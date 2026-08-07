/**
 * Team and match scoring, sitting beside the individual engine in scoring.ts
 * and reusing it. Three shapes of golf the individual board could never show:
 *
 *   - a scramble, where a team plays one ball and owns one card;
 *   - a better ball, where each member keeps their own card and the team takes
 *     the better score on each hole;
 *   - a match, where two sides are compared hole by hole rather than totalled.
 *
 * The maths that decides who has a stroke where is the same as everywhere else
 * (`strokesReceived`, `countingGross`); what changes is whose scores combine
 * and how they are compared.
 */

import {
  cardStats,
  countingGross,
  courseHandicap,
  positionStandings,
  strokesReceived,
  type StandingRow,
  type ViewMode,
} from "./scoring";
import type {
  Course,
  HoleScores,
  MaxHoleScore,
  Player,
  Team,
} from "./types";

/* ------------------------------------------------------------------ *
 * Handicaps
 * ------------------------------------------------------------------ */

/** Each member's course handicap, capped at `maxCH` before anything is done
 *  with it. */
export function memberCourseHandicaps(
  members: Player[],
  course: Course,
  tee?: string,
  maxCH?: number,
): number[] {
  return members.map((m) => {
    const ch = courseHandicap(m.handicap, course, tee);
    return maxCH != null ? Math.min(ch, maxCH) : ch;
  });
}

/**
 * A scramble team's single playing handicap: the lowest course handicap gets
 * the first allowance, the next the second, and so on. A two-person scramble
 * off [35, 15] gives the low player 35% and the high player 15%, summed. Fewer
 * allowances than members means the trailing members contribute nothing, which
 * is how a four-person scramble at [25, 20, 15, 10] behaves.
 */
export function teamPlayingHandicap(
  members: Player[],
  course: Course,
  allowances: number[],
  maxCH?: number,
  tee?: string,
): number {
  const chs = memberCourseHandicaps(members, course, tee, maxCH).sort(
    (a, b) => a - b,
  );
  const total = chs.reduce(
    (sum, ch, i) => sum + ch * ((allowances[i] ?? 0) / 100),
    0,
  );
  return Math.round(total);
}

/* ------------------------------------------------------------------ *
 * Scramble — one card, one team handicap
 * ------------------------------------------------------------------ */

/** A synthetic player standing in for the team, so the shared board code can
 *  render it. Its handicap field carries the team playing handicap already, and
 *  its club is the members' so a per-row club lookup resolves. */
export function teamAsPlayer(team: Team, teamPH: number, clubId = ""): Player {
  return {
    id: team.id,
    clubId,
    name: team.name,
    handicap: teamPH,
    gender: "M",
    division: team.division,
  } as Player;
}

export interface TeamScoreInputs {
  course: Course;
  allowances: number[];
  maxCH?: number;
  maxHoleScore?: MaxHoleScore;
  tee?: string;
}

/**
 * A scramble team's board row. The team owns one card (stored under its id the
 * way a player's is under theirs), scored off the blended team handicap.
 */
export function scrambleTeamRow(
  team: Team,
  members: Player[],
  teamCard: HoleScores,
  o: TeamScoreInputs,
): StandingRow {
  const teamPH = teamPlayingHandicap(members, o.course, o.allowances, o.maxCH, o.tee);
  const s = cardStats(teamCard, o.course, teamPH, o.maxHoleScore ?? "none");
  return {
    player: teamAsPlayer(team, teamPH, members[0]?.clubId),
    ...s,
    position: 0,
    tied: false,
    gap: 0,
    division: team.division,
  };
}

/* ------------------------------------------------------------------ *
 * Better ball — every member keeps a card, the team takes the better hole
 * ------------------------------------------------------------------ */

/** One member's net and points on a hole, off their own playing handicap. */
function holeFor(
  gross: number,
  holeIdx: number,
  course: Course,
  ph: number,
  max: MaxHoleScore,
) {
  const hole = course.holes[holeIdx];
  const counted = countingGross(gross, hole, ph, max);
  return {
    netToPar: counted - strokesReceived(ph, hole.si) - hole.par,
    grossToPar: gross - hole.par,
    points: Math.max(0, hole.par - (counted - strokesReceived(ph, hole.si)) + 2),
  };
}

/**
 * A better-ball team's board row. On each hole the team takes its best member:
 * the lowest net (and, for the points view, the highest Stableford), which can
 * be two different members on the same hole - that is the point of better ball.
 * Members play off their own handicaps, so this passes each member's own PH.
 */
