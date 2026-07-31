/**
 * What TV mode is allowed to believe.
 *
 * Everything the producer announces passes through here first. A figure on a
 * clubhouse screen is a claim the club is making in public about one of its
 * members, and it cannot be taken back once forty people have read it, so the
 * bar is deliberately higher than the bar for putting a number on a
 * leaderboard: the board can show a figure that is still settling, the
 * television cannot celebrate one.
 *
 * Three gates, in order:
 *
 *   1. Agreement. A live figure counts only when the player and their marker
 *      have entered the same number. Disagreement is a dispute, and a dispute
 *      is silence, not a guess at which of them is right.
 *
 *   2. Settling. An agreed figure waits out a cool-down before it may be
 *      announced, because the common correction is made within a minute of the
 *      entry, by the player who typed it. Waiting costs nothing and turns most
 *      corrections into something no one ever saw.
 *
 *   3. Plausibility. Rare things happen and should be celebrated; impossible
 *      things are usually a typo. The test is implausibility, never
 *      impressiveness, so a low handicap making eagle goes straight to air and
 *      the same eagle from a twenty-eight waits for a human to look at it.
 */

import { handicapSet, strokesReceived } from "@/lib/scoring";
import type { Course, Hole, Player } from "@/lib/types";
import type { ProducerConfig, ScoreRow } from "./types";

/** One hole that has cleared every gate and may be talked about. */
export interface SettledHole {
  round: number;
  playerId: string;
  /** 0-17 */
  hole: number;
  gross: number;
  /** epoch ms it became announceable */
  settledAt: number;
  via: "dual" | "desk";
}

function key(round: number, playerId: string, hole: number) {
  return `${round}:${playerId}:${hole}`;
}

/**
 * The holes that may be announced as at `now`.
 *
 * A desk card is settled by the act of publishing it: the caddymaster has
 * entered the whole card and then deliberately pushed it, with their PIN, so
 * there is nothing further to wait for. A live card is settled by agreement
 * plus the cool-down.
 */
export function settledHoles(
  rows: ScoreRow[],
  published: Record<number, Record<string, boolean>>,
  cfg: Pick<ProducerConfig, "cooldownMs">,
  now: number,
): SettledHole[] {
  const byHole = new Map<string, { player?: ScoreRow; marker?: ScoreRow; desk?: ScoreRow }>();
  for (const r of rows) {
    const k = key(r.round, r.playerId, r.hole);
    let slot = byHole.get(k);
    if (!slot) byHole.set(k, (slot = {}));
    const prev = slot[r.source];
    // keep the latest entry from each party
    if (!prev || r.at >= prev.at) slot[r.source] = r;
  }

  const out: SettledHole[] = [];
  for (const [k, slot] of byHole) {
    const [roundStr, playerId, holeStr] = k.split(":");
    const round = Number(roundStr);
    const hole = Number(holeStr);

    if (slot.desk && slot.desk.gross != null) {
      if (published[round]?.[playerId]) {
        out.push({
          round,
          playerId,
          hole,
          gross: slot.desk.gross,
          settledAt: slot.desk.at,
          via: "desk",
        });
      }
      continue;
    }

    const p = slot.player;
    const m = slot.marker;
    if (!p || !m) continue; // only one side has entered; nothing to agree with
    if (p.gross == null || m.gross == null) continue;
    if (p.gross !== m.gross) continue; // in dispute: say nothing at all

    const settledAt = Math.max(p.at, m.at) + cfg.cooldownMs;
    if (settledAt > now) continue; // still inside the cool-down
    out.push({ round, playerId, hole, gross: p.gross, settledAt, via: "dual" });
  }
  return out.sort((a, b) => a.settledAt - b.settledAt);
}

/** Strokes this player receives on this hole, at the tournament's allowance. */
export function shotsOn(
  player: Player,
  course: Course,
  hole: Hole,
  allowancePct: number,
  tee?: string,
) {
  const { ph } = handicapSet(player.handicap, course, allowancePct, tee);
  return strokesReceived(ph, hole.si);
}

/**
 * Strokes under par, gross.
 *
 * Deliberately measured against par and not against what the player's handicap
 * entitles them to. The first version of this judged a figure against par plus
 * the shots received, which reads well but is the wrong lens: receiving two
 * shots on a hole does not make a gross birdie there any less likely, it only
 * makes the net figure less remarkable. Judged that way, an ordinary birdie
 * from a twenty-eight came out as implausible as an eagle from a scratch, and
 * the high handicappers, who are most of the field and most of the reason
 * anyone is watching, would have had every good hole held for review.
 *
 * What is implausible is the golf, so the golf is what gets measured. The
 * handicap comes back in below, as the thing that decides how rare a given
 * piece of golf is.
 */
export function underPar(gross: number, hole: Hole): number {
  return hole.par - gross;
}

export interface Verdict {
  /** may go to air without a human looking at it */
  auto: boolean;
  /** why it is being held, phrased for the producer panel */
  reason?: string;
}

/**
 * Whether a moment can go straight to air.
 *
 * The thresholds are deliberately generous. Holding something that did happen
 * costs a few seconds and one tap; broadcasting something that did not costs
 * the club's confidence in the whole product, and it is the club's screen.
 */
export function judge(opts: {
  kind: "ace" | "eagle" | "course-record" | "other";
  player: Player;
  hole?: Hole;
  gross?: number;
  cfg: Pick<ProducerConfig, "aceApprovalHandicap">;
}): Verdict {
  const { kind, player, hole, gross, cfg } = opts;
  const hc = player.handicap;

  // A club's own record is the club's to confirm. It is rare enough that the
  // one tap costs nothing, and wrong badly enough that it must not be automatic.
  if (kind === "course-record")
    return { auto: false, reason: "Course record. Confirm before broadcast" };

  if (kind === "ace" && hc > cfg.aceApprovalHandicap)
    return { auto: false, reason: `Hole-in-one from a ${hc} handicap. Confirm` };

  if (hole && gross != null) {
    const under = underPar(gross, hole);

    // Three under on a single hole is an albatross. Club golf produces a
    // handful a decade; a mistyped entry produces one a week.
    if (under >= 3)
      return {
        auto: false,
        reason: `${gross} on a par ${hole.par}. Confirm before broadcast`,
      };

    // Eagles are the line where handicap starts to matter. A single figure
    // makes them; a twenty-eight making one is the story of their year, and
    // worth the four seconds it takes to nod at it first.
    if (under === 2) {
      if (hc > 18)
        return { auto: false, reason: `Eagle from a ${hc} handicap. Confirm` };
      if (hc > 12 && hole.si <= 2)
        return {
          auto: false,
          reason: `Eagle on stroke index ${hole.si} from a ${hc} handicap. Confirm`,
        };
    }
  }

  return { auto: true };
}

/** A card is complete when every hole of it has settled. */
export function cardComplete(holes: SettledHole[]) {
  return holes.length === 18;
}
