import type { Course, Hole, HoleScores, Player } from "./types";

/* ------------------------------------------------------------------ */
/* Handicap maths                                                      */
/* ------------------------------------------------------------------ */

/**
 * WHS Course Handicap: HI × (Slope ÷ 113) + (Course Rating − Par).
 * Falls back to the raw index when a course has no ratings.
 */
export function courseHandicap(handicapIndex: number, course: Course, tee?: string) {
  const rating =
    course.ratings?.find((r) => r.tee === (tee ?? course.tees)) ??
    course.ratings?.[0];
  if (!rating) return Math.round(handicapIndex);
  return Math.round(
    handicapIndex * (rating.slope / 113) + (rating.courseRating - course.par),
  );
}

/** Playing Handicap = Course Handicap × allowance. */
export function playingHandicap(handicapIndex: number, allowancePct: number) {
  return Math.round(handicapIndex * (allowancePct / 100));
}

/** The full HI → CH → PH chain, as shown on the card (Rule 3.3b(4)). */
export function handicapSet(
  handicapIndex: number,
  course: Course,
  allowancePct: number,
  tee?: string,
) {
  const ch = courseHandicap(handicapIndex, course, tee);
  const ph = Math.round(ch * (allowancePct / 100));
  return { hi: handicapIndex, ch, ph };
}

/** Strokes received on a hole given playing handicap and stroke index. */
export function strokesReceived(ph: number, si: number) {
  if (ph <= 0) return 0;
  return Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0);
}

export function stablefordPoints(hole: Hole, gross: number, ph: number) {
  const net = gross - strokesReceived(ph, hole.si);
  return Math.max(0, hole.par - net + 2);
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export type ViewMode = "points" | "net" | "gross";

export interface StandingRow {
  player: Player;
  thru: number; // holes completed
  grossTotal: number;
  grossToPar: number;
  netToPar: number;
  points: number;
  /** consecutive gross birdies-or-better ending at the last played hole */
  hotStreak: number;
  position: number;
  tied: boolean;
  /** gap to leader in the active view's unit (positive = behind) */
  gap: number;
  division?: string;
}

export function rowStats(
  player: Player,
  scores: HoleScores,
  course: Course,
  allowancePct: number,
) {
  const { ph } = handicapSet(player.handicap, course, allowancePct);
  let thru = 0;
  let grossTotal = 0;
  let grossToPar = 0;
  let netToPar = 0;
  let points = 0;
  let hotStreak = 0;
  for (let i = 0; i < 18; i++) {
    const gross = scores[i];
    if (gross == null) continue;
    const hole = course.holes[i];
    thru++;
    grossTotal += gross;
    grossToPar += gross - hole.par;
    netToPar += gross - strokesReceived(ph, hole.si) - hole.par;
    points += stablefordPoints(hole, gross, ph);
    if (gross <= hole.par - 1) hotStreak++;
    else hotStreak = 0;
  }
  return { thru, grossTotal, grossToPar, netToPar, points, hotStreak, ph };
}

/** Sort + position the field for a given view mode. */
export function computeStandings(
  players: Player[],
  scores: Record<string, HoleScores>,
  course: Course,
  allowancePct: number,
  mode: ViewMode,
): StandingRow[] {
  const rows = players.map((player) => {
    const s = rowStats(player, scores[player.id] ?? Array(18).fill(null), course, allowancePct);
    return {
      player,
      thru: s.thru,
      grossTotal: s.grossTotal,
      grossToPar: s.grossToPar,
      netToPar: s.netToPar,
      points: s.points,
      hotStreak: s.hotStreak,
      position: 0,
      tied: false,
      gap: 0,
    };
  });

  const key = (r: StandingRow) =>
    mode === "points" ? -r.points : mode === "net" ? r.netToPar : r.grossToPar;

  rows.sort((a, b) => {
    const d = key(a) - key(b);
    if (d !== 0) return d;
    if (b.thru !== a.thru) return b.thru - a.thru; // further along wins ties visually
    return a.player.name.localeCompare(b.player.name);
  });

  rows.forEach((r, i) => {
    if (i > 0 && key(r) === key(rows[i - 1])) {
      r.position = rows[i - 1].position;
    } else {
      r.position = i + 1;
    }
  });
  rows.forEach((r) => {
    r.tied = rows.filter((o) => o.position === r.position).length > 1;
  });

  const leaderKey = rows.length ? key(rows[0]) : 0;
  rows.forEach((r) => {
    r.gap = Math.abs(key(r) - leaderKey);
  });

  return rows;
}

export function divisionFor(handicap: number, divisions: { name: string; range: [number, number] }[]) {
  return divisions.find((d) => handicap >= d.range[0] && handicap <= d.range[1])?.name;
}

/* ------------------------------------------------------------------ */
/* Score generation (the simulated field)                              */
/* ------------------------------------------------------------------ */

/** Deterministic PRNG so every tab simulates identical golf. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a plausible gross score for a player on a hole.
 * `bias` shifts quality: negative = playing better than handicap.
 */
export function generateGross(
  hole: Hole,
  handicap: number,
  rnd: () => number,
  bias = 0,
) {
  const expected = hole.par + handicap / 18 + bias;
  // carry the fractional expectation honestly instead of rounding it away
  const base = Math.floor(expected);
  let gross = base + (rnd() < expected - base ? 1 : 0);
  // right-skewed outcomes — real golf has more blow-ups than hero holes
  const r = rnd();
  if (r < 0.05) gross -= 2;
  else if (r < 0.22) gross -= 1;
  else if (r < 0.62) gross += 0;
  else if (r < 0.85) gross += 1;
  else if (r < 0.95) gross += 2;
  else gross += 3;
  return Math.max(hole.par - 2, Math.min(hole.par + 5, gross));
}
