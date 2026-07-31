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
  players: Record<string, unknown>[];
  scores: ScoreRow[];
  cardIn: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  disputes: Record<string, unknown>[];
  corrections: Record<string, unknown>[];
  audit: Record<string, unknown>[];
}

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

async function pushOps(sb: SupabaseClient, ops: SyncOp[], tournamentId: string) {
  if (forceFail()) throw new Error("forced sync failure");

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
        tournament_id: tournamentId,
        round,
        player_id: String(o.payload.playerId),
        hole: Number(o.payload.hole),
        gross: (o.payload.gross ?? null) as number | null,
        source,
        client_id: CLIENT_ID,
        updated_at: new Date(o.ts).toISOString(),
      });
    }
    const { error } = await sb.from("scores").upsert([...byCell.values()], {
      onConflict: "tournament_id,round,player_id,hole,source",
    });
    if (error) throw error;
  }

  // entity rows, grouped by table
  const entityOps = ops.filter((o) => o.kind === "entity");
  const byTable = new Map<
    string,
    { rows: Record<string, unknown>[]; conflict?: string; insertOnly?: boolean }
  >();
  for (const o of entityOps) {
    const table = String(o.payload.table);
    const row = o.payload.row as Record<string, unknown>;
    const conflict = o.payload.conflict as string | undefined;
    const insertOnly = Boolean(o.payload.insertOnly);
    const bucket = byTable.get(table) ?? { rows: [], conflict, insertOnly };
    bucket.rows.push(row);
    byTable.set(table, bucket);
  }
  for (const [table, { rows, conflict, insertOnly }] of byTable) {
    if (insertOnly) {
      // append-only (audit): ignore duplicates so a retry can't double-insert
      const { error } = await sb.from(table).upsert(rows, {
        onConflict: "id",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    } else {
      const { error } = await sb
        .from(table)
        .upsert(rows, conflict ? { onConflict: conflict } : undefined);
      if (error) throw error;
    }
  }
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
    players,
    scores,
    cardIn,
    certifications,
    disputes,
    corrections,
    audit,
  ] = await Promise.all([
    sb.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
    eq("pairings"),
    sb.from("players").select("*"),
    eq("scores"),
    eq("card_in"),
    eq("certifications"),
    eq("disputes"),
    eq("corrections"),
    eq("audit_log"),
  ]);

  return {
    tournament: tournament.data ?? null,
    pairings: pairings.data ?? [],
    players: players.data ?? [],
    scores: (scores.data ?? []) as ScoreRow[],
    cardIn: cardIn.data ?? [],
    certifications: certifications.data ?? [],
    disputes: disputes.data ?? [],
    corrections: corrections.data ?? [],
    audit: audit.data ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export interface RemoteAdapter {
  kind: "supabase" | "none";
  push(ops: SyncOp[], tournamentId: string): Promise<void>;
  hydrate(tournamentId: string): Promise<HydrationSnapshot>;
  /** the current live tournament id, if any device has started one */
  findLiveTournamentId(): Promise<string | null>;
  /** realtime for every synced table; onChange(table, newRow). unsubscribe. */
  subscribeTables(
    onChange: (table: SyncTable, row: Record<string, unknown>) => void,
  ): () => void;
}

const EMPTY_SNAPSHOT: HydrationSnapshot = {
  tournament: null, pairings: [], players: [], scores: [], cardIn: [],
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
    },
    async hydrate() {
      return EMPTY_SNAPSHOT;
    },
    async findLiveTournamentId() {
      return null;
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
      await pushOps(await supabase(), ops, tournamentId);
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
              onChange(table, row);
            },
          );
        }
        channel = ch.subscribe();
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
