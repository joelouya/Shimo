/**
 * Finding things worth saying.
 *
 * Detection runs over settled holes only, so everything here can assume the
 * figure is real. What it decides is whether the figure is interesting, which
 * is a different question at a championship than at a club medal, and the
 * difference is the whole of `FieldProfile`.
 *
 * A championship field is tight and playing one course off one set of tees, so
 * gross figures carry their own meaning and the story is at the top of the
 * board. A club medal is twenty-eight handicaps wide, where gross says only who
 * is the better golfer; the story is who beat their own handicap, and it is
 * spread across the whole field, because most of the room is watching to see
 * themselves and their friends rather than the leader.
 *
 * Rarity is judged by measuring the golf against par and letting handicap
 * decide how rare that golf is, never by measuring against what a handicap
 * entitles a player to. See lib/tv/trust.ts for why.
 */

import { handicapSet, strokesReceived } from "@/lib/scoring";
import type { Course, Hole, Player } from "@/lib/types";
import { judge, shotsOn, underPar, type SettledHole } from "./trust";
import type {
  AnnouncementKind,
  CourseRecord,
  FieldProfile,
  ProducerConfig,
} from "./types";

/** A thing that happened, before it has been dressed up as an announcement. */
export interface Moment {
  kind: AnnouncementKind;
  playerId: string;
  round: number;
  /** identifies the fact, so it is announced at most once, ever */
  factKey: string;
  /** when it became known */
  at: number;
  /** how much it deserves the screen; ties break toward the older moment */
  priority: number;
  /** 0-17, when the moment belongs to one hole */
  hole?: number;
  gross?: number;
  /** held for admin approval, with the reason */
  holdReason?: string;
  /** anything the template needs that is cheaper to compute here */
  data?: Record<string, string | number>;
}

/**
 * How much each kind is worth when two want the screen at once.
 *
 * An ace outranks everything because a club may see one a year. A round coming
 * in is bottom because it happens forty times an afternoon, and it is a
 * courtesy rather than a headline.
 */
export const PRIORITY: Record<AnnouncementKind, number> = {
  ace: 100,
  "course-record": 95,
  eagle: 80,
  "net-eagle": 70,
  "lead-change": 65,
  streak: 55,
  "cut-line": 50,
  mover: 40,
  finish: 35,
  tie: 25,
  "round-in": 20,
  "leaderboard-update": 15,
  retraction: 90,
};

/** Net strokes under par on one hole, for a player at this allowance. */
export function netUnderPar(
  gross: number,
  hole: Hole,
  player: Player,
  course: Course,
  allowancePct: number,
) {
  return hole.par - (gross - shotsOn(player, course, hole, allowancePct));
}

/** Gross-first at a championship, net-first everywhere else. */
export function isNetFirst(profile: FieldProfile) {
  return profile === "club" || profile === "stableford";
}

function byHole(holes: SettledHole[]) {
  const out: (SettledHole | undefined)[] = Array(18);
  for (const h of holes) out[h.hole] = h;
  return out;
}

/**
 * Every moment on one player's settled card for one round.
 *
 * Called with the whole card each time rather than with the newest hole, so a
 * card that arrives all at once from the desk is read the same way as one that
 * trickled in over four hours. The producer de-duplicates by `factKey`, which
 * is what keeps that from re-announcing the morning.
 */
