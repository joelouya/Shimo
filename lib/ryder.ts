/**
 * Ryder Cup scoring: two sides, several sessions, a running points total.
 *
 * An event shape rather than a format. Each session is a round played in one
 * match format - fourballs, foursomes, singles - and every match is worth a
 * point, a half for a halved match. The side that reaches the threshold first
 * has won and cannot be caught, which is the number the room watches.
 *
 * Every match reduces to `matchState` from team-scoring; what differs by format
 * is only how each side's per-hole net is worked out. Singles is one card a
 * side, fourball the better of the pair on each hole, foursomes a single ball
 * the pair share.
 */

import { courseHandicap } from "./scoring";
import { matchState, playerNetPerHole, type MatchResult } from "./team-scoring";
import type {
  Course,
  HoleScores,
  MaxHoleScore,
  RyderCupConfig,
  RyderMatch,
  RyderSessionFormat,
  RyderSide,
} from "./types";

/** The synthetic id a foursomes side's single ball is stored under. */
export function foursomesCardId(matchId: string, side: "A" | "B"): string {
  return `${matchId}:${side}`;
}

export interface RyderMatchResult extends MatchResult {
  match: RyderMatch;
  format: RyderSessionFormat;
  /** id of the side that is up, or null when all square */
  leaderSideId: string | null;
  /** points this match has awarded so far (0 until it is decided) */
  points: { a: number; b: number };
  decided: boolean;
}

export interface RyderBoard {
  sideA: RyderSide;
  sideB: RyderSide;
  matches: RyderMatchResult[];
  /** points awarded so far */
  totals: { a: number; b: number };
  pointsToWin: number;
  /** the side that has clinched, or null */
  clinchedBy: string | null;
  /** a headline like "8½ – 5½" */
  score: string;
}

interface Session {
  number: number;
  sessionFormat: RyderSessionFormat;
  course: Course;
}

/** A player's net-per-hole off a match handicap. */
function net(
  card: HoleScores | undefined,
  course: Course,
  ph: number,
  max: MaxHoleScore,
) {
  return playerNetPerHole(card ?? Array(18).fill(null), course, ph, max);
}

/** The better of a pair on each hole (fourball). */
function bestNet(
  ids: string[],
  scores: Record<string, HoleScores>,
  course: Course,
  phByPlayer: Record<string, number>,
  max: MaxHoleScore,
): (number | null)[] {
  const perMember = ids.map((id) => net(scores[id], course, phByPlayer[id] ?? 0, max));
  return course.holes.map((_, i) => {
    const nets = perMember.map((n) => n[i]).filter((v): v is number => v != null);
    return nets.length ? Math.min(...nets) : null;
  });
}

/** How halves-and-wins is written, with the ½ golf uses. */
function half(n: number): string {
  const whole = Math.floor(n);
  const frac = n - whole ? "½" : "";
  return whole === 0 && frac ? "½" : `${whole}${frac}`;
}

/**
 * Score a whole Ryder Cup. `handicapOf` gives a player's index; `scoresFor`
 * gives a session's scores (player cards for singles and fourball, and the
 * shared ball under foursomesCardId for foursomes).
 */
export function ryderCupBoard(
  config: RyderCupConfig,
  sessions: Session[],
  scoresFor: (round: number) => Record<string, HoleScores>,
  handicapOf: (playerId: string) => number,
  maxHoleScore: MaxHoleScore = "none",
): RyderBoard {
  const [sideA, sideB] = config.sides;

  const results: RyderMatchResult[] = config.matches.map((match) => {
    const session = sessions.find((s) => s.number === match.round);
    const format = session?.sessionFormat ?? "singles";
    const course = session?.course;
    const scores = scoresFor(match.round);

    let netA: (number | null)[] = Array(18).fill(null);
    let netB: (number | null)[] = Array(18).fill(null);

    if (course) {
      if (format === "foursomes") {
        // each side plays one ball off half their combined course handicap
        const sideCH = (ids: string[]) =>
          Math.round(0.5 * ids.reduce((s, id) => s + courseHandicap(handicapOf(id), course), 0));
        const chA = sideCH(match.sideA);
        const chB = sideCH(match.sideB);
        const low = Math.min(chA, chB);
        netA = net(scores[foursomesCardId(match.id, "A")], course, chA - low, maxHoleScore);
        netB = net(scores[foursomesCardId(match.id, "B")], course, chB - low, maxHoleScore);
      } else {
        // singles and fourball: every player plays off the match's low handicap
        const all = [...match.sideA, ...match.sideB];
        const ch: Record<string, number> = Object.fromEntries(
          all.map((id) => [id, courseHandicap(handicapOf(id), course)]),
        );
        const low = Math.min(...all.map((id) => ch[id]));
        const ph: Record<string, number> = Object.fromEntries(
          all.map((id) => [id, ch[id] - low]),
        );
        if (format === "singles") {
          netA = net(scores[match.sideA[0]], course, ph[match.sideA[0]] ?? 0, maxHoleScore);
          netB = net(scores[match.sideB[0]], course, ph[match.sideB[0]] ?? 0, maxHoleScore);
        } else {
          netA = bestNet(match.sideA, scores, course, ph, maxHoleScore);
          netB = bestNet(match.sideB, scores, course, ph, maxHoleScore);
        }
      }
    }

    const m = matchState(netA, netB);
    const decided = m.closed || (m.thru === 18 && m.remaining === 0);
    let points = { a: 0, b: 0 };
    if (decided) {
      if (m.upBy > 0) points = { a: config.winPoints, b: 0 };
      else if (m.upBy < 0) points = { a: 0, b: config.winPoints };
      else points = { a: config.halfPoints, b: config.halfPoints };
    }
    const leaderSideId = m.upBy > 0 ? sideA.id : m.upBy < 0 ? sideB.id : null;
    return { ...m, match, format, leaderSideId, points, decided };
  });

  const totals = results.reduce(
    (acc, r) => ({ a: acc.a + r.points.a, b: acc.b + r.points.b }),
    { a: 0, b: 0 },
  );
  const clinchedBy =
    totals.a >= config.pointsToWin ? sideA.id
    : totals.b >= config.pointsToWin ? sideB.id
    : null;

  return {
    sideA,
    sideB,
    matches: results,
    totals,
    pointsToWin: config.pointsToWin,
    clinchedBy,
    score: `${half(totals.a)} – ${half(totals.b)}`,
  };
}
