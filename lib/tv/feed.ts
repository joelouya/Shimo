"use client";

/**
 * The score stream, as TV mode sees it.
 *
 * Read-only in the strictest sense: this module has no write path at all, and
 * the route that uses it needs no session. A television in a clubhouse is a
 * screen anyone can walk up to, and the safe thing for it to be able to do is
 * nothing.
 *
 * Unlike the public leaderboard read, this keeps every entry from every party
 * rather than collapsing them to one published figure. The producer needs to
 * see that a player and their marker agree, and when each of them last typed,
 * because that is what the cool-down is measured against. Collapsing first
 * would throw away exactly the information the trust gates are built on.
 *
 * It also never goes blank. A screen showing yesterday's board with a quiet
 * note in the corner is worth a great deal more to a club than a screen
 * showing an error, so a failed refresh keeps what it already had.
 */

import { useEffect, useRef, useState } from "react";

import { COURSES } from "@/lib/data";
import { roundsOf } from "@/lib/rounds";
import { rowToClub, rowToPlayer, rowToTournament } from "@/lib/sync/mappers";
import { REMOTE_CONFIGURED, supabase } from "@/lib/sync/client";
import type { CourseRecord, ScoreRow, TvDecision, TvSnapshot } from "./types";

export type FeedStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "unconfigured"
  | "reconnecting";

export interface TvFeed {
  status: FeedStatus;
  snapshot: TvSnapshot | null;
  /** epoch ms of the last successful read, so the screen can say how stale it is */
  lastUpdated: number | null;
}

const POLL_MS = 20_000;
/** after this long with no successful read, the corner note appears */
const STALE_MS = 60_000;

function millis(v: unknown): number {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : Date.now();
}

export function useTvFeed(tournamentId: string): TvFeed {
  const [feed, setFeed] = useState<TvFeed>({
    status: REMOTE_CONFIGURED ? "loading" : "unconfigured",
    snapshot: null,
    lastUpdated: null,
  });
  // the last good snapshot, held so a failed refresh never empties the screen
  const held = useRef<TvSnapshot | null>(null);

  useEffect(() => {
    if (!REMOTE_CONFIGURED) return;
    let cancelled = false;
    let channel: { unsubscribe: () => void } | null = null;

    const load = async () => {
      try {
        const sb = await supabase();
        const [t, pairings, players, scores, cardIn, clubs, decisions] =
          await Promise.all([
          sb.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
          sb.from("pairings").select("*").eq("tournament_id", tournamentId),
          sb.from("players").select("*"),
          sb.from("scores").select("*").eq("tournament_id", tournamentId),
          sb.from("card_in").select("*").eq("tournament_id", tournamentId),
          sb.from("clubs").select("*"),
          sb
            .from("tv_decisions")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("id", { ascending: true }),
        ]);
        if (cancelled) return;
        if (!t.data) {
          setFeed((f) => ({ ...f, status: "not-found" }));
          return;
        }

        const tournament = rowToTournament(t.data);
        const rounds = roundsOf(tournament);

        const fieldByRound: Record<number, string[]> = {};
        for (const g of (pairings.data ?? []) as Record<string, unknown>[]) {
          const rnd = (g.round as number) ?? 1;
          (fieldByRound[rnd] ??= []).push(...((g.player_ids as string[]) ?? []));
        }
        const fieldIds = new Set(Object.values(fieldByRound).flat());
        const groupRows = ((pairings.data ?? []) as Record<string, unknown>[])
          .filter((g) => ((g.round as number) ?? 1) === 1)
          .map((g) => ({
            number: (g.number as number) ?? 0,
            teeTime: (g.tee_time as string) ?? "",
            playerIds: (g.player_ids as string[]) ?? [],
          }))
          .sort((a, b) => a.number - b.number);
        const roster = (players.data ?? [])
          .map(rowToPlayer)
          .filter((p) => fieldIds.has(p.id));

        const rows: ScoreRow[] = (scores.data ?? []).map((r) => ({
          round: (r.round as number) ?? 1,
          playerId: r.player_id as string,
          hole: r.hole as number,
          gross: (r.gross ?? null) as number | null,
          source: (r.source === "marker"
            ? "marker"
            : r.source === "desk"
              ? "desk"
              : "player") as ScoreRow["source"],
          at: millis(r.updated_at),
        }));

        const published: Record<number, Record<string, boolean>> = {};
        for (const r of (cardIn.data ?? []) as Record<string, unknown>[]) {
          const rnd = (r.round as number) ?? 1;
          (published[rnd] ??= {})[r.player_id as string] = Boolean(r.is_in);
        }

        const identity =
          (clubs.data ?? [])
            .map(rowToClub)
            .find((c) => c.clubId === tournament.clubId) ?? {
            clubId: tournament.clubId,
          };

        // the round in play: the last one anyone has posted a figure to
        const played = new Set(rows.map((r) => r.round));
        const round =
          [...rounds].reverse().find((r) => played.has(r.number))?.number ??
          rounds[0].number;

        const course =
          COURSES.find(
            (c) => c.id === rounds.find((r) => r.number === round)?.courseId,
          ) ??
          COURSES.find((c) => c.id === tournament.courseId) ??
          COURSES[0];

        const snapshot: TvSnapshot = {
          at: Date.now(),
          tournament,
          course,
          players: roster,
          round,
          rows,
          published,
          fieldByRound,
          groups: groupRows,
          identity,
          records: recordsOf(identity),
          decisions: (decisions.data ?? []).map((d) => ({
            id: d.id as number,
            kind: d.kind as TvDecision["kind"],
            factKey: (d.fact_key ?? undefined) as string | undefined,
            payload: (d.payload ?? {}) as TvDecision["payload"],
            actor: (d.actor ?? "") as string,
            at: millis(d.created_at),
          })),
          online: true,
        };
        held.current = snapshot;
        setFeed({ status: "ready", snapshot, lastUpdated: Date.now() });
      } catch {
        if (cancelled) return;
        // hold what we had; only say so once it is old enough to matter
        setFeed((f) => ({
          ...f,
          status: held.current ? "reconnecting" : f.status,
          snapshot: held.current ?? f.snapshot,
        }));
      }
    };

    load();

    supabase().then((sb) => {
      if (cancelled) return;
      channel = sb
        .channel(`tv-${tournamentId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "scores",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_in",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tv_decisions",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => void load(),
        )
        .subscribe();
    });

    const poll = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
      channel?.unsubscribe();
    };
  }, [tournamentId]);

  return feed;
}

/**
 * Whether the screen should own up to being behind.
 *
 * Deliberately not the same question as "is the socket up". A television that
 * flashes a warning every time a websocket blinks is worse than one that waits
 * a minute and is sure, because the room reads the warning as the scores being
 * wrong.
 */
export function isStale(feed: TvFeed, now: number) {
  return feed.lastUpdated != null && now - feed.lastUpdated > STALE_MS;
}

/**
 * Course records, held on the club rather than the tournament: a record
 * belongs to the course and outlives every event played on it.
 */
function recordsOf(identity: { courseRecords?: CourseRecord[] }): CourseRecord[] {
  return identity.courseRecords ?? [];
}
