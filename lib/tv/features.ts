/**
 * Feature mode: the scheduled interludes.
 *
 * Announcements are for things that happened. Features are for the long
 * stretches when nothing has, which is most of a Saturday, and their job is to
 * give a room something to look at that is about this tournament rather than
 * about nothing.
 *
 * Everything here is derived from the same settled figures the producer
 * announces from, so a feature can never show a number the screen would not
 * have been willing to say out loud. Curation is deterministic: given the same
 * snapshot and the same position in the rotation, the same card comes out.
 * That is worth more than variety, because it means what a club sees while
 * setting up is what the room sees later.
 *
 * A kind with nothing to say returns null and is skipped rather than padded.
 */

import type { CumulativeRow } from "@/lib/scoring";
import { inBillingOrder } from "@/lib/sponsors";
import { toPar } from "@/lib/utils";
import type { SettledHole } from "./trust";
import type { FeatureCard, FeatureKind, ProducerConfig, TvSnapshot } from "./types";

/** The order features are offered in. Sponsors sit between, never twice running. */
const ROTATION: FeatureKind[] = [
  "spotlight",
  "hole-of-the-day",
  "group",
  "stats",
  "head-to-head",
  "sponsor",
  "message",
];

/**
 * What the screen does once the last card is in.
 *
 * A club leaves the television on through the prizegiving and into the
 * evening, so this has to be worth walking past for an hour: the champion,
 * the board, the people who paid for the day, and a thank you. It loops, and
 * it is the same four cards every time round, because a room that has already
 * seen them is not watching any more, it is drinking.
 */
const CLOSING: FeatureKind[] = ["champion", "final-board", "thanks", "congratulations"];

const DURATION: Record<FeatureKind, number> = {
  spotlight: 10_000,
  "hole-of-the-day": 9_000,
  group: 9_000,
  stats: 9_000,
  "head-to-head": 10_000,
  sponsor: 5_000,
  message: 8_000,
  champion: 12_000,
  "final-board": 14_000,
  thanks: 8_000,
  congratulations: 8_000,
};

interface Ctx {
  snapshot: TvSnapshot;
  settled: SettledHole[];
  standings: CumulativeRow[];
  cfg: ProducerConfig;
  now: number;
}

/**
 * The next feature worth showing.
 *
 * `turn` advances every time one is shown, so the rotation moves on even when
 * a kind has nothing to offer and is skipped.
 */
export function nextFeature(ctx: Ctx, turn: number): FeatureCard | null {
  const list = isOver(ctx) ? CLOSING : ROTATION;
  for (let i = 0; i < list.length; i++) {
    const kind = list[(turn + i) % list.length];
    const card = build(kind, ctx, turn);
    if (card) return card;
  }
  return null;
}

/**
 * Whether the golf is finished.
 *
 * Either the club has said so, or every player in the field has a full card.
 * The second matters because a club rarely remembers to press anything: the
 * last group walks off, and the screen should know.
 */
export function isOver(ctx: Ctx) {
  if (ctx.snapshot.tournament.status === "completed") return true;
  const rows = ctx.standings;
  return rows.length > 0 && rows.every((r) => r.thru >= 18);
}

function build(kind: FeatureKind, ctx: Ctx, turn: number): FeatureCard | null {
  const id = `${kind}:${turn}`;
  const base = { id, kind, durationMs: DURATION[kind] };
  switch (kind) {
    case "spotlight":
      return spotlight(ctx, base);
    case "hole-of-the-day":
      return holeOfTheDay(ctx, base);
    case "group":
      return group(ctx, base, turn);
    case "stats":
      return stats(ctx, base);
    case "head-to-head":
      return headToHead(ctx, base);
    case "sponsor":
      return sponsor(ctx, base, turn);
    case "message":
      return message(ctx, base, turn);
    case "champion":
      return champion(ctx, base);
    case "final-board":
      return finalBoard(ctx, base);
    case "thanks":
      return thanks(ctx, base);
    case "congratulations":
      return congratulations(ctx, base);
  }
}

/* ---------------- once the last card is in ---------------- */

function champion(ctx: Ctx, base: Base): FeatureCard | null {
  const top = ctx.standings[0];
  if (!top) return null;
  const beaten = ctx.standings.length - 1;
  return {
    ...base,
    eyebrow: ctx.snapshot.tournament.status === "completed" ? "Champion" : "Leader in the clubhouse",
    title: top.player.name,
    lines: [
      { label: "Score", value: scoreLine(top, ctx.snapshot) },
      { label: "Strokes", value: `${top.grossTotal}` },
      { label: "Handicap", value: `${top.player.handicap}` },
      ...(beaten > 0 ? [{ label: "From a field of", value: `${ctx.standings.length}` }] : []),
    ],
  };
}

