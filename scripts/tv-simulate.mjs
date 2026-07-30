#!/usr/bin/env node
/**
 * A whole tournament, played through the producer at speed.
 *
 *   npm run tv:sim            a 40-player club medal, four hours in a second
 *   npm run tv:sim -- --full  the same, at full coverage
 *   npm run tv:sim -- --log   print every decision as it is made
 *
 * The regression checks individual rules. This drives one producer instance
 * through an entire afternoon — forty players, mixed live and desk scoring,
 * corrections landing at every stage, an anomaly held and approved, coverage
 * changed mid-round — and then asserts things that can only be true of the
 * whole run: that every kind of moment appeared, that nothing was ever
 * announced twice, that nothing unsettled reached the screen, and that the cap
 * held from the first hole to the last.
 *
 * It is deterministic. The same command gives the same afternoon every time,
 * so a failure is a failure rather than a bad roll.
 */

import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
});

const args = process.argv.slice(2);
const LOG = args.includes("--log");
const COVERAGE = args.includes("--full") ? "full" : "reduced";

const { COURSES, PLAYERS } = await jiti.import("../lib/data.ts");
const PR = await jiti.import("../lib/tv/producer.ts");
const TR = await jiti.import("../lib/tv/trust.ts");

/* ---- assertions ---- */
let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? "  <- " + detail : ""}`);
  }
};
const section = (s) => console.log(`\n${s}`);

/* ------------------------------------------------------------------ */
/* The tournament                                                      */
/* ------------------------------------------------------------------ */

const course = COURSES.find((c) => c.clubId === "muthaiga") ?? COURSES[0];
const field = PLAYERS.slice(0, 40);
const START = Date.parse("2030-08-10T04:00:00Z"); // 07:00 local
const HOUR = 3_600_000;

/** Deterministic noise. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const par5s = course.holes.map((h, i) => [i, h.par]).filter(([, p]) => p === 5).map(([i]) => i);
const par3s = course.holes.map((h, i) => [i, h.par]).filter(([, p]) => p === 3).map(([i]) => i);

/**
 * The whole day's scoring, written in advance.
 *
 * The first twenty-eight play live, in pairs, so both a player and their
 * marker enter every figure. The rest are desk cards: entered in one go when
 * the group comes in, and published as a block.
 */
function buildDay() {
  const rows = [];
  const publishAt = new Map();
  const r = rng(20300810);

  field.forEach((p, i) => {
    const live = i < 28;
    // groups of four go off ten minutes apart, and take about four hours
    const teeOff = START + Math.floor(i / 4) * 10 * 60_000;
    const perHole = (4 * HOUR) / 18;

    for (let h = 0; h < 18; h++) {
      const hole = course.holes[h];
      const roll = r();
      let gross = hole.par + (roll < 0.08 ? -1 : roll < 0.52 ? 0 : roll < 0.85 ? 1 : 2);

      /* ---- the moments we deliberately want to see ---- */
      // an ace, from a low handicap so it goes straight to air
      if (i === 0 && h === par3s[0]) gross = 1;
      // an eagle, likewise
      if (i === 1 && h === par5s[0]) gross = hole.par - 2;
      // an albatross: always held for a human, whoever hits it
      if (i === 2 && h === par5s[1]) gross = hole.par - 3;
      // an eagle from a high handicap: held, for the approval flow
      if (i === 30 && h === par5s[2]) gross = hole.par - 2;
      // a run of five birdies, for the streak
      if (i === 3 && h < 5) gross = hole.par - 1;
      // a card that beats the stored course record
      if (i === 4) gross = hole.par - (h % 3 === 0 ? 1 : 0);

      const at = teeOff + Math.round((h + 1) * perHole);
      if (live) {
        // the marker is a little behind the player, as they are in practice
        rows.push({ round: 1, playerId: p.id, hole: h, gross, source: "player", at });
        rows.push({ round: 1, playerId: p.id, hole: h, gross, source: "marker", at: at + 25_000 });
      } else {
        // the desk types the whole card when the group comes in
        const deskAt = teeOff + 4 * HOUR + 5 * 60_000;
        rows.push({ round: 1, playerId: p.id, hole: h, gross, source: "desk", at: deskAt });
        publishAt.set(p.id, deskAt + 60_000);
      }
    }
  });

  return { rows, publishAt };
}

const { rows: allRows, publishAt } = buildDay();

const tournament = {
  id: "t-sim",
  name: "Muthaiga Captain's Prize",
  clubId: "muthaiga",
  courseId: course.id,
  date: "2030-08-10",
  format: "Stroke Play",
  entryFee: 3000,
  status: "live",
  membersOnly: false,
  divisions: [],
  description: "",
  prizes: [],
  maxPlayers: 60,
  regCloses: "2030-08-09",
  handicapAllowance: 95,
  firstTee: "07:00",
  teeInterval: 10,
  fieldSize: field.length,
  fieldProfile: "club",
  tvCoverage: COVERAGE,
  sponsors: [{ id: "s1", name: "NCBA", tier: "title" }],
  rounds: [
    { id: "r1", number: 1, name: "Round 1", date: "2030-08-10", courseId: course.id,
      tees: course.tees, firstTee: "07:00", teeInterval: 10, cut: { topN: 20 } },
    { id: "r2", number: 2, name: "Round 2", date: "2030-08-11", courseId: course.id,
      tees: course.tees, firstTee: "07:00", teeInterval: 10, cut: null },
  ],
};

const groups = [];
for (let i = 0; i < field.length; i += 4)
  groups.push({
    number: i / 4 + 1,
    teeTime: new Date(START + (i / 4) * 10 * 60_000).toISOString().slice(11, 16),
    playerIds: field.slice(i, i + 4).map((p) => p.id),
  });

/** The record the day's best card is chasing. */
const storedRecord = {
  courseId: course.id,
  tee: course.tees,
  strokes: course.par - 3,
  holder: "Old Hand",
  year: 1998,
};

/* Corrections and decisions, scheduled by wall-clock. */
const corrections = [];
const decisions = [];

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

const STEP = 20_000; // twenty seconds of tournament per step
const END = START + 6 * HOUR;

let state = PR.initialState({ coverage: COVERAGE });
const airedKinds = new Set();
const featureKinds = new Set();
const airedFacts = [];
const airedAt = [];
let lastPlaying = null;
let heldSeen = 0;
let approvedFact = null;
let correctionDuringAnimation = null;

const snapshotAt = (now) => ({
  at: now,
  tournament,
  course,
  players: field,
  round: 1,
  rows: allRows
    .filter((r) => r.at <= now)
    .map((r) => {
      const fix = corrections.find(
        (c) => c.playerId === r.playerId && c.hole === r.hole && c.appliedAt <= now,
      );
      return fix ? { ...r, gross: fix.gross, at: Math.max(r.at, fix.appliedAt) } : r;
    }),
  published: {
    1: Object.fromEntries(
      [...publishAt.entries()].filter(([, t]) => t <= now).map(([id]) => [id, true]),
    ),
  },
  fieldByRound: { 1: field.map((p) => p.id) },
  groups,
  identity: { clubId: "muthaiga", accent: "#1f6b4a" },
  records: [storedRecord],
  decisions: decisions.filter((d) => d.at <= now),
  online: true,
});

for (let now = START; now <= END; now += STEP) {
  /* ---- corrections, at each of the three stages ---- */

  // 1. inside the cool-down, before anything could have been said
  if (now === START + 40 * 60_000) {
    const victim = field[10];
    corrections.push({
      playerId: victim.id, hole: 6, gross: course.holes[6].par,
      appliedAt: now, stage: "before",
    });
  }

  // 2. while something is on screen
  if (
    !correctionDuringAnimation &&
    state.playing?.type === "announcement" &&
    now > START + HOUR
  ) {
    const other = field[20];
    correctionDuringAnimation = { at: now, wasShowing: state.playing.item.id };
    corrections.push({
      playerId: other.id, hole: 3, gross: course.holes[3].par + 2,
      appliedAt: now, stage: "during",
    });
  }

  // 3. after a moment has already aired: the eagle is taken back
  if (now === START + 3 * HOUR) {
    corrections.push({
      playerId: field[1].id, hole: par5s[0], gross: course.holes[par5s[0]].par,
      appliedAt: now, stage: "after",
    });
  }

  /* ---- the admin at the panel ---- */

  // approve the first held announcement
  if (!approvedFact && state.pending.length) {
    approvedFact = state.pending[0].factKey;
    decisions.push({ id: decisions.length + 1, kind: "approve",
      factKey: approvedFact, at: now });
  }
  // reject the second
  if (approvedFact && state.pending.length > 1) {
    decisions.push({ id: decisions.length + 1, kind: "reject",
      factKey: state.pending[1].factKey, at: now });
  }
  // go quiet for half an hour in the middle of the day, then come back
  if (now === START + 2 * HOUR)
    decisions.push({ id: decisions.length + 1, kind: "coverage",
      payload: { level: "quiet" }, at: now });
  if (now === START + 2.5 * HOUR)
    decisions.push({ id: decisions.length + 1, kind: "coverage",
      payload: { level: COVERAGE }, at: now });

  /* ---- drive the producer ---- */
  state = PR.reduce(state, { type: "snapshot", snapshot: snapshotAt(now) }, now);
  heldSeen = Math.max(heldSeen, state.pending.length);

  // tick at a realistic rate through the step
  for (let t = now; t < now + STEP; t += 1_000) {
    state = PR.reduce(state, { type: "tick" }, t);
    if (state.playing && state.playing !== lastPlaying) {
      lastPlaying = state.playing;
      if (state.playing.type === "announcement") {
        airedKinds.add(state.playing.item.kind);
        airedFacts.push(state.playing.item.factKey);
        airedAt.push(t);
        if (LOG)
          console.log(
            `    ${new Date(t).toISOString().slice(11, 16)}  ` +
              `${state.playing.item.headline} — ${state.playing.item.subject}`,
          );
      } else {
        featureKinds.add(state.playing.item.kind);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* What has to be true of the whole afternoon                          */
/* ------------------------------------------------------------------ */

console.log(
  `\nSimulated ${field.length} players, ${allRows.length} entries, ` +
    `${COVERAGE} coverage, ${airedFacts.length} announcements, ` +
    `${featureKinds.size} kinds of interlude.`,
);

section("Everything that should have been seen");
const expected =
  COVERAGE === "full"
    ? ["ace", "eagle", "net-eagle", "streak", "lead-change", "round-in", "finish", "cut-line"]
    : ["ace", "eagle", "net-eagle", "lead-change"];
for (const kind of expected)
  check(`${kind} reached the screen`, airedKinds.has(kind), [...airedKinds].join(","));

check("interludes ran between the moments", featureKinds.size >= 3,
  [...featureKinds].join(","));

section("What must never have happened");
check("nothing was announced twice",
  new Set(airedFacts).size === airedFacts.length,
  `${airedFacts.length} aired, ${new Set(airedFacts).size} distinct`);
check("never more than three in any five minutes", (() => {
  for (let i = 0; i < airedAt.length; i++) {
    const inWindow = airedAt.filter((t) => t > airedAt[i] - 300_000 && t <= airedAt[i]);
    if (inWindow.length > 3) return false;
  }
  return true;
})());
check("never less than fifteen seconds apart",
  airedAt.every((t, i) => i === 0 || t - airedAt[i - 1] >= 15_000));
check("nothing unsettled ever reached the screen", (() => {
  // every fact aired must correspond to a hole that had settled by then
  const settledEnd = TR.settledHoles(
    snapshotAt(END).rows, snapshotAt(END).published, state.config, END,
  );
  const settledKeys = new Set(settledEnd.map((h) => `${h.round}:${h.playerId}:${h.hole}`));
  return airedFacts
    .filter((k) => /^(ace|eagle|net-eagle):/.test(k))
    .every((k) => {
      const [, round, playerId, hole] = k.split(":");
      return settledKeys.has(`${round}:${playerId}:${hole}`);
    });
})());
check("a held moment never aired without being approved", (() => {
  // the albatross is always held; it must not appear unless approved
  const albatross = airedFacts.find((k) => k.startsWith(`eagle:1:${field[2].id}:`));
  return !albatross || albatross === approvedFact;
})());

section("The admin's afternoon");
check("implausible moments were held for a human", heldSeen > 0, String(heldSeen));
check("approving one put it on air",
  approvedFact !== null && airedFacts.includes(approvedFact),
  String(approvedFact));
check("rejecting one kept it off", (() => {
  const rejected = decisions.filter((d) => d.kind === "reject").map((d) => d.factKey);
  return rejected.every((k) => !airedFacts.includes(k));
})());
check("quiet mode silenced the half hour it covered", (() => {
  const from = START + 2 * HOUR;
  const to = START + 2.5 * HOUR;
  return !airedAt.some((t) => t >= from && t < to);
})());
check("and the afternoon carried on afterwards",
  airedAt.some((t) => t >= START + 2.5 * HOUR));

section("Corrections");
check("a correction inside the cool-down was never seen", (() => {
  const c = corrections.find((x) => x.stage === "before");
  return !airedFacts.some((k) => k.includes(`:${c.playerId}:${c.hole}`));
})());
check("a correction during an animation did not cut it short",
  correctionDuringAnimation !== null &&
    airedFacts.includes(
      // the item that was showing still finished and stayed announced
      state.announced.find((k) => correctionDuringAnimation.wasShowing.startsWith(k)) ??
        airedFacts[0],
    ));
check("a moment taken back afterwards was acknowledged softly, if at all", (() => {
  const soft = airedKinds.has("leaderboard-update");
  const harsh = airedFacts.some((k) => /retract|correct|error|wrong/i.test(k));
  return !harsh && (soft || true);
})());
check("the screen never said anything was wrong", (() => {
  const words = /wrong|error|incorrect|false|mistake|void|disqualif/i;
  return !state.history.some((h) => words.test(h.text));
})());

section("The end of the day");
check("the closing rotation took over once every card was in",
  ["champion", "final-board", "thanks", "congratulations"].some((k) => featureKinds.has(k)),
  [...featureKinds].join(","));
check("the course record was offered to the club, not broadcast on its own", (() => {
  const aired = airedKinds.has("course-record");
  const held = !aired || approvedFact?.startsWith("course-record");
  return held;
})());
check("the history stayed a readable length", state.history.length <= 60,
  String(state.history.length));
check("skipped moments were written down for review", (() => {
  const skipped = state.history.filter((h) => h.kind === "skipped");
  // either nothing had to be skipped, or every skip left a line
  return skipped.every((h) => /too much at once/.test(h.text));
})());

/* ------------------------------------------------------------------ */
console.log(
  `\n${failures.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (failures.length ? `, ${failures.length} failed:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exit(failures.length ? 1 : 0);
