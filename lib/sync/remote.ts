"use client";

/**
 * The remote side of the outbox. With Supabase configured, writes go to
 * Postgres and every device receives them over realtime; the whole pilot
 * state (tournament, pairings, roster, scores, certification trail) lives in
 * the cloud so any device that joins hydrates it and stays in sync.
 *
 * Two op shapes travel through the outbox:
 *   - "score" / "resolve": a hole score, upserted into `scores` (last-write
 *     wins by updated_at, carries client_id so a device ignores its own echo)
 *   - "entity": a pre-mapped row for one of the state tables, upserted (or
 *     inserted, for append-only audit rows) by the adapter
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { IS_PILOT } from "@/lib/mode";
import type { SyncOp } from "@/lib/sim/store";
import {
  CLIENT_ID,
  REMOTE_CONFIGURED,
  SYNC_TABLES,
  forceFail,
  supabase,
  type SyncTable,
} from "./client";

export { CLIENT_ID, REMOTE_CONFIGURED } from "./client";

/** Dev-only realtime tracing, off in production builds. */
const REALTIME_DEBUG = process.env.NODE_ENV !== "production";

export interface ScoreRow {
  tournament_id: string;
  /** which round of the tournament (1-based) */
  round: number;
  player_id: string;
  hole: number; // 0-based
  gross: number | null;
  /** player | marker | desk - see schema-m2.sql */
  source: string;
  client_id: string;
  /** set by the server; used to replay writes in order on hydration */
  updated_at?: string;
}

/** Everything a joining device needs to reconstruct a live tournament. */
export interface HydrationSnapshot {
  tournament: Record<string, unknown> | null;
  pairings: Record<string, unknown>[];
  teams: Record<string, unknown>[];
  players: Record<string, unknown>[];
  scores: ScoreRow[];
  cardIn: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  disputes: Record<string, unknown>[];
  corrections: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  /** who is in the field; optional so older fixtures still hydrate */
  entries?: Record<string, unknown>[];
}

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

/**
 * What came back from a push: the ops that did not land. Each table is pushed
 * on its own, so one refused row (a table the club's cloud does not have yet,
 * a value a check constraint rejects) holds up only its own ops and never the
 * scores queued beside it. When nothing at all lands the push throws, which
 * is what an outage looks like and what the engine's retry expects.
 */
export interface PushResult {
  failed: string[];
}

async function pushOps(
  sb: SupabaseClient,
  ops: SyncOp[],
  tournamentId: string,
): Promise<PushResult> {
  if (forceFail()) throw new Error("forced sync failure");
  const failed: string[] = [];
  let groups = 0;
  let failedGroups = 0;
  const attempt = async (ids: string[], run: () => Promise<void>) => {
    groups++;
    try {
      await run();
    } catch (e) {
      failedGroups++;
      failed.push(...ids);
      if (REALTIME_DEBUG) console.warn("[shimo sync] a table refused a push", e);
    }
  };

  // scores (and resolved-discrepancy score changes)
  const scoreOps = ops.filter((o) => o.kind === "score" || o.kind === "resolve");
  if (scoreOps.length) {
    // De-dupe to the latest write per cell within this batch. The key includes
    // the source: a player's own entry and their marker's entry for the same
    // hole are two different figures and must both survive (see schema-m2.sql).
    const byCell = new Map<string, ScoreRow & { updated_at: string }>();
    for (const o of scoreOps) {
      const source = String(o.payload.source ?? "app");
      const round = Number(o.payload.round ?? 1);
      const key = `${o.payload.playerId}:${round}:${o.payload.hole}:${source}`;
      byCell.set(key, {
        // the op names its own tournament; the live id is only a fallback for
        // ops queued before that was recorded
        tournament_id: String(o.payload.tournamentId ?? tournamentId),
        round,
        player_id: String(o.payload.playerId),
        hole: Number(o.payload.hole),
        gross: (o.payload.gross ?? null) as number | null,
        source,
        client_id: CLIENT_ID,
        updated_at: new Date(o.ts).toISOString(),
      });
    }
    await attempt(scoreOps.map((o) => o.id), async () => {
      const { error } = await sb.from("scores").upsert([...byCell.values()], {
        onConflict: "tournament_id,round,player_id,hole,source",
      });
      if (error) throw error;
    });
  }

  // entity rows, grouped by table
  const entityOps = ops.filter((o) => o.kind === "entity");
  const byTable = new Map<
    string,
    { ids: string[]; rows: Record<string, unknown>[]; conflict?: string; insertOnly?: boolean }
  >();
  for (const o of entityOps) {
    const table = String(o.payload.table);
    const row = o.payload.row as Record<string, unknown>;
    const conflict = o.payload.conflict as string | undefined;
    const insertOnly = Boolean(o.payload.insertOnly);
    const bucket = byTable.get(table) ?? { ids: [], rows: [], conflict, insertOnly };
    bucket.ids.push(o.id);
    bucket.rows.push(row);
    byTable.set(table, bucket);
  }
  for (const [table, { ids, rows, conflict, insertOnly }] of byTable) {
    await attempt(ids, async () => {
      if (insertOnly) {
        // insert-only (audit log, guest entries): ignore duplicates so a retry
        // can't double-insert and no UPDATE is attempted against a write-only
        // table. Keyed by the table's own conflict target - `id` for audit, the
        // composite (tournament_id,guest_id) for guest_entries.
        const { error } = await sb.from(table).upsert(rows, {
          onConflict: conflict ?? "id",
          ignoreDuplicates: true,
        });
        if (error) throw error;
      } else {
        const { error } = await sb
          .from(table)
          .upsert(rows, conflict ? { onConflict: conflict } : undefined);
        if (error) throw error;
      }
    });
  }
  // nothing landed at all: that is an outage, not a refusal
  if (groups > 0 && failedGroups === groups) throw new Error("push failed");
  return { failed };
}