function finalBoard(ctx: Ctx, base: Base): FeatureCard | null {
  const top = ctx.standings.slice(0, 8);
  if (top.length < 2) return null;
  return {
    ...base,
    eyebrow: "Final standings",
    title: dayOf(ctx.snapshot),
    lines: top.map((r) => ({
      label: `${r.tied ? "T" : ""}${r.position}  ${r.player.name}`,
      value: scoreLine(r, ctx.snapshot),
    })),
  };
}

function thanks(ctx: Ctx, base: Base): FeatureCard | null {
  const list = ctx.snapshot.tournament.sponsors ?? [];
  if (!list.length) return null;
  const sorted = inBillingOrder(list);
  return {
    ...base,
    eyebrow: "With thanks to",
    title: sorted[0].name,
    lines: sorted.slice(1).map((s) => ({ label: s.name, value: "" })),
    footnote: "and everyone who made today possible",
  };
}

function congratulations(ctx: Ctx, base: Base): FeatureCard | null {
  const n = ctx.standings.length;
  if (!n) return null;
  return {
    ...base,
    eyebrow: ctx.snapshot.tournament.name,
    title: "Congratulations to all who played",
    lines: [],
    footnote: `${n} cards returned`,
  };
}

type Base = { id: string; kind: FeatureKind; durationMs: number };

/**
 * One player, chosen for having done something lately rather than for leading.
 *
 * The leader is already at the top of the board all afternoon. What a room has
 * no other way of noticing is the player twentieth overall who has just played
 * four good holes, and those are the people watching.
 */
function spotlight(ctx: Ctx, base: Base): FeatureCard | null {
  const { snapshot, standings } = ctx;
  const inPlay = standings.filter((r) => r.thru >= 3 && r.thru < 18);
  if (!inPlay.length) return null;

  // hottest recent form: the longest run of holes at or under their own par
  const best = [...inPlay].sort((a, b) => b.hotStreak - a.hotStreak || a.position - b.position)[0];
  if (!best) return null;

  return {
    ...base,
    eyebrow: "On the course",
    title: best.player.name,
    lines: [
      { label: "Position", value: best.tied ? `T${best.position}` : `${best.position}` },
      { label: "Through", value: `${best.thru}` },
      { label: "Handicap", value: `${best.player.handicap}` },
      ...(best.hotStreak > 1
        ? [{ label: "Form", value: `${best.hotStreak} holes at or better` }]
        : []),
    ],
    footnote: scoreLine(best, snapshot),
  };
}

/**
 * The hole giving the field the most trouble today.
 *
 * Needs a decent number of cards through it before it means anything: with
 * three scores on it the hardest hole is whichever three people played worst.
 */
function holeOfTheDay(ctx: Ctx, base: Base): FeatureCard | null {
  const { snapshot, settled } = ctx;
  const byHole = new Map<number, number[]>();
  for (const h of settled) {
    const arr = byHole.get(h.hole) ?? [];
    arr.push(h.gross - snapshot.course.holes[h.hole].par);
    byHole.set(h.hole, arr);
  }
  const scored = [...byHole.entries()]
    .filter(([, v]) => v.length >= 8)
    .map(([hole, v]) => ({
      hole,
      avg: v.reduce((a, b) => a + b, 0) / v.length,
      n: v.length,
    }));
  if (!scored.length) return null;

  const hardest = scored.reduce((a, b) => (b.avg > a.avg ? b : a));
  const h = snapshot.course.holes[hardest.hole];
  return {
    ...base,
    eyebrow: "Hole of the day",
    title: `The ${hardest.hole + 1}${suffix(hardest.hole + 1)}`,
    lines: [
      { label: "Par", value: `${h.par}` },
      { label: "Yards", value: `${h.yards}` },
      { label: "Stroke index", value: `${h.si}` },
      {
        label: "Field average",
        value: `${hardest.avg >= 0 ? "+" : ""}${hardest.avg.toFixed(2)}`,
      },
    ],
    footnote: `From ${hardest.n} cards through it`,
  };
}