export function betterBallTeamRow(
  team: Team,
  members: Player[],
  memberScores: Record<string, HoleScores>,
  o: TeamScoreInputs,
): StandingRow {
  const phs = members.map((m) => {
    const ch = courseHandicap(m.handicap, o.course, o.tee);
    const capped = o.maxCH != null ? Math.min(ch, o.maxCH) : ch;
    return Math.round(capped * ((o.allowances[0] ?? 100) / 100));
  });
  const max = o.maxHoleScore ?? "none";
  let thru = 0;
  let grossToPar = 0;
  let netToPar = 0;
  let points = 0;
  for (let i = 0; i < 18; i++) {
    const played = members
      .map((m, k) => ({ gross: memberScores[m.id]?.[i], ph: phs[k] }))
      .filter((x): x is { gross: number; ph: number } => x.gross != null);
    if (!played.length) continue;
    thru++;
    const holes = played.map((p) => holeFor(p.gross, i, o.course, p.ph, max));
    grossToPar += Math.min(...holes.map((h) => h.grossToPar));
    netToPar += Math.min(...holes.map((h) => h.netToPar));
    points += Math.max(...holes.map((h) => h.points));
  }
  return {
    player: teamAsPlayer(team, Math.min(...phs), members[0]?.clubId),
    thru,
    grossTotal: 0,
    grossToPar,
    netToPar,
    points,
    hotStreak: 0,
    position: 0,
    tied: false,
    gap: 0,
    division: team.division,
  };
}

/** Position a set of team rows the same way the individual board is ranked. */
export function teamStandings(rows: StandingRow[], mode: ViewMode): StandingRow[] {
  return positionStandings(rows, mode);
}

/* ------------------------------------------------------------------ *
 * Match play — two sides, compared hole by hole
 * ------------------------------------------------------------------ */

export interface MatchResult {
  /** holes both sides have completed */
  thru: number;
  /** holes still to play */
  remaining: number;
  /** positive: side A is up by this many; negative: side B; 0: all square */
  upBy: number;
  /** the match cannot be caught: over before the 18th */
  closed: boolean;
  /** the lead now equals the holes remaining */
  dormie: boolean;
  /** "3 & 2", "2 up", "AS", "1 up" */
  status: string;
}

/**
 * The pure match engine: two per-hole net arrays in, a match state out. Every
 * format reduces to this - singles gives a member's net, fourball the better
 * net of the pair, foursomes the single ball's net - so the up/down/dormie/
 * closed logic lives in one honest place and is tested on its own.
 */
export function matchState(
  netA: (number | null)[],
  netB: (number | null)[],
): MatchResult {
  let upBy = 0;
  let thru = 0;
  let closed = false;
  let closeMargin = 0;
  let closeRemaining = 0;
  for (let i = 0; i < 18; i++) {
    if (netA[i] == null || netB[i] == null) break; // a pair plays in order
    thru++;
    if ((netA[i] as number) < (netB[i] as number)) upBy++;
    else if ((netB[i] as number) < (netA[i] as number)) upBy--;
    const remaining = 18 - thru;
    if (!closed && Math.abs(upBy) > remaining) {
      closed = true;
      closeMargin = Math.abs(upBy);
      closeRemaining = remaining;
    }
  }
  const remaining = 18 - thru;
  const dormie = !closed && Math.abs(upBy) === remaining && remaining > 0;

  let status: string;
  if (closed) {
    status = closeRemaining > 0 ? `${closeMargin} & ${closeRemaining}` : `${closeMargin} up`;
  } else if (upBy === 0) {
    status = thru === 18 ? "Halved" : "AS";
  } else {
    status = `${Math.abs(upBy)} up`;
  }
  return { thru, remaining, upBy, closed, dormie, status };
}

/**
 * Strokes each player receives per hole in a match: everyone plays off the
 * lowest course handicap in the match and receives the full difference (the
 * standard match-play allowance). Returns a per-player playing figure to feed
 * strokesReceived.
 */
export function matchStrokeHandicaps(
  players: Player[],
  course: Course,
  tee?: string,
): Record<string, number> {
  const chs = players.map((p) => ({ id: p.id, ch: courseHandicap(p.handicap, course, tee) }));
  const low = Math.min(...chs.map((c) => c.ch));
  return Object.fromEntries(chs.map((c) => [c.id, c.ch - low]));
}

/** One player's net-to-par per hole, for feeding matchState. */
export function playerNetPerHole(
  scores: HoleScores,
  course: Course,
  ph: number,
  max: MaxHoleScore = "none",
): (number | null)[] {
  return course.holes.map((hole, i) => {
    const gross = scores[i];
    if (gross == null) return null;
    return countingGross(gross, hole, ph, max) - strokesReceived(ph, hole.si) - hole.par;
  });
}

/** A pair's better net per hole (fourball): the lower of the two members. */
export function bestNetPerHole(
  members: Player[],
  memberScores: Record<string, HoleScores>,
  course: Course,
  phByPlayer: Record<string, number>,
  max: MaxHoleScore = "none",
): (number | null)[] {
  const perMember = members.map((m) =>
    playerNetPerHole(memberScores[m.id] ?? Array(18).fill(null), course, phByPlayer[m.id] ?? 0, max),
  );
  return course.holes.map((_, i) => {
    const nets = perMember.map((n) => n[i]).filter((v): v is number => v != null);
    return nets.length ? Math.min(...nets) : null;
  });
}
