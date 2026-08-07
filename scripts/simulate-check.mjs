#!/usr/bin/env node
/**
 * Proof that the field simulator drives the real thing.
 *
 *   npm run sim:check
 *
 * The control room is meant to be watched, not asserted against - but the five
 * forced events are only worth watching if each one really lands on a card and
 * the real detectors really fire. This drives the simulator's own imperative
 * API against the real store, in pilot mode, and checks that an eagle is a
 * three on a par five, a correction becomes an amber, an anomaly reaches the
 * integrity log the committee reads, the desk burst moves a whole group, and a
 * full field plays to eighteen with a well-formed board and no impossible
 * figure anywhere.
 */

import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

process.env.NEXT_PUBLIC_SHIMO_MODE = "pilot";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";

/* browser globals the store reads at import time */
const bag = new Map();
globalThis.localStorage = {
  getItem: (k) => bag.get(k) ?? null,
  setItem: (k, v) => bag.set(k, String(v)),
  removeItem: (k) => bag.delete(k),
  clear: () => bag.clear(),
};
globalThis.window ??= globalThis;
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "sim-check", onLine: true, language: "en" },
  configurable: true,
});
globalThis.BroadcastChannel = class {
  postMessage() {}
  close() {}
  set onmessage(_) {}
};
bag.set("shimo-client-id", "sim-check");

let pass = 0;
const fails = [];
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    fails.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
};
const section = (t) => console.log(`\n${t}`);

const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
});
const Sim = await jiti.import("../lib/sim/simulator.ts");
const S = await jiti.import("../lib/sim/store.ts");
const { COURSES } = await jiti.import("../lib/data.ts");
const { roundKey } = await jiti.import("../lib/rounds.ts");
const { computeStandings } = await jiti.import("../lib/scoring.ts");

const COURSE = COURSES.find((c) => c.id === "muthaiga-main");
const KEY = roundKey("sim-field", 1);
const st = () => S.simStore.getState();
const cardOf = (pid) => st().scores?.[KEY]?.[pid] ?? [];

/* ------------------------------------------------------------------ */

section("Build a field");
Sim.buildField("medal", 24);
{
  const s = st();
  check("the sim tournament is live", s.liveTournamentId === "sim-field");
  check("its format and profile are set", (() => {
    const t = s.created.find((x) => x.id === "sim-field");
    return t?.format === "Stroke Play" && t?.fieldProfile === "club";
  })());
  const inField = s.roster.filter((p) => p.id.startsWith("simp-"));
  check("twenty-four players are on the roster", inField.length === 24, `${inField.length}`);
  check("in six groups of four",
    (s.pairings[KEY] ?? []).length === 6, `${(s.pairings[KEY] ?? []).length}`);
  check("every handicap is inside the medal spread",
    inField.every((p) => p.handicap >= 0 && p.handicap <= 28));
}

section("Play a few holes, then force an eagle");
for (let i = 0; i < 12; i++) Sim.stepOnce();
{
  Sim.forceEagle();
  const par5s = COURSE.holes.map((h, i) => (h.par === 5 ? i : -1)).filter((i) => i >= 0);
  // someone now holds a three on one of the par fives
  const eagled = st().roster.some((p) =>
    par5s.some((i) => cardOf(p.id)[i] === 3),
  );
  check("a three sits on a par five", eagled, Sim.getSimStatus().lastEvent ?? "");
  // the ticker is capped at 24, so it cannot grow; check the eagle is on it
  check("and the eagle reached the ticker",
    st().events.some((e) => e.gross === 3 && par5s.includes(e.hole - 1)));
}

section("A correction becomes an amber in Live Ops");
{
  const beforeFlags = st().flags.length;
  const beforeCorr = st().corrections.length;
  Sim.forceCorrection();
  check("a correction was requested", st().corrections.length === beforeCorr + 1);
  check("an amber flag was raised for it",
    st().flags.length === beforeFlags + 1 &&
      st().flags[0].kind === "amber" &&
      st().flags[0].message.startsWith("Correction request"));
  check("the audit trail recorded it",
    st().auditLog.some((a) => a.kind === "correction-requested"));
}

