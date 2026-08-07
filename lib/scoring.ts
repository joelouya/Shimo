import type { Course, Hole, HoleScores, MaxHoleScore, Player } from "./types";

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

/**
 * The gross that counts toward net and points once a maximum-hole-score rule
 * is applied. The actual gross a player made is never changed - a real strokes
 * total stays real - but net stroke play and a fixed cap both look at a capped
 * figure. Net double bogey (par + strokes received + 2) is the WHS default and
 * is exactly the score at which Stableford already gives nothing, so it leaves
 * points untouched and only tidies net stroke play.
 */
export function countingGross(
  gross: number,
  hole: Hole,
  ph: number,
  max: MaxHoleScore = "none",
): number {
  if (max === "none") return gross;
  if (max === "net-double-bogey") {
    return Math.min(gross, hole.par + strokesReceived(ph, hole.si) + 2);
  }
  return Math.min(gross, max);
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

/**
 * Per-hole totals for one card off a known playing handicap.
 *
 * The maths that used to live inside rowStats, pulled out so a team card - a
 * scramble ball, a better-ball hole, a foursomes ball - can be scored off a
 * team playing handicap that was worked out somewhere else, instead of being
 * re-derived from an individual's index.
 */
export function cardStats(
  scores: HoleScores,
  course: Course,
  ph: number,
  maxHoleScore: MaxHoleScore = "none",
) {
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
    // the real gross made, and the (possibly capped) gross that counts
    const counted = countingGross(gross, hole, ph, maxHoleScore);
    thru++;
    grossTotal += gross;
    grossToPar += gross - hole.par;
    netToPar += counted - strokesReceived(ph, hole.si) - hole.par;
    points += stablefordPoints(hole, counted, ph);
    if (gross <= hole.par - 1) hotStreak++;
    else hotStreak = 0;
  }
  return { thru, grossTotal, grossToPar, netToPar, points, hotStreak };
}

export function rowStats(
  player: Player,
  scores: HoleScores,
  course: Course,
  allowancePct: number,
  maxHoleScore: MaxHoleScore = "none",
) {
  const { ph } = handicapSet(player.handicap, course, allowancePct);
  return { ...cardStats(scores, course, ph, maxHoleScore), ph };
}