export function momentsForCard(opts: {
  player: Player;
  round: number;
  holes: SettledHole[];
  course: Course;
  allowancePct: number;
  profile: FieldProfile;
  cfg: Pick<ProducerConfig, "aceApprovalHandicap">;
  records: CourseRecord[];
  tee?: string;
}): Moment[] {
  const { player, round, holes, course, allowancePct, profile, cfg, records, tee } =
    opts;
  const out: Moment[] = [];
  const cells = byHole(holes);
  const pid = player.id;
  const base = (kind: AnnouncementKind, suffix: string) =>
    `${kind}:${round}:${pid}:${suffix}`;

  for (const h of holes) {
    const hole = course.holes[h.hole];
    if (!hole) continue;
    const gross = h.gross;
    const under = underPar(gross, hole);

    if (gross === 1) {
      const v = judge({ kind: "ace", player, hole, gross, cfg });
      out.push({
        kind: "ace",
        playerId: pid,
        round,
        factKey: base("ace", String(h.hole)),
        at: h.settledAt,
        priority: PRIORITY.ace,
        hole: h.hole,
        gross,
        holdReason: v.reason,
      });
      continue; // an ace is the moment on that hole; nothing else competes
    }

    if (under >= 2) {
      const v = judge({ kind: "eagle", player, hole, gross, cfg });
      out.push({
        kind: "eagle",
        playerId: pid,
        round,
        factKey: base("eagle", String(h.hole)),
        at: h.settledAt,
        priority: PRIORITY.eagle + (under >= 3 ? 10 : 0),
        hole: h.hole,
        gross,
        holdReason: v.reason,
        data: { under },
      });
      continue;
    }

    /*
     * Net eagle: two better than the hole after the player's shots. At a club
     * medal this is the equivalent moment for the two thirds of the field who
     * will never make a gross one, and leaving it out is what makes a
     * leaderboard feel like it belongs to the good players.
     */
    if (isNetFirst(profile)) {
      const net = netUnderPar(gross, hole, player, course, allowancePct);
      if (net >= 2 && under < 2) {
        out.push({
          kind: "net-eagle",
          playerId: pid,
          round,
          factKey: base("net-eagle", String(h.hole)),
          at: h.settledAt,
          priority: PRIORITY["net-eagle"],
          hole: h.hole,
          gross,
          data: { net },
        });
      }
    }
  }

  // Streaks: three in a row, counted in the terms this field is judged in.
  const streakAt = (i: number) => {
    const h = cells[i];
    const hole = course.holes[i];
    if (!h || !hole) return false;
    return isNetFirst(profile)
      ? netUnderPar(h.gross, hole, player, course, allowancePct) >= 1
      : underPar(h.gross, hole) >= 1;
  };
  let run = 0;
  for (let i = 0; i < 18; i++) {
    if (streakAt(i)) {
      run++;
      // fire once, on the hole that completes the third, and again only if the
      // run reaches five: a heater that keeps going is a new story
      if (run === 3 || run === 5) {
        out.push({
          kind: "streak",
          playerId: pid,
          round,
          factKey: base("streak", `${i}:${run}`),
          at: cells[i]!.settledAt,
          priority: PRIORITY.streak + (run >= 5 ? 8 : 0),
          hole: i,
          data: { run, term: isNetFirst(profile) ? "net" : "gross" },
        });
      }
    } else {
      run = 0;
    }
  }

  // The card as a whole, once every hole of it has settled.
  if (holes.length === 18) {
    const gross = holes.reduce((a, h) => a + h.gross, 0);
    const grossToPar = gross - course.par;
    const { ph } = handicapSet(player.handicap, course, allowancePct, tee);
    let netToPar = 0;
    for (const h of holes) {
      const hole = course.holes[h.hole];
      netToPar += h.gross - strokesReceived(ph, hole.si) - hole.par;
    }

    const record = records.find(
      (r) => r.courseId === course.id && (!tee || r.tee === tee),
    );
    if (record && gross < record.strokes) {
      const v = judge({ kind: "course-record", player, cfg });
      out.push({
        kind: "course-record",
        playerId: pid,
        round,
        factKey: base("course-record", String(gross)),
        at: holes[holes.length - 1].settledAt,
        priority: PRIORITY["course-record"],
        holdReason: v.reason,
        data: { gross, previous: record.strokes, holder: record.holder, tee: record.tee },
      });
    }

    const beat = isNetFirst(profile) ? netToPar : grossToPar;
    if (beat <= 0) {
      out.push({
        kind: "finish",
        playerId: pid,
        round,
        factKey: base("finish", String(gross)),
        at: holes[holes.length - 1].settledAt,
        priority: PRIORITY.finish,
        data: { gross, grossToPar, netToPar },
      });
    }

    out.push({
      kind: "round-in",
      playerId: pid,
      round,
      factKey: base("round-in", "card"),
      at: holes[holes.length - 1].settledAt,
      priority: PRIORITY["round-in"],
      data: { gross, grossToPar, netToPar },
    });
  }

  return out;
}

/**
 * Moments that come from the board moving rather than from one card: the lead
 * changing hands, a player arriving in the top ten, a tie forming or breaking.
 */
export function momentsForBoard(opts: {
  before: { playerId: string; position: number }[];
  after: { playerId: string; position: number }[];
  nameOf: (id: string) => string;
  round: number;
  at: number;
}): Moment[] {
  const { before, after, nameOf, round, at } = opts;
  const out: Moment[] = [];
  if (!after.length) return out;

  const leaderBefore = before.find((r) => r.position === 1)?.playerId;
  const leaderAfter = after.find((r) => r.position === 1)?.playerId;

  if (leaderAfter && leaderBefore && leaderAfter !== leaderBefore) {
    out.push({
      kind: "lead-change",
      playerId: leaderAfter,
      round,
      // keyed by the pair, so the lead swapping back later is its own moment
      factKey: `lead-change:${round}:${leaderBefore}>${leaderAfter}:${at}`,
      at,
      priority: PRIORITY["lead-change"],
      data: { outgoing: nameOf(leaderBefore) },
    });
  }

  const posBefore = new Map(before.map((r) => [r.playerId, r.position]));
  for (const row of after) {
    const was = posBefore.get(row.playerId);
    // arriving in the top ten from outside it, having climbed at least three
    if (was != null && was > 10 && row.position <= 10 && was - row.position >= 3) {
      out.push({
        kind: "mover",
        playerId: row.playerId,
        round,
        factKey: `mover:${round}:${row.playerId}:${row.position}`,
        at,
        priority: PRIORITY.mover,
        data: { from: was, to: row.position },
      });
    }
  }

  return out;
}
