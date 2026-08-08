"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  COURSES,
  DEMO_USER_ID,
  GROUPS,
  PLAYERS,
  playerById,
} from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import {
  applyCut,
  computeStandings,
  cumulativeStandings,
  divisionFor,
  rowStats,
  type CumulativeRow,
  type RoundCards,
  type StandingRow,
  type ViewMode,
} from "@/lib/scoring";
import {
  betterBallTeamRow,
  scrambleTeamRow,
  teamStandings,
} from "@/lib/team-scoring";
import { ryderCupBoard, type RyderBoard } from "@/lib/ryder";
import type { Course, HoleScores, Player, Round, Tournament } from "@/lib/types";
import {
  LIVE_COURSE,
  LIVE_TOURNAMENT,
  liveKey,
  meId,
  roundCardIn,
  roundCerts,
  roundMarkerScores,
  roundPairings,
  roundScores,
  setAuth,
  simStore,
  useSim,
  type SavedGroup,
} from "./store";
import { roundKey as roundKeyOf, roundOf, roundsOf } from "@/lib/rounds";
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
  /** the round on the course right now (1-based) */
  round: number;
  /** that round's configuration: its date, course, tees and cut */
  roundInfo: Round;
  /** the course this round is played on */
  course: Course;
}

/**
 * Resolves the tournament being played today.
 * demo : always the seeded Muthaiga Captain's Prize with its field
 * pilot: the admin-created tournament that was started, with saved pairings
 *        and players drawn from the club roster
 */
export function useActiveTournament(): ActiveTournament | null {
  const liveId = useSim((s) => s.liveTournamentId);
  const liveRound = useSim((s) => s.liveRound);
  const created = useSim((s) => s.created);
  const pairings = useSim((s) => s.pairings);
  const roster = useSim((s) => s.roster);

  return useMemo(() => {
    const round = liveRound || 1;
    if (!IS_PILOT) {
      const info = roundOf(LIVE_TOURNAMENT, 1);
      return {
        tournament: LIVE_TOURNAMENT,
        groups: pairings[roundKeyOf(LIVE_TOURNAMENT.id, 1)] ?? DEMO_GROUPS,
        players: FIELD_PLAYERS,
        round: 1,
        roundInfo: info,
        course: LIVE_COURSE,
      };
    }
    if (!liveId) return null;
    const tournament = created.find((t) => t.id === liveId);
    if (!tournament) return null;
    const info = roundOf(tournament, round);
    const groups = pairings[roundKeyOf(liveId, round)] ?? [];
    const ids = new Set(groups.flatMap((g) => g.playerIds));
    const players = roster.filter((p) => ids.has(p.id));
    return {
      tournament,
      groups,
      players,
      round,
      roundInfo: info,
      course: COURSES.find((c) => c.id === info.courseId) ?? LIVE_COURSE,
    };
  }, [liveId, liveRound, created, pairings, roster]);
}

/* ---- round-scoped views of the live round, in the shape components expect ---- */

/** Every player's own card for the round on the course. */
export function useRoundScores(): Record<string, HoleScores> {
  return useSim((s) => roundScores(s));
}
/** What each player's marker has recorded for them, this round. */
export function useRoundMarkerScores(): Record<string, HoleScores> {
  return useSim((s) => roundMarkerScores(s));
}
export function useRoundCerts() {
  return useSim((s) => roundCerts(s));
}
export function useRoundCardIn() {
  return useSim((s) => roundCardIn(s));
}

/** Standings for the round on the course only. */
export function useStandings(mode: ViewMode, division?: string): StandingRow[] {
  const scores = useRoundScores();
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
    // this round's course: par and stroke index drive every point, and a
    // championship can move courses between rounds
    return computeStandings(
      players,
      scores,
      active.course,
      active.tournament.handicapAllowance,
      mode,
    );
  }, [scores, mode, division, active]);
}

/** True when the day is scored as teams rather than individuals. */
export function isTeamFormat(t: Tournament | undefined): boolean {
  return t?.format === "Scramble" || t?.format === "Better Ball";
}

/**
 * The team board for a Scramble or Better Ball, in the same shape as the
 * individual board so the leaderboard can render either. A scramble scores the
 * team's single card off the blended team handicap; a better ball takes each
 * team's better member on every hole.
 */
export function useTeamStandings(mode: ViewMode, division?: string): StandingRow[] {
  const scores = useRoundScores();
  const active = useActiveTournament();
  const teamsByKey = useSim((s) => s.teams);
  const roster = useSim((s) => s.roster);

  return useMemo(() => {
    if (!active) return [];
    const t = active.tournament;
    const teams = teamsByKey[roundKeyOf(t.id, active.round ?? 1)] ?? [];
    const allowances = t.handicapAllowances ?? [t.handicapAllowance];
    const inputs = {
      course: active.course,
      allowances,
      maxCH: t.maxCourseHandicap,
      maxHoleScore: t.maxHoleScore,
    };
    const rows = teams
      .filter((tm) => !division || division === "Overall" || tm.division === division)
      .map((tm) => {
        const members = tm.playerIds
          .map((id) => roster.find((p) => p.id === id))
          .filter((p): p is Player => Boolean(p));
        return t.format === "Scramble"
          ? scrambleTeamRow(tm, members, scores[tm.id] ?? Array(18).fill(null), inputs)
          : betterBallTeamRow(tm, members, scores, inputs);
      });
    return teamStandings(rows, mode);
  }, [scores, mode, division, active, teamsByKey, roster]);
}

