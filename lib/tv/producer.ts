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
import { COURSES } from "@/lib/data";
import { roundsOf } from "@/lib/rounds";
import type { Course } from "@/lib/types";
import { isNetFirst, momentsForBoard, momentsForCard, type Moment } from "./detect";
import { settledHoles, type SettledHole } from "./trust";
import type {
  Announcement,
  HistoryEntry,
  ProducerConfig,
  ProducerState,
  TvSnapshot,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

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
    nextSlotAt: 0,
    nextFeatureAt: 0,
    history: [],
    config: { ...DEFAULT_CONFIG, ...config },
    lastAt: 0,
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
    snapshot.players,
    byRound,
    t.handicapAllowance,
    modeOf(snapshot),
    (rnd, pid) => (snapshot.fieldByRound[rnd] ?? []).includes(pid),
  );
  // a player who has not played a hole yet is not in the running
  return rows
    .filter((r) => r.thru > 0)
    .map((r) => ({ playerId: r.player.id, position: r.position }));
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
  const player = snapshot.players.find((p) => p.id === m.playerId);
  if (!player) return null;
  const club = player.clubId;
  const detail = `${club ? clubShort(snapshot, club) : ""}${
    club ? " · " : ""
  }HC ${player.handicap}`;

  const common = {
    id: `${m.factKey}#${m.at}`,
    priority: m.priority,
    subject: player.name,
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
  return clubId === snapshot.tournament.clubId ? "" : clubId;
}

/* ------------------------------------------------------------------ */
/* The reducer                                                         */
/* ------------------------------------------------------------------ */

function note(state: ProducerState, entry: HistoryEntry): HistoryEntry[] {
  // twenty minutes is what the panel shows; keep a little more than that
  const cutoff = entry.at - 30 * 60_000;
  return [entry, ...state.history].filter((h) => h.at >= cutoff).slice(0, 60);
}

/** Highest priority first; between equals, whatever has waited longest. */
function ordered(queue: Announcement[]) {
  return [...queue].sort(
    (a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt,
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

function onSnapshot(
  state: ProducerState,
  snapshot: TvSnapshot,
  now: number,
): ProducerState {
  const cfg = state.config;
  const settled = settledHoles(snapshot.rows, snapshot.published, cfg, now);

  // group settled holes by player and round
  const cards = new Map<string, SettledHole[]>();
  for (const h of settled) {
    const k = `${h.round}:${h.playerId}`;
    let card = cards.get(k);
    if (!card) cards.set(k, (card = []));
    card.push(h);
  }

  const found: Moment[] = [];
  const byId = new Map(snapshot.players.map((p) => [p.id, p] as const));
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
        records: snapshot.records,
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

  const queue = [...state.queue];
  const pending = [...state.pending];
  for (const m of fresh) {
    const a = dress(m, snapshot, now);
    if (!a) continue;
    if (a.holdReason) pending.push(a);
    else queue.push(a);
  }

  return {
    ...state,
    queue,
    pending,
    boardBefore: after,
    lastAt: snapshot.at,
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
    const [next] = ordered(state.queue).filter((a) => a.queuedAt <= now);
    if (next) {
      const remaining = state.queue.filter((a) => a.id !== next.id);
      return {
        ...state,
        mode: "announcement",
        playing: { type: "announcement", item: next, until: now + next.durationMs },
        queue: remaining,
        announced: [...state.announced, next.factKey],
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

  return state;
}
