#!/usr/bin/env node
/**
 * Headless regression over the scoring spine.
 *
 *   node scripts/regression.mjs
 *
 * Drives the real store, not a mock, through the flows that matter after the
 * multi-round re-keying: dual entry, discrepancy resolution, the attestation
 * ceremony, the correction window, dispute resolution, the audit trail, and
 * the cut. Browser timers get throttled when a headless pane is hidden, which
 * makes the demo autoplay unreliable to observe, so the ceremony is driven
 * directly here instead.
 */

import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";

/* ---- browser globals the store expects ---- */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.BroadcastChannel = class {
  postMessage() {}
  close() {}
  set onmessage(_) {}
};
globalThis.window = undefined; // keep the store in its non-client path
// navigator is a getter-only global in modern Node, so patch its fields
try {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, userAgent: "regression", language: "en" },
    configurable: true,
  });
} catch {}

const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
});

const S = await jiti.import("../lib/sim/store.ts");
const { roundKey } = await jiti.import("../lib/rounds.ts");
const { scorePayload } = await jiti.import("../lib/integrity.ts");

/* ---- tiny assertion harness ---- */
let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? "  <- " + detail : ""}`);
  }
}
function section(t) {
  console.log(`\n${t}`);
}

const st = () => S.simStore.getState();
const TID = "t-captains-prize";
const K1 = roundKey(TID, 1);
const JOE = "p-joe";
const DAVID = "p-kamau-d";

/* ------------------------------------------------------------------ */
section("State shape");
check("scores are keyed by round", !!st().scores[K1], Object.keys(st().scores).join(","));
check("liveRound defaults to 1", st().liveRound === 1);
check("pairings are keyed by round", !!st().pairings[K1]);
check(
  "round accessors read the live round",
  Object.keys(S.roundScores(st())).length > 0,
);

/* ------------------------------------------------------------------ */
section("Dual entry keeps the two figures apart");
S.enterOwnScore(5, 6); // Joel's own card, hole 6
check("own score lands on the player's card", S.roundScores(st())[JOE][5] === 6);
check(
  "the marker's view is not overwritten by the player",
  S.roundMarkerScores(st())[JOE][5] == null,
);
const scoreOp = st().outbox.filter((o) => o.kind === "score").pop();
check("the score op carries its round", scoreOp?.payload.round === 1, JSON.stringify(scoreOp?.payload));
check("the score op is sourced to the player", scoreOp?.payload.source === "player");

S.enterMarkerScoreFor(DAVID, 5, 5); // Joel, as marker, records David
check("marker entry lands on the marker view", S.roundMarkerScores(st())[DAVID][5] === 5);
check("marker entry leaves the partner's own card alone", S.roundScores(st())[DAVID][5] == null);
const mOp = st().outbox.filter((o) => o.kind === "score").pop();
check("the marker op is sourced to the marker", mOp?.payload.source === "marker");

/* ------------------------------------------------------------------ */
section("Discrepancy resolution");
S.resolveDiscrepancy(JOE, 5, 7);
check("agreed figure settles both views",
  S.roundScores(st())[JOE][5] === 7 && S.roundMarkerScores(st())[JOE][5] === 7);
const rOp = st().outbox.filter((o) => o.kind === "resolve").pop();
check("the resolve op carries its round", rOp?.payload.round === 1);

/* ------------------------------------------------------------------ */
section("Attestation ceremony (Rule 3.3b)");
// fill both cards so the ceremony is legitimate
for (let h = 0; h < 18; h++) {
  S.setBulkScore(JOE, h, 5);
  S.setBulkScore(DAVID, h, 4);
}
S.markerAttest(JOE, DAVID, { method: "pin" });
let cert = S.roundCerts(st())[JOE];
check("marker attest moves the card to awaiting-player", cert?.stage === "awaiting-player");
check("the attesting marker is recorded", cert?.markerId === DAVID);

await S.playerCertify(JOE, { method: "pin" });
cert = S.roundCerts(st())[JOE];
check("player certify returns the card", cert?.stage === "certified");
check("the card is sealed with a hash", !!cert?.lockedHash);

const kinds = st().auditLog.map((a) => a.kind);
check("audit records marker-attested", kinds.includes("marker-attested"));
check("audit records player-certified", kinds.includes("player-certified"));
check("audit records card-returned", kinds.includes("card-returned"));
check("every audit record carries its round",
  st().auditLog.every((a) => a.round === 1),
  JSON.stringify([...new Set(st().auditLog.map((a) => a.round))]));
const returned = st().auditLog.find((a) => a.kind === "card-returned");
check("the returned record carries the handicap chain", !!returned?.handicaps);
check("the returned record carries a device fingerprint", !!returned?.device);

/* the seal must actually cover the round */
const h1 = await (await jiti.import("../lib/integrity.ts")).sha256Hex(
  scorePayload({ tournamentId: TID, round: 1, courseId: "muthaiga-main",
    playerId: JOE, markerId: DAVID, scores: S.roundScores(st())[JOE] }),
);
const h2 = await (await jiti.import("../lib/integrity.ts")).sha256Hex(
  scorePayload({ tournamentId: TID, round: 2, courseId: "muthaiga-main",
    playerId: JOE, markerId: DAVID, scores: S.roundScores(st())[JOE] }),
);
check("an identical card in another round seals differently", h1 !== h2);
check("the stored seal matches the round-1 payload", cert?.lockedHash === h1);

/* ------------------------------------------------------------------ */
section("Correction window");
S.requestCorrection(JOE, 3, 9, "Wrote the 4th in the 5th's box");
const corr = st().corrections[0];
check("the correction is recorded against its round", corr?.round === 1);
check("the correction starts pending", corr?.status === "pending");
const sealBefore = S.roundCerts(st())[JOE].lockedHash;

await S.decideCorrection(corr.id, true, "Verified against the marker's card");
check("an approved correction changes the score", S.roundScores(st())[JOE][3] === 9);
check("the correction is marked approved",
  st().corrections.find((c) => c.id === corr.id)?.status === "approved");
check("approval re-seals the card", S.roundCerts(st())[JOE].lockedHash !== sealBefore);
check("the decision is on the audit trail",
  st().auditLog.some((a) => a.kind === "correction-decided" && a.round === 1));

/* ------------------------------------------------------------------ */
section("Dispute resolution");
S.raiseDispute(DAVID, 7, "We cannot agree the drop on the 8th", JOE);
const disp = st().disputes[0];
check("the dispute is recorded against its round", disp?.round === 1);
check("raising a dispute holds the card", S.roundCerts(st())[DAVID]?.stage === "disputed");

await S.resolveDispute(disp.id, { kind: "committee", score: 6, reason: "Committee ruling" });
check("the committee figure is applied", S.roundScores(st())[DAVID][7] === 6);
check("the dispute closes", st().disputes.find((d) => d.id === disp.id)?.status === "resolved");
check("resolution certifies the held card", S.roundCerts(st())[DAVID]?.stage === "certified");
check("the ruling is on the audit trail",
  st().auditLog.some((a) => a.kind === "dispute-resolved"));

/* ------------------------------------------------------------------ */
section("Audit export is append-only and ordered");
const ids = st().auditLog.map((a) => a.id);
check("audit ids are unique", new Set(ids).size === ids.length);
check("audit is in chronological order",
  st().auditLog.every((a, i, arr) => i === 0 || arr[i - 1].ts <= a.ts));
check("audit rows sync append-only", st().outbox.some(
  (o) => o.kind === "entity" && o.payload.table === "audit_log" && o.payload.insertOnly));

/* ------------------------------------------------------------------ */
section("Multi-round: rounds, cut and re-pairing");
const T = {
  id: "t-champs", name: "Champs", clubId: "sigona", courseId: "sigona-main",
  date: "2026-08-06", format: "Stroke Play", entryFee: 0, status: "upcoming",
  membersOnly: false, divisions: [{ name: "Overall", range: [0, 28] }],
  description: "", prizes: [], maxPlayers: 60, regCloses: "2026-08-01",
  handicapAllowance: 100, firstTee: "07:00", teeInterval: 10, fieldSize: 0,
  rounds: [1, 2, 3].map((n) => ({
    id: `r${n}`, number: n, name: `Round ${n}`, date: `2026-08-0${5 + n}`,
    courseId: "sigona-main", tees: "White", firstTee: "07:00", teeInterval: 10,
    cut: n === 2 ? { topN: 4 } : null,
  })),
};
S.createTournament(T);
const field = st().roster.slice(0, 9).map((p) => p.id);
const mk = (ids) => ids.reduce((acc, id, i) => {
  const g = Math.floor(i / 3);
  (acc[g] ??= { id: `g${g + 1}`, number: g + 1, teeTime: "07:00", playerIds: [] })
    .playerIds.push(id);
  return acc;
}, []);
S.savePairings("t-champs", mk(field), 1);
S.savePairings("t-champs", mk(field), 2);
S.startTournamentDay("t-champs", 1);
check("starting a round sets the live round", st().liveRound === 1);
check("pairings saved per round", !!st().pairings[roundKey("t-champs", 2)]);

// give everyone a score in rounds 1 and 2, best players first in the list
for (const r of [1, 2]) {
  S.simStore.setState({ ...st(), liveRound: r }, true);
  field.forEach((pid, i) => {
    for (let h = 0; h < 18; h++) S.setBulkScore(pid, h, 4 + (i % 5));
  });
}
S.simStore.setState({ ...st(), liveRound: 2 }, true);

const cut = S.cutAfterRound(st(), st().created.find((x) => x.id === "t-champs"), 2);
check("the cut is computed after round 2", !!cut);
check("the cut keeps the top 4 and ties", cut.survivors.length >= 4, `kept ${cut?.count}`);
check("the cut drops the rest", cut.survivors.length < field.length);

S.startNextRound("t-champs");
check("closing a round opens the next", st().liveRound === 3);
const r3 = st().pairings[roundKey("t-champs", 3)] ?? [];
const r3Field = r3.flatMap((g) => g.playerIds);
check("round 3 is paired from the survivors", r3Field.length === cut.survivors.length,
  `${r3Field.length} vs ${cut.survivors.length}`);
check("every round-3 player made the cut",
  r3Field.every((p) => cut.survivors.includes(p)));

/* cumulative totals */
const { cumulativeStandings } = await jiti.import("../lib/scoring.ts");
const { COURSES } = await jiti.import("../lib/data.ts");
const champs = st().created.find((x) => x.id === "t-champs");
const rows = cumulativeStandings(
  field.map((id) => st().roster.find((p) => p.id === id)),
  [1, 2].map((n) => ({
    round: n,
    scores: st().scores[roundKey("t-champs", n)] ?? {},
    course: COURSES.find((c) => c.id === "sigona-main"),
  })),
  100, "net",
);
const top = rows[0];
const r1 = top.rounds.find((x) => x.round === 1);
const r2 = top.rounds.find((x) => x.round === 2);
check("cumulative total is the sum of the rounds",
  top.netToPar === r1.netToPar + r2.netToPar,
  `${top.netToPar} vs ${r1.netToPar}+${r2.netToPar}`);
check("cumulative thru counts both rounds", top.thru === 36, String(top.thru));

/* ------------------------------------------------------------------ */
section("Sync payloads");
const entityTables = new Set(
  st().outbox.filter((o) => o.kind === "entity").map((o) => o.payload.table),
);
check("certifications sync on the round key",
  st().outbox.some((o) => o.kind === "entity" && o.payload.table === "certifications" &&
    o.payload.conflict === "tournament_id,round,player_id"));
check("pairings sync on the round key",
  st().outbox.some((o) => o.kind === "entity" && o.payload.table === "pairings" &&
    o.payload.conflict === "tournament_id,round,group_id"));
check("card_in syncs on the round key",
  !entityTables.has("card_in") ||
  st().outbox.some((o) => o.kind === "entity" && o.payload.table === "card_in" &&
    o.payload.conflict === "tournament_id,round,player_id"));
check("every score op carries a round",
  st().outbox.filter((o) => o.kind === "score").every((o) => o.payload.round != null));

/* ------------------------------------------------------------------ */
console.log(
  `\n${failures.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (failures.length ? `, ${failures.length} failed:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exit(failures.length ? 1 : 0);
