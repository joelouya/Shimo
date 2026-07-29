/**
 * Working out what kind of field this is.
 *
 * The same format wants different coverage depending on who turned up. A
 * championship is a tight field playing one course off one set of tees, where
 * a gross figure carries its own meaning and the story is at the top of the
 * board. A club medal is twenty-eight handicaps wide, where gross says only
 * who is the better golfer; the story there is who beat their own handicap,
 * and it is spread across the whole field.
 *
 * Guessed from the handicaps because a club should not have to answer a
 * question it has not thought about, and overridable because the guess will
 * sometimes be wrong: a scratch field playing a fun day wants the club
 * treatment, and an invitational with three high handicaps in it does not.
 */

import type { Format, Player } from "@/lib/types";
import type { FieldProfile } from "./types";

/** The value at a given percentile of a sorted list. */
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

export interface ProfileGuess {
  profile: FieldProfile;
  /** phrased for the wizard, so the club can see why */
  because: string;
}

export function detectProfile(format: Format, players: Player[]): ProfileGuess {
  if (format === "Better Ball" || format === "Scramble")
    return { profile: "team", because: `${format} is played in teams` };

  if (format === "Stableford")
    return {
      profile: "stableford",
      because: "Stableford already compresses the field",
    };

  const hcs = players.map((p) => p.handicap).sort((a, b) => a - b);
  if (hcs.length < 6)
    return {
      profile: "club",
      because: "Too few entries yet to tell — club treatment for now",
    };

  /*
   * Read the middle of the field rather than its edges. One scratch player and
   * one twenty-eight in an otherwise even field say almost nothing about it,
   * and using the full range would let either of them decide the whole
   * afternoon's coverage.
   */
  const low = percentile(hcs, 0.1);
  const high = percentile(hcs, 0.9);
  const spread = high - low;
  const median = percentile(hcs, 0.5);

  if (spread <= 8 && median <= 10)
    return {
      profile: "championship",
      because: `Handicaps ${low} to ${high} — a tight field, so gross figures mean something`,
    };

  return {
    profile: "club",
    because: `Handicaps ${low} to ${high} — a wide field, so net is the fairer story`,
  };
}

export const PROFILE_LABEL: Record<FieldProfile, string> = {
  championship: "Championship",
  club: "Club medal",
  stableford: "Stableford",
  team: "Team format",
};

export const PROFILE_HELP: Record<FieldProfile, string> = {
  championship:
    "Gross figures, drama at the top of the board. For a tight field off one set of tees.",
  club: "Net figures, moments spread across the whole field. For a normal club day.",
  stableford: "Points, with net moments. Stableford compresses the field already.",
  team: "Team moments rather than individual ones.",
};

/* ------------------------------------------------------------------ */

/**
 * A settled card that beats the club's stored record.
 *
 * Deliberately a question rather than an action. Shimo has one afternoon's
 * view of a course a club has been playing for eighty years, and a stored
 * record that looks beaten is far more often a record nobody has updated
 * since the tees moved than it is history being made. So the club is asked,
 * and the record only changes when someone says so.
 *
 * Separate from the course-record announcement, which is about the screen.
 * This is about the club's own books, and a club may well want the second
 * without the first.
 */
export interface RecordClaim {
  courseId: string;
  tee: string;
  strokes: number;
  holder: string;
  /** what is on the books now, if anything */
  previous?: { strokes: number; holder: string; year: number };
}

export function recordClaims(opts: {
  cards: { playerId: string; strokes: number; complete: boolean }[];
  nameOf: (id: string) => string;
  courseId: string;
  tee: string;
  records: { courseId: string; tee: string; strokes: number; holder: string; year: number }[];
}): RecordClaim[] {
  const { cards, nameOf, courseId, tee, records } = opts;
  const held = records.find((r) => r.courseId === courseId && r.tee === tee);

  const best = cards
    .filter((c) => c.complete)
    .sort((a, b) => a.strokes - b.strokes)[0];
  if (!best) return [];

  // With nothing on the books there is nothing to beat, and the first score
  // Shimo happens to see is not a course record.
  if (!held) return [];
  if (best.strokes >= held.strokes) return [];

  return [
    {
      courseId,
      tee,
      strokes: best.strokes,
      holder: nameOf(best.playerId),
      previous: { strokes: held.strokes, holder: held.holder, year: held.year },
    },
  ];
}