/** Who is out on the course together, and where they stand. */
function group(ctx: Ctx, base: Base, turn: number): FeatureCard | null {
  const { snapshot, standings } = ctx;
  // A snapshot missing its optional collections must never stop the screen.
  // This is the second time that has bitten, so every one of them is read
  // through a default now rather than trusted.
  const playing = (snapshot.groups ?? []).filter((g) =>
    g.playerIds.some((id) => {
      const row = standings.find((r) => r.player.id === id);
      return row && row.thru > 0 && row.thru < 18;
    }),
  );
  if (!playing.length) return null;
  const g = playing[turn % playing.length];

  const lines = g.playerIds
    .map((id) => standings.find((r) => r.player.id === id))
    .filter((r): r is CumulativeRow => Boolean(r))
    .map((r) => ({
      label: r.player.name,
      value: `${scoreLine(r, snapshot)} · thru ${r.thru}`,
    }));
  if (!lines.length) return null;

  return {
    ...base,
    eyebrow: "On the course now",
    title: `Group ${g.number}`,
    lines,
    footnote: g.teeTime ? `Away at ${g.teeTime}` : undefined,
  };
}

/** The afternoon in four numbers. */
function stats(ctx: Ctx, base: Base): FeatureCard | null {
  const { snapshot, settled, standings } = ctx;
  if (settled.length < 20) return null;

  let birdies = 0;
  let better = 0;
  let total = 0;
  for (const h of settled) {
    const par = snapshot.course.holes[h.hole].par;
    total += h.gross - par;
    if (h.gross === par - 1) birdies++;
    if (h.gross <= par - 2) better++;
  }
  const cardsIn = standings.filter((r) => r.thru >= 18).length;

  return {
    ...base,
    eyebrow: "The day so far",
    // not the tournament name: it is already set large across the top of the
    // screen, and a card that repeats the header wastes its biggest line
    title: dayOf(snapshot),
    lines: [
      { label: "Birdies", value: `${birdies}` },
      ...(better > 0 ? [{ label: "Eagles or better", value: `${better}` }] : []),
      { label: "Holes played", value: `${settled.length}` },
      {
        label: "Field average",
        value: `${total >= 0 ? "+" : ""}${(total / settled.length).toFixed(2)} per hole`,
      },
      { label: "Cards in", value: `${cardsIn} of ${standings.length}` },
    ],
  };
}

/** Two players who cannot get away from each other. */
function headToHead(ctx: Ctx, base: Base): FeatureCard | null {
  const { snapshot, standings } = ctx;
  const top = standings.slice(0, 8).filter((r) => r.thru > 0);
  if (top.length < 2) return null;

  // the closest pair near the top that is not already a tie
  let pair: [CumulativeRow, CumulativeRow] | null = null;
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i];
    const b = top[i + 1];
    if (a.position !== b.position) {
      pair = [a, b];
      break;
    }
  }
  if (!pair) return null;

  return {
    ...base,
    eyebrow: "Head to head",
    title: `${pair[0].player.name} · ${pair[1].player.name}`,
    lines: pair.map((r) => ({
      label: r.player.name,
      value: `${scoreLine(r, snapshot)} · thru ${r.thru} · HC ${r.player.handicap}`,
    })),
    footnote: "Separated by one place",
  };
}

/** A moment that belongs to whoever is paying for the afternoon. */
function sponsor(ctx: Ctx, base: Base, turn: number): FeatureCard | null {
  const list = ctx.snapshot.tournament.sponsors ?? [];
  // only the ones billed above a mention: a partner logo in the corner of the
  // board all day is already the deal they struck
  const premium = list.filter((s) => s.tier === "title" || s.tier === "prize");
  if (!premium.length) return null;
  const s = premium[turn % premium.length];
  return {
    ...base,
    eyebrow: s.tier === "title" ? "Title sponsor" : "Presented by",
    title: s.name,
    lines: [],
    sponsor: s,
  };
}

/** Whatever the club wants the room to know. */
function message(ctx: Ctx, base: Base, turn: number): FeatureCard | null {
  const msgs = ctx.cfg.messages.filter((m) => m.trim().length > 0);
  if (!msgs.length) return null;
  return {
    ...base,
    eyebrow: "From the club",
    title: msgs[turn % msgs.length],
    lines: [],
  };
}

/* ---------------- helpers ---------------- */

function scoreLine(r: CumulativeRow, snapshot: TvSnapshot) {
  if (snapshot.tournament.format === "Stableford") return `${r.points} pts`;
  const netFirst = (snapshot.tournament.fieldProfile ?? "club") !== "championship";
  return toPar(netFirst ? r.netToPar : r.grossToPar);
}

/** "Tuesday, 28 July" - informative, and never a repeat of the header. */
function dayOf(snapshot: TvSnapshot) {
  const round = snapshot.tournament.rounds?.find((r) => r.number === snapshot.round);
  const iso = round?.date ?? snapshot.tournament.date;
  return new Date(iso + "T12:00:00").toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function suffix(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
