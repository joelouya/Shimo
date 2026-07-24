"use client";

/**
 * Read-only leaderboard data for the public /live/[id] route. Reads straight
 * from Supabase with no store and no auth: hydrate once, stay subscribed to
 * score changes, and poll every 30s as a fallback if the socket goes quiet.
 */

import { useEffect, useRef, useState } from "react";

import { COURSES } from "@/lib/data";
import {
  computeStandings,
  divisionFor,
  type StandingRow,
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
  scores: Record<string, (number | null)[]>;
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
    scores: {},
    lastUpdated: null,
    online: true,
  });
  const scoresRef = useRef<Record<string, (number | null)[]>>({});

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
        const fieldIds = new Set(
          (pairings.data ?? []).flatMap(
            (g: Record<string, unknown>) => (g.player_ids as string[]) ?? [],
          ),
        );
        const roster = (players.data ?? [])
          .map(rowToPlayer)
          .filter((p) => fieldIds.has(p.id));
        const scoreMap: Record<string, (number | null)[]> = {};
        for (const p of roster) scoreMap[p.id] = emptyCard();
        for (const r of scores.data ?? []) {
          const pid = r.player_id as string;
          (scoreMap[pid] ??= emptyCard())[r.hole as number] =
            (r.gross ?? null) as number | null;
        }
        scoresRef.current = scoreMap;
        setBoard({
          status: "ready",
          tournament,
          course,
          players: roster,
          scores: scoreMap,
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
            if (!row) return;
            const pid = row.player_id as string;
            const next = { ...scoresRef.current };
            (next[pid] ??= emptyCard())[row.hole as number] =
              (row.gross ?? null) as number | null;
            scoresRef.current = next;
            setBoard((b) => ({ ...b, scores: next, lastUpdated: Date.now() }));
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

export function publicStandings(
  board: PublicBoard,
  mode: ViewMode,
  division?: string,
): StandingRow[] {
  if (!board.tournament || !board.course) return [];
  let players = board.players;
  if (division && division !== "Overall") {
    players = players.filter(
      (p) => divisionFor(p.handicap, board.tournament!.divisions) === division,
    );
  }
  return computeStandings(
    players,
    board.scores,
    board.course,
    board.tournament.handicapAllowance,
    mode,
  );
}