/** The Ryder Cup scoreboard for the active event, or null if it is not one. */
export function useRyderCupBoard(): RyderBoard | null {
  const active = useActiveTournament();
  const allScores = useSim((s) => s.scores);
  const roster = useSim((s) => s.roster);
  return useMemo(() => {
    const t = active?.tournament;
    if (!t?.ryderCup) return null;
    const sessions = roundsOf(t).map((r) => ({
      number: r.number,
      sessionFormat: r.sessionFormat ?? "singles",
      course: COURSES.find((c) => c.id === r.courseId) ?? active!.course,
    }));
    return ryderCupBoard(
      t.ryderCup,
      sessions,
      (round) => allScores[roundKeyOf(t.id, round)] ?? {},
      (id) => roster.find((p) => p.id === id)?.handicap ?? 0,
      t.maxHoleScore,
    );
  }, [active, allScores, roster]);
}

export interface CumulativeBoard {
  rows: CumulativeRow[];
  /** rounds that have at least one score in, in order */
  playedRounds: number[];
  /** the cut, once the round it follows has begun */
  cut: { afterRound: number; line: number | null; count: number } | null;
}

/**
 * The whole tournament: every round summed, with the cut applied so players
 * who missed it are marked but keep the scores they made.
 */
export function useCumulative(
  mode: ViewMode,
  division?: string,
): CumulativeBoard {
  const allScores = useSim((s) => s.scores);
  const pairings = useSim((s) => s.pairings);
  const roster = useSim((s) => s.roster);
  const active = useActiveTournament();

  return useMemo(() => {
    if (!active) return { rows: [], playedRounds: [], cut: null };
    const t = active.tournament;
    const rounds = roundsOf(t);

    const fieldIn = (rnd: number) =>
      (pairings[roundKeyOf(t.id, rnd)] ?? []).flatMap((g) => g.playerIds);

    const ids = new Set(rounds.flatMap((r) => fieldIn(r.number)));
    let players = [...ids]
      .map(
        (pid) =>
          roster.find((p) => p.id === pid) ?? PLAYERS.find((p) => p.id === pid),
      )
      .filter((p): p is Player => !!p);
    if (!players.length) players = active.players;
    if (division && division !== "Overall") {
      players = players.filter(
        (p) => divisionFor(p.handicap, t.divisions) === division,
      );
    }

    const byRound: RoundCards[] = rounds.map((r) => ({
      round: r.number,
      scores: allScores[roundKeyOf(t.id, r.number)] ?? {},
      course: COURSES.find((c) => c.id === r.courseId) ?? LIVE_COURSE,
    }));

    const rows = cumulativeStandings(
      players,
      byRound,
      t.handicapAllowance,
      mode,
      (rnd, pid) => fieldIn(rnd).includes(pid),
    );

    const playedRounds = byRound
      .filter((rc) => Object.values(rc.scores).some((c) => c.some((x) => x != null)))
      .map((rc) => rc.round);

    // a cut only means something once the round after it is under way
    const cutRound = rounds.find((r) => r.cut && r.cut.topN > 0);
    let cut: CumulativeBoard["cut"] = null;
    if (cutRound && active.round > cutRound.number) {
      const upTo = byRound.filter((rc) => rc.round <= cutRound.number);
      const thru = cumulativeStandings(players, upTo, t.handicapAllowance, mode);
      const res = applyCut(thru, cutRound.cut!.topN, mode);
      for (const r of rows) r.madeCut = res.survivors.has(r.player.id);
      cut = { afterRound: cutRound.number, line: res.line, count: res.count };
    }

    return { rows, playedRounds, cut };
  }, [allScores, pairings, roster, active, mode, division]);
}

/** The demo user's live status: position, points, thru. Demo mode only. */
export function useUserLive() {
  const scores = useRoundScores();
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

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Connectivity is the browser's to know: read it, don't mirror it into state. */
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function useSyncStatus() {
  const outbox = useSim((s) => s.outbox);
  const lastSyncedAt = useSim((s) => s.lastSyncedAt);
  const online = useOnline();
  const pending = outbox.filter((o) => o.status === "pending").length;
  const failed = outbox.filter((o) => o.status === "failed").length;
  return { online, pending, failed, lastSyncedAt };
}

/**
 * A clock that ticks slowly.
 *
 * Pace of play moves in minutes, so reading `Date.now()` during render is both
 * impure, which the React Compiler rightly refuses, and pointlessly precise.
 * Thirty seconds is finer than any decision a caddymaster makes with it.
 *
 * Lives here rather than in lib/pace.ts so that module stays free of React and
 * can keep being imported by the headless harness.
 */
export function useSlowClock(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
