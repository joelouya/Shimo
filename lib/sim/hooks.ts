"use client";

import { useEffect, useMemo, useState } from "react";

import {
  COURSES,
  DEMO_USER_ID,
  GROUPS,
  PLAYERS,
  playerById,
} from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import {
  computeStandings,
  divisionFor,
  rowStats,
  type StandingRow,
  type ViewMode,
} from "@/lib/scoring";
import type { Course, Player, Tournament } from "@/lib/types";
import {
  LIVE_COURSE,
  LIVE_TOURNAMENT,
  meId,
  setAuth,
  simStore,
  useSim,
  type SavedGroup,
} from "./store";
import { AUTH_AVAILABLE, getSession, onAuthChange } from "@/lib/sync/auth";

/** The player this device acts as (picked identity in pilot, Joel in demo). */
export function useMeId(): string {
  return useSim(meId);
}

/** The Player object for this device's identity, or null if unknown. */
export function useMe(): Player | null {
  const id = useSim(meId);
  const roster = useSim((s) => s.roster);
  return useMemo(() => {
    if (!id) return null;
    if (!IS_PILOT) return playerById(id);
    return roster.find((p) => p.id === id) ?? null;
  }, [id, roster]);
}

/**
 * Mirror the Supabase auth session into the store, once at the app root, so
 * meId resolves synchronously everywhere. Reconciles on mount and on every
 * sign-in / sign-out.
 */
export function useAuthReconcile() {
  useEffect(() => {
    if (!AUTH_AVAILABLE) return;
    let active = true;
    getSession().then((s) => {
      if (active) setAuth(s?.user?.email ?? null, s?.user?.id ?? null);
    });
    const unsub = onAuthChange((s) =>
      setAuth(s?.user?.email ?? null, s?.user?.id ?? null),
    );
    return () => {
      active = false;
      unsub();
    };
  }, []);
}

const FIELD_IDS = GROUPS.flatMap((g) => g.playerIds);
export const FIELD_PLAYERS = PLAYERS.filter((p) => FIELD_IDS.includes(p.id));

const DEMO_GROUPS: SavedGroup[] = GROUPS.map((g) => ({
  id: g.id,
  number: g.number,
  teeTime: g.teeTime,
  playerIds: [...g.playerIds],
}));

export interface ActiveTournament {
  tournament: Tournament;
  groups: SavedGroup[];
  players: Player[];
}

/**
 * Resolves the tournament being played today.
 * demo : always the seeded Muthaiga Captain's Prize with its field
 * pilot: the admin-created tournament that was started, with saved pairings
 *        and players drawn from the club roster
 */
export function useActiveTournament(): ActiveTournament | null {
  const liveId = useSim((s) => s.liveTournamentId);
  const created = useSim((s) => s.created);
  const pairings = useSim((s) => s.pairings);
  const roster = useSim((s) => s.roster);

  return useMemo(() => {
    if (!IS_PILOT) {
      return {
        tournament: LIVE_TOURNAMENT,
        groups: pairings[LIVE_TOURNAMENT.id] ?? DEMO_GROUPS,
        players: FIELD_PLAYERS,
      };
    }
    if (!liveId) return null;
    const tournament = created.find((t) => t.id === liveId);
    if (!tournament) return null;
    const groups = pairings[liveId] ?? [];
    const ids = new Set(groups.flatMap((g) => g.playerIds));
    const players = roster.filter((p) => ids.has(p.id));
    return { tournament, groups, players };
  }, [liveId, created, pairings, roster]);
}

export function useStandings(mode: ViewMode, division?: string): StandingRow[] {
  const scores = useSim((s) => s.scores);
  const active = useActiveTournament();
  return useMemo(() => {
    if (!active) return [];
    let players = active.players;
    if (division && division !== "Overall") {
      players = players.filter(
        (p) =>
          divisionFor(p.handicap, active.tournament.divisions) === division,
      );
    }
    // the tournament's own course, not the demo one: par and stroke index
    // drive every point, so this must follow the event being played
    const course =
      COURSES.find((c) => c.id === active.tournament.courseId) ?? LIVE_COURSE;
    return computeStandings(
      players,
      scores,
      course,
      active.tournament.handicapAllowance,
      mode,
    );
  }, [scores, mode, division, active]);
}

/** The demo user's live status: position, points, thru. Demo mode only. */
export function useUserLive() {
  const scores = useSim((s) => s.scores);
  const attested = useSim((s) => s.attested);
  return useMemo(() => {
    const rows = computeStandings(
      FIELD_PLAYERS,
      scores,
      LIVE_COURSE,
      LIVE_TOURNAMENT.handicapAllowance,
      "points",
    );
    const me = rows.find((r) => r.player.id === DEMO_USER_ID)!;
    return { ...me, attested };
  }, [scores, attested]);
}

/** Current hole (1-based) for a group; 19 = finished. */
export function groupCurrentHole(
  scores: Record<string, (number | null)[]>,
  groupId: string,
) {
  const g = GROUPS.find((x) => x.id === groupId)!;
  const thru = Math.min(
    ...g.playerIds.map((pid) => scores[pid].filter((x) => x != null).length),
  );
  return thru + 1;
}

export function playerStats(
  scores: Record<string, (number | null)[]>,
  playerId: string,
  course: Course = LIVE_COURSE,
  allowance: number = LIVE_TOURNAMENT.handicapAllowance,
  player?: Player,
) {
  const p =
    player ??
    PLAYERS.find((x) => x.id === playerId) ??
    simStore.getState().roster.find((x) => x.id === playerId);
  if (!p) {
    return rowStats(
      { id: playerId, name: "", clubId: "", handicap: 0, gender: "M" },
      scores[playerId] ?? Array(18).fill(null),
      course,
      allowance,
    );
  }
  return rowStats(p, scores[playerId] ?? Array(18).fill(null), course, allowance);
}

/* ------------------------------------------------------------------ */
/* Connectivity + sync status                                          */
/* ------------------------------------------------------------------ */

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function useSyncStatus() {
  const outbox = useSim((s) => s.outbox);
  const lastSyncedAt = useSim((s) => s.lastSyncedAt);
  const online = useOnline();
  const pending = outbox.filter((o) => o.status === "pending").length;
  const failed = outbox.filter((o) => o.status === "failed").length;
  return { online, pending, failed, lastSyncedAt };
}
