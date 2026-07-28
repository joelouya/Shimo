/**
 * The producer.
 *
 * A pure reducer. Every input is an event and a time, every output is a new
 * state, and nothing in here reaches for a clock, a socket or the DOM. That is
 * deliberate: the interesting cases are all about timing, and the only way to
 * test "a correction arrives while the eagle is on screen" honestly is to be
 * able to say exactly when each of those happened.
 *
 * What it is doing, in one paragraph. Snapshots arrive; it works out what has
 * settled, turns that into moments, drops anything it has said before, sends
 * the implausible ones to an admin and the rest to a queue. A queue item waits
 * for the screen to be free and for a decent gap since the last one, then
 * plays for as long as its kind is worth, then the board comes back. Every so
 * often, if nothing else is happening, it puts up a feature instead. In quiet
 * mode it does none of this and shows the board.
 *
 * The rule underneath all of it: it would rather say nothing than say something
 * it would have to take back.
 */

import { cumulativeStandings, type ViewMode } from "@/lib/scoring";
import { clubById, COURSES } from "@/lib/data";
import { roundsOf } from "@/lib/rounds";
import type { Course } from "@/lib/types";
import { isNetFirst, momentsForBoard, momentsForCard, type Moment } from "./detect";
import { settledHoles, type SettledHole } from "./trust";
import { nextFeature } from "./features";
import type {
  Announcement,
  HistoryEntry,
  ProducerConfig,
  ProducerState,
  TvSnapshot,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

/**
 * Kinds re-derived from the card on every snapshot.
 *
 * These can stop being true: a card is corrected, or a marker changes their
 * entry and the two no longer agree. Anything here that vanishes must be
 * pulled back out of the queue before it airs.
 *
 * Lead changes and movers are not in the list. They describe a moment the
 * board passed through rather than a fact about a card, so they are not
 * re-derived and must not be pruned for failing to reappear.
 */
const DURABLE = new Set([
  "ace", "eagle", "net-eagle", "streak", "finish", "round-in", "course-record",
]);

/**
 * The ones worth acknowledging if they are later undone. All rare, so the
 * soft update card that follows stays rare too.
 */
const MATERIAL = new Set(["ace", "eagle", "net-eagle", "course-record"]);

/** How long each kind holds the screen. */
export const DURATION: Record<string, number> = {
  ace: 10_000,
  "course-record": 12_000,
  eagle: 6_000,
  "net-eagle": 6_000,
  "cut-line": 6_000,
  "lead-change": 5_000,
  streak: 4_000,
  mover: 4_000,
  finish: 4_000,
  "round-in": 3_000,
  tie: 3_000,
  "leaderboard-update": 5_000,
  retraction: 6_000,
};

export type ProducerEvent =
  | { type: "snapshot"; snapshot: TvSnapshot }
  | { type: "tick" }
  | { type: "config"; patch: Partial<ProducerConfig> }
  | { type: "approve"; id: string }
  | { type: "reject"; id: string }
  | { type: "cancel"; id: string }
  | { type: "skip" }
  | { type: "test" }
  | { type: "retract"; player: string };

export function initialState(config?: Partial<ProducerConfig>): ProducerState {
  return {
    mode: "leaderboard",
    playing: null,
    queue: [],
    pending: [],
    announced: [],
    recentSubjects: [],
    nextSlotAt: 0,
    nextFeatureAt: 0,
    featureTurn: 0,
    history: [],
    config: { ...DEFAULT_CONFIG, ...config },
    lastAt: 0,
    appliedDecision: 0,
    materialShown: [],
  };
}

/* ------------------------------------------------------------------ */
/* Standings, the one derived thing the producer needs                 */
/* ------------------------------------------------------------------ */

export function modeOf(snapshot: TvSnapshot): ViewMode {
  if (snapshot.tournament.format === "Stableford") return "points";
  return isNetFirst(snapshot.tournament.fieldProfile ?? "club") ? "net" : "gross";
}

/**
 * The board as the producer sees it, built only from settled figures.
 *
 * The visible leaderboard may legitimately show more than this: a figure one
 * player has entered belongs on a board as a provisional number. It does not
 * belong in a decision about whether the lead has changed hands, because a
 * lead change announced off one unconfirmed entry is exactly the thing that
 * has to be taken back.
 */
export function standingsFrom(
  snapshot: TvSnapshot,
  settled: SettledHole[],
): { playerId: string; position: number }[] {
  const t = snapshot.tournament;
  const cardsByRound = new Map<number, Record<string, (number | null)[]>>();
  for (const h of settled) {
    let bucket = cardsByRound.get(h.round);
    if (!bucket) cardsByRound.set(h.round, (bucket = {}));
    (bucket[h.playerId] ??= Array(18).fill(null))[h.hole] = h.gross;
  }

  const rounds = roundsOf(t);
  const byRound = rounds.map((r) => ({
    round: r.number,
    scores: cardsByRound.get(r.number) ?? {},
    course: COURSES.find((c) => c.id === r.courseId) ?? snapshot.course,
  }));

  const rows = cumulativeStandings(
    snapshot.players ?? [],
    byRound,
    t.handicapAllowance,
    modeOf(snapshot),
    (rnd, pid) => ((snapshot.fieldByRound ?? {})[rnd] ?? []).includes(pid),
  );
  // a player who has not played a hole yet is not in the running
  return rows
    .filter((r) => r.thru > 0)
    .map((r) => ({ playerId: r.player.id, position: r.position }));
}

/**
 * The board as the screen shows it: every figure posted, not only the settled
 * ones. Features describe the afternoon rather than celebrate a moment, so
 * they read the same board a member is looking at.
 */
export function boardRows(snapshot: TvSnapshot, settled: SettledHole[]) {
  void settled;
  const t = snapshot.tournament;
  const cards: Record<number, Record<string, (number | null)[]>> = {};
  for (const r of snapshot.rows ?? []) {
    if (r.source === "marker") continue;
    ((cards[r.round] ??= {})[r.playerId] ??= Array(18).fill(null))[r.hole] = r.gross;
  }
  return cumulativeStandings(
    snapshot.players ?? [],
    roundsOf(t).map((r) => ({
      round: r.number,
      scores: cards[r.number] ?? {},
      course: COURSES.find((c) => c.id === r.courseId) ?? snapshot.course,
    })),
    t.handicapAllowance,
    modeOf(snapshot),
    (rnd, pid) => ((snapshot.fieldByRound ?? {})[rnd] ?? []).includes(pid),
  ).filter((r) => r.thru > 0);
}

/* ------------------------------------------------------------------ */
/* Dressing a moment up as something to look at                        */
/* ------------------------------------------------------------------ */

const ORDINAL = [
  "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th",
  "10th", "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th",
];

function holeLine(course: Course, hole: number | undefined) {
  if (hole == null) return undefined;
  const h = course.holes[hole];
  if (!h) return undefined;
  return `The ${ORDINAL[hole]} · par ${h.par} · ${h.yards} yards`;
}

export function dress(
  m: Moment,
  snapshot: TvSnapshot,
  now: number,
): Announcement | null {
  const player = (snapshot.players ?? []).find((p) => p.id === m.playerId);
  if (!player) return null;
  // A visitor's club is worth naming; the host club is not, since every other
  // name on the screen belongs to it too. Join only what there is, or the
  // members of the club running the event get a dangling separator.
  const detail = [clubShort(snapshot, player.clubId), `HC ${player.handicap}`]
    .filter(Boolean)
    .join(" · ");

  const common = {
    id: `${m.factKey}#${m.at}`,
    priority: m.priority,
    subject: player.name,
    subjectId: player.id,
    detail,
    factKey: m.factKey,
    queuedAt: now,
    holdReason: m.holdReason,
    durationMs: DURATION[m.kind] ?? 5_000,
  };

  switch (m.kind) {
    case "ace":
      return { ...common, kind: m.kind, headline: "Hole-in-one", line: holeLine(snapshot.course, m.hole) };
    case "eagle":
      return {
        ...common,
        kind: m.kind,
        headline: Number(m.data?.under) >= 3 ? "Albatross" : "Eagle",
        line: holeLine(snapshot.course, m.hole),
      };
    case "net-eagle":
      return { ...common, kind: m.kind, headline: "Net eagle", line: holeLine(snapshot.course, m.hole) };
    case "streak":
      return {
        ...common,
        kind: m.kind,
        headline: "Heater",
        line: `${m.data?.run} ${m.data?.term === "net" ? "net " : ""}birdies in a row`,
      };
    case "lead-change":
      return {
        ...common,
        kind: m.kind,
        headline: "New leader",
        outgoing: String(m.data?.outgoing ?? ""),
      };
    case "mover":
      return {
        ...common,
        kind: m.kind,
        headline: "Mover",
        line: `Climbs to ${m.data?.to}`,
      };
    case "finish":
      return {
        ...common,
        kind: m.kind,
        headline: "Round complete",
        figure: String(m.data?.gross ?? ""),
        line: "Played to handicap or better",
      };
    case "round-in":
      return {
        ...common,
        kind: m.kind,
        headline: "Round in",
        figure: String(m.data?.gross ?? ""),
      };
    case "course-record":
      return {
        ...common,
        kind: m.kind,
        headline: "Course record",
        figure: String(m.data?.gross ?? ""),
        line: `Previous: ${m.data?.previous} by ${m.data?.holder} · ${m.data?.tee} tees`,
      };
    default:
      return { ...common, kind: m.kind, headline: m.kind };
  }
}

function clubShort(snapshot: TvSnapshot, clubId: string) {
  // the club running the event is unremarkable; a visitor's club is the story
  if (!clubId || clubId === snapshot.tournament.clubId) return "";
  // and it is named, not keyed: "royal-nairobi" is a database row, "Royal
  // Nairobi" is what the room calls it
  return clubById(clubId).short || clubById(clubId).name || "";
}

/* ------------------------------------------------------------------ */
/* The reducer                                                         */
/* ------------------------------------------------------------------ */

function note(state: ProducerState, entry: HistoryEntry): HistoryEntry[] {
  // twenty minutes is what the panel shows; keep a little more than that
  const cutoff = entry.at - 30 * 60_000;
  return [entry, ...state.history].filter((h) => h.at >= cutoff).slice(0, 60);
}

/**
 * Highest priority first; between equals, whatever has waited longest.
 *
 * At a club medal the priority is nudged down for a player who has been on
 * screen recently. Most of the room is watching to see themselves and their
 * friends, not the leader, and without this one player having a very good
 * round takes every slot in the afternoon while forty other people wait. The
 * nudge is small and capped, so it reorders moments of similar weight and
 * never keeps a hole-in-one waiting behind a round-in.
 */
const FAIRNESS_STEP = 8;
const FAIRNESS_CAP = 24;

function ordered(queue: Announcement[], state: ProducerState) {
  const spread = isNetFirst(state.config.profile);
  const weight = (a: Announcement) => {
    if (!spread || !a.subjectId) return a.priority;
    const seen = state.recentSubjects.filter((id) => id === a.subjectId).length;
    return a.priority - Math.min(seen * FAIRNESS_STEP, FAIRNESS_CAP);
  };
  return [...queue].sort(
    (a, b) => weight(b) - weight(a) || a.queuedAt - b.queuedAt,
  );
}

export function reduce(
  state: ProducerState,
  event: ProducerEvent,
  now: number,
): ProducerState {
  switch (event.type) {
    case "config": {
      const config = { ...state.config, ...event.patch };
      let next = { ...state, config };
      if (event.patch.quiet !== undefined && event.patch.quiet !== state.config.quiet) {
        next = {
          ...next,
          history: note(state, {
            at: now,
            kind: event.patch.quiet ? "quiet-on" : "quiet-off",
            text: event.patch.quiet ? "Quiet mode on" : "Quiet mode off",
          }),
        };
        /*
         * Going quiet empties the queue rather than pausing it. The admin
         * reaching for this switch wants the room to stop being interrupted
         * now, and a backlog that fires the moment they switch back is the
         * opposite of what they asked for. Anything still true will be found
         * again on the next snapshot.
         */
        if (event.patch.quiet) next = { ...next, queue: [], mode: "leaderboard", playing: null };
      }
      return next;
    }

    case "approve": {
      const item = state.pending.find((a) => a.id === event.id);
      if (!item) return state;
      return {
        ...state,
        pending: state.pending.filter((a) => a.id !== event.id),
        queue: [...state.queue, { ...item, holdReason: undefined, queuedAt: now }],
      };
    }

    case "reject": {
      const item = state.pending.find((a) => a.id === event.id);
      if (!item) return state;
      // remembered as announced, so it is never re-detected and re-offered
      return {
        ...state,
        pending: state.pending.filter((a) => a.id !== event.id),
        announced: [...state.announced, item.factKey],
        history: note(state, { at: now, kind: item.kind, text: `Rejected: ${item.headline} — ${item.subject}` }),
      };
    }

    case "cancel": {
      const item = state.queue.find((a) => a.id === event.id);
      if (!item) return state;
      return {
        ...state,
        queue: state.queue.filter((a) => a.id !== event.id),
        announced: [...state.announced, item.factKey],
      };
    }

    case "skip":
      // cut the current item short; the board comes back on the next tick
      return state.playing ? { ...state, playing: { ...state.playing, until: now } } : state;

    case "retract": {
      /*
       * The rare case where something that aired was wrong. It is answered
       * forward, never backward: the correct player is congratulated and the
       * board has already quietly reshuffled. Nothing on screen ever suggests
       * that the earlier moment was false, because the member who was
       * celebrated by mistake is in the room.
       */
      const item: Announcement = {
        id: `retraction:${now}`,
        kind: "retraction",
        priority: 90,
        durationMs: DURATION.retraction,
        headline: "Leaderboard updated",
        subject: `Congratulations to ${event.player}`,
        factKey: `retraction:${now}`,
        queuedAt: now + 60_000, // sits for a minute, so it reads as routine
      };
      return { ...state, queue: [...state.queue, item] };
    }

    case "test": {
      const item: Announcement = {
        id: `test:${now}`,
        kind: "round-in",
        priority: 1,
        durationMs: 4_000,
        headline: "Test",
        subject: "Producer panel",
        detail: "This is a test announcement",
        factKey: `test:${now}`,
        queuedAt: now,
      };
      return { ...state, queue: [...state.queue, item] };
    }

    case "snapshot":
      return onSnapshot(state, event.snapshot, now);

    case "tick":
      return onTick(state, now);
  }
}

/**
 * Fold in whatever the club has decided since the last snapshot.
 *
 * Decisions arrive as an append-only list rather than as commands, so a screen
 * that was asleep, offline or only just switched on catches up by replaying
 * what it missed. Applied in id order, and only once: the highest id seen is
 * remembered, which is what stops a poll that returns the same rows from
 * approving the same announcement forty times.
 */
function applyDecisions(
  state: ProducerState,
  snapshot: TvSnapshot,
  now: number,
): ProducerState {
  let next = state;
  // Tolerate a snapshot without them. A feed that failed to read one optional
  // table, or an older client, must not be able to stop the screen.
  for (const d of snapshot.decisions ?? []) {
    if (d.id <= next.appliedDecision) continue;
    switch (d.kind) {
      case "approve":
      case "reject":
      case "cancel": {
        // The panel decides about a fact, not about a message: it may be
        // holding a different copy of the same announcement, so match on the
        // fact key rather than on an id minted locally.
        const held = next.pending.find((a) => a.factKey === d.factKey);
        const queued = next.queue.find((a) => a.factKey === d.factKey);
        const target = held ?? queued;
        if (d.kind === "approve" && held) {
          next = reduce(next, { type: "approve", id: held.id }, now);
        } else if (d.kind === "reject" && held) {
          next = reduce(next, { type: "reject", id: held.id }, now);
        } else if (d.kind === "cancel" && queued) {
          next = reduce(next, { type: "cancel", id: queued.id }, now);
        } else if (!target && d.factKey) {
          /*
           * The decision arrived before this screen had detected the fact, or
           * after it had already played. Either way, remember it as settled so
           * that a rejection made on the panel a moment early still lands when
           * detection catches up.
           */
          if (d.kind !== "approve")
            next = { ...next, announced: [...next.announced, d.factKey] };
        }
        break;
      }
      case "quiet":
        next = reduce(
          next,
          { type: "config", patch: { quiet: Boolean(d.payload?.on) } },
          now,
        );
        break;
      case "retract":
        next = reduce(
          next,
          { type: "retract", player: String(d.payload?.player ?? "") },
          now,
        );
        break;
      case "test":
        next = reduce(next, { type: "test" }, now);
        break;
      case "skip":
        next = reduce(next, { type: "skip" }, now);
        break;
    }
    next = { ...next, appliedDecision: d.id };
  }
  return next;
}

function onSnapshot(
  base: ProducerState,
  snapshot: TvSnapshot,
  now: number,
): ProducerState {
  const withDecisions = applyDecisions(base, snapshot, now);
  /*
   * The tournament carries the profile, so a club changing it mid-round is
   * picked up on the next snapshot rather than needing the screen restarted.
   */
  const profile = snapshot.tournament.fieldProfile ?? "club";
  const state =
    profile === withDecisions.config.profile
      ? withDecisions
      : { ...withDecisions, config: { ...withDecisions.config, profile } };
  const cfg = state.config;
  const settled = settledHoles(snapshot.rows ?? [], snapshot.published ?? {}, cfg, now);

  // group settled holes by player and round
  const cards = new Map<string, SettledHole[]>();
  for (const h of settled) {
    const k = `${h.round}:${h.playerId}`;
    let card = cards.get(k);
    if (!card) cards.set(k, (card = []));
    card.push(h);
  }

  const found: Moment[] = [];
  const byId = new Map((snapshot.players ?? []).map((p) => [p.id, p] as const));
  for (const [k, holes] of cards) {
    const [roundStr, playerId] = k.split(":");
    const player = byId.get(playerId);
    if (!player) continue;
    const round = Number(roundStr);
    const r = roundsOf(snapshot.tournament).find((x) => x.number === round);
    found.push(
      ...momentsForCard({
        player,
        round,
        holes,
        course: COURSES.find((c) => c.id === r?.courseId) ?? snapshot.course,
        allowancePct: snapshot.tournament.handicapAllowance,
        profile: snapshot.tournament.fieldProfile ?? "club",
        cfg,
        records: snapshot.records ?? [],
        tee: r?.tees,
      }),
    );
  }

  const after = standingsFrom(snapshot, settled);
  found.push(
    ...momentsForBoard({
      before: state.boardBefore ?? [],
      after,
      nameOf: (id) => byId.get(id)?.name ?? id,
      round: snapshot.round,
      at: now,
    }),
  );

  // Nothing already said, nothing already waiting, nothing already queued.
  const known = new Set([
    ...state.announced,
    ...state.queue.map((a) => a.factKey),
    ...state.pending.map((a) => a.factKey),
  ]);
  const fresh = found.filter((m) => !known.has(m.factKey));

  /*
   * In quiet mode, facts are consumed rather than collected.
   *
   * Clearing the queue when the switch is thrown is not enough on its own:
   * detection runs against the whole card every time, so the same eagle is
   * found again on the very next snapshot and the queue refills behind the
   * admin's back. They would then turn announcements back on an hour later and
   * be handed the hour, which is precisely what they used the switch to avoid.
   *
   * So while quiet, everything found is marked as though it had been shown.
   * The room is not interrupted now and is not interrupted retrospectively
   * later; only what happens after the switch goes back is announced.
   */
  if (cfg.quiet) {
    return {
      ...state,
      announced: [...state.announced, ...fresh.map((m) => m.factKey)],
      queue: [],
      pending: [],
      boardBefore: after,
      lastAt: snapshot.at,
      lastSnapshot: snapshot,
      nextFeatureAt: state.nextFeatureAt || now + cfg.featureEveryMs,
    };
  }

  /*
   * A correction arrives as an absence: the card no longer produces the eagle
   * it produced a minute ago, because a figure was changed or because the two
   * entries have stopped agreeing. Nothing announces a correction, so this is
   * where one is noticed.
   */
  const trueNow = new Set(found.map((m) => m.factKey));
  const stillTrue = (a: Announcement) =>
    !DURABLE.has(a.kind) || trueNow.has(a.factKey);

  // Anything waiting that is no longer true is dropped before it can air. This
  // is the quiet, best case for a correction: it was caught in the seconds
  // between being found and being shown, and nobody ever saw it.
  const queue = state.queue.filter(stillTrue);
  const pending = state.pending.filter(stillTrue);

  for (const m of fresh) {
    const a = dress(m, snapshot, now);
    if (!a) continue;
    if (a.holdReason) pending.push(a);
    else queue.push(a);
  }

  /*
   * The harder case: it had already been on the screen. The board has
   * reshuffled underneath by itself, so the only question is whether to
   * acknowledge it, and the answer is a short forward-looking card half a
   * minute later. It names the player now leading, never the correction, never
   * the player whose moment it was, and nothing about it suggests anyone did
   * anything wrong. The member who was congratulated is in the room.
   */
  const vanished = state.materialShown.filter((k) => !trueNow.has(k));
  const leader = (snapshot.players ?? []).find((p) => p.id === after[0]?.playerId);
  const update: Announcement[] =
    vanished.length > 0 && leader
      ? [
          {
            id: `leaderboard-update:${now}`,
            kind: "leaderboard-update",
            priority: 15,
            durationMs: DURATION["leaderboard-update"],
            headline: "Leaderboard update",
            subject: leader.name,
            detail: "Leading",
            factKey: `leaderboard-update:${now}`,
            // half a minute later, so it reads as a routine refresh rather
            // than as a reaction to whatever just happened
            queuedAt: now + 30_000,
          },
        ]
      : [];

  return {
    ...state,
    queue: [...queue, ...update],
    pending,
    materialShown: state.materialShown.filter((k) => trueNow.has(k)),
    boardBefore: after,
    lastAt: snapshot.at,
    lastSnapshot: snapshot,
    // the first snapshot sets the feature clock, so nothing fires immediately
    nextFeatureAt: state.nextFeatureAt || now + cfg.featureEveryMs,
  };
}

function onTick(state: ProducerState, now: number): ProducerState {
  const cfg = state.config;

  // Something is on screen. Let it finish: cutting an animation short reads as
  // a fault, and whatever changed underneath it will still be true afterwards.
  if (state.playing) {
    if (now < state.playing.until) return state;
    return {
      ...state,
      mode: "leaderboard",
      playing: null,
      nextSlotAt: now + cfg.spacingMs,
    };
  }

  if (cfg.quiet) return state.mode === "leaderboard" ? state : { ...state, mode: "leaderboard" };

  // An announcement, if one is due and the room has had a moment of board.
  if (state.queue.length && now >= state.nextSlotAt) {
    const [next] = ordered(state.queue, state).filter((a) => a.queuedAt <= now);
    if (next) {
      const remaining = state.queue.filter((a) => a.id !== next.id);
      return {
        ...state,
        mode: "announcement",
        playing: { type: "announcement", item: next, until: now + next.durationMs },
        queue: remaining,
        announced: [...state.announced, next.factKey],
        // a short memory: long enough to spread a busy hour, short enough that
        // a player who was on once at eleven is not penalised at three
        recentSubjects: next.subjectId
          ? [next.subjectId, ...state.recentSubjects].slice(0, 8)
          : state.recentSubjects,
        materialShown: MATERIAL.has(next.kind)
          ? [...state.materialShown, next.factKey]
          : state.materialShown,
        history: note(state, {
          at: now,
          kind: next.kind,
          text: `${next.headline} — ${next.subject}`,
        }),
        // a feature never lands straight on top of an announcement
        nextFeatureAt: Math.max(state.nextFeatureAt, now + cfg.featureEveryMs),
      };
    }
  }

  /*
   * Nothing to announce. Every so often, put up something about the tournament
   * instead of leaving the board on for the twentieth minute running. Features
   * never compete with announcements: this only runs once the queue is empty
   * and the screen is free, and playing an announcement pushes the next feature
   * a full interval away.
   */
  if (
    now >= state.nextFeatureAt &&
    state.lastSnapshot &&
    state.queue.length === 0
  ) {
    const settled = settledHoles(
      state.lastSnapshot.rows ?? [],
      state.lastSnapshot.published ?? {},
      cfg,
      now,
    );
    const card = nextFeature(
      {
        snapshot: state.lastSnapshot,
        settled,
        standings: boardRows(state.lastSnapshot, settled),
        cfg,
        now,
      },
      state.featureTurn,
    );
    // A tournament with nothing to say yet gets its board back and is asked
    // again at the next interval, rather than being given an empty card.
    if (!card) return { ...state, nextFeatureAt: now + cfg.featureEveryMs };
    return {
      ...state,
      mode: "feature",
      playing: { type: "feature", item: card, until: now + card.durationMs },
      featureTurn: state.featureTurn + 1,
      nextFeatureAt: now + card.durationMs + cfg.featureEveryMs,
      history: note(state, { at: now, kind: card.kind, text: card.title }),
    };
  }

  return state;
}
