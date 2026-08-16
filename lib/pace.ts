/**
 * Pace of play, captured passively.
 *
 * Three timestamps per group per round and nothing else: away, through the
 * turn, in. No marshal interface, no player-facing screen, no nudges. A group
 * that is behind is a conversation between the caddymaster and a starter, and
 * software that tells four members on the 11th tee to hurry up is software a
 * club switches off.
 *
 * All of it falls out of scoring that was happening anyway. Nobody presses
 * anything, which is the only reason to believe the numbers: a pace system
 * that depends on a marshal remembering to tap a button measures the marshal.
 *
 * Time is measured in holes played rather than hole numbers, so a shotgun
 * start works without a special case. A group that went off the 10th has
 * played nine holes when it reaches the clubhouse turn, the same as everyone
 * else.
 */

export interface GroupPace {
  /** roundKey, so a group's second round is a separate row */
  key: string;
  groupId: string;
  /** first score entered by anyone in the group */
  startedAt?: string;
  /** the group reached nine holes played */
  turnAt?: string;
  /** the group reached eighteen */
  finishedAt?: string;
}

export interface PaceReading {
  groupId: string;
  /** minutes, absent until the stamp exists */
  front?: number;
  back?: number;
  total?: number;
  /** minutes since the group teed off, for a group still out */
  elapsed?: number;
  holesPlayed: number;
  /** minutes behind the field average for the same number of holes */
  behind?: number;
  outOfPosition: boolean;
}

const MIN = 60_000;

function minutesBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MIN);
}

/** Minutes since a group teed off, given the clock. */
function elapsedFrom(startedAt: string | undefined, now: number) {
  if (!startedAt) return undefined;
  return Math.round((now - new Date(startedAt).getTime()) / MIN);
}

/**
 * Where every group stands.
 *
 * `holesPlayed` comes from the caller because pace does not own scores; it is
 * given the count and does arithmetic on it. Keeping the two apart is what
 * lets this be checked without a scoring engine.
 *
 * The field average is computed over groups at a comparable point rather than
 * over all groups. Comparing a group on the 4th against the average of a field
 * where half are on the 16th would call every early group slow, which is the
 * classic way these systems lose a club's trust in the first hour.
 */
export function paceReadings(
  paces: GroupPace[],
  holesPlayed: Record<string, number>,
  now: number,
  thresholdMin = 15,
): PaceReading[] {
  const rows = paces.map((p) => {
    const holes = holesPlayed[p.groupId] ?? 0;
    const front = minutesBetween(p.startedAt, p.turnAt);
    const back = minutesBetween(p.turnAt, p.finishedAt);
    const total = minutesBetween(p.startedAt, p.finishedAt);
    const elapsed = p.finishedAt
      ? total
      : elapsedFrom(p.startedAt, now);
    return { groupId: p.groupId, front, back, total, elapsed, holes };
  });

  /*
   * Minutes per hole across the field, from groups that have played enough to
   * mean something. Three holes is the floor: a group one hole in has a rate
   * dominated by however long they stood on the first tee.
   */
  const rates = rows
    .filter((r) => r.holes >= 3 && r.elapsed !== undefined)
    .map((r) => r.elapsed! / r.holes);
  const fieldRate =
    rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  return rows.map((r) => {
    let behind: number | undefined;
    if (fieldRate !== null && r.elapsed !== undefined && r.holes >= 3) {
      behind = Math.round(r.elapsed - fieldRate * r.holes);
    }
    return {
      groupId: r.groupId,
      front: r.front,
      back: r.back,
      total: r.total,
      elapsed: r.elapsed,
      holesPlayed: r.holes,
      behind,
      /*
       * Only a group still on the course can be out of position. Flagging a
       * group that has already returned its cards asks the desk to chase
       * people who are in the bar.
       */
      outOfPosition:
        behind !== undefined && behind >= thresholdMin && r.total === undefined,
    };
  });
}

/** "4h 12m", or "2h 06m". Blank when there is nothing to show yet. */
export function formatElapsed(minutes: number | undefined): string {
  if (minutes === undefined) return "·";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/**
 * Which stamp a score should set, given how many holes the group had played
 * before it and how many it has after.
 *
 * Returned rather than applied so the rule is checkable on its own. Crossing
 * nine and eighteen is what matters, and a group can cross both in one entry
 * when a card is typed at the desk in one go.
 */
export function stampsFor(
  before: number,
  after: number,
): { start: boolean; turn: boolean; finish: boolean } {
  return {
    start: before === 0 && after > 0,
    turn: before < 9 && after >= 9,
    finish: before < 18 && after >= 18,
  };
}

/**
 * A group's lifecycle, derived rather than stored.
 *
 * The desk's one question during a round is "what needs me?", and the answer
 * is scattered across scores (how far a group is round), certification (whether
 * its cards are in and sealed), and flags (whether anything went wrong). This
 * folds those into two axes so a group can be read at a glance from across the
 * room: a phase it is passing through, and whether it is asking for a human.
 *
 * Kept as primitives in and a plain object out, so it owns no store types and
 * can be checked on its own. Inputs are reduced by the caller, which already
 * holds the scores, certs and flags.
 */
export type GroupPhase =
  | "not-started"
  | "on-course"
  | "card-in"
  | "certified";

/** amber means a human is needed; red means something is wrong or disputed. */
export type GroupAttention = "none" | "review" | "dispute";

export interface GroupState {
  phase: GroupPhase;
  attention: GroupAttention;
}

export function groupState(opts: {
  /** min holes played across the group */
  thru: number;
  /** every card in the group is certified and sealed */
  allCertified: boolean;
  /** a card in the group is disputed or with the committee */
  anyDisputed: boolean;
  hasAmberFlag: boolean;
  hasRedFlag: boolean;
}): GroupState {
  const finished = opts.thru >= 18;
  const phase: GroupPhase = opts.allCertified
    ? "certified"
    : finished
      ? "card-in"
      : opts.thru > 0
        ? "on-course"
        : "not-started";

  // Attention is independent of phase: a group still on the course can carry a
  // marker discrepancy, and a card that is in can be disputed. Red outranks
  // amber, per the Three Flags Rule.
  const attention: GroupAttention =
    opts.hasRedFlag || opts.anyDisputed
      ? "dispute"
      : opts.hasAmberFlag
        ? "review"
        : "none";

  return { phase, attention };
}
