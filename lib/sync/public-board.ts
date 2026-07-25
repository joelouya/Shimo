"use client";

/**
 * Read-only leaderboard data for the public /live/[id] route. Reads straight
 * from Supabase with no store and no auth: hydrate once, stay subscribed to
 * score changes, and poll every 30s as a fallback if the socket goes quiet.
 */

import { useEffect, useRef, useState } from "react";

import { COURSES } from "@/lib/data";
import { roundsOf } from "@/lib/rounds";
import {
  applyCut,
  cumulativeStandings,
  divisionFor,
  type CumulativeRow,
  type RoundCards,
  type ViewMode,
} from "@/lib/scoring";
import { rowToPlayer, rowToTournament } from "@/lib/sync/mappers";
import type { Course, Player, Tournament } from "@/lib/types";
import { REMOTE_CONFIGURED, supabase } from "./client";

export interface PublicBoard {
  status: "loading" | "ready" | "not-found" | "unconfigured";
  tournament: Tournament | null;
  course: Course | null;
  players: Player[];
  /** round number -> playerId -> card */
  byRound: Record<number, Record<string, (number | null)[]>>;
  /** the field of each round, so a player cut after round 2 is not counted */
  fieldByRound: Record<number, string[]>;
  lastUpdated: number | null;
  online: boolean;
}

function emptyCard() {
  return Array(18).fill(null) as (number | null)[];
}

export function usePublicBoard(tournamentId: string): PublicBoard {
  const [board, setBoard] = useState<PublicBoard>({
    status: REMOTE_CONFIGURED ? "loading" : "unconfigured",
    tournament: null,
    course: null,
    players: [],
    byRound: {},
    fieldByRound: {},
    lastUpdated: null,
    online: true,
  });
  const scoresRef = useRef<Record<number, Record<string, (number | null)[]>>>({});

  useEffect(() => {
    if (!REMOTE_CONFIGURED) return;
    let cancelled = false;
    let channel: { unsubscribe: () => void } | null = null;

    const load = async () => {
      try {
        const sb = await supabase();
        const [t, pairings, players, scores] = await Promise.all([
          sb.from("tournaments").select("*").eq("id", tournamentId).maybeSingle(),
          sb.from("pairings").select("*").eq("tournament_id", tournamentId),
          sb.from("players").select("*"),
          sb.from("scores").select("*").eq("tournament_id", tournamentId),
        ]);
        if (cancelled) return;
        if (!t.data) {
          setBoard((b) => ({ ...b, status: "not-found" }));
          return;
        }
        const tournament = rowToTournament(t.data);
        const course = COURSES.find((c) => c.id === tournament.courseId) ?? null;
        // only players in the field
        // the field of each round, from that round's pairings
        const fieldByRound: Record<number, string[]> = {};
        for (const g of (pairings.data ?? []) as Record<string, unknown>[]) {
          const rnd = (g.round as number) ?? 1;
          (fieldByRound[rnd] ??= []).push(...((g.player_ids as string[]) ?? []));
        }
        const fieldIds = new Set(Object.values(fieldByRound).flat());
        const roster = (players.data ?? [])
          .map(rowToPlayer)
          .filter((p) => fieldIds.has(p.id));

        // only the agreed figure belongs on a public board: the desk's entry,
        // or the player's own card. A marker's private copy is not published.
        const byRound: Record<number, Record<string, (number | null)[]>> = {};
        const ordered = [...(scores.data ?? [])].sort((a, b) =>
          String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? "")),
        );
        for (const r of ordered) {
          if (r.source === "marker") continue;
          const rnd = (r.round as number) ?? 1;
          const pid = r.player_id as string;
          const bucket = (byRound[rnd] ??= {});
          (bucket[pid] ??= emptyCard())[r.hole as number] =
            (r.gross ?? null) as number | null;
        }
        scoresRef.current = byRound;
        setBoard({
          status: "ready",
          tournament,
          course,
          players: roster,
          byRound,
          fieldByRound,
          lastUpdated: Date.now(),
          online: navigator.onLine,
        });
      } catch {
        setBoard((b) => ({ ...b, online: navigator.onLine }));
      }
    };

    load();

    // realtime score changes for this tournament
    supabase().then((sb) => {
      channel = sb
        .channel(`public-board-${tournamentId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "scores",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (!row || row.source === "marker") return;
            const rnd = (row.round as number) ?? 1;
            const pid = row.player_id as string;
            const next = { ...scoresRef.current };
            const bucket = (next[rnd] = { ...(next[rnd] ?? {}) });
            bucket[pid] = [...(bucket[pid] ?? emptyCard())];
            bucket[pid][row.hole as number] = (row.gross ?? null) as number | null;
            scoresRef.current = next;
            setBoard((b) => ({ ...b, byRound: next, lastUpdated: Date.now() }));
          },
        )
        .subscribe();
    });

    // 30s polling fallback + connectivity
    const poll = setInterval(load, 30_000);
    const setOnline = () =>
      setBoard((b) => ({ ...b, online: navigator.onLine }));
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOnline);

    return () => {
      cancelled = true;
      clearInterval(poll);
      channel?.unsubscribe();
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOnline);
    };
  }, [tournamentId]);

  return board;
}

/**
 * The board a spectator sees: every round summed, with the cut applied once
 * the round after it is under way. `round` narrows it to a single round.
 */
export function publicStandings(
  board: PublicBoard,
  mode: ViewMode,
  division?: string,
  round?: number,
): CumulativeRow[] {
  const t = board.tournament;
  if (!t || !board.course) return [];
  let players = board.players;
  if (division && division !== "Overall") {
    players = players.filter(
      (p) => divisionFor(p.handicap, t.divisions) === division,
    );
  }
  const rounds = roundsOf(t).filter((r) => round == null || r.number === round);
  const byRound: RoundCards[] = rounds.map((r) => ({
    round: r.number,
    scores: board.byRound[r.number] ?? {},
    course: COURSES.find((c) => c.id === r.courseId) ?? board.course!,
  }));
  const rows = cumulativeStandings(
    players,
    byRound,
    t.handicapAllowance,
    mode,
    (rnd, pid) => (board.fieldByRound[rnd] ?? []).includes(pid),
  );

  // mark who missed the cut, once the following round has started
  if (round == null) {
    const cutRound = roundsOf(t).find((r) => r.cut && r.cut.topN > 0);
    const started = (n: number) =>
      Object.values(board.byRound[n] ?? {}).some((c) => c.some((x) => x != null));
    if (cutRound && started(cutRound.number + 1)) {
      const upTo = byRound.filter((rc) => rc.round <= cutRound.number);
      const thru = cumulativeStandings(players, upTo, t.handicapAllowance, mode);
      const res = applyCut(thru, cutRound.cut!.topN, mode);
      for (const r of rows) r.madeCut = res.survivors.has(r.player.id);
    }
  }
  return rows;
}