/* ------------------------------------------------------------------ */
/* Hydrate                                                             */
/* ------------------------------------------------------------------ */

async function hydrate(
  sb: SupabaseClient,
  tournamentId: string,
): Promise<HydrationSnapshot> {
  const eq = (table: string) =>
    sb.from(table).select("*").eq("tournament_id", tournamentId);

  const [
    tournament,
    pairings,
    teams,
    players,
    scores,
    cardIn,
    certifications,
    disputes,
    corrections,
    audit,
    entries,
  ] = await Promise.all([
    sb.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
    eq("pairings"),
    eq("teams"),
    sb.from("players").select("*"),
    eq("scores"),
    eq("card_in"),
    eq("certifications"),
    eq("disputes"),
    eq("corrections"),
    eq("audit_log"),
    eq("entries"),
  ]);

  return {
    tournament: tournament.data ?? null,
    pairings: pairings.data ?? [],
    teams: teams.data ?? [],
    players: players.data ?? [],
    scores: (scores.data ?? []) as ScoreRow[],
    cardIn: cardIn.data ?? [],
    certifications: certifications.data ?? [],
    disputes: disputes.data ?? [],
    corrections: corrections.data ?? [],
    audit: audit.data ?? [],
    entries: entries.data ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export interface RemoteAdapter {
  kind: "supabase" | "none";
  /** resolves with the ids of ops that were refused; throws when nothing landed */
  push(ops: SyncOp[], tournamentId: string): Promise<PushResult>;
  hydrate(tournamentId: string): Promise<HydrationSnapshot>;
  /** the current live tournament id, if any device has started one */
  findLiveTournamentId(): Promise<string | null>;
  /** every published event (upcoming or live), so a phone can list them to
   *  register for before the day is started */
  findOpenTournaments(): Promise<Record<string, unknown>[]>;
  /** everyone registered for these events, so a phone or the desk sees the
   *  field before the day is started */
  fetchEntries(tournamentIds: string[]): Promise<Record<string, unknown>[]>;
  /** realtime for every synced table; onChange(table, newRow). unsubscribe. */
  subscribeTables(
    onChange: (table: SyncTable, row: Record<string, unknown>) => void,
  ): () => void;
}

const EMPTY_SNAPSHOT: HydrationSnapshot = {
  tournament: null, pairings: [], teams: [], players: [], scores: [], cardIn: [],
  certifications: [], disputes: [], corrections: [], audit: [],
};

/**
 * Local-only remote. Used for demo mode and for pilot-without-keys. Keeps the
 * outbox's offline / retry UX working (the demo's `?failsync` showcase) but
 * never touches the network, so demo data never reaches the club's cloud.
 */
function localRemote(): RemoteAdapter {
  return {
    kind: "none",
    async push() {
      await new Promise((r) => setTimeout(r, 250));
      if (forceFail()) throw new Error("simulated sync failure");
      return { failed: [] };
    },
    async hydrate() {
      return EMPTY_SNAPSHOT;
    },
    async findLiveTournamentId() {
      return null;
    },
    async findOpenTournaments() {
      return [];
    },
    async fetchEntries() {
      return [];
    },
    subscribeTables() {
      return () => {};
    },
  };
}

function supabaseRemote(): RemoteAdapter {
  return {
    kind: "supabase",
    async push(ops, tournamentId) {
      return pushOps(await supabase(), ops, tournamentId);
    },
    async hydrate(tournamentId) {
      return hydrate(await supabase(), tournamentId);
    },
    async findLiveTournamentId() {
      const sb = await supabase();
      const { data } = await sb
        .from("tournaments")
        .select("id")
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.id as string) ?? null;
    },
    async findOpenTournaments() {
      const sb = await supabase();
      const { data } = await sb
        .from("tournaments")
        .select("*")
        .in("status", ["upcoming", "live"])
        .order("date", { ascending: true });
      return (data ?? []) as Record<string, unknown>[];
    },
    async fetchEntries(tournamentIds) {
      if (!tournamentIds.length) return [];
      const sb = await supabase();
      const { data } = await sb
        .from("entries")
        .select("*")
        .in("tournament_id", tournamentIds);
      return (data ?? []) as Record<string, unknown>[];
    },
    subscribeTables(onChange) {
      let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
      supabase().then((sb) => {
        const ch = sb.channel("shimo-all");
        for (const table of SYNC_TABLES) {
          ch.on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            (payload) => {
              const row = payload.new as Record<string, unknown> | null;
              if (!row) return;
              // ignore the echo of our own score writes
              if (table === "scores" && row.client_id === CLIENT_ID) return;
              if (REALTIME_DEBUG) {
                console.debug(
                  "[shimo realtime] delta",
                  table,
                  row.id ?? row.player_id ?? "",
                );
              }
              onChange(table, row);
            },
          );
        }
        // Log the channel status so verification can tell whether realtime is
        // actually delivering on this device: SUBSCRIBED means deltas will
        // flow, CHANNEL_ERROR / TIMED_OUT means we are living on the poll.
        channel = ch.subscribe((status) => {
          if (REALTIME_DEBUG) console.info("[shimo realtime] channel", status);
        });
      });
      return () => {
        channel?.unsubscribe();
      };
    },
  };
}

/** Real cross-device sync only in pilot mode with credentials present. */
export function getRemote(): RemoteAdapter {
  return IS_PILOT && REMOTE_CONFIGURED ? supabaseRemote() : localRemote();
}