/** Sort + position the field for a given view mode. */
export function computeStandings(
  players: Player[],
  scores: Record<string, HoleScores>,
  course: Course,
  allowancePct: number,
  mode: ViewMode,
  maxHoleScore: MaxHoleScore = "none",
): StandingRow[] {
  const rows = players.map((player) => {
    const s = rowStats(
      player,
      scores[player.id] ?? Array(18).fill(null),
      course,
      allowancePct,
      maxHoleScore,
    );
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

  return positionStandings(rows, mode);
}

/**
 * Sort, rank and gap a set of already-computed rows. Shared so a team board or
 * a derived better-ball board positions the same way an individual one does -
 * ties share a position, the leader's gap is zero, the one further round the
 * course breaks a dead heat visually.
 */
export function positionStandings(rows: StandingRow[], mode: ViewMode): StandingRow[] {
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
  // right-skewed outcomes - real golf has more blow-ups than hero holes
  const r = rnd();
  if (r < 0.05) gross -= 2;
  else if (r < 0.22) gross -= 1;
  else if (r < 0.62) gross += 0;
  else if (r < 0.85) gross += 1;
  else if (r < 0.95) gross += 2;
  else gross += 3;
  return Math.max(hole.par - 2, Math.min(hole.par + 5, gross));
}

/* ------------------------------------------------------------------ */
/* Multi-round: cumulative standings and the cut                       */
/* ------------------------------------------------------------------ */

/** One round's cards, with the course that round was played on. */
export interface RoundCards {
  round: number;
  /** playerId -> that player's card for this round */
  scores: Record<string, HoleScores>;
  course: Course;
}

export interface RoundLine {
  round: number;
  thru: number;
  grossTotal: number;
  grossToPar: number;
  netToPar: number;
  points: number;
  /** the player was not in this round's field, having missed the cut */
  missed: boolean;
}

export interface CumulativeRow {
  player: Player;
  /** one entry per round, in order */
  rounds: RoundLine[];
  /** totals across every round the player actually played */
  thru: number;
  grossTotal: number;
  grossToPar: number;
  netToPar: number;
  points: number;
  hotStreak: number;
  position: number;
  tied: boolean;
  gap: number;
  /** false once the player has missed a cut; they keep their scores */
  madeCut: boolean;
  division?: string;
}

/** Lower is better in every mode, so one comparator serves all three. */
function rankKey(
  r: { points: number; netToPar: number; grossToPar: number },
  mode: ViewMode,
) {
  return mode === "points" ? -r.points : mode === "net" ? r.netToPar : r.grossToPar;
}

/**
 * Standings across several rounds. A player's total is the sum of the rounds
 * they played; a round they missed the cut for contributes nothing and is
 * marked so the table can show it as such.
 *
 * `playedIn` decides who counted in which round: pass the field for each round
 * (normally its pairings), so a player cut after round 2 is not treated as
 * having shot nothing in round 3.
 */
export function cumulativeStandings(
  players: Player[],
  byRound: RoundCards[],
  allowancePct: number,
  mode: ViewMode,
  playedIn?: (round: number, playerId: string) => boolean,
): CumulativeRow[] {
  const ordered = [...byRound].sort((a, b) => a.round - b.round);

  const rows: CumulativeRow[] = players.map((player) => {
    const lines: RoundLine[] = [];
    let thru = 0;
    let grossTotal = 0;
    let grossToPar = 0;
    let netToPar = 0;
    let points = 0;
    let hotStreak = 0;

    for (const rc of ordered) {
      const inField = playedIn ? playedIn(rc.round, player.id) : true;
      const card = rc.scores[player.id] ?? [];
      const st = rowStats(player, card, rc.course, allowancePct);
      lines.push({
        round: rc.round,
        thru: st.thru,
        grossTotal: st.grossTotal,
        grossToPar: st.grossToPar,
        netToPar: st.netToPar,
        points: st.points,
        missed: !inField && st.thru === 0,
      });
      if (!inField && st.thru === 0) continue;
      thru += st.thru;
      grossTotal += st.grossTotal;
      grossToPar += st.grossToPar;
      netToPar += st.netToPar;
      points += st.points;
      hotStreak = st.hotStreak; // the streak that matters is the current one
    }

    return {
      player,
      rounds: lines,
      thru,
      grossTotal,
      grossToPar,
      netToPar,
      points,
      hotStreak,
      position: 0,
      tied: false,
      gap: 0,
      madeCut: true,
    };
  });

  rows.sort((a, b) => {
    const d = rankKey(a, mode) - rankKey(b, mode);
    if (d !== 0) return d;
    if (b.thru !== a.thru) return b.thru - a.thru;
    return a.player.name.localeCompare(b.player.name);
  });

  rows.forEach((r, i) => {
    r.position =
      i > 0 && rankKey(r, mode) === rankKey(rows[i - 1], mode)
        ? rows[i - 1].position
        : i + 1;
  });
  rows.forEach((r) => {
    r.tied = rows.filter((o) => o.position === r.position).length > 1;
  });
  const leader = rows.length ? rankKey(rows[0], mode) : 0;
  rows.forEach((r) => {
    r.gap = Math.abs(rankKey(r, mode) - leader);
  });

  return rows;
}

export interface CutResult {
  /** ids that survive the cut */
  survivors: Set<string>;
  /** the score at the cut, in the active mode's unit */
  line: number | null;
  /** how many made it, ties included, which is usually more than topN */
  count: number;
}

/**
 * Top `topN` and everyone tied with the last of them. Ties are always kept,
 * which is why a "top 30" cut routinely returns 33 players.
 *
 * Only players who have actually returned a score are eligible; someone with
 * no card cannot make a cut.
 */
export function applyCut(
  rows: CumulativeRow[],
  topN: number,
  mode: ViewMode,
): CutResult {
  const played = rows.filter((r) => r.thru > 0);
  if (topN <= 0 || played.length === 0) {
    return { survivors: new Set(played.map((r) => r.player.id)), line: null, count: played.length };
  }
  if (played.length <= topN) {
    return {
      survivors: new Set(played.map((r) => r.player.id)),
      line: rankKey(played[played.length - 1], mode),
      count: played.length,
    };
  }
  const line = rankKey(played[topN - 1], mode);
  const survivors = played.filter((r) => rankKey(r, mode) <= line);
  return {
    survivors: new Set(survivors.map((r) => r.player.id)),
    line,
    count: survivors.length,
  };
}

/** The cut line as it reads on a board: "+8" in strokes, "62 pts" in points. */
export function formatCutLine(line: number | null, mode: ViewMode): string {
  if (line == null) return "";
  if (mode === "points") return `${-line} pts`;
  return line === 0 ? "E" : line > 0 ? `+${line}` : `${line}`;
}