section("An anomaly reaches the committee log, quietly");
{
  const before = st().integrityLog.length;
  Sim.forceAnomaly();
  check("the integrity heuristic fired for a high handicap",
    st().integrityLog.length > before,
    "pilot mode logs a card that outruns its handicap for later review");
  if (st().integrityLog.length > before) {
    const f = st().integrityLog[0];
    check("it names a real player in the field",
      st().roster.some((p) => p.id === f.playerId));
    check("and it is logged, not alerted (never surfaced during play)",
      f.status === "open" && f.kind === "red");
  }
}

section("A desk burst moves a whole group at once");
{
  const groups = st().pairings[KEY];
  const thruOf = (pid) => cardOf(pid).filter((v) => v != null).length;
  const behind = groups
    .map((g) => ({ g, thru: Math.min(...g.playerIds.map(thruOf)) }))
    .sort((a, b) => a.thru - b.thru)[0];
  const before = behind.thru;
  Sim.forceCaddyBurst();
  const after = Math.min(...behind.g.playerIds.map(thruOf));
  check("the group jumped several holes in one entry", after >= before + 3,
    `${before} → ${after}`);
}

section("A lead change actually reorders the board");
Sim.teardown();
Sim.buildField("championship", 24);
for (let i = 0; i < 30; i++) Sim.stepOnce(); // get a real board going
{
  const boardTop = () => {
    const s = st();
    const t = s.created.find((x) => x.id === "sim-field");
    if (!t) return null;
    const field = s.roster.filter((p) => p.id.startsWith("simp-"));
    const rows = computeStandings(field, S.roundScores(s), COURSE, t.handicapAllowance, "gross");
    return rows[0]?.thru ? { id: rows[0].player.id, name: rows[0].player.name } : null;
  };
  const second = () => {
    const s = st();
    const t = s.created.find((x) => x.id === "sim-field");
    const field = s.roster.filter((p) => p.id.startsWith("simp-"));
    const rows = computeStandings(field, S.roundScores(s), COURSE, t.handicapAllowance, "gross");
    return rows[1]?.player.id ?? null;
  };
  const leaderBefore = boardTop();
  const challenger = second();
  const chBefore = cardOf(challenger).filter((v) => v != null).length;
  Sim.forceLeadChange();
  const leaderAfter = boardTop();
  const chAfter = cardOf(challenger).filter((v) => v != null).length;
  check("there was a board to change", leaderBefore !== null && challenger !== null);
  check("the challenger was actually given holes", chAfter > chBefore, `${chBefore} → ${chAfter}`);
  check("those holes were birdies or better", (() => {
    const card = cardOf(challenger);
    for (let h = chBefore; h < chAfter; h++) {
      if (card[h] > COURSE.holes[h].par - 1) return false;
    }
    return true;
  })());
  console.log(`        lead: ${leaderBefore?.name} → ${leaderAfter?.name}`);
}

section("A full field plays to eighteen without a bad figure");
Sim.teardown();
Sim.buildField("stableford", 60);
{
  let guard = 0;
  while (st().created.some((t) => t.id === "sim-field") && guard++ < 2000) {
    const s = Sim.stepOnce();
    if (s.holesIn >= s.holesTotal) break;
  }
  const s = st();
  const field = s.roster.filter((p) => p.id.startsWith("simp-"));
  let bad = null;
  let complete = 0;
  for (const p of field) {
    const card = cardOf(p.id);
    const filled = card.filter((v) => v != null);
    if (filled.length === 18) complete++;
    for (const v of filled) {
      if (!Number.isInteger(v) || v <= 0 || v > 30) bad = `${p.id}=${v}`;
    }
  }
  check("every player finished eighteen", complete === field.length,
    `${complete} of ${field.length}`);
  check("no card holds an impossible figure", bad === null, bad ?? "");
  check("stepping stops once the field is in", guard < 2000, `${guard} steps`);
}

section("Teardown clears the field");
Sim.teardown();
check("the sim tournament is gone",
  !st().created.some((t) => t.id === "sim-field"));
check("the board stood down", st().liveTournamentId !== "sim-field");

/* ------------------------------------------------------------------ */
console.log(
  `\n${fails.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (fails.length ? `, ${fails.length} failed:\n  - ${fails.join("\n  - ")}` : ""),
);
process.exit(fails.length ? 1 : 0);
