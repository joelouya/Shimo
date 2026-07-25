/**
 * Rounds: the spine of a multi-round tournament.
 *
 * A club monthly medal has one round. A championship has several, each with its
 * own date, course, tees and pairings, and possibly a cut after it. Everything
 * that used to be "the tournament's scores" is now "this round's scores", keyed
 * by `roundKey(tournamentId, roundNumber)`.
 *
 * `roundsOf` is the compatibility seam: a tournament created before rounds
 * existed, or a seeded demo one, reads as a single round built from its
 * top-level date, course and tee fields. Nothing else needs to know.
 */

import type { Round, Tournament } from "./types";

/** Scores, pairings and certifications are all filed under this. */
export function roundKey(tournamentId: string, roundNumber: number): string {
  return `${tournamentId}#${roundNumber}`;
}

/** Every round of a tournament, in play order. Always at least one. */
export function roundsOf(t: Tournament): Round[] {
  if (t.rounds && t.rounds.length > 0) {
    return [...t.rounds].sort((a, b) => a.number - b.number);
  }
  return [
    {
      id: "r1",
      number: 1,
      name: "Round 1",
      date: t.date,
      courseId: t.courseId,
      tees: "",
      firstTee: t.firstTee,
      teeInterval: t.teeInterval,
      cut: null,
    },
  ];
}

export function roundOf(t: Tournament, roundNumber: number): Round {
  const rs = roundsOf(t);
  return rs.find((r) => r.number === roundNumber) ?? rs[0];
}

export function isMultiRound(t: Tournament): boolean {
  return roundsOf(t).length > 1;
}

/** The last round number that has a cut configured, if any. */
export function cutAfter(t: Tournament): number | null {
  const withCut = roundsOf(t).find((r) => r.cut && r.cut.topN > 0);
  return withCut ? withCut.number : null;
}

/**
 * The span a tournament covers, for cards and posters: a single date for one
 * round, or first-to-last for several.
 */
export function tournamentDates(t: Tournament): { start: string; end: string } {
  const rs = roundsOf(t);
  const dates = rs.map((r) => r.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Keep the tournament's mirrored round-1 fields in step with `rounds[0]`, so
 * lists and cards that read the top-level fields never drift from the rounds.
 */
export function withRoundsSynced(t: Tournament): Tournament {
  const rs = roundsOf(t);
  const first = rs[0];
  return {
    ...t,
    rounds: rs,
    date: first.date,
    courseId: first.courseId,
    firstTee: first.firstTee,
    teeInterval: first.teeInterval,
  };
}

/** A fresh round, used by the wizard when the admin adds one. */
export function makeRound(
  number: number,
  base: { date: string; courseId: string; tees: string; firstTee?: string; teeInterval?: number },
): Round {
  return {
    id: `r${number}`,
    number,
    name: `Round ${number}`,
    date: base.date,
    courseId: base.courseId,
    tees: base.tees,
    firstTee: base.firstTee ?? "07:30",
    teeInterval: base.teeInterval ?? 10,
    cut: null,
  };
}
