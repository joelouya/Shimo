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
import { readFileSync } from "node:fs";
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
const MAP = await jiti.import("../lib/sync/mappers.ts");
const SCORE = await jiti.import("../lib/scoring.ts");
const TEAM = await jiti.import("../lib/team-scoring.ts");
const RYDER = await jiti.import("../lib/ryder.ts");

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

section("Round-keyed housekeeping");
// hydration must file each round's tee sheet under its own key, not the bare
// tournament id, or a joining device sees no pairings at all
S.hydrateFromSnapshot({
  tournament: {
    id: "t-hyd", club_id: "sigona", course_id: "sigona-main", name: "Hydrated",
    date: "2030-01-01", format: "Stroke Play", status: "live",
    members_only: false, divisions: [], description: "", prizes: [],
    max_players: 0, reg_closes: "", handicap_allowance: 100,
    first_tee: "07:00", tee_interval: 10, field_size: 0,
    rounds: [1, 2].map((n) => ({ id: `r${n}`, number: n, name: `Round ${n}`,
      date: "2030-01-0" + n, courseId: "sigona-main", tees: "White",
      firstTee: "07:00", teeInterval: 10, cut: null })),
  },
  pairings: [
    { tournament_id: "t-hyd", round: 1, group_id: "g1", number: 1,
      tee_time: "07:00", player_ids: ["p-a", "p-b"] },
    { tournament_id: "t-hyd", round: 2, group_id: "g1", number: 1,
      tee_time: "07:30", player_ids: ["p-b", "p-a"] },
  ],
  players: [], scores: [], cardIn: [], certifications: [],
  disputes: [], corrections: [], audit: [],
});
check("hydration files round 1's tee sheet under its own key",
  (st().pairings[roundKey("t-hyd", 1)] ?? []).length === 1);
check("hydration files round 2's separately",
  (st().pairings[roundKey("t-hyd", 2)] ?? [])[0]?.teeTime === "07:30",
  JSON.stringify(st().pairings[roundKey("t-hyd", 2)]));
check("hydration does not file pairings under the bare tournament id",
  !st().pairings["t-hyd"]);

// deleting a tournament must clear every round's tee sheet
S.deleteTournament("t-hyd");
check("delete clears every round's pairings",
  !Object.keys(st().pairings).some((k) => k.startsWith("t-hyd")),
  Object.keys(st().pairings).filter((k) => k.startsWith("t-hyd")).join(","));

/* ------------------------------------------------------------------ */
section("Registration cutoff and eligibility");
const E = await jiti.import("../lib/eligibility.ts");
const baseT = {
  ...T, id: "t-elig", status: "upcoming",
  rounds: [{ id: "r1", number: 1, name: "Round 1", date: "2030-06-10",
             courseId: "sigona-main", tees: "White", firstTee: "07:00",
             teeInterval: 10, cut: null }],
  date: "2030-06-10", regCloses: "", regClosesAt: undefined,
};

check("cutoff defaults to the day before round 1",
  E.regClosesAt(baseT).toISOString().slice(0, 10) === "2030-06-09",
  E.regClosesAt(baseT).toISOString());
check("registration is open well before the cutoff",
  E.registrationOpen(baseT, new Date("2030-06-01T09:00:00Z")));
check("registration closes after the cutoff",
  !E.registrationOpen(baseT, new Date("2030-06-09T23:00:00Z")));
check("an explicit cutoff wins",
  E.regClosesAt({ ...baseT, regClosesAt: "2030-06-05T18:00:00" })
    .toISOString().slice(0, 10) === "2030-06-05");
check("a live tournament is never open for entries",
  !E.registrationOpen({ ...baseT, status: "live" }, new Date("2030-06-01")));

const junior = { id: "j", name: "J", clubId: "sigona", handicap: 5,
                 gender: "M", dob: "2010-06-11" };  // turns 20 the day after
check("age is judged on the first round's date",
  E.ageAt(junior.dob, "2030-06-10") === 19, String(E.ageAt(junior.dob, "2030-06-10")));
check("a junior passes an under-25 limit",
  E.eligibilityForPlayer({ ...baseT, maxAge: 24 }, junior).kind === "eligible");
check("an over-age player is blocked",
  E.eligibilityForPlayer({ ...baseT, maxAge: 18 }, junior).kind === "limit");
check("a member without a date of birth is never age-blocked",
  E.eligibilityForPlayer({ ...baseT, maxAge: 10 },
    { ...junior, dob: undefined }).kind === "eligible");
check("a handicap floor blocks a better player",
  E.eligibilityForPlayer({ ...baseT, minHandicap: 10 }, junior).kind === "limit");
check("members-only blocks another club",
  E.eligibilityForPlayer({ ...baseT, membership: "members" },
    { ...junior, clubId: "karen" }).kind === "locked");
check("members-and-guests admits another club",
  E.eligibilityForPlayer({ ...baseT, membership: "members-guests" },
    { ...junior, clubId: "karen" }).kind === "eligible");
check("a custom note never blocks an entry",
  E.eligibilityForPlayer({ ...baseT, eligibilityNote: "Past champions only" },
    junior).kind === "eligible");
check("the summary reads as a club would write it",
  E.eligibilitySummary({ ...baseT, membership: "members-guests",
    minHandicap: 0, maxHandicap: 24, maxAge: 24 }) ===
  "Members and guests · HC 0 to 24 · Under 25",
  E.eligibilitySummary({ ...baseT, membership: "members-guests",
    minHandicap: 0, maxHandicap: 24, maxAge: 24 }));

/* ------------------------------------------------------------------ */
section("Club identity and accent contrast");
const CT = await jiti.import("../lib/contrast.ts");

check("Shimo's own terracotta is accepted", CT.checkAccent("#b84a2e").ok);
check("a deep club green is accepted", CT.checkAccent("#1e7a4c").ok,
  CT.checkAccent("#1e7a4c").reason);
check("a mid blue is accepted", CT.checkAccent("#2b6cb0").ok,
  CT.checkAccent("#2b6cb0").reason);
check("a very dark green is accepted", CT.checkAccent("#0b3d2e").ok);
check("a washed-out pink is refused", !CT.checkAccent("#e91e8c").ok);
check("a refusal offers a shade that passes", (() => {
  const r = CT.checkAccent("#e91e8c");
  return !!r.suggestion && CT.checkAccent(r.suggestion).ok;
})());
check("nonsense is refused", !CT.checkAccent("zzz").ok);

check("a dark accent is lightened to clear the navy panels",
  CT.contrastRatio(CT.accentOnDark("#0b3d2e"), CT.NAVY) >= CT.AA_LARGE,
  String(CT.contrastRatio(CT.accentOnDark("#0b3d2e"), CT.NAVY)));
check("every accepted accent clears AA on cream", (() => {
  for (const hex of ["#b84a2e", "#1e7a4c", "#2b6cb0", "#8a1c3b", "#5b3fa8", "#8a5a12"]) {
    const r = CT.checkAccent(hex);
    if (!r.ok || CT.contrastRatio(r.onLight, CT.CREAM) < CT.AA_TEXT) return false;
  }
  return true;
})());
check("button text flips to navy on a light fill",
  CT.textOnAccent("#ffd400") === CT.NAVY);

// identity round-trips through the store and queues for sync
S.setClubIdentity("sigona", { accent: "#1e7a4c", phone: "+254 700 000 000" });
check("club identity is stored", S.clubIdentityOf(st(), "sigona").accent === "#1e7a4c");
check("a later edit merges rather than replaces", (() => {
  S.setClubIdentity("sigona", { email: "golf@sigona.co.ke" });
  const i = S.clubIdentityOf(st(), "sigona");
  return i.accent === "#1e7a4c" && i.email === "golf@sigona.co.ke";
})());
check("club identity queues for sync",
  st().outbox.some((o) => o.kind === "entity" && o.payload.table === "clubs"));
check("a club with no identity returns a stable empty object",
  S.clubIdentityOf(st(), "karen") === S.clubIdentityOf(st(), "karen"));

/* ------------------------------------------------------------------ */
section("Tiered entry pricing");
const P = await jiti.import("../lib/pricing.ts");
const priced = {
  ...baseT, clubId: "sigona", entryFee: 0,
  feeTiers: [
    { id: "std",     label: "Standard",    amount: 31250, audience: "all" },
    { id: "member",  label: "Members",     amount: 23750, audience: "members" },
    { id: "loyalty", label: "Loyalty",     amount: 26250, audience: "all" },
    { id: "early",   label: "Early bird",  amount: 21000, audience: "all",
      until: "2030-01-01T00:00:00Z" },   // long expired
  ],
};
const member = { id:"m", name:"M", clubId:"sigona", handicap:5, gender:"M" };
const guest  = { id:"g", name:"G", clubId:"karen",  handicap:5, gender:"M" };
const now = new Date("2030-06-01T00:00:00Z");

check("a single-price event still reads as one tier",
  P.tiersOf({ ...baseT, entryFee: 2500 }).length === 1);
check("the implied tier carries the entry fee",
  P.tiersOf({ ...baseT, entryFee: 2500 })[0].amount === 2500);
check("an expired early bird drops off the sheet",
  !P.availableTiers(priced, now).some((x) => x.id === "early"));
check("a member is given the member rate",
  P.tierFor(priced, member, now).id === "member",
  P.tierFor(priced, member, now).id);
check("a guest cannot take the member rate",
  P.tierFor(priced, guest, now).id !== "member");
check("a guest is given the best rate open to them",
  P.tierFor(priced, guest, now).id === "loyalty",
  P.tierFor(priced, guest, now).id);
check("a live early bird beats every other rate", (() => {
  const early = new Date("2029-01-01T00:00:00Z");
  return P.tierFor(priced, guest, early).id === "early";
})());
check("the card shows the cheapest available price",
  P.priceRange(priced, now).min === 23750, String(P.priceRange(priced, now).min));
check("a single-price event is not shown as a range",
  P.priceRange({ ...baseT, entryFee: 2500 }, now).single);
check("the headline price follows the sheet",
  P.withPricingSynced(priced).entryFee === 21000,
  String(P.withPricingSynced(priced).entryFee));
check("a tier already named 'rate' is not called a rate twice",
  P.tierPhrase({ id:"x", label:"Loyalty rate", amount:0, audience:"all" }) === "loyalty rate");
check("a plain tier name gains the noun",
  P.tierPhrase({ id:"x", label:"Members", amount:0, audience:"all" }) === "members rate");
check("an unnamed tier still reads sensibly",
  P.tierPhrase({ id:"x", label:"", amount:0, audience:"all" }) === "standard rate");
check("a sheet whose rates have all expired still offers one", (() => {
  const gone = { ...baseT, entryFee: 0, feeTiers: [
    { id: "x", label: "Gone", amount: 100, audience: "all", until: "2000-01-01T00:00:00Z" }] };
  return P.availableTiers(gone, now).length === 1;
})());

/* ------------------------------------------------------------------ */
section("Poster specs");
const PS = await jiti.import("../lib/poster/spec.ts");

const posterT = {
  ...T,
  id: "t-poster",
  name: "Kenya Amateur Strokeplay Championship",
  format: "Stroke Play",
  date: "2030-08-06",
  maxPlayers: 96,
  entryFee: 6500,
  membership: "open",
  prizes: [
    { place: "Winner", prize: "The Kenya Cup" },
    { place: "Runner-up", prize: "KES 20,000" },
    { place: "Best gross", prize: "A dozen balls" },
    { place: "Nearest the pin", prize: "A putter" },
    { place: "Longest drive", prize: "A driver" },
  ],
  sponsors: [{ id: "s1", name: "NCBA", tier: "title" }],
  rounds: [
    { id: "r1", number: 1, name: "Round 1", date: "2030-08-06",
      courseId: "sigona-main", tees: "Blue", firstTee: "07:00", teeInterval: 8, cut: null },
    { id: "r2", number: 2, name: "Round 2", date: "2030-08-07",
      courseId: "sigona-main", tees: "Blue", firstTee: "07:00", teeInterval: 8, cut: { topN: 30 } },
    { id: "r3", number: 3, name: "Final round", date: "2030-08-08",
      courseId: "sigona-main", tees: "Blue", firstTee: "08:30", teeInterval: 10, cut: null },
  ],
};

const fx = PS.fixtureSpec(posterT, { clubId: posterT.clubId }, new Date("2030-07-01"));
check("a fixture poster names the tournament", fx.title === posterT.name);
check("54 holes are counted from the rounds",
  fx.eyebrow === "stroke play · 54 holes", fx.eyebrow);
check("a date range collapses the repeated month",
  fx.dateLine === "6 to 8 August 2030", fx.dateLine);
check("one date per round appears in the schedule",
  fx.schedule.length === 3, String(fx.schedule.length));
check("the cut is stated in words",
  /top 30 and ties/.test(fx.cut ?? ""), fx.cut);
check("prizes are capped at what fits",
  fx.prizes.length === 4, String(fx.prizes.length));
check("a single round does not repeat the date beside the tee time", (() => {
  const one = PS.fixtureSpec({ ...posterT, rounds: undefined, firstTee: "07:30" },
    { clubId: posterT.clubId }, new Date("2030-07-01"));
  return one.schedule.length === 1 && one.schedule[0].value === "07:30";
})());
check("a one-day event states the weekday", (() => {
  const one = PS.fixtureSpec({ ...posterT, rounds: undefined },
    { clubId: posterT.clubId }, new Date("2030-07-01"));
  return /^Tuesday/.test(one.dateLine);
})());
check("a club with no contact details gets no contact block",
  (fx.contacts ?? []).length === 0);
check("contact details are carried through when set", (() => {
  const withContact = PS.fixtureSpec(posterT,
    { clubId: posterT.clubId, phone: "+254 700 000 000", email: "a@b.com",
      website: "https://sigona.co.ke" }, new Date("2030-07-01"));
  return withContact.contacts.length === 3 &&
    withContact.contacts[2] === "sigona.co.ke"; // the scheme is dropped
})());
check("the Shimo credit is on unless the club turns it off",
  fx.credit === true &&
  PS.fixtureSpec(posterT, { clubId: posterT.clubId, posterCredit: false },
    new Date("2030-07-01")).credit === false);
check("sponsors ride along to the poster",
  fx.sponsors?.[0]?.tier === "title");

const rowsOf = (n, tieTop) =>
  Array.from({ length: n }, (_, i) => ({
    player: { id: `p${i}`, name: `Player ${i}`, clubId: posterT.clubId, handicap: 10, gender: "M" },
    rounds: [], thru: 54, grossTotal: 220 + i, grossToPar: 4 + i, netToPar: -6 + i,
    points: 100 - i, hotStreak: 0, position: tieTop && i < 2 ? 1 : i + 1,
    tied: tieTop ? i < 2 : false, gap: 0, madeCut: true,
  }));

const res = PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(24), "net");
check("a results poster shows ten players",
  res.rows.length === 10, String(res.rows.length));
check("the whole field is counted in the small print",
  /24 played/.test(res.note), res.note);
check("a finished event with a clear winner names a champion",
  res.heroLabel === "Champion", String(res.heroLabel));
check("a shared lead is not called a champion",
  PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(24, true), "net")
    .heroLabel === undefined);
check("standings still in progress name no champion",
  PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(24), "net",
    { provisional: true }).heroLabel === undefined);
check("a provisional board says so",
  PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(24), "net",
    { provisional: true }).eyebrow === "Provisional standings");
check("ties are marked in the position column",
  PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(24, true), "net")
    .rows[0].pos === "T1");
check("stableford posts points and no stroke total",
  (() => {
    const pts = PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(24), "points");
    return pts.scoreLabel === "Points" && pts.rows[0].total === undefined;
  })());
check("stroke play posts the score against par and the total",
  res.scoreLabel === "Net" && res.rows[0].total === "220");
check("a board shorter than ten shows what there is",
  PS.resultsSpec(posterT, { clubId: posterT.clubId }, rowsOf(3), "net").rows.length === 3);
check("the file name is safe to save",
  PS.posterFileName(fx) === "shimo-kenya-amateur-strokeplay-championship-fixture.png",
  PS.posterFileName(fx));

/* ------------------------------------------------------------------ */
section("TV trust gates");
const TR = await jiti.import("../lib/tv/trust.ts");
const COOL = { cooldownMs: 120_000 };
const t0 = 1_000_000;

const row = (source, hole, gross, at) => ({
  round: 1, playerId: "p1", hole, gross, source, at,
});

check("a figure only the player has entered is not announceable",
  TR.settledHoles([row("player", 0, 3, t0)], {}, COOL, t0 + 999_999).length === 0);
check("a figure only the marker has entered is not announceable",
  TR.settledHoles([row("marker", 0, 3, t0)], {}, COOL, t0 + 999_999).length === 0);
check("player and marker disagreeing is silence, not a guess",
  TR.settledHoles([row("player", 0, 3, t0), row("marker", 0, 4, t0)], {}, COOL,
    t0 + 999_999).length === 0);
check("agreed figures still wait out the cool-down",
  TR.settledHoles([row("player", 0, 3, t0), row("marker", 0, 3, t0)], {}, COOL,
    t0 + 60_000).length === 0);
check("an agreed figure is announceable once it has settled",
  TR.settledHoles([row("player", 0, 3, t0), row("marker", 0, 3, t0)], {}, COOL,
    t0 + 120_000).length === 1);
check("the cool-down runs from the later of the two entries", (() => {
  const rows = [row("player", 0, 3, t0), row("marker", 0, 3, t0 + 60_000)];
  return TR.settledHoles(rows, {}, COOL, t0 + 120_000).length === 0 &&
         TR.settledHoles(rows, {}, COOL, t0 + 180_000).length === 1;
})());
check("an edit inside the window restarts the wait", (() => {
  // the player corrects their own entry a minute in, and both now agree on 4
  const rows = [row("player", 0, 3, t0), row("marker", 0, 4, t0),
                row("player", 0, 4, t0 + 60_000)];
  return TR.settledHoles(rows, {}, COOL, t0 + 120_000).length === 0 &&
         TR.settledHoles(rows, {}, COOL, t0 + 181_000)[0].gross === 4;
})());
check("a desk card is not announceable until it is published",
  TR.settledHoles([row("desk", 0, 3, t0)], {}, COOL, t0 + 999_999).length === 0);
check("a published desk card needs no cool-down",
  TR.settledHoles([row("desk", 0, 3, t0)], { 1: { p1: true } }, COOL, t0).length === 1);
check("a desk entry overrides a disputed live pair", (() => {
  const rows = [row("player", 0, 3, t0), row("marker", 0, 5, t0), row("desk", 0, 4, t0)];
  const out = TR.settledHoles(rows, { 1: { p1: true } }, COOL, t0);
  return out.length === 1 && out[0].gross === 4 && out[0].via === "desk";
})());
check("a card is complete only at eighteen holes",
  !TR.cardComplete(Array(17).fill(0)) && TR.cardComplete(Array(18).fill(0)));

const par4 = { hole: 1, par: 4, si: 1, yards: 400 };
const par3Hard = { hole: 5, par: 3, si: 2, yards: 190 };
const low = { id: "a", name: "A", clubId: "c", handicap: 5, gender: "M" };
const high = { id: "b", name: "B", clubId: "c", handicap: 28, gender: "M" };
const G = { aceApprovalHandicap: 20 };

check("a course record always waits for the club to confirm it",
  !TR.judge({ kind: "course-record", player: low, cfg: G }).auto);
const mid = { id: "c", name: "C", clubId: "c", handicap: 15, gender: "M" };
check("an ace from a low handicap goes straight to air",
  TR.judge({ kind: "ace", player: low, hole: par3Hard, gross: 1, cfg: G }).auto);
check("an ace from a high handicap waits",
  !TR.judge({ kind: "ace", player: high, hole: par3Hard, gross: 1, cfg: G }).auto);
check("an eagle from a low handicap is impressive, not implausible",
  TR.judge({ kind: "eagle", player: low, hole: par4, gross: 2, cfg: G }).auto,
  TR.judge({ kind: "eagle", player: low, hole: par4, gross: 2, cfg: G }).reason);
check("the same eagle from a twenty-eight waits for a human",
  !TR.judge({ kind: "eagle", player: high, hole: par4, gross: 2, cfg: G }).auto);
check("a mid handicap eagle on the hardest hole waits",
  !TR.judge({ kind: "eagle", player: mid, hole: par4, gross: 2, cfg: G }).auto);
check("the same mid handicap eagle on an easy hole does not",
  TR.judge({ kind: "eagle", player: mid, hole: { hole: 9, par: 5, si: 14, yards: 480 },
    gross: 3, cfg: G }).auto);
check("the held announcement says why, in words an admin can act on",
  /28 handicap/.test(
    TR.judge({ kind: "eagle", player: high, hole: par4, gross: 2, cfg: G }).reason ?? ""));
check("an albatross is always confirmed first, from any handicap",
  !TR.judge({ kind: "other", player: low, hole: { hole: 9, par: 5, si: 8, yards: 500 },
    gross: 2, cfg: G }).auto);
check("a gross birdie is never held, from any handicap", (() => {
  return [low, mid, high].every((p) =>
    TR.judge({ kind: "other", player: p, hole: par4, gross: 3, cfg: G }).auto);
})());
check("receiving shots does not make a player's good hole suspicious", (() => {
  // the bug this replaced: judged against par-plus-shots, a 28 handicap's
  // ordinary birdie on stroke index 1 scored as implausible as a scratch eagle
  return TR.judge({ kind: "other", player: high, hole: par4, gross: 3, cfg: G }).auto;
})());
check("a par is never held",
  TR.judge({ kind: "other", player: high, hole: par4, gross: 4, cfg: G }).auto);

/* ------------------------------------------------------------------ */
section("TV moment detection");
const DT = await jiti.import("../lib/tv/detect.ts");
const tvCourse = COURSES[0];
const G2 = { aceApprovalHandicap: 20 };

const scratch = { id: "s1", name: "Scratch", clubId: "c", handicap: 2, gender: "M" };
const bogey = { id: "b1", name: "Bogey", clubId: "c", handicap: 24, gender: "M" };

/** a settled card from an array of 18 gross figures */
const card = (grosses, at = 5000) =>
  grosses.map((g, i) => ({ round: 1, playerId: "x", hole: i, gross: g, settledAt: at + i, via: "dual" }));

const parCard = () => tvCourse.holes.map((h) => h.par);

const moments = (player, grosses, profile = "championship") =>
  DT.momentsForCard({
    player, round: 1, holes: card(grosses).map((h) => ({ ...h, playerId: player.id })),
    course: tvCourse, allowancePct: 100, profile, cfg: G2, records: [],
  });

check("an ace is detected", (() => {
  const g = parCard(); const i = tvCourse.holes.findIndex((h) => h.par === 3);
  g[i] = 1;
  return moments(scratch, g).some((m) => m.kind === "ace");
})());
check("an ace crowds out every other reading of that hole", (() => {
  const g = parCard(); const i = tvCourse.holes.findIndex((h) => h.par === 3);
  g[i] = 1;
  const onHole = moments(scratch, g).filter((m) => m.hole === i);
  return onHole.length === 1 && onHole[0].kind === "ace";
})());
check("an eagle is detected", (() => {
  const g = parCard(); const i = tvCourse.holes.findIndex((h) => h.par === 5);
  g[i] = 3;
  return moments(scratch, g).some((m) => m.kind === "eagle");
})());
check("an eagle from a high handicap carries its hold reason", (() => {
  const g = parCard(); const i = tvCourse.holes.findIndex((h) => h.par === 5);
  g[i] = 3;
  const m = moments(bogey, g).find((x) => x.kind === "eagle");
  return Boolean(m?.holdReason);
})());
check("a championship does not manufacture net eagles", (() => {
  const g = parCard(); g[tvCourse.holes.findIndex((h) => h.si === 1)] -= 1;
  return !moments(bogey, g, "championship").some((m) => m.kind === "net-eagle");
})());
check("a club medal finds the net eagle a gross-only board would miss", (() => {
  // a birdie on a hole where a 24 receives two shots is a net eagle
  const i = tvCourse.holes.findIndex((h) => h.si <= 2);
  const g = parCard(); g[i] -= 1;
  return moments(bogey, g, "club").some((m) => m.kind === "net-eagle" && m.hole === i);
})());
check("a streak needs three in a row", (() => {
  const g = parCard(); g[0] -= 1; g[1] -= 1;
  const two = moments(scratch, g).filter((m) => m.kind === "streak");
  g[2] -= 1;
  const three = moments(scratch, g).filter((m) => m.kind === "streak");
  return two.length === 0 && three.length === 1;
})());
check("a broken run does not carry over", (() => {
  const g = parCard(); g[0] -= 1; g[1] -= 1; g[3] -= 1; g[4] -= 1;
  return moments(scratch, g).filter((m) => m.kind === "streak").length === 0;
})());
check("a run of five is its own moment", (() => {
  const g = parCard(); for (let i = 0; i < 5; i++) g[i] -= 1;
  return moments(scratch, g).filter((m) => m.kind === "streak").length === 2;
})());
check("an incomplete card produces no round-in", (() => {
  const holes = card(parCard()).slice(0, 17).map((h) => ({ ...h, playerId: scratch.id }));
  return !DT.momentsForCard({ player: scratch, round: 1, holes, course: tvCourse,
    allowancePct: 100, profile: "championship", cfg: G2, records: [] })
    .some((m) => m.kind === "round-in");
})());
check("a complete card always says round in",
  moments(scratch, parCard()).some((m) => m.kind === "round-in"));
check("level par counts as a finish worth noting",
  moments(scratch, parCard()).some((m) => m.kind === "finish"));
check("a round over par is not announced as a finish", (() => {
  const g = parCard(); g[0] += 4;
  return !moments(scratch, g, "championship").some((m) => m.kind === "finish");
})());
check("a course record is detected and always held", (() => {
  const g = parCard();
  const out = DT.momentsForCard({
    player: scratch, round: 1, holes: card(g).map((h) => ({ ...h, playerId: scratch.id })),
    course: tvCourse, allowancePct: 100, profile: "championship", cfg: G2, tee: "White",
    records: [{ courseId: tvCourse.id, tee: "White", strokes: tvCourse.par + 1,
                holder: "Old Hand", year: 1998 }],
  });
  const rec = out.find((m) => m.kind === "course-record");
  return Boolean(rec) && Boolean(rec.holdReason);
})());
check("a record off other tees is not the record being chased", (() => {
  const out = DT.momentsForCard({
    player: scratch, round: 1, holes: card(parCard()).map((h) => ({ ...h, playerId: scratch.id })),
    course: tvCourse, allowancePct: 100, profile: "championship", cfg: G2, tee: "White",
    records: [{ courseId: tvCourse.id, tee: "Red", strokes: tvCourse.par + 1,
                holder: "Old Hand", year: 1998 }],
  });
  return !out.some((m) => m.kind === "course-record");
})());
check("every fact key is unique on one card", (() => {
  const g = parCard(); g[0] -= 1; g[1] -= 1; g[2] -= 1;
  const keys = moments(scratch, g).map((m) => m.factKey);
  return new Set(keys).size === keys.length;
})());

const board = (ids) => ids.map((playerId, i) => ({ playerId, position: i + 1 }));
check("a lead change is detected",
  DT.momentsForBoard({ before: board(["a", "b"]), after: board(["b", "a"]),
    nameOf: (id) => id, round: 1, at: 1 }).some((m) => m.kind === "lead-change"));
check("a lead change names who is being displaced",
  DT.momentsForBoard({ before: board(["a", "b"]), after: board(["b", "a"]),
    nameOf: (id) => id === "a" ? "Alice" : "Bob", round: 1, at: 1 })
    .find((m) => m.kind === "lead-change").data.outgoing === "Alice");
check("a board that has not moved says nothing",
  DT.momentsForBoard({ before: board(["a", "b"]), after: board(["a", "b"]),
    nameOf: (id) => id, round: 1, at: 1 }).length === 0);
check("the first leader of the day is not a lead change",
  DT.momentsForBoard({ before: [], after: board(["a"]), nameOf: (id) => id,
    round: 1, at: 1 }).length === 0);
check("a real climb into the top ten is a mover", (() => {
  const before = board(Array.from({ length: 20 }, (_, i) => `p${i}`));
  const after = [{ playerId: "p15", position: 6 }, ...board(["a"])];
  return DT.momentsForBoard({ before, after, nameOf: (id) => id, round: 1, at: 1 })
    .some((m) => m.kind === "mover" && m.playerId === "p15");
})());
check("a one-place shuffle is not a mover", (() => {
  const before = board(Array.from({ length: 20 }, (_, i) => `p${i}`));
  const after = [{ playerId: "p11", position: 10 }];
  return !DT.momentsForBoard({ before, after, nameOf: (id) => id, round: 1, at: 1 })
    .some((m) => m.kind === "mover");
})());
check("an ace outranks everything else on the queue",
  DT.PRIORITY.ace > DT.PRIORITY["course-record"] &&
  DT.PRIORITY["course-record"] > DT.PRIORITY.eagle &&
  DT.PRIORITY.eagle > DT.PRIORITY["round-in"]);

/* ------------------------------------------------------------------ */
section("TV producer");
const PR = await jiti.import("../lib/tv/producer.ts");

const tvC = COURSES[0];
const tvPlayers = [
  { id: "p1", name: "Alice Wanjiru", clubId: "sigona", handicap: 4, gender: "F" },
  { id: "p2", name: "Ben Otieno", clubId: "sigona", handicap: 6, gender: "M" },
];
const tvT = {
  ...T, id: "t-tv", clubId: "sigona", courseId: tvC.id, format: "Stroke Play",
  handicapAllowance: 100, fieldProfile: "championship", status: "live",
  rounds: [{ id: "r1", number: 1, name: "Round 1", date: "2030-01-01",
             courseId: tvC.id, tees: "White", firstTee: "07:00",
             teeInterval: 10, cut: null }],
};
const snap = (rows, at, extra = {}) => ({
  at, tournament: tvT, course: tvC, players: tvPlayers, round: 1, rows,
  published: {}, fieldByRound: { 1: ["p1", "p2"] },
  identity: { clubId: "sigona" }, records: [], decisions: [], groups: [],
  online: true, ...extra,
});
/** both parties agree on `gross` at time `at` */
const pair = (pid, hole, gross, at) => [
  { round: 1, playerId: pid, hole, gross, source: "player", at },
  { round: 1, playerId: pid, hole, gross, source: "marker", at },
];
const eagleHole = tvC.holes.findIndex((h) => h.par === 5);
const eagleRows = (pid, at) => pair(pid, eagleHole, tvC.holes[eagleHole].par - 2, at);

const S0 = PR.initialState({ cooldownMs: 120_000, spacingMs: 15_000, coverage: "full" });

check("nothing is queued while a figure is still cooling down", (() => {
  const s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 60_000);
  return s.queue.length === 0 && s.pending.length === 0;
})());

const settledState = PR.reduce(S0,
  { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
check("a settled eagle reaches the queue",
  settledState.queue.some((a) => a.kind === "eagle"), String(settledState.queue.length));
check("the announcement is dressed for the screen", (() => {
  const a = settledState.queue.find((x) => x.kind === "eagle");
  return a.headline === "Eagle" && a.subject === "Alice Wanjiru" && /par 5/.test(a.line);
})());
check("the board stays up until the queue's slot is due", (() => {
  const s = PR.reduce({ ...settledState, nextSlotAt: 200_000 }, { type: "tick" }, 130_000);
  return s.mode === "leaderboard" && s.playing === null;
})());

const playing = PR.reduce(settledState, { type: "tick" }, 130_000);
check("the eagle takes the screen once its slot arrives",
  playing.mode === "announcement" && playing.playing.item.kind === "eagle");
check("an eagle holds the screen for six seconds",
  playing.playing.until - 130_000 === 6_000);
check("what is playing has left the queue and been remembered",
  playing.queue.length === 0 && playing.announced.includes(playing.playing.item.factKey));
check("it appears in the history the panel shows",
  playing.history[0].text === "Eagle · Alice Wanjiru");

check("an animation is never cut short by a new snapshot", (() => {
  const mid = PR.reduce(playing,
    { type: "snapshot", snapshot: snap(eagleRows("p2", 0), 131_000) }, 133_000);
  const still = PR.reduce(mid, { type: "tick" }, 133_000);
  return still.mode === "announcement" && still.playing.item.subject === "Alice Wanjiru";
})());
check("the board returns when the announcement has run its course", (() => {
  const done = PR.reduce(playing, { type: "tick" }, 136_000);
  return done.mode === "leaderboard" && done.playing === null;
})());
check("a gap is enforced before the next announcement", (() => {
  const done = PR.reduce(playing, { type: "tick" }, 136_000);
  return done.nextSlotAt === 136_000 + 15_000;
})());
check("nothing cascades: two eagles do not play back to back", (() => {
  let s = PR.reduce(S0, { type: "snapshot",
    snapshot: snap([...eagleRows("p1", 0), ...eagleRows("p2", 0)], 0) }, 130_000);
  s = PR.reduce(s, { type: "tick" }, 130_000);          // first plays
  s = PR.reduce(s, { type: "tick" }, 136_100);          // it ends
  const tooSoon = PR.reduce(s, { type: "tick" }, 140_000);
  const later = PR.reduce(s, { type: "tick" }, 152_000);
  return tooSoon.mode === "leaderboard" && later.mode === "announcement";
})());
check("the same fact is never announced twice", (() => {
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
  s = PR.reduce(s, { type: "tick" }, 130_000);
  s = PR.reduce(s, { type: "tick" }, 137_000);
  s = PR.reduce(s, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 138_000) }, 138_000);
  return s.queue.length === 0;
})());

check("an implausible moment is held, not queued", (() => {
  const hacker = [{ id: "p1", name: "High Handicap", clubId: "sigona", handicap: 28, gender: "M" },
                  tvPlayers[1]];
  const s = PR.reduce(S0, { type: "snapshot",
    snapshot: { ...snap(eagleRows("p1", 0), 0), players: hacker } }, 130_000);
  return s.pending.length === 1 && s.queue.length === 0 && Boolean(s.pending[0].holdReason);
})());
check("a held moment does not reach the screen on its own", (() => {
  const hacker = [{ id: "p1", name: "High Handicap", clubId: "sigona", handicap: 28, gender: "M" },
                  tvPlayers[1]];
  let s = PR.reduce(S0, { type: "snapshot",
    snapshot: { ...snap(eagleRows("p1", 0), 0), players: hacker } }, 130_000);
  s = PR.reduce(s, { type: "tick" }, 200_000);
  return s.mode === "leaderboard";
})());
check("approving a held moment sends it to air", (() => {
  const hacker = [{ id: "p1", name: "High Handicap", clubId: "sigona", handicap: 28, gender: "M" },
                  tvPlayers[1]];
  let s = PR.reduce(S0, { type: "snapshot",
    snapshot: { ...snap(eagleRows("p1", 0), 0), players: hacker } }, 130_000);
  s = PR.reduce(s, { type: "approve", id: s.pending[0].id }, 131_000);
  s = PR.reduce(s, { type: "tick" }, 131_000);
  return s.mode === "announcement" && s.pending.length === 0;
})());
check("rejecting a held moment silences it for good", (() => {
  const hacker = [{ id: "p1", name: "High Handicap", clubId: "sigona", handicap: 28, gender: "M" },
                  tvPlayers[1]];
  let s = PR.reduce(S0, { type: "snapshot",
    snapshot: { ...snap(eagleRows("p1", 0), 0), players: hacker } }, 130_000);
  s = PR.reduce(s, { type: "reject", id: s.pending[0].id }, 131_000);
  // the same fact is still true on the next snapshot, and must not come back
  s = PR.reduce(s, { type: "snapshot",
    snapshot: { ...snap(eagleRows("p1", 0), 132_000), players: hacker } }, 132_000);
  s = PR.reduce(s, { type: "tick" }, 200_000);
  return s.pending.length === 0 && s.queue.length === 0 && s.mode === "leaderboard";
})());
check("a queued announcement can be cancelled before it airs", (() => {
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
  s = PR.reduce(s, { type: "cancel", id: s.queue[0].id }, 130_500);
  s = PR.reduce(s, { type: "tick" }, 200_000);
  return s.queue.length === 0 && s.mode === "leaderboard";
})());

check("a correction inside the window is never seen at all", (() => {
  // both agreed on an eagle, then both corrected to a par a minute later
  const rows = [...eagleRows("p1", 0), ...pair("p1", eagleHole, tvC.holes[eagleHole].par, 60_000)];
  const s = PR.reduce(S0, { type: "snapshot", snapshot: snap(rows, 60_000) }, 190_000);
  return !s.queue.some((a) => a.kind === "eagle") && s.pending.length === 0;
})());
check("a disagreement mid-cooldown holds everything back", (() => {
  const rows = [...eagleRows("p1", 0),
    { round: 1, playerId: "p1", hole: eagleHole, gross: 5, source: "marker", at: 30_000 }];
  const s = PR.reduce(S0, { type: "snapshot", snapshot: snap(rows, 30_000) }, 300_000);
  return s.queue.length === 0 && s.pending.length === 0;
})());

check("quiet mode keeps the board up and drops the backlog", (() => {
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
  s = PR.reduce(s, { type: "config", patch: { coverage: "quiet" } }, 130_100);
  s = PR.reduce(s, { type: "tick" }, 200_000);
  return s.queue.length === 0 && s.mode === "leaderboard" &&
    s.history.some((h) => h.kind === "coverage");
})());
check("leaving quiet mode does not replay what was silenced", (() => {
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
  s = PR.reduce(s, { type: "config", patch: { coverage: "quiet" } }, 130_100);
  s = PR.reduce(s, { type: "config", patch: { coverage: "full" } }, 200_000);
  s = PR.reduce(s, { type: "tick" }, 200_100);
  return s.mode === "leaderboard";
})());
check("quiet mode interrupts nothing that is already on screen", (() => {
  let s = PR.reduce(settledState, { type: "tick" }, 130_000);
  s = PR.reduce(s, { type: "config", patch: { coverage: "quiet" } }, 131_000);
  return s.playing === null; // cleared, board restored, room stops being interrupted
})());

check("a retraction congratulates forward and never looks back", (() => {
  const s = PR.reduce(S0, { type: "retract", player: "Ben Otieno" }, 100_000);
  const a = s.queue[0];
  return a.kind === "retraction" && a.subject === "Congratulations to Ben Otieno" &&
    !/wrong|error|false|incorrect/i.test(a.headline + a.subject);
})());
check("a retraction waits a minute so it reads as routine", (() => {
  let s = PR.reduce(S0, { type: "retract", player: "Ben Otieno" }, 100_000);
  const early = PR.reduce(s, { type: "tick" }, 120_000);
  const later = PR.reduce(s, { type: "tick" }, 165_000);
  return early.mode === "leaderboard" && later.mode === "announcement";
})());
check("the test button puts something on screen for the admin", (() => {
  let s = PR.reduce(S0, { type: "test" }, 100_000);
  s = PR.reduce(s, { type: "tick" }, 100_000);
  return s.mode === "announcement" && s.playing.item.headline === "Test";
})());
check("skip cuts the current item and returns the board", (() => {
  let s = PR.reduce(settledState, { type: "tick" }, 130_000);
  s = PR.reduce(s, { type: "skip" }, 131_000);
  s = PR.reduce(s, { type: "tick" }, 131_000);
  return s.mode === "leaderboard";
})());
check("higher priority takes the screen first", (() => {
  const aceHole = tvC.holes.findIndex((h) => h.par === 3);
  const rows = [...eagleRows("p2", 0), ...pair("p1", aceHole, 1, 0)];
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(rows, 0) }, 130_000);
  s = PR.reduce(s, { type: "tick" }, 130_000);
  return s.playing.item.kind === "ace";
})());
check("the producer only counts settled figures when reading the board", (() => {
  // p2 alone claims a huge lead; unconfirmed, so no lead change is announced
  const rows = [...pair("p1", 0, 3, 0),
    { round: 1, playerId: "p2", hole: 0, gross: 2, source: "player", at: 0 }];
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(rows, 0) }, 130_000);
  s = PR.reduce(s, { type: "snapshot", snapshot: snap(rows, 131_000) }, 131_000);
  return !s.queue.some((a) => a.kind === "lead-change");
})());

/* ------------------------------------------------------------------ */
section("Desk publish gate");
{
  const before = st().auditLog.length;
  const pid = st().roster[0].id;
  S.publishCard(pid, { by: "Peter Kamau" });
  const snap = st();
  const rec = snap.auditLog[snap.auditLog.length - 1];
  check("publishing a card writes an audit record",
    snap.auditLog.length === before + 1 && rec.kind === "card-published");
  check("the record names who did it and who it was done for",
    rec.actor === "Peter Kamau" &&
    /Score entered by Peter Kamau on behalf of /.test(rec.detail), rec.detail);
  check("the card is marked in for the live round",
    S.roundCardIn(snap)[pid] === true);
  check("a published card is announceable to the producer", (() => {
    const rows = [{ round: snap.liveRound, playerId: pid, hole: 0, gross: 4,
                    source: "desk", at: 1000 }];
    const pub = { [snap.liveRound]: { [pid]: true } };
    return TR.settledHoles(rows, pub, { cooldownMs: 120_000 }, 1000).length === 1;
  })());

  S.publishCard(pid, { by: "Peter Kamau", photo: "t/1/p-1.png" });
  const withPhoto = st().auditLog.at(-1);
  check("a photographed card says so in the record",
    /card photographed/.test(withPhoto.detail), withPhoto.detail);

  S.unpublishCard(pid, { by: "Peter Kamau", reason: "wrong player" });
  const snap2 = st();
  check("withdrawing takes the card back out",
    S.roundCardIn(snap2)[pid] !== true);
  check("withdrawing records why, not just that",
    /withdrawn by Peter Kamau: wrong player/.test(snap2.auditLog.at(-1).detail),
    snap2.auditLog.at(-1).detail);
  check("a withdrawn card stops being announceable", (() => {
    const rows = [{ round: snap2.liveRound, playerId: pid, hole: 0, gross: 4,
                    source: "desk", at: 1000 }];
    return TR.settledHoles(rows, { [snap2.liveRound]: { [pid]: false } },
      { cooldownMs: 120_000 }, 1000).length === 0;
  })());
}

/* ------------------------------------------------------------------ */
section("Producer decisions from the panel");
{
  const dec = (id, kind, extra = {}) => ({ id, kind, at: 1000, ...extra });
  const held = [{ id: "p1", name: "High Handicap", clubId: "sigona", handicap: 28, gender: "M" },
                tvPlayers[1]];
  const heldSnap = (at, decisions = []) =>
    ({ ...snap(eagleRows("p1", 0), at), players: held, decisions });

  check("a snapshot with no decisions at all does not stop the screen", (() => {
    const bare = { ...snap(eagleRows("p1", 0), 0) };
    delete bare.decisions;
    return PR.reduce(S0, { type: "snapshot", snapshot: bare }, 130_000).queue.length === 1;
  })());

  check("approving from the panel puts the held moment on", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: heldSnap(0) }, 130_000);
    const fk = s.pending[0].factKey;
    s = PR.reduce(s, { type: "snapshot",
      snapshot: heldSnap(131_000, [dec(1, "approve", { factKey: fk })]) }, 131_000);
    return s.pending.length === 0 && s.queue.length === 1;
  })());
  check("rejecting from the panel silences it for good", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: heldSnap(0) }, 130_000);
    const fk = s.pending[0].factKey;
    s = PR.reduce(s, { type: "snapshot",
      snapshot: heldSnap(131_000, [dec(1, "reject", { factKey: fk })]) }, 131_000);
    s = PR.reduce(s, { type: "snapshot",
      snapshot: heldSnap(140_000, [dec(1, "reject", { factKey: fk })]) }, 140_000);
    return s.pending.length === 0 && s.queue.length === 0;
  })());
  check("the same decision replayed is applied only once", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: heldSnap(0) }, 130_000);
    const fk = s.pending[0].factKey;
    const ds = [dec(1, "approve", { factKey: fk })];
    s = PR.reduce(s, { type: "snapshot", snapshot: heldSnap(131_000, ds) }, 131_000);
    s = PR.reduce(s, { type: "snapshot", snapshot: heldSnap(132_000, ds) }, 132_000);
    s = PR.reduce(s, { type: "snapshot", snapshot: heldSnap(133_000, ds) }, 133_000);
    return s.queue.length === 1;
  })());
  check("a rejection that arrives before the fact is detected still lands", (() => {
    // the panel rejected it on its own copy a moment earlier
    const fk = "eagle:1:p1:" + eagleHole;
    let s = PR.reduce(S0, { type: "snapshot",
      snapshot: { ...snap([], 0), players: held, decisions: [dec(1, "reject", { factKey: fk })] } },
      1_000);
    s = PR.reduce(s, { type: "snapshot", snapshot: heldSnap(131_000,
      [dec(1, "reject", { factKey: fk })]) }, 131_000);
    return s.pending.length === 0 && s.queue.length === 0;
  })());
  check("quiet from the panel reaches the screen", (() => {
    let s = PR.reduce(S0, { type: "snapshot",
      snapshot: snap(eagleRows("p1", 0), 0, { decisions: [dec(1, "quiet", { payload: { on: true } })] }) },
      130_000);
    s = PR.reduce(s, { type: "tick" }, 200_000);
    return s.config.coverage === "quiet" && s.mode === "leaderboard" && s.queue.length === 0;
  })());
  check("nothing piles up behind quiet mode", (() => {
    // detection runs against the whole card every time, so without consuming
    // what it finds the queue refills on the next snapshot
    let s = PR.reduce(S0, { type: "snapshot",
      snapshot: snap(eagleRows("p1", 0), 0, { decisions: [dec(1, "quiet", { payload: { on: true } })] }) },
      130_000);
    for (const t of [140_000, 150_000, 160_000]) {
      s = PR.reduce(s, { type: "snapshot",
        snapshot: snap(eagleRows("p1", 0), t, { decisions: [dec(1, "quiet", { payload: { on: true } })] }) }, t);
    }
    return s.queue.length === 0 && s.pending.length === 0;
  })());
  check("turning announcements back on does not replay the quiet hour", (() => {
    const ds = [dec(1, "quiet", { payload: { on: true } })];
    let s = PR.reduce(S0, { type: "snapshot",
      snapshot: snap(eagleRows("p1", 0), 0, { decisions: ds }) }, 130_000);
    s = PR.reduce(s, { type: "snapshot",
      snapshot: snap(eagleRows("p1", 0), 200_000, { decisions: ds }) }, 200_000);
    const back = [...ds, dec(2, "quiet", { payload: { on: false } })];
    s = PR.reduce(s, { type: "snapshot",
      snapshot: snap(eagleRows("p1", 0), 300_000, { decisions: back }) }, 300_000);
    s = PR.reduce(s, { type: "tick" }, 300_100);
    return s.config.coverage !== "quiet" && s.queue.length === 0 && s.mode === "leaderboard";
  })());
  check("a moment that happens after quiet lifts is still announced", (() => {
    const back = [dec(1, "quiet", { payload: { on: true } }),
                  dec(2, "quiet", { payload: { on: false } })];
    let s = PR.reduce(S0, { type: "snapshot", snapshot: snap([], 0, { decisions: back }) }, 100_000);
    s = PR.reduce(s, { type: "snapshot",
      snapshot: snap(eagleRows("p1", 200_000), 400_000, { decisions: back }) }, 400_000);
    return s.queue.some((a) => a.kind === "eagle");
  })());
  check("a retraction from the panel is queued forward-looking", (() => {
    const s = PR.reduce(S0, { type: "snapshot",
      snapshot: snap([], 0, { decisions: [dec(1, "retract", { payload: { player: "Ben Otieno" } })] }) },
      100_000);
    return s.queue[0]?.kind === "retraction" &&
      s.queue[0].subject === "Congratulations to Ben Otieno";
  })());
  check("decisions apply in the order they were made", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: heldSnap(0) }, 130_000);
    const fk = s.pending[0].factKey;
    // quiet, then loud again: the screen should end up loud
    s = PR.reduce(s, { type: "snapshot", snapshot: heldSnap(131_000, [
      dec(1, "quiet", { payload: { on: true } }),
      dec(2, "quiet", { payload: { on: false } }),
      dec(3, "approve", { factKey: fk }),
    ]) }, 131_000);
    return s.config.coverage !== "quiet" && s.queue.length === 1;
  })());
  check("a screen switched on late catches up on everything it missed", (() => {
    const fk = "eagle:1:p1:" + eagleHole;
    const s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: heldSnap(500_000, [
        dec(1, "quiet", { payload: { on: true } }),
        dec(2, "reject", { factKey: fk }),
        dec(3, "quiet", { payload: { on: false } }),
      ]) }, 500_000);
    return s.appliedDecision === 3 && s.config.coverage !== "quiet" &&
      s.pending.length === 0 && s.queue.length === 0;
  })());
}

/* ------------------------------------------------------------------ */
section("Producer over a long session");
{
  /*
   * The property a clubhouse screen actually has to have: it is switched on in
   * the morning and left alone. Everything below drives one producer instance
   * through hours of snapshots rather than starting fresh each time, because
   * that is the case a page reload would hide.
   */
  const hours = (h) => 130_000 + h * 3_600_000;
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap([], hours(0)) }, hours(0));

  // an hour of nothing at all
  for (let m = 1; m <= 12; m++) {
    const t = hours(0) + m * 300_000;
    s = PR.reduce(s, { type: "snapshot", snapshot: snap([], t) }, t);
    s = PR.reduce(s, { type: "tick" }, t);
  }
  check("an hour with no scores leaves the board alone",
    s.mode === "leaderboard" && s.queue.length === 0 && s.playing === null);

  // a fact appears three hours in
  const late = hours(3);
  s = PR.reduce(s, { type: "snapshot",
    snapshot: snap(eagleRows("p1", late - 300_000), late) }, late);
  check("a moment appearing hours later is still found",
    s.queue.some((a) => a.kind === "eagle"), String(s.queue.length));
  s = PR.reduce(s, { type: "tick" }, late);
  check("and it still reaches the screen",
    s.mode === "announcement" && s.playing.item.kind === "eagle");
  s = PR.reduce(s, { type: "tick" }, late + 7_000);
  check("and the board comes back after it",
    s.mode === "leaderboard");

  // the same snapshot repeating for another hour must stay silent
  for (let m = 1; m <= 12; m++) {
    const t = late + m * 300_000;
    s = PR.reduce(s, { type: "snapshot",
      snapshot: snap(eagleRows("p1", late - 300_000), t) }, t);
    s = PR.reduce(s, { type: "tick" }, t);
  }
  check("a fact that is still true is not announced again",
    s.mode === "leaderboard" && s.queue.length === 0);

  check("the history does not grow without bound", s.history.length <= 60,
    String(s.history.length));
  check("what has been announced is remembered across the whole day",
    s.announced.length > 0);
}

/* ------------------------------------------------------------------ */
section("Corrections");
{
  const par = tvC.holes[eagleHole].par;
  // both agreed on an eagle at t0; both later agree it was a par
  const corrected = (at) => [
    ...eagleRows("p1", 0),
    ...pair("p1", eagleHole, par, at),
  ];

  check("a correction before anything was queued is never seen", (() => {
    const s = PR.reduce(S0, { type: "snapshot", snapshot: snap(corrected(60_000), 60_000) },
      190_000);
    return s.queue.length === 0 && s.pending.length === 0;
  })());

  check("a correction pulls a queued announcement before it airs", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
    const queued = s.queue.length === 1;
    // the desk fixes it while it is still waiting its turn
    s = PR.reduce(s, { type: "snapshot", snapshot: snap(corrected(130_500), 131_000) }, 260_000);
    s = PR.reduce(s, { type: "tick" }, 260_000);
    return queued && s.queue.length === 0 && s.mode === "leaderboard";
  })());

  check("a correction pulls a held announcement too", (() => {
    const held = [{ id: "p1", name: "High Handicap", clubId: "sigona", handicap: 28, gender: "M" },
                  tvPlayers[1]];
    let s = PR.reduce(S0, { type: "snapshot",
      snapshot: { ...snap(eagleRows("p1", 0), 0), players: held } }, 130_000);
    const wasHeld = s.pending.length === 1;
    s = PR.reduce(s, { type: "snapshot",
      snapshot: { ...snap(corrected(130_500), 131_000), players: held } }, 260_000);
    return wasHeld && s.pending.length === 0;
  })());

  check("an animation already running is never cut short by a correction", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
    s = PR.reduce(s, { type: "tick" }, 130_000);           // the eagle is on screen
    s = PR.reduce(s, { type: "snapshot", snapshot: snap(corrected(130_500), 131_000) }, 132_000);
    const mid = PR.reduce(s, { type: "tick" }, 132_000);
    return mid.mode === "announcement" && mid.playing.item.kind === "eagle";
  })());

  const afterAir = (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
    s = PR.reduce(s, { type: "tick" }, 130_000);
    s = PR.reduce(s, { type: "tick" }, 137_000);           // it has finished
    return PR.reduce(s, { type: "snapshot", snapshot: snap(corrected(140_000), 141_000) }, 270_000);
  })();

  check("a correction after it aired never says a correction happened", (() => {
    const words = afterAir.queue.map((a) =>
      [a.headline, a.subject, a.detail, a.line].join(" ")).join(" ");
    return !/correct|wrong|error|false|mistake|void|disqual/i.test(words);
  })());
  check("the board is acknowledged with one soft forward-looking card",
    afterAir.queue.length === 1 && afterAir.queue[0].kind === "leaderboard-update",
    JSON.stringify(afterAir.queue.map((a) => a.kind)));
  check("that card names whoever is leading now, not whose moment it was",
    afterAir.queue[0].subject !== "Alice Wanjiru" || afterAir.queue[0].detail === "Leading");
  check("it waits half a minute so it reads as routine", (() => {
    const soon = PR.reduce(afterAir, { type: "tick" }, 271_000);
    const later = PR.reduce(afterAir, { type: "tick" }, 305_000);
    return soon.mode === "leaderboard" && later.mode === "announcement";
  })());
  check("the acknowledgement is sent once, not on every later snapshot", (() => {
    let s = afterAir;
    for (const t of [280_000, 300_000, 320_000]) {
      s = PR.reduce(s, { type: "snapshot", snapshot: snap(corrected(140_000), t) }, t);
    }
    return s.queue.filter((a) => a.kind === "leaderboard-update").length === 1;
  })());

  check("a marker who changes their mind pulls the moment quietly", (() => {
    let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
    // the marker now disagrees: the figure is in dispute, so it stops being true
    const disputed = [...eagleRows("p1", 0),
      { round: 1, playerId: "p1", hole: eagleHole, gross: par, source: "marker", at: 130_500 }];
    s = PR.reduce(s, { type: "snapshot", snapshot: snap(disputed, 131_000) }, 260_000);
    s = PR.reduce(s, { type: "tick" }, 260_000);
    return s.queue.length === 0 && s.mode === "leaderboard";
  })());

  check("a lead change is not pruned for failing to happen twice", (() => {
    // board moments describe a moment passed through, not a fact on a card
    let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(pair("p1", 0, 3, 0), 0) }, 130_000);
    s = PR.reduce(s, { type: "snapshot",
      snapshot: snap([...pair("p1", 0, 3, 0), ...pair("p2", 0, 2, 0)], 131_000) }, 131_000);
    const had = s.queue.some((a) => a.kind === "lead-change");
    s = PR.reduce(s, { type: "snapshot",
      snapshot: snap([...pair("p1", 0, 3, 0), ...pair("p2", 0, 2, 0)], 132_000) }, 132_000);
    return had && s.queue.some((a) => a.kind === "lead-change");
  })());
}

/* ------------------------------------------------------------------ */
section("Feature interludes");
{
  // a field of eight with a full spread of settled holes, so most kinds have
  // something to say
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `f${i}`, name: `Player ${i}`, clubId: "sigona",
    handicap: 4 + i * 3, gender: "M",
  }));
  const rowsFor = (n) => {
    const out = [];
    many.forEach((p, pi) => {
      for (let h = 0; h < n; h++) {
        const gross = tvC.holes[h].par + ((pi + h) % 3 === 0 ? -1 : (pi + h) % 3 === 1 ? 0 : 1);
        for (const source of ["player", "marker"])
          out.push({ round: 1, playerId: p.id, hole: h, gross, source, at: 0 });
      }
    });
    return out;
  };
  const bigSnap = (at, extra = {}) => ({
    ...snap(rowsFor(9), at), players: many,
    fieldByRound: { 1: many.map((p) => p.id) },
    groups: [
      { number: 1, teeTime: "07:30", playerIds: many.slice(0, 4).map((p) => p.id) },
      { number: 2, teeTime: "07:40", playerIds: many.slice(4).map((p) => p.id) },
    ],
    ...extra,
  });

  const CFG = { featureEveryMs: 90_000, spacingMs: 15_000, cooldownMs: 120_000 };
  let s = PR.reduce(PR.initialState({ ...CFG, coverage: "full" }),
    { type: "snapshot", snapshot: bigSnap(0) }, 130_000);

  check("no feature fires the moment the screen comes on", (() => {
    const t = PR.reduce(s, { type: "tick" }, 130_000);
    return t.mode !== "feature";
  })());

  // drain the announcements the seeded card produces
  let t = 130_000;
  for (let i = 0; i < 40; i++) {
    t += 5_000;
    s = PR.reduce(s, { type: "tick" }, t);
  }
  check("a feature appears once the interval has passed and nothing is queued",
    s.mode === "feature" || s.history.some((h) => /spotlight|hole|group|day|head/i.test(h.kind)),
    s.mode);

  check("a feature holds the screen then gives it back", (() => {
    let x = s;
    // find one playing
    for (let i = 0; i < 60 && x.mode !== "feature"; i++) { t += 5_000; x = PR.reduce(x, { type: "tick" }, t); }
    if (x.mode !== "feature") return false;
    const until = x.playing.until;
    const after = PR.reduce(x, { type: "tick" }, until + 1);
    s = after;
    return after.mode === "leaderboard";
  })());

  check("the rotation moves on rather than repeating one card", (() => {
    const kinds = new Set();
    let x = s, u = t;
    for (let i = 0; i < 200; i++) {
      u += 5_000;
      x = PR.reduce(x, { type: "tick" }, u);
      if (x.mode === "feature") kinds.add(x.playing.item.kind);
    }
    return kinds.size >= 3;
  })(), "");

  check("an announcement always wins the screen over a feature", (() => {
    // a due feature and a waiting eagle at the same instant
    let x = PR.reduce(PR.initialState({ ...CFG, coverage: "full" }),
      { type: "snapshot", snapshot: bigSnap(0, { rows: [...rowsFor(9), ...eagleRows("f0", 0)] }) },
      130_000);
    x = { ...x, nextFeatureAt: 0 };
    x = PR.reduce(x, { type: "tick" }, 130_000);
    return x.mode === "announcement";
  })());

  check("quiet mode shows no features either", (() => {
    let x = PR.reduce(PR.initialState({ ...CFG, coverage: "quiet" }),
      { type: "snapshot", snapshot: bigSnap(0) }, 130_000);
    x = { ...x, nextFeatureAt: 0 };
    for (let i = 0; i < 10; i++) x = PR.reduce(x, { type: "tick" }, 130_000 + i * 10_000);
    return x.mode === "leaderboard";
  })());

  check("a tournament with nothing to say yet is not given an empty card", (() => {
    let x = PR.reduce(PR.initialState({ ...CFG, coverage: "full" }), { type: "snapshot", snapshot: snap([], 0) }, 1000);
    x = { ...x, nextFeatureAt: 0 };
    x = PR.reduce(x, { type: "tick" }, 1000);
    return x.mode === "leaderboard" && x.nextFeatureAt > 1000;
  })());

  check("a snapshot missing any optional collection cannot stop the screen", (() => {
    // this has bitten twice: once on decisions, once on groups. Every optional
    // collection is now read through a default, and this holds that line.
    const optional = ["decisions", "groups", "records", "rows", "players",
                      "published", "fieldByRound"];
    return optional.every((field) => {
      try {
        const bare = { ...bigSnap(0) };
        delete bare[field];
        let x = PR.reduce(PR.initialState({ ...CFG, coverage: "full" }), { type: "snapshot", snapshot: bare }, 130_000);
        x = { ...x, nextFeatureAt: 0 };
        PR.reduce(x, { type: "tick" }, 130_000);
        return true;
      } catch {
        console.log(`       (crashed without ${field})`);
        return false;
      }
    });
  })());

  const FE = await jiti.import("../lib/tv/features.ts");
  check("the same snapshot and turn always produce the same card", (() => {
    const settled = TR.settledHoles(rowsFor(9), {}, { cooldownMs: 0 }, 999_999);
    const ctx = { snapshot: bigSnap(0), settled,
      standings: PR.boardRows(bigSnap(0), settled), cfg: PR.initialState({ ...CFG, coverage: "full" }).config, now: 1 };
    const a = FE.nextFeature(ctx, 3);
    const b = FE.nextFeature(ctx, 3);
    return JSON.stringify(a) === JSON.stringify(b);
  })());
  check("a club message is only offered when the club wrote one", (() => {
    const settled = TR.settledHoles(rowsFor(9), {}, { cooldownMs: 0 }, 999_999);
    const base = { snapshot: bigSnap(0), settled,
      standings: PR.boardRows(bigSnap(0), settled), now: 1 };
    const none = FE.nextFeature({ ...base, cfg: { ...PR.initialState({ ...CFG, coverage: "full" }).config, messages: [] } }, 6);
    const some = FE.nextFeature({ ...base,
      cfg: { ...PR.initialState({ ...CFG, coverage: "full" }).config, messages: ["Prizegiving at 6pm in the main bar"] } }, 6);
    return none?.kind !== "message" && some?.kind === "message" &&
      some.title === "Prizegiving at 6pm in the main bar";
  })());
  check("only sponsors billed above a mention get their own moment", (() => {
    const settled = TR.settledHoles(rowsFor(9), {}, { cooldownMs: 0 }, 999_999);
    const withPartner = bigSnap(0, { tournament: { ...tvT,
      sponsors: [{ id: "s9", name: "A Partner", tier: "partner" }] } });
    const ctx = { snapshot: withPartner, settled,
      standings: PR.boardRows(withPartner, settled), cfg: PR.initialState({ ...CFG, coverage: "full" }).config, now: 1 };
    return FE.nextFeature(ctx, 5)?.kind !== "sponsor";
  })());
}

/* ------------------------------------------------------------------ */
section("Field profile");
const PF = await jiti.import("../lib/tv/profile.ts");
const hcField = (hcs) => hcs.map((h, i) => ({ id: `x${i}`, name: `P${i}`,
  clubId: "sigona", handicap: h, gender: "M" }));

check("a scratch field playing stroke play is a championship",
  PF.detectProfile("Stroke Play", hcField([0, 1, 2, 3, 4, 5, 6, 7])).profile === "championship");
check("a normal Saturday field is a club medal",
  PF.detectProfile("Stroke Play", hcField([2, 6, 11, 14, 18, 21, 24, 28])).profile === "club");
check("stableford is read as stableford whatever the handicaps",
  PF.detectProfile("Stableford", hcField([0, 1, 2, 3, 4, 5, 6, 7])).profile === "stableford");
check("team formats are read as team formats",
  PF.detectProfile("Scramble", hcField([0, 1, 2, 3, 4, 5, 6, 7])).profile === "team" &&
  PF.detectProfile("Better Ball", hcField([2, 4, 6, 8, 10, 12, 14, 16])).profile === "team");
check("too few entries to tell falls to the club treatment",
  PF.detectProfile("Stroke Play", hcField([1, 2, 3])).profile === "club");
check("one visiting scratch player does not make a club day a championship",
  PF.detectProfile("Stroke Play",
    hcField([0, 14, 16, 17, 18, 20, 22, 26])).profile === "club");
check("one high handicap does not stop a championship being one",
  PF.detectProfile("Stroke Play",
    hcField([1, 2, 3, 4, 5, 6, 7, 28])).profile === "championship");
check("the guess explains itself in words a club can judge",
  /Handicaps \d+ to \d+/.test(
    PF.detectProfile("Stroke Play", hcField([2, 6, 11, 14, 18, 21, 24, 28])).because));

/* ------------------------------------------------------------------ */
section("Spreading the afternoon across the field");
{
  const two = [
    { id: "hot", name: "Hot Streak", clubId: "sigona", handicap: 12, gender: "M" },
    { id: "other", name: "Someone Else", clubId: "sigona", handicap: 14, gender: "F" },
  ];
  const mk = (profile) => ({ ...snap([], 0),
    players: two, fieldByRound: { 1: ["hot", "other"] },
    tournament: { ...tvT, fieldProfile: profile } });

  const q = (state, subjectId, priority, i) => ({
    id: `a${i}`, kind: "round-in", priority, durationMs: 3000,
    headline: "Round in", subject: subjectId, subjectId,
    factKey: `f${i}`, queuedAt: 0,
  });

  check("at a club medal the screen prefers someone who has not been on", (() => {
    let s = PR.reduce(PR.initialState({ spacingMs: 0, coverage: "full" }),
      { type: "snapshot", snapshot: mk("club") }, 1000);
    s = { ...s, recentSubjects: ["hot", "hot", "hot"],
          queue: [q(s, "hot", 40, 1), q(s, "other", 36, 2)] };
    s = PR.reduce(s, { type: "tick" }, 1000);
    return s.playing.item.subjectId === "other";
  })());

  check("at a championship the higher-ranked moment simply wins", (() => {
    let s = PR.reduce(PR.initialState({ spacingMs: 0, coverage: "full" }),
      { type: "snapshot", snapshot: mk("championship") }, 1000);
    s = { ...s, recentSubjects: ["hot", "hot", "hot"],
          queue: [q(s, "hot", 40, 1), q(s, "other", 36, 2)] };
    s = PR.reduce(s, { type: "tick" }, 1000);
    return s.playing.item.subjectId === "hot";
  })());

  check("the nudge never keeps a rare moment waiting behind a common one", (() => {
    let s = PR.reduce(PR.initialState({ spacingMs: 0, coverage: "full" }),
      { type: "snapshot", snapshot: mk("club") }, 1000);
    s = { ...s, recentSubjects: ["hot", "hot", "hot", "hot", "hot"],
          queue: [
            { ...q(s, "hot", 100, 1), kind: "ace", headline: "Hole-in-one" },
            q(s, "other", 20, 2),
          ] };
    s = PR.reduce(s, { type: "tick" }, 1000);
    return s.playing.item.kind === "ace";
  })());

  check("being on screen is remembered, and forgotten again", (() => {
    let s = PR.reduce(PR.initialState({ spacingMs: 0, coverage: "full" }),
      { type: "snapshot", snapshot: mk("club") }, 1000);
    s = { ...s, queue: [q(s, "hot", 40, 1)] };
    s = PR.reduce(s, { type: "tick" }, 1000);
    const remembered = s.recentSubjects[0] === "hot";
    // the memory is short by design
    const long = { ...s, recentSubjects: Array(20).fill("hot") };
    let t2 = { ...long, queue: [q(long, "hot", 40, 9)] };
    t2 = PR.reduce(PR.reduce(t2, { type: "tick" }, 5000), { type: "tick" }, 9000);
    return remembered && t2.recentSubjects.length <= 8;
  })());

  check("a club changing the profile mid-round is picked up", (() => {
    let s = PR.reduce(PR.initialState({ coverage: "full" }), { type: "snapshot", snapshot: mk("club") }, 1000);
    const wasClub = s.config.profile === "club";
    s = PR.reduce(s, { type: "snapshot", snapshot: mk("championship") }, 2000);
    return wasClub && s.config.profile === "championship";
  })());
}

/* ------------------------------------------------------------------ */
section("Course records and club settings");
{
  const recs = [{ courseId: "c1", tee: "White", strokes: 68, holder: "Old Hand", year: 1998 }];
  const cards = (strokes, complete = true) => [{ playerId: "p1", strokes, complete }];
  const nameOf = () => "Today's Player";

  check("a lower score off the same tees is offered to the club",
    PF.recordClaims({ cards: cards(66), nameOf, courseId: "c1", tee: "White", records: recs })
      .length === 1);
  check("the offer carries what is on the books now", (() => {
    const c = PF.recordClaims({ cards: cards(66), nameOf, courseId: "c1", tee: "White",
      records: recs })[0];
    return c.previous.strokes === 68 && c.previous.holder === "Old Hand";
  })());
  check("a score off other tees does not touch that record",
    PF.recordClaims({ cards: cards(66), nameOf, courseId: "c1", tee: "Red", records: recs })
      .length === 0);
  check("equalling the record is not beating it",
    PF.recordClaims({ cards: cards(68), nameOf, courseId: "c1", tee: "White", records: recs })
      .length === 0);
  check("an unfinished card is never a record",
    PF.recordClaims({ cards: cards(60, false), nameOf, courseId: "c1", tee: "White",
      records: recs }).length === 0);
  check("with nothing on the books Shimo does not invent a record", (() => {
    // the first score it happens to see at a club is not eighty years of history
    return PF.recordClaims({ cards: cards(60), nameOf, courseId: "c1", tee: "White",
      records: [] }).length === 0;
  })());

  check("a tournament can start the day quiet", (() => {
    const quietT = { ...tvT, tvQuiet: true };
    let s = PR.reduce(PR.initialState({ coverage: "full" }), { type: "snapshot",
      snapshot: { ...snap(eagleRows("p1", 0), 0), tournament: quietT } }, 130_000);
    s = PR.reduce(s, { type: "tick" }, 200_000);
    return s.config.coverage === "quiet" && s.mode === "leaderboard" && s.queue.length === 0;
  })());
  check("the panel overrules the tournament's default, not the other way round", (() => {
    const quietT = { ...tvT, tvQuiet: true };
    let s = PR.reduce(PR.initialState(), { type: "snapshot", snapshot: {
      ...snap(eagleRows("p1", 0), 0), tournament: quietT,
      decisions: [{ id: 1, kind: "quiet", payload: { on: false }, at: 1 }],
    } }, 130_000);
    return s.config.coverage !== "quiet";
  })());
  check("club messages reach the feature rotation", (() => {
    const s = PR.reduce(PR.initialState(), { type: "snapshot", snapshot: {
      ...snap([], 0),
      identity: { clubId: "sigona", tvMessages: ["Prizegiving at 6pm in the main bar"] },
    } }, 1000);
    return s.config.messages[0] === "Prizegiving at 6pm in the main bar";
  })());
}

/* ------------------------------------------------------------------ */
section("Coverage tiers");
{
  const tCov = (coverage) => ({ ...tvT, tvCoverage: coverage });
  const covSnap = (coverage, rows, at = 0) => ({
    ...snap(rows, at), tournament: tCov(coverage),
  });
  const streakRows = (pid) => {
    // three birdies running: a streak, and nothing bigger
    const out = [];
    for (let h = 0; h < 3; h++)
      for (const source of ["player", "marker"])
        out.push({ round: 1, playerId: pid, hole: h,
                   gross: tvC.holes[h].par - 1, source, at: 0 });
    return out;
  };

  check("defaults follow the field: championship full, medal reduced, team quiet",
    PF.defaultCoverage("championship") === "full" &&
    PF.defaultCoverage("club") === "reduced" &&
    PF.defaultCoverage("stableford") === "reduced" &&
    PF.defaultCoverage("team") === "quiet");

  check("full carries a streak", (() => {
    const s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: covSnap("full", streakRows("p1")) }, 130_000);
    return s.queue.some((a) => a.kind === "streak");
  })());
  check("reduced does not", (() => {
    const s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: covSnap("reduced", streakRows("p1")) }, 130_000);
    return !s.queue.some((a) => a.kind === "streak");
  })());
  check("reduced still carries an eagle", (() => {
    const s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: covSnap("reduced", eagleRows("p1", 0)) }, 130_000);
    return s.queue.some((a) => a.kind === "eagle");
  })());
  check("reduced still carries an ace", (() => {
    const aceHole = tvC.holes.findIndex((h) => h.par === 3);
    const s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: covSnap("reduced", pair("p1", aceHole, 1, 0)) }, 130_000);
    return s.queue.some((a) => a.kind === "ace");
  })());
  check("reduced never blocks a correction from being acknowledged",
    PR.allowedAt("retraction", "reduced") && PR.allowedAt("leaderboard-update", "reduced"));
  check("quiet carries nothing at all",
    !PR.allowedAt("ace", "quiet") && !PR.allowedAt("retraction", "quiet"));
  check("what reduced skips does not pile up behind it", (() => {
    let s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: covSnap("reduced", streakRows("p1")) }, 130_000);
    for (const t of [200_000, 300_000, 400_000])
      s = PR.reduce(s, { type: "snapshot", snapshot: covSnap("reduced", streakRows("p1"), t) }, t);
    return s.queue.length === 0;
  })());
  check("turning coverage up does not replay what reduced skipped", (() => {
    let s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: covSnap("reduced", streakRows("p1")) }, 130_000);
    s = PR.reduce(s, { type: "snapshot", snapshot: covSnap("full", streakRows("p1"), 200_000) }, 200_000);
    s = PR.reduce(s, { type: "tick" }, 200_000);
    return s.mode === "leaderboard";
  })());
  check("features still run in reduced", (() => {
    // reduced is about interruptions, not about the screen going blank
    return PR.allowedAt("ace", "reduced") === true &&
      PR.initialState({ coverage: "reduced" }).config.coverage === "reduced";
  })());
  check("the panel can move between all three levels", (() => {
    const d = (id, level) => ({ id, kind: "coverage", payload: { level }, at: 1 });
    let s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: { ...covSnap("full", []), decisions: [d(1, "reduced")] } }, 1000);
    const a = s.config.coverage === "reduced";
    s = PR.reduce(s, { type: "snapshot",
      snapshot: { ...covSnap("full", [], 2000), decisions: [d(1, "reduced"), d(2, "quiet")] } }, 2000);
    return a && s.config.coverage === "quiet";
  })());
}

/* ------------------------------------------------------------------ */
section("The hard cap");
{
  const CAP = PR.initialState({ cooldownMs: 0, spacingMs: 15_000, coverage: "full" });
  const many = Array.from({ length: 6 }, (_, i) =>
    ({ id: `c${i}`, name: `Cap ${i}`, clubId: "sigona", handicap: 6, gender: "M" }));
  const par5s = tvC.holes.map((h, i) => [i, h.par]).filter(([, p]) => p === 5).map(([i]) => i);
  const rows = [];
  many.forEach((p, i) => {
    const hole = par5s[i % par5s.length];
    for (const source of ["player", "marker"])
      rows.push({ round: 1, playerId: p.id, hole, gross: tvC.holes[hole].par - 2, source, at: 0 });
  });
  const capSnap = (at) => ({ ...snap(rows, at), players: many,
    fieldByRound: { 1: many.map((p) => p.id) } });

  let s = PR.reduce(CAP, { type: "snapshot", snapshot: capSnap(0) }, 1000);
  check("six eagles all reach the queue", s.queue.length >= 6, String(s.queue.length));

  // play them out over five minutes
  let t = 1000;
  let aired = 0;
  for (let i = 0; i < 200; i++) {
    const before = s.playing;
    t += 1000;
    s = PR.reduce(s, { type: "tick" }, t);
    if (s.playing && s.playing !== before && s.playing.type === "announcement") aired++;
    if (t > 1000 + 6 * 60_000) break;
  }
  check("no more than three go out in five minutes", aired <= 3, `aired ${aired}`);
  check("at least fifteen seconds between any two", (() => {
    const gaps = s.firedAt.slice().sort((a, b) => a - b);
    return gaps.every((v, i) => i === 0 || v - gaps[i - 1] >= 15_000);
  })());
  check("what could not be shown is let go, not saved up", s.queue.length < 6,
    String(s.queue.length));
  check("and it is written down for the club to look over",
    s.history.some((h) => h.kind === "skipped" && /too much at once/.test(h.text)),
    JSON.stringify(s.history.slice(0, 3)));
  check("a skipped moment is never quietly re-offered later", (() => {
    const gone = s.history.filter((h) => h.kind === "skipped").length;
    let x = s;
    let u = t;
    for (let i = 0; i < 60; i++) {
      u += 10_000;
      x = PR.reduce(x, { type: "snapshot", snapshot: capSnap(u) }, u);
      x = PR.reduce(x, { type: "tick" }, u);
    }
    return gone > 0 && x.queue.length === 0;
  })());
  check("the window rolls: more may go out once it has passed", (() => {
    let x = s;
    let u = t;
    // a fresh eagle, well after the busy window
    const later = u + 10 * 60_000;
    x = PR.reduce(x, { type: "snapshot",
      snapshot: { ...capSnap(later), rows: [...rows, ...eagleRows("c0", later - 60_000)] } }, later);
    x = PR.reduce(x, { type: "tick" }, later);
    return x.mode === "announcement";
  })());
  check("the cap applies in full coverage too, not only reduced",
    PR.RATE_MAX === 3 && PR.RATE_WINDOW_MS === 300_000);

  check("an ace arriving in a saturated window is held back, never dropped", (() => {
    /*
     * The one thing the cap must never do. A club sees an ace once a year and
     * a screen that threw one away because three birdies got there first would
     * be unforgivable, so the biggest thing in the queue is kept while the
     * window clears and everything below it is let go.
     */
    let x = PR.reduce(PR.initialState({ cooldownMs: 0, spacingMs: 15_000, coverage: "full" }),
      { type: "snapshot", snapshot: capSnap(0) }, 1000);
    let u = 1000;
    for (let i = 0; i < 60; i++) { u += 1000; x = PR.reduce(x, { type: "tick" }, u); }
    // the cap is now saturated; an ace lands
    const aceHole = tvC.holes.findIndex((h) => h.par === 3);
    x = PR.reduce(x, { type: "snapshot", snapshot: {
      ...capSnap(u), rows: [...rows, ...pair("c5", aceHole, 1, u - 1000)] } }, u);
    const queuedIt = x.queue.some((a) => a.kind === "ace");
    // wind past the window and it goes out
    for (let i = 0; i < 400 && x.playing?.item?.kind !== "ace"; i++) {
      u += 1000;
      x = PR.reduce(x, { type: "tick" }, u);
    }
    const aired = x.playing?.item?.kind === "ace";
    const notSkipped = !x.history.some(
      (h) => h.kind === "skipped" && /Hole-in-one/.test(h.text),
    );
    return queuedIt && aired && notSkipped;
  })());
}

/* ------------------------------------------------------------------ */
section("Sound");
check("nothing makes a sound unless the club has asked",
  PR.initialState().config.aceChime === false);
check("and the only thing that can is a hole-in-one", (() => {
  // the whole audio surface is one flag and one kind; this holds it there, so
  // adding a second sound has to be a deliberate change with a test to update
  const src = readFileSync(new URL("../app/tournament/[id]/tv/page.tsx", import.meta.url), "utf8");
  const calls = src.match(/playChime\(\)/g) ?? [];
  return calls.length === 1 && /kind === "ace"/.test(src) && /config\.aceChime/.test(src);
})());

/* ------------------------------------------------------------------ */
section("Cut line, ties, and the end of the day");
{
  const cutT = { ...tvT, rounds: [
    { id: "r1", number: 1, name: "Round 1", date: "2030-01-01", courseId: tvC.id,
      tees: "White", firstTee: "07:00", teeInterval: 10, cut: { topN: 4 } },
    { id: "r2", number: 2, name: "Round 2", date: "2030-01-02", courseId: tvC.id,
      tees: "White", firstTee: "07:00", teeInterval: 10, cut: null },
  ] };
  const twelve = Array.from({ length: 12 }, (_, i) =>
    ({ id: `k${i}`, name: `Cut ${i}`, clubId: "sigona", handicap: 8, gender: "M" }));
  // twelve players, twelve holes each, spread out so a line exists
  const cutRows = [];
  twelve.forEach((p, pi) => {
    for (let h = 0; h < 12; h++) {
      const gross = tvC.holes[h].par + (pi % 4 === 0 ? 0 : pi % 4 === 1 ? 1 : pi < 8 ? 1 : 2);
      for (const source of ["player", "marker"])
        cutRows.push({ round: 1, playerId: p.id, hole: h, gross, source, at: 0 });
    }
  });
  const cutSnap = (at) => ({ ...snap(cutRows, at), tournament: cutT, players: twelve,
    fieldByRound: { 1: twelve.map((p) => p.id) } });

  const cs = PR.reduce(PR.initialState({ coverage: "full" }),
    { type: "snapshot", snapshot: cutSnap(0) }, 130_000);
  check("the cut line is announced on the round it applies after",
    cs.queue.some((a) => a.kind === "cut-line"), String(cs.queue.map((a) => a.kind)));
  check("it names the line and the number inside, never who is out", (() => {
    const a = cs.queue.find((x) => x.kind === "cut-line");
    return /Top 4 and ties/.test(a.subject) &&
      /inside/.test(a.line ?? "") &&
      !twelve.some((p) => (a.line ?? "").includes(p.name));
  })());
  check("no cut line on a round that has no cut", (() => {
    const noCut = { ...cutT, rounds: [{ ...cutT.rounds[0], cut: null }] };
    const s = PR.reduce(PR.initialState({ coverage: "full" }), { type: "snapshot",
      snapshot: { ...cutSnap(0), tournament: noCut } }, 130_000);
    return !s.queue.some((a) => a.kind === "cut-line");
  })());
  check("no cut line before the field has played enough for one", (() => {
    const thin = cutRows.filter((r) => r.hole < 3);
    const s = PR.reduce(PR.initialState({ coverage: "full" }), { type: "snapshot",
      snapshot: { ...cutSnap(0), rows: thin } }, 130_000);
    return !s.queue.some((a) => a.kind === "cut-line");
  })());
  check("the line recurs when it moves, and not before", (() => {
    let s = cs;
    const same = PR.reduce(s, { type: "snapshot", snapshot: cutSnap(200_000) }, 200_000);
    const before = same.queue.filter((a) => a.kind === "cut-line").length;
    return before === 1; // still the one, not a second copy of the same line
  })());
  check("a cut line is not shown at reduced coverage",
    !PR.allowedAt("cut-line", "reduced"));

  const board = (ids) => ids.map((playerId, i) => ({ playerId, position: i + 1 }));
  const DT2 = DT;
  check("a share of the lead forming is worth three seconds", (() => {
    const out = DT2.momentsForTie({
      before: board(["a", "b", "c"]),
      after: [{ playerId: "a", position: 1 }, { playerId: "b", position: 1 },
              { playerId: "c", position: 3 }],
      nameOf: (id) => id.toUpperCase(), round: 1, at: 1 });
    return out.length === 1 && /A and B/.test(String(out[0].data.names));
  })());
  check("one player breaking clear is the other half of it", (() => {
    const out = DT2.momentsForTie({
      before: [{ playerId: "a", position: 1 }, { playerId: "b", position: 1 }],
      after: board(["a", "b"]),
      nameOf: (id) => id.toUpperCase(), round: 1, at: 1 });
    return out.length === 1 && out[0].data.broken === 1;
  })());
  check("a lead change and a tie breaking are not both announced", (() => {
    /*
     * They are the same event seen from two sides. The simulation showed the
     * screen saying "New leader - Peter Njoroge" and "Clear at the top - Peter
     * Njoroge" within seconds of each other.
     */
    const two = [
      { id: "lead", name: "Lead", clubId: "sigona", handicap: 5, gender: "M" },
      { id: "was", name: "Was", clubId: "sigona", handicap: 5, gender: "M" },
    ];
    const mkSnap = (at) => ({ ...snap([], at), players: two,
      fieldByRound: { 1: ["lead", "was"] } });
    let x = PR.reduce(PR.initialState({ coverage: "full" }),
      { type: "snapshot", snapshot: mkSnap(0) }, 1000);
    // hand it a board where the two were tied and one has gone clear
    x = { ...x, boardBefore: [{ playerId: "lead", position: 1 },
                              { playerId: "was", position: 1 }] };
    const out = [
      ...DT.momentsForBoard({ before: x.boardBefore,
        after: [{ playerId: "was", position: 1 }, { playerId: "lead", position: 2 }],
        nameOf: (id) => id, round: 1, at: 1 }),
      ...DT.momentsForTie({ before: x.boardBefore,
        after: [{ playerId: "was", position: 1 }, { playerId: "lead", position: 2 }],
        nameOf: (id) => id, round: 1, at: 1 }),
    ];
    // both detectors fire; the producer is what keeps only one
    const hasLead = out.some((m) => m.kind === "lead-change");
    const hasBroken = out.some((m) => m.kind === "tie" && m.data?.broken);
    return hasLead && hasBroken;
  })());
  check("ties further down the board are left alone", (() => {
    const out = DT2.momentsForTie({
      before: board(["a", "b", "c", "d"]),
      after: [{ playerId: "a", position: 1 }, { playerId: "b", position: 2 },
              { playerId: "c", position: 3 }, { playerId: "d", position: 3 }],
      nameOf: (id) => id, round: 1, at: 1 });
    return out.length === 0;
  })());

  /* ---- the end of the day ---- */
  const doneRows = [];
  twelve.forEach((p, pi) => {
    for (let h = 0; h < 18; h++) {
      const gross = tvC.holes[h].par + (pi % 3 === 0 ? 0 : 1);
      for (const source of ["player", "marker"])
        doneRows.push({ round: 1, playerId: p.id, hole: h, gross, source, at: 0 });
    }
  });
  const doneSnap = (at, extraT = {}) => ({ ...snap(doneRows, at),
    tournament: { ...tvT, status: "completed",
      sponsors: [{ id: "s1", name: "NCBA", tier: "title" },
                 { id: "s2", name: "Junior Golf Foundation", tier: "prize" }],
      ...extraT },
    players: twelve, fieldByRound: { 1: twelve.map((p) => p.id) } });

  let d = PR.reduce(PR.initialState({ coverage: "full" }),
    { type: "snapshot", snapshot: doneSnap(0) }, 130_000);
  const kinds = new Set();
  let u = 130_000;
  for (let i = 0; i < 400; i++) {
    u += 2_000;
    d = PR.reduce(d, { type: "tick" }, u);
    if (d.mode === "feature") kinds.add(d.playing.item.kind);
  }
  check("the screen closes with the champion, the board, thanks and a goodbye",
    ["champion", "final-board", "thanks", "congratulations"].every((k) => kinds.has(k)),
    [...kinds].join(","));
  check("it stops announcing once the golf is finished", (() => {
    let x = PR.reduce(PR.initialState({ coverage: "full" }),
      { type: "snapshot", snapshot: doneSnap(0) }, 130_000);
    let v = 130_000;
    for (let i = 0; i < 120; i++) { v += 2_000; x = PR.reduce(x, { type: "tick" }, v); }
    return x.mode !== "announcement";
  })());
  check("a club with no sponsors is not given an empty thank-you card", (() => {
    let x = PR.reduce(PR.initialState({ coverage: "full" }), { type: "snapshot",
      snapshot: { ...doneSnap(0), tournament: { ...tvT, status: "completed" } } }, 130_000);
    let v = 130_000;
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      v += 2_000;
      x = PR.reduce(x, { type: "tick" }, v);
      if (x.mode === "feature") seen.add(x.playing.item.kind);
    }
    return !seen.has("thanks") && seen.has("champion");
  })());
  check("a finished field is recognised without the club pressing anything", (() => {
    // no status change: every card simply came in
    let x = PR.reduce(PR.initialState({ coverage: "full" }), { type: "snapshot",
      snapshot: { ...doneSnap(0), tournament: { ...tvT, sponsors: undefined } } }, 130_000);
    let v = 130_000;
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      v += 2_000;
      x = PR.reduce(x, { type: "tick" }, v);
      if (x.mode === "feature") seen.add(x.playing.item.kind);
    }
    return seen.has("champion") || seen.has("final-board");
  })());
  check("a screen switched on at the prizegiving does not wait ninety seconds", (() => {
    // the one moment someone is definitely watching
    let x = PR.reduce(PR.initialState({ coverage: "full", featureEveryMs: 90_000 }),
      { type: "snapshot", snapshot: doneSnap(0) }, 130_000);
    let v = 130_000;
    for (let i = 0; i < 8; i++) { v += 1_000; x = PR.reduce(x, { type: "tick" }, v); }
    return x.mode === "feature";
  })());
  check("a tournament still in play does still wait", (() => {
    let x = PR.reduce(PR.initialState({ coverage: "full", featureEveryMs: 90_000 }),
      { type: "snapshot", snapshot: cutSnap(0) }, 130_000);
    let v = 130_000;
    for (let i = 0; i < 8; i++) { v += 1_000; x = PR.reduce(x, { type: "tick" }, v); }
    return x.mode !== "feature";
  })());
  check("the closing cards run back to back, not once a minute", (() => {
    let x = PR.reduce(PR.initialState({ coverage: "full" }),
      { type: "snapshot", snapshot: doneSnap(0) }, 130_000);
    let v = 130_000;
    let gaps = 0;
    let lastEnd = null;
    for (let i = 0; i < 300; i++) {
      v += 1_000;
      const before = x.mode;
      x = PR.reduce(x, { type: "tick" }, v);
      if (before === "feature" && x.mode === "leaderboard") lastEnd = v;
      if (lastEnd && x.mode === "feature") { gaps = v - lastEnd; lastEnd = null; }
    }
    return gaps > 0 && gaps <= 4_000;
  })());
}

/* ------------------------------------------------------------------ *
 * The tournament list
 *
 * Editing a seeded tournament copies it into the club's own records, which
 * means the same event can exist twice in two different places. The list is
 * the one place that has to reconcile them.
 * ------------------------------------------------------------------ */
section("The tournament list");
{
  const seeded = S.allTournaments([]);
  const one = seeded[0];
  check("the seeded list is deduplicated to begin with",
    new Set(seeded.map((t) => t.id)).size === seeded.length);

  const adopted = S.allTournaments([{ ...one, name: "Renamed by the club" }]);
  check("adopting a seeded tournament does not list it twice",
    adopted.filter((t) => t.id === one.id).length === 1);
  check("the club's own copy is the one that shows",
    adopted.find((t) => t.id === one.id).name === "Renamed by the club");
  check("adopting does not lose any other tournament",
    adopted.length === seeded.length, `${adopted.length} vs ${seeded.length}`);

  const afterDismiss = S.allTournaments([], [one.id]);
  check("a dismissed tournament leaves the list",
    !afterDismiss.some((t) => t.id === one.id));
  check("dismissing one leaves the rest alone",
    afterDismiss.length === seeded.length - 1);
}

/* ------------------------------------------------------------------ *
 * First run
 *
 * Both surfaces show their orientation exactly once, and independently. A
 * welcome that comes back is worse than no welcome at all.
 * ------------------------------------------------------------------ */
section("First run");
{
  S.setOnboarded(true);
  S.setDeskWelcomed(true);
  check("the golfer orientation stays dismissed", st().onboarded === true);
  check("the desk orientation stays dismissed", st().deskWelcomed === true);
  check("dismissing one does not dismiss the other", (() => {
    S.setDeskWelcomed(false);
    return st().onboarded === true && st().deskWelcomed === false;
  })());
}

/* ------------------------------------------------------------------ *
 * Membership access
 *
 * The gate that makes "member" mean something. Every branch is checked here
 * rather than by signing in and out of a phone, which is the whole reason
 * memberAccess is a pure function over the roster.
 * ------------------------------------------------------------------ */
section("Membership access");
{
  const M = await jiti.import("../lib/membership.ts");
  const base = { id: "p-x", clubId: "muthaiga", name: "Test Member",
                 handicap: 12, gender: "M", email: "test@example.com" };

  check("nobody signed in is signed out",
    M.memberAccess([base], null).kind === "signed-out");
  check("an email off the roster is not a member",
    M.memberAccess([base], "stranger@example.com").kind === "not-a-member");
  check("a stranger is told what to do instead", (() => {
    const msg = M.accessMessage(M.memberAccess([base], "stranger@example.com"));
    return msg && /registration link/i.test(msg.body);
  })());

  /* Demo keeps open access; the pilot branches are exercised through the
     store below, where IS_PILOT is whatever the harness was built with. */
  check("a roster email resolves to its row",
    M.rosterRowFor([base], "TEST@Example.com ")?.id === "p-x");
  check("a claimed address resolves to its row", (() => {
    const claimed = { ...base, email: "old@example.com",
      invite: { token: "t", claimedBy: "new@example.com" } };
    return M.rosterRowFor([claimed], "new@example.com")?.id === "p-x";
  })());

  check("a token is long and unguessable", (() => {
    const t = M.newInviteToken();
    return t.length === 20 && /^[a-z2-9]+$/.test(t);
  })());
  check("two tokens never collide", (() => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(M.newInviteToken());
    return seen.size === 500;
  })());
  check("tokens avoid look-alike characters", (() => {
    let all = "";
    for (let i = 0; i < 200; i++) all += M.newInviteToken();
    return !/[ilo01]/.test(all);
  })());

  /* ---- the club's own actions ---- */
  const rosterBefore = st().roster.length;
  S.addRosterMember({ ...base, id: "p-invite-test", email: "invitee@example.com" });
  const token = S.inviteMember("p-invite-test");
  check("inviting mints a token", typeof token === "string" && token.length === 20);
  check("an invited member is not yet activated",
    !st().roster.find((p) => p.id === "p-invite-test").invite.activatedAt);

  check("copying reuses an unclaimed link rather than breaking it",
    S.ensureInviteToken("p-invite-test") === token);

  const claimed = S.activateInvite(token, "invitee@example.com");
  check("the right token claims the row", claimed?.id === "p-invite-test");
  check("the same token cannot claim twice",
    S.activateInvite(token, "someone@else.com") === null);
  check("an unknown token claims nothing",
    S.activateInvite("nosuchtokennosuchto", "x@y.com") === null);

  S.setMemberActive("p-invite-test", false);
  check("a switched-off member cannot be claimed", (() => {
    const t2 = S.inviteMember("p-invite-test");
    return S.activateInvite(t2, "invitee@example.com") === null;
  })());
  check("switching off keeps the member on the roster",
    st().roster.some((p) => p.id === "p-invite-test"));

  S.linkMemberEmail("p-invite-test", "Actual@Address.com");
  const linked = st().roster.find((p) => p.id === "p-invite-test");
  check("linking an address activates and reactivates",
    linked.active === true && Boolean(linked.invite.activatedAt));
  check("linking lower-cases the address",
    linked.invite.claimedBy === "actual@address.com");
  check("the linked address now resolves to the member",
    M.rosterRowFor(st().roster, "actual@address.com").id === "p-invite-test");

  check("bulk invites skip members who already claimed", (() => {
    const before = st().roster.filter((p) => p.invite?.activatedAt).length;
    S.inviteAllMembers();
    const after = st().roster.filter((p) => p.invite?.activatedAt).length;
    return after === before;
  })());
  check("the roster did not lose anyone along the way",
    st().roster.length === rosterBefore + 1);
}

/* ------------------------------------------------------------------ *
 * Guests
 *
 * The field on a corporate day is mostly people the club has never met. They
 * score, they mark, and their certification is worth what a member's is. What
 * has to hold is that they never become members by accident, that a code
 * reaches exactly one card, and that nobody reaches a sponsor without saying
 * they were willing to.
 * ------------------------------------------------------------------ */
section("Guests");
{
  const G = await jiti.import("../lib/guests.ts");

  check("a code is six characters, grouped and unambiguous", (() => {
    const c = G.newGuestCode();
    return /^[a-z2-9]{3}-[a-z2-9]{3}$/.test(c) && !/[ilo01]/.test(c);
  })());
  check("codes do not collide across a full field", (() => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(G.newGuestCode());
    return seen.size === 2000;
  })());
  check("a code typed in capitals, spaced, without the dash still works",
    G.normaliseCode("  ABC 123 ") === "abc-123");

  check("a name is required, everything else is not",
    G.validateRegistration({ name: "J", sponsorListConsent: false }).length === 1 &&
    G.validateRegistration({ name: "James Mwangi", sponsorListConsent: false }).length === 0);
  check("a handicap outside the real range is refused",
    G.validateRegistration({ name: "James Mwangi", handicap: 99, sponsorListConsent: false })
      .some((p) => p.field === "handicap"));
  check("no handicap at all is fine",
    G.validateRegistration({ name: "James Mwangi", sponsorListConsent: false }).length === 0);

  /* ---- registering ---- */
  const rosterBefore = st().roster.length;
  const e1 = S.registerGuest("t-corp-test", {
    name: "James Mwangi", email: "james@acme.co.ke", company: "Acme",
    handicap: 18, sponsorListConsent: false,
  });
  check("registering yields a code", /^[a-z2-9]{3}-[a-z2-9]{3}$/.test(e1.code));
  check("a guest never lands on the member roster",
    st().roster.length === rosterBefore &&
    !st().roster.some((p) => p.email === "james@acme.co.ke"));
  check("a guest is a player everywhere scoring looks", (() => {
    const found = S.playerInField(st(), e1.guestId);
    return found?.name === "James Mwangi";
  })());
  check("a declared handicap is marked as the player's own claim", (() => {
    const g = st().guests.find((x) => x.id === e1.guestId);
    return G.handicapProvenance(g) === "self-declared";
  })());
  check("a guest with no handicap is not treated as scratch", (() => {
    const e = S.registerGuest("t-corp-test", {
      name: "No Handicap", email: "nh@acme.co.ke", sponsorListConsent: false,
    });
    const g = st().guests.find((x) => x.id === e.guestId);
    return G.handicapProvenance(g) === "none";
  })());

  /* ---- the code opens one card, in one event ---- */
  check("a code opens its own player", (() => {
    const hit = S.guestForCode(st(), e1.code);
    return hit?.player.id === e1.guestId && hit.tournamentId === "t-corp-test";
  })());
  check("a code typed loosely still opens it",
    S.guestForCode(st(), e1.code.replace("-", "").toUpperCase())?.player.id === e1.guestId);
  check("a wrong code opens nothing", S.guestForCode(st(), "zzz-999") === null);
  check("a code is scoped to one tournament", (() => {
    const other = S.registerGuest("t-other-test", {
      name: "James Mwangi", email: "james@acme.co.ke", sponsorListConsent: false,
    });
    return other.code !== e1.code &&
      S.guestForCode(st(), other.code).tournamentId === "t-other-test";
  })());

  /* ---- a repeat guest keeps one identity ---- */
  check("playing a second event does not duplicate the person",
    st().guests.filter((g) => g.email === "james@acme.co.ke").length === 1);
  check("but does give a separate entry per event",
    st().guestEntries.filter((e) => e.guestId === e1.guestId).length === 2);
  check("submitting the same form twice does not mint a second code", (() => {
    const again = S.registerGuest("t-corp-test", {
      name: "James Mwangi", email: "james@acme.co.ke", sponsorListConsent: false,
    });
    return again.code === e1.code;
  })());

  /* ---- consent ---- */
  check("consent is off unless it was given",
    G.sponsorListable(st().guests).length === 0);
  check("a guest who agrees is listable", (() => {
    S.registerGuest("t-corp-test", {
      name: "Willing Guest", email: "willing@acme.co.ke", sponsorListConsent: true,
    });
    const listable = G.sponsorListable(st().guests);
    return listable.length === 1 && listable[0].name === "Willing Guest";
  })());
  check("changing their mind on a later event is honoured", (() => {
    S.registerGuest("t-other-test", {
      name: "Willing Guest", email: "willing@acme.co.ke", sponsorListConsent: false,
    });
    return G.sponsorListable(st().guests).length === 0;
  })());
  check("notes never travel with the sponsor-listable set", (() => {
    S.registerGuest("t-corp-test", {
      name: "Noted Guest", email: "noted@acme.co.ke",
      notes: "Nut allergy", sponsorListConsent: true,
    });
    /* The club holds the note; the consented set is what a pack may draw on,
       and the pack renders name and organisation only. */
    const g = st().guests.find((x) => x.email === "noted@acme.co.ke");
    return g.guest.notes === "Nut allergy" &&
      G.sponsorListable(st().guests).some((x) => x.id === g.id);
  })());

  check("guests in one tournament are only that tournament's guests", (() => {
    const inCorp = S.guestsIn(st(), "t-corp-test").map((g) => g.name).sort();
    return inCorp.includes("James Mwangi") && inCorp.includes("Noted Guest");
  })());
}

/* ------------------------------------------------------------------ *
 * Sponsor inventory
 *
 * A corporate day is sold as a set of positions. What has to hold is that the
 * order never changes between renders, that a club cannot promise two people
 * top billing without being told, and that what a sponsor paid never leaks
 * onto a surface anyone else can see.
 * ------------------------------------------------------------------ */
section("Sponsor inventory");
{
  const SP = await jiti.import("../lib/sponsors.ts");
  const mk = (id, name, tier, extra = {}) => ({ id, name, tier, ...extra });

  check("the old tier names still parse",
    SP.normaliseTier("prize") === "category" &&
    SP.normaliseTier("partner") === "supporting" &&
    SP.normaliseTier(undefined) === "supporting");

  const set = [
    mk("s4", "Zulu Supplies", "supporting"),
    mk("s2", "Beta Insurance", "presenting"),
    mk("s1", "Acme Bank", "title"),
    mk("s3", "Delta Drinks", "category", { category: "Halfway house" }),
    mk("s5", "Alpha Fuels", "supporting"),
  ];
  check("billing order runs title, presenting, category, supporting",
    SP.inBillingOrder(set).map((s) => s.id).join(",") === "s1,s2,s3,s5,s4");
  check("same-tier sponsors keep a stable order between renders", (() => {
    const a = SP.inBillingOrder(set).map((s) => s.id).join(",");
    const b = SP.inBillingOrder([...set].reverse()).map((s) => s.id).join(",");
    return a === b;
  })());
  check("the title sponsor is findable", SP.titleSponsor(set).name === "Acme Bank");

  check("a title sponsor appears everywhere",
    SP.placementsOf(set.find((s) => s.id === "s1")).length === 6);
  check("a supporting sponsor gets the poster and the recap, not the screen", (() => {
    const p = SP.placementsOf(set.find((s) => s.id === "s4"));
    return p.includes("poster") && p.includes("recap") && !p.includes("tv");
  })());
  check("an explicit placement overrides the tier default", (() => {
    const bought = mk("s9", "Screen Only", "supporting", { placements: ["tv"] });
    return SP.appearsOn(bought, "tv") && !SP.appearsOn(bought, "poster");
  })());
  check("a surface returns its sponsors in billing order",
    SP.sponsorsOn(set, "tv").map((s) => s.id).join(",") === "s1,s2");

  /* ---- what stops a club publishing ---- */
  check("no sponsors at all blocks a corporate day",
    !SP.canPublish([]) && SP.sponsorProblems([])[0].message.includes("at least one"));
  check("two title sponsors is caught", (() => {
    const two = [mk("a", "One", "title"), mk("b", "Two", "title")];
    return SP.sponsorProblems(two).some((p) => /top billing/.test(p.message));
  })());
  check("a category sponsor with no category is caught",
    SP.sponsorProblems([mk("c", "Vague Co", "category")])
      .some((p) => /what they bought/.test(p.message)));
  check("a missing contact warns but does not block", (() => {
    const one = [mk("d", "Acme", "title")];
    return SP.sponsorProblems(one).some((p) => /nowhere to go/.test(p.message)) &&
      SP.canPublish(one);
  })());
  check("a contest pointing at a departed sponsor is caught", (() => {
    const contests = [{ id: "c1", name: "Nearest the pin", hole: 7, sponsorId: "gone" }];
    return SP.sponsorProblems([mk("d", "Acme", "title")], contests)
      .some((p) => /no longer on the sheet/.test(p.message));
  })());

  /* ---- contests ---- */
  const contests = [
    { id: "c1", name: "Nearest the pin", hole: 7, sponsorId: "s3" },
    { id: "c2", name: "Longest drive", hole: 12, sponsorId: "s3" },
    { id: "c3", name: "Hole in one", hole: 16, sponsorId: "s1" },
  ];
  check("a player on a contest hole can see whose it is",
    SP.contestOnHole(contests, 7).sponsorId === "s3");
  check("an ordinary hole has no contest",
    SP.contestOnHole(contests, 8) === undefined);
  check("a sponsor's contests come back in hole order",
    SP.contestsFor(contests, "s3").map((c) => c.hole).join(",") === "7,12");

  /* ---- the club's book ---- */
  S.rememberSponsor("muthaiga", mk("s1", "Acme Bank", "title", {
    contestId: "c3", contributionKES: 500000, contact: { name: "A. Person" },
  }));
  const book = () => st().clubIdentity.muthaiga?.sponsorBook ?? [];
  check("a sponsor is kept for next time", book().length === 1);
  check("the contest link does not follow into the book",
    book()[0].contestId === undefined);
  check("what they paid does not follow into the book",
    book()[0].contributionKES === undefined);
  check("the contact does follow, because that is the reusable part",
    book()[0].contact.name === "A. Person");
  check("remembering the same sponsor updates rather than duplicates", (() => {
    S.rememberSponsor("muthaiga", mk("other-id", "acme bank", "presenting"));
    return book().length === 1 && SP.normaliseTier(book()[0].tier) === "presenting";
  })());
}

/* ------------------------------------------------------------------ *
 * Corporate and charity days
 * ------------------------------------------------------------------ */
section("Corporate and charity days");
{
  const SP = await jiti.import("../lib/sponsors.ts");
  const sponsors = [
    { id: "sp1", name: "Acme Bank", tier: "title", contact: { name: "A. Person" } },
    { id: "sp2", name: "Delta Drinks", tier: "category", category: "Halfway house",
      contact: { name: "D. Person" } },
  ];
  const contests = [
    { id: "ct1", name: "Nearest the pin", hole: 7, sponsorId: "sp2", prize: "A watch" },
  ];

  check("a sound corporate inventory may publish",
    SP.canPublish(sponsors, contests));
  check("the same day with no sponsors may not",
    !SP.canPublish([], contests));

  /* A real corporate day in the store, not a literal in this file. */
  S.createTournament({
    ...T,
    id: "t-corp-day",
    name: "Acme Corporate Golf Day",
    eventKind: "corporate",
    presentedBy: { name: "Acme Bank" },
    rounds: [T.rounds[0]],
    sponsors,
    contests,
  });
  const day = () => st().created.find((x) => x.id === "t-corp-day");

  check("the day knows what kind of day it is", day().eventKind === "corporate");
  check("the brand leads and the club is the venue",
    day().presentedBy.name === "Acme Bank" && day().clubId === "sigona");
  check("contests survive into the store", day().contests.length === 1);
  check("a contest keeps its sponsor", day().contests[0].sponsorId === "sp2");

  S.setTournamentContests("t-corp-day", [
    ...contests,
    { id: "ct2", name: "Longest drive", hole: 12 },
  ]);
  check("contests can be edited after publishing", day().contests.length === 2);

  S.setContestResult("t-corp-day", "ct1", { playerId: "p-joe", detail: "1.4 m" });
  check("a contest result is recorded against the contest", (() => {
    const c = day().contests.find((x) => x.id === "ct1");
    return c.result.playerId === "p-joe" && c.result.detail === "1.4 m";
  })());
  check("recording one result leaves the others alone",
    day().contests.find((x) => x.id === "ct2").result === undefined);

  S.setTournamentSponsors("t-corp-day", [
    ...sponsors,
    { id: "sp3", name: "Zulu Supplies", tier: "supporting" },
  ]);
  check("the sponsor set can grow after publishing", day().sponsors.length === 3);
  check("the title sponsor is unchanged by a later addition",
    SP.titleSponsor(day().sponsors).name === "Acme Bank");

  /* A charity day is for its beneficiary; sponsors are who paid for it.
     Conflating the two would put the charity into the poster's logo strip. */
  S.createTournament({
    ...T,
    id: "t-charity-day",
    name: "Junior Golf Charity Day",
    eventKind: "charity",
    beneficiary: { name: "Junior Golf Foundation", targetKES: 2000000 },
    rounds: [T.rounds[0]],
    sponsors,
  });
  const charity = () => st().created.find((x) => x.id === "t-charity-day");
  check("a charity day names its beneficiary",
    charity().beneficiary.name === "Junior Golf Foundation");
  check("the beneficiary is not one of the sponsors",
    !charity().sponsors.some((x) => x.name === "Junior Golf Foundation"));
  check("what was raised is absent until the club enters it",
    charity().beneficiary.raisedKES === undefined);
}

/* ------------------------------------------------------------------ *
 * Pace of play
 * ------------------------------------------------------------------ */
section("Pace of play");
{
  const P = await jiti.import("../lib/pace.ts");

  check("the first score starts the clock", (() => {
    const m = P.stampsFor(0, 1);
    return m.start && !m.turn && !m.finish;
  })());
  check("crossing nine stamps the turn", (() => {
    const m = P.stampsFor(8, 9);
    return !m.start && m.turn && !m.finish;
  })());
  check("a card typed at the desk in one go crosses both", (() => {
    const m = P.stampsFor(0, 18);
    return m.start && m.turn && m.finish;
  })());
  check("a stamp is never set twice", (() => {
    const m = P.stampsFor(9, 12);
    return !m.start && !m.turn && !m.finish;
  })());

  const t0 = Date.parse("2026-08-22T07:00:00Z");
  const iso = (min) => new Date(t0 + min * 60_000).toISOString();

  const paces = [
    { key: "k", groupId: "g1", startedAt: iso(0), turnAt: iso(120), finishedAt: iso(250) },
    { key: "k", groupId: "g2", startedAt: iso(10), turnAt: iso(132) },
    /* well behind: nine holes in the time the others took for thirteen */
    { key: "k", groupId: "g3", startedAt: iso(20) },
  ];
  const holes = { g1: 18, g2: 13, g3: 9 };
  const readings = P.paceReadings(paces, holes, t0 + 220 * 60_000, 15);
  const by = (id) => readings.find((r) => r.groupId === id);

  check("a finished group reports front, back and total",
    by("g1").front === 120 && by("g1").back === 130 && by("g1").total === 250);
  check("a group still out reports elapsed rather than total",
    by("g2").total === undefined && by("g2").elapsed === 210);
  check("a slow group is flagged", by("g3").outOfPosition === true);
  check("a group on the pace is not", by("g2").outOfPosition === false);
  check("a group that has finished is never flagged, however slow it was",
    by("g1").outOfPosition === false);

  check("a group with too few holes is not judged", (() => {
    const r = P.paceReadings(
      [{ key: "k", groupId: "g9", startedAt: iso(200) }],
      { g9: 1 },
      t0 + 220 * 60_000,
    );
    return r[0].behind === undefined && r[0].outOfPosition === false;
  })());
  check("nobody is behind when there is no field to compare against", (() => {
    const r = P.paceReadings(
      [{ key: "k", groupId: "solo", startedAt: iso(0) }],
      { solo: 9 },
      t0 + 120 * 60_000,
    );
    /* One group is its own average, so it is exactly on the pace. */
    return r[0].behind === 0 && r[0].outOfPosition === false;
  })());
  check("the threshold is honoured", (() => {
    const strict = P.paceReadings(paces, holes, t0 + 220 * 60_000, 5);
    const loose = P.paceReadings(paces, holes, t0 + 220 * 60_000, 600);
    return strict.some((r) => r.outOfPosition) &&
      !loose.some((r) => r.outOfPosition);
  })());

  check("elapsed reads as a golfer would say it",
    P.formatElapsed(250) === "4h 10m" && P.formatElapsed(46) === "46m" &&
    P.formatElapsed(undefined) === "·");

  /* ---- captured off real scoring, with nobody pressing anything ---- */
  /* t-champs has already been scored higher up this file, so measure the
     change this entry causes rather than assuming a clean sheet. */
  const key = roundKey("t-champs", 1);
  const g1 = st().pairings[key][0];
  const playedBefore = S.groupHolesPlayed(st(), key)[g1.id] ?? 0;
  S.setBulkScore(g1.playerIds[0], 0, 5);
  check("entering a score starts that group's clock", (() => {
    const row = Object.values(st().pace).find(
      (p) => p.key === key && p.groupId === g1.id,
    );
    return Boolean(row?.startedAt);
  })());
  check("the stamp lands on the group, not the player", (() => {
    const row = Object.values(st().pace).find((p) => p.key === key);
    return row.groupId === st().pairings[key][0].id && Boolean(row.startedAt);
  })());
  check("a second score does not restart the clock", (() => {
    const row = Object.values(st().pace).find((p) => p.key === key);
    const first = row.startedAt;
    S.setBulkScore(st().pairings[key][0].playerIds[1], 1, 4);
    return Object.values(st().pace).find((p) => p.key === key).startedAt === first;
  })());
  check("holes played counts the group, not one card", (() => {
    /* Two holes were just entered on two different players in the same group.
       A per-card count would read 1; a per-group count reads both. */
    const after = S.groupHolesPlayed(st(), key)[g1.id];
    return after >= Math.max(playedBefore, 2);
  })());
  check("two players on the same hole count as one hole for the group", (() => {
    /*
     * Called directly on a synthetic state. t-champs above is scored to
     * completion and has no untouched hole left, and building a whole live
     * round to reach one branch would test the harness rather than the rule.
     * groupHolesPlayed reads only pairings and scores, so this is the real
     * function on real inputs.
     */
    const card = (holes) => {
      const c = Array(18).fill(null);
      for (const [h, v] of holes) c[h] = v;
      return c;
    };
    const fake = {
      pairings: { k: [{ id: "gg", number: 1, teeTime: "07:00", playerIds: ["a", "b"] }] },
      scores: {
        k: {
          /* both players scored hole 0; only one scored hole 1 */
          a: card([[0, 4], [1, 5]]),
          b: card([[0, 5]]),
        },
      },
    };
    return S.groupHolesPlayed(fake, "k").gg === 2;
  })());

  check("a hole nobody in the group has scored does not count", (() => {
    const empty = Array(18).fill(null);
    const fake = {
      pairings: { k: [{ id: "gg", number: 1, teeTime: "07:00", playerIds: ["a"] }] },
      scores: { k: { a: empty } },
    };
    return S.groupHolesPlayed(fake, "k").gg === 0;
  })());

}

/* ------------------------------------------------------------------ *
 * Exposure
 *
 * The rule this whole module exists to enforce: a figure is either observed
 * or it is reported as not measured. Nothing is estimated. A recap pack is a
 * document a club hands a paying backer, and the product's first claim is
 * that its numbers hold up.
 * ------------------------------------------------------------------ */
section("Exposure");
{
  const E = await jiti.import("../lib/exposure.ts");

  const ev = (surface, device, seconds) => ({
    tournamentId: "t-x", surface, device, at: Date.now(),
    ...(seconds !== undefined ? { seconds } : {}),
  });

  const events = [
    ev("board", "d1"), ev("board", "d1"), ev("board", "d2"), ev("board", "d3"),
    ev("tournament", "d1"),
    ev("tv", "tvbox", 60), ev("tv", "tvbox", 60), ev("tv", "tvbox", 60),
    /* another tournament entirely, which must not leak in */
    { tournamentId: "t-other", surface: "board", device: "d9", at: Date.now() },
  ];
  const sum = E.summarise(events, "t-x");
  const of = (s) => sum.find((x) => x.surface === s);

  check("one person refreshing is not forty people",
    of("board").unique === 3 && of("board").total === 4);
  check("another tournament's views do not leak in",
    of("board").unique === 3);
  check("a surface nobody opened reports zero, not nothing",
    of("tournament").unique === 1 && sum.length === 3);
  check("the television reports time, not opens",
    of("tv").seconds === 180 && of("tv").unique === 1);
  check("only the television carries seconds",
    of("board").seconds === undefined);

  check("an unmeasured figure is a value, not a gap", (() => {
    const m = E.notMeasured(E.UNMEASURED.social);
    return m.measured === false && /social accounts/i.test(m.why);
  })());
  check("a measured figure carries its value",
    E.measured(42).measured === true && E.measured(42).value === 42);
  check("every unmeasured reason explains itself",
    Object.values(E.UNMEASURED).every((w) => w.length > 40));

  /* ---- contest engagement is counted, never assumed ---- */
  const card = (holes) => {
    const c = Array(18).fill(null);
    for (const [h, v] of holes) c[h] = v;
    return c;
  };
  const cards = {
    a: card([[6, 3]]),          // played the 7th
    b: card([[6, 4]]),          // played the 7th
    c: card([[0, 5]]),          // did not reach it
    d: card([]),                // no card at all
  };
  check("only players who actually played the hole are counted",
    E.contestEngagement(cards, 7) === 2);
  check("a field size is never used as a stand-in",
    E.contestEngagement(cards, 7) !== Object.keys(cards).length);
  check("a hole outside the round counts nobody",
    E.contestEngagement(cards, 19) === 0 && E.contestEngagement(cards, 0) === 0);

  check("a duration reads the way a person would say it",
    E.formatDuration(13320) === "3h 42m" && E.formatDuration(600) === "10 min");

  /* ---- captured off the real store ---- */
  const before = st().exposure.length;
  S.recordExposure("t-corp-day", "board");
  S.recordExposure("t-corp-day", "tv", 60);
  check("recording appends", st().exposure.length === before + 2);
  check("a row carries no personal data", (() => {
    const row = st().exposure[st().exposure.length - 1];
    return Object.keys(row).sort().join(",") ===
      "at,device,seconds,surface,tournamentId";
  })());
  check("an empty tournament id records nothing", (() => {
    const n = st().exposure.length;
    S.recordExposure("", "board");
    return st().exposure.length === n;
  })());
  check("the store rolls up the same way the pure function does", (() => {
    const rolled = E.summarise(S.exposureFor(st(), "t-corp-day"), "t-corp-day");
    return rolled.find((x) => x.surface === "tv").seconds === 60;
  })());
}

/* ------------------------------------------------------------------ *
 * The sponsor recap pack
 *
 * The rule the whole feature turns on: a pack states only what was observed.
 * These check the spec builder, which is where a fabricated number would have
 * to enter from.
 * ------------------------------------------------------------------ */
section("Sponsor recap");
{
  const R = await jiti.import("../lib/recap/spec.ts");

  const sponsor = {
    id: "sp1", name: "Zawadi Bank", tier: "title", accent: "#1e5f8c",
    contact: { name: "Grace Njeri", email: "grace@example.com" },
    contributionKES: 750000,
  };
  const tournament = {
    id: "t-recap", name: "Zawadi Corporate Golf Day", clubId: "muthaiga",
    format: "Stableford", fieldSize: 120,
    eventKind: "corporate", presentedBy: { name: "Zawadi Bank" },
    contests: [
      { id: "c1", name: "Nearest the pin", hole: 7, sponsorId: "sp1",
        result: { playerId: "p-njoroge", detail: "1.4 m" } },
      { id: "c2", name: "Longest drive", hole: 12, sponsorId: "sp-other" },
    ],
  };
  const card = (holes) => {
    const c = Array(18).fill(null);
    for (const h of holes) c[h] = 4;
    return c;
  };
  const cards = { a: card([6]), b: card([6]), c: card([0]) };
  const events = [
    { tournamentId: "t-recap", surface: "board", device: "d1", at: 1 },
    { tournamentId: "t-recap", surface: "board", device: "d1", at: 2 },
    { tournamentId: "t-recap", surface: "board", device: "d2", at: 3 },
  ];
  const build = (over = {}) =>
    R.recapSpec({
      sponsor, tournament, club: { name: "Muthaiga Golf Club" },
      events, cards, winners: [], consented: [], withheld: 0,
      dateLine: "Saturday, 22 August 2026", venueLine: "Muthaiga · White tees",
      nameOf: (id) => (id === "p-njoroge" ? "Peter Njoroge" : undefined),
      ...over,
    });

  const spec = build();
  const fig = (label) => spec.figures.find((f) => f.label.includes(label));

  check("board views come from what was observed",
    fig("live board").value.measured && fig("live board").value.value === "2");
  check("a figure nobody could observe is marked, not guessed",
    fig("Social").value.measured === false &&
    /social accounts/i.test(fig("Social").value.why));
  check("no clubhouse screen means no invented screen time",
    fig("clubhouse screen").value.measured === false);
  check("every figure is a Measure, so a bare number cannot reach a page",
    spec.figures.every((f) => typeof f.value.measured === "boolean"));

  check("only this sponsor's contest appears",
    spec.contests.length === 1 && spec.contests[0].name === "Nearest the pin");
  check("the contest winner is resolved from an id, not stored as a name",
    spec.contests[0].winner === "Peter Njoroge");
  check("who faced the contest is counted, not taken from the field size",
    spec.contests[0].faced.value === "2" &&
    spec.contests[0].faced.value !== String(tournament.fieldSize));
  check("a contest nobody won says so rather than inventing a winner", (() => {
    const s2 = build({
      sponsor: { ...sponsor, id: "sp-other" },
    });
    return s2.contests[0].winner === undefined;
  })());

  check("the private contribution never reaches the pack",
    !JSON.stringify(spec).includes("750000"));
  check("a sponsor's contact is named for delivery, not printed as data",
    spec.sponsor.contact === "Grace Njeri" &&
    !JSON.stringify(spec.figures).includes("grace@example.com"));

  /* ---- consent ---- */
  check("nobody appears in the list without consent",
    spec.participants.length === 0);
  check("those withheld are counted so the pack can be honest", (() => {
    const s2 = build({
      consented: [{ id: "g1", name: "Alice Wanjiru", guest: { company: "Zawadi Bank" } }],
      withheld: 41,
    });
    return s2.participants.length === 1 && s2.participantsWithheld === 41;
  })());
  check("a listed guest brings a name and organisation and nothing else", (() => {
    const s2 = build({
      consented: [{
        id: "g1", name: "Alice Wanjiru", email: "alice@example.com",
        phone: "+254700000000",
        guest: { company: "Zawadi Bank", notes: "Nut allergy",
                 sponsorListConsent: true, selfDeclaredHandicap: false },
      }],
    });
    const blob = JSON.stringify(s2.participants);
    return blob.includes("Alice Wanjiru") && blob.includes("Zawadi Bank") &&
      !blob.includes("alice@example.com") && !blob.includes("+254700000000") &&
      !blob.includes("Nut allergy");
  })());

  /* ---- charity ---- */
  check("what a charity day raised is absent until the club enters it", (() => {
    const s2 = build({
      tournament: { ...tournament, eventKind: "charity",
        beneficiary: { name: "Junior Golf Foundation", targetKES: 2000000 } },
    });
    return s2.raised.amount.measured === false &&
      /auction|raffle/i.test(s2.raised.amount.why);
  })());
  check("once entered, it is reported as given", (() => {
    const s2 = build({
      tournament: { ...tournament, eventKind: "charity",
        beneficiary: { name: "Junior Golf Foundation", raisedKES: 2450000 } },
    });
    return s2.raised.amount.measured === true &&
      s2.raised.amount.value.includes("2,450,000");
  })());

  check("the filename is one a club can find six weeks later",
    R.recapFileName(spec) ===
      "zawadi-corporate-golf-day-zawadi-bank-recap.pdf");
}

/* ------------------------------------------------------------------ *
 * Sponsor links
 *
 * The token is the only thing keeping two sponsors at the same event out of
 * each other's packs, and a participant list is inside one.
 * ------------------------------------------------------------------ */
section("Sponsor links");
{
  const R = await jiti.import("../lib/recap/spec.ts");

  check("a token is long and unguessable", (() => {
    const t = R.newRecapToken();
    return t.length === 12 && /^[a-z2-9]+$/.test(t);
  })());
  check("tokens avoid look-alike characters", (() => {
    let all = "";
    for (let i = 0; i < 300; i++) all += R.newRecapToken();
    return !/[ilo01]/.test(all);
  })());
  check("two tokens never collide", (() => {
    const seen = new Set();
    for (let i = 0; i < 3000; i++) seen.add(R.newRecapToken());
    return seen.size === 3000;
  })());
  check("a link carries nothing but the token", (() => {
    const t = R.newRecapToken();
    const path = R.recapPath(t);
    /* The old scheme was /recap/<tournament>/<sponsor>, which one sponsor
       could edit into another's. Nothing identifying may survive here. */
    return path === `/recap/${t}` && path.split("/").length === 3;
  })());
}

/* ------------------------------------------------------------------ *
 * Ordering
 *
 * The schema says these tables are last-write-wins by updated_at. Realtime
 * does not promise delivery order and a reconnect replays the backlog
 * wholesale, so "last" has to mean last written rather than last to arrive.
 * The swarm run found what happens otherwise: a stale `upcoming` tournament
 * row landing after the `live` one stood the board down mid-round, and the
 * phone then silently recorded nothing for the rest of the day.
 * ------------------------------------------------------------------ */
// Last, because proving a newer row still applies means cancelling the
// tournament, and everything above needs it alive.
section("A stale row must not overwrite a fresh one");
{
  const live = st().liveTournamentId;
  const t = st().created.find((x) => x.id === live) ?? st().created[0];
  check("there is a tournament to reorder", Boolean(t));

  const fresh = { ...MAP.tournamentToRow(t), status: "live" };
  const stale = {
    ...MAP.tournamentToRow(t),
    status: "upcoming",
    updated_at: new Date(Date.parse(fresh.updated_at) - 60_000).toISOString(),
  };

  S.applyRemoteEntity("tournaments", fresh);
  const afterFresh = st().liveTournamentId;
  S.applyRemoteEntity("tournaments", stale);
  check("an older row arriving late is ignored",
    st().liveTournamentId === afterFresh,
    "out-of-order delivery must not stand a live round down");

  /* And the round must still be playable afterwards, which is the part that
     actually hurt: a null live id makes every subsequent score a no-op. */
  const pid = st().roster[0]?.id;
  if (pid) {
    S.setBulkScore(pid, 0, 4);
    const k = roundKey(st().liveTournamentId, st().liveRound ?? 1);
    check("and the phone can still record a score",
      st().scores?.[k]?.[pid]?.[0] === 4);
  }

  /* A genuinely newer row still applies, or the guard would be a freeze. */
  const newer = {
    ...MAP.tournamentToRow(t),
    status: "cancelled",
    updated_at: new Date(Date.parse(fresh.updated_at) + 60_000).toISOString(),
  };
  S.applyRemoteEntity("tournaments", newer);
  check("a genuinely newer row still applies",
    !st().created.some((x) => x.id === t.id),
    "dropping stale rows must not turn into dropping every row");
}

/* ------------------------------------------------------------------ */
/* Ryder Cup: sessions, points, clinch                                 */
/* ------------------------------------------------------------------ */
{
  const flat = {
    id: "flat", clubId: "x", name: "Flat", tees: "White", par: 72,
    holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, si: i + 1, yards: 400 })),
  };
  const par18 = () => Array(18).fill(4);
  const bogey18 = () => Array(18).fill(5);

  const config = {
    sides: [
      { id: "usa", name: "USA", playerIds: ["a1", "a2"] },
      { id: "eur", name: "EUR", playerIds: ["b1", "b2"] },
    ],
    pointsToWin: 2.5,
    winPoints: 1,
    halfPoints: 0.5,
    matches: [
      { id: "m1", round: 1, sideA: ["a1", "a2"], sideB: ["b1", "b2"] }, // fourball
      { id: "m2", round: 2, sideA: ["a1", "a2"], sideB: ["b1", "b2"] }, // foursomes
      { id: "m3", round: 3, sideA: ["a1"], sideB: ["b1"] }, // singles
      { id: "m4", round: 3, sideA: ["a2"], sideB: ["b2"] }, // singles
    ],
  };
  const sessions = [
    { number: 1, sessionFormat: "fourball", course: flat },
    { number: 2, sessionFormat: "foursomes", course: flat },
    { number: 3, sessionFormat: "singles", course: flat },
  ];
  const byRound = {
    1: { a1: par18(), a2: par18(), b1: bogey18(), b2: bogey18() }, // USA better every hole
    2: { "m2:A": par18(), "m2:B": par18() }, // foursomes: level, halved
    3: { a1: par18(), b1: bogey18(), a2: bogey18(), b2: par18() }, // m3 USA, m4 EUR
  };
  const board = RYDER.ryderCupBoard(
    config, sessions, (r) => byRound[r] ?? {}, () => 0,
  );

  section("Ryder Cup: sessions, points, clinch");
  const m = Object.fromEntries(board.matches.map((x) => [x.match.id, x]));
  check("fourball match goes to the better pair", m.m1.points.a === 1 && m.m1.decided);
  check("a level foursomes is halved", m.m2.points.a === 0.5 && m.m2.points.b === 0.5);
  check("singles split as scored", m.m3.points.a === 1 && m.m4.points.b === 1);
  check("side totals sum the matches", board.totals.a === 2.5 && board.totals.b === 1.5,
    JSON.stringify(board.totals));
  check("the headline uses halves", board.score === "2½ – 1½", board.score);
  check("the side that reaches the target clinches", board.clinchedBy === "usa",
    String(board.clinchedBy));
}

/* ------------------------------------------------------------------ */
/* Team, match and max-hole-score scoring                              */
/* ------------------------------------------------------------------ */
/*
 * A synthetic course - 18 par-4s, stroke index 1..18, no ratings - so course
 * handicap falls back to the raw index and every stroke lands where the maths
 * says it should. That makes these assertions exact rather than approximate.
 */
const FLAT = {
  id: "flat", clubId: "x", name: "Flat", tees: "White", par: 72,
  holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, si: i + 1, yards: 400 })),
};
const par = () => Array(18).fill(4);
const pl = (id, handicap) => ({ id, clubId: "x", name: id, handicap, gender: "M" });
const team = (id, name, playerIds) => ({ id, tournamentId: "t", name, playerIds });

section("Team playing handicap (per-position allowance + max course handicap)");
{
  // A off 10, B off 30, capped at 24: [10, 24] -> 10*35% + 24*15% = 3.5 + 3.6 = 7.1 -> 7
  const ph = TEAM.teamPlayingHandicap([pl("A", 10), pl("B", 30)], FLAT, [35, 15], 24);
  check("blends capped course handicaps by position", ph === 7, `got ${ph}`);
  const uncapped = TEAM.teamPlayingHandicap([pl("A", 10), pl("B", 30)], FLAT, [35, 15]);
  check("without a cap the high handicap counts in full",
    uncapped === Math.round(10 * 0.35 + 30 * 0.15), `got ${uncapped}`);
}

section("Scramble: one team card off the team handicap");
{
  const row = TEAM.scrambleTeamRow(
    team("t1", "A + B", ["A", "B"]),
    [pl("A", 10), pl("B", 30)],
    par(), // team pars every hole
    { course: FLAT, allowances: [35, 15], maxCH: 24 },
  );
  // team PH 7 -> a stroke on the 7 lowest indexes; net-to-par = -(strokes) = -7
  check("net is par minus the team's strokes", row.netToPar === -7, `got ${row.netToPar}`);
  check("gross to par is level for straight pars", row.grossToPar === 0, `got ${row.grossToPar}`);
  // par4 with a stroke = 3 pts, without = 2 pts: 7*3 + 11*2 = 43
  check("stableford points reflect the team strokes", row.points === 43, `got ${row.points}`);
  check("the team row carries the team name", row.player.name === "A + B");
}

section("Better ball: the team takes its better member each hole");
{
  const A = par(); // A pars everything, off 0 -> net 0 every hole
  const B = par().map((v, i) => (i === 0 ? 2 : 6)); // B: eagle on 1, doubles after, off 18
  const row = TEAM.betterBallTeamRow(
    team("t2", "A + B", ["A", "B"]),
    [pl("A", 0), pl("B", 18)],
    { A, B },
    { course: FLAT, allowances: [100] },
  );
  // hole 1: A net 0, B net 2-1-4 = -3 -> team -3; every other hole best is A's 0
  check("only the better member's hole counts", row.netToPar === -3, `got ${row.netToPar}`);
  check("all eighteen holes are through", row.thru === 18, `got ${row.thru}`);
}

section("Match play: up, down, dormie, closed");
{
  const win = 0, halve = 1; // lower net wins the hole; equal halves it
  // A wins the first three, halves the rest -> 3 up with 2 to play at the 16th
  const netA = Array.from({ length: 18 }, (_, i) => (i < 16 ? (i < 3 ? win : halve) : null));
  const netB = Array.from({ length: 18 }, (_, i) => (i < 16 ? halve : null));
  const closed = TEAM.matchState(netA, netB);
  check("a match out of reach is closed", closed.closed === true);
  check("and reads as '3 & 2'", closed.status === "3 & 2", `got ${closed.status}`);

  // A up 2 with 2 to play: not closed, dormie
  const dA = Array.from({ length: 18 }, (_, i) => (i < 16 ? (i < 2 ? win : halve) : null));
  const dB = Array.from({ length: 18 }, (_, i) => (i < 16 ? halve : null));
  const dormie = TEAM.matchState(dA, dB);
  check("dormie is recognised", dormie.dormie === true && dormie.closed === false,
    JSON.stringify(dormie));
  check("dormie shows the lead", dormie.status === "2 up", `got ${dormie.status}`);

  // ten holes played, five each: all square
  const sA = Array.from({ length: 18 }, (_, i) => (i < 10 ? (i % 2 === 0 ? win : halve + 1) : null));
  const sB = Array.from({ length: 18 }, (_, i) => (i < 10 ? (i % 2 === 0 ? halve + 1 : win) : null));
  const sq = TEAM.matchState(sA, sB);
  check("an even match reads AS", sq.upBy === 0 && sq.status === "AS", JSON.stringify(sq));
}

section("Max hole score caps net and points, never the real gross");
{
  const blow = par().map((v, i) => (i === 0 ? 10 : 4)); // a 10 on the first, off 0
  const raw = SCORE.cardStats(blow, FLAT, 0, "none");
  check("uncapped, the blow-up lands in full", raw.netToPar === 6, `got ${raw.netToPar}`);
  const capped = SCORE.cardStats(blow, FLAT, 0, "net-double-bogey");
  // par 4, no stroke -> net double bogey caps the counting score at 6, net +2
  check("net double bogey caps the counting score", capped.netToPar === 2, `got ${capped.netToPar}`);
  check("but the real gross total is untouched", capped.grossTotal === raw.grossTotal,
    `${capped.grossTotal} vs ${raw.grossTotal}`);
  const fixed = SCORE.cardStats(blow, FLAT, 0, 7);
  check("a fixed cap counts at most that score", fixed.netToPar === 3, `got ${fixed.netToPar}`);
}

section("Duplicate event copies the setup, not the scoring");
{
  const src = {
    id: "t-dup-src", name: "Quarterly Scramble", clubId: "muthaiga",
    courseId: "muthaiga-main", date: "2026-03-01", format: "Scramble",
    entryFee: 0, status: "completed", membersOnly: false,
    divisions: [{ name: "Overall", range: [0, 36] }], description: "",
    prizes: [], maxPlayers: 40, regCloses: "2026-02-28", handicapAllowance: 95,
    firstTee: "07:00", teeInterval: 10, fieldSize: 40, playersPerTeam: 2,
    handicapAllowances: [35, 15], result: { winner: "A + B", score: "-12" },
    rounds: [{ id: "r1", number: 1, name: "Round 1", date: "2026-03-01",
      courseId: "muthaiga-main", tees: "White", firstTee: "07:00", teeInterval: 10, cut: null }],
  };
  S.createTournament(src);
  const newId = S.duplicateTournament("t-dup-src");
  const copy = st().created.find((x) => x.id === newId);
  check("a fresh id is minted", Boolean(newId) && newId !== "t-dup-src");
  check("the copy is upcoming, not completed", copy?.status === "upcoming");
  check("the name is marked a copy", copy?.name === "Quarterly Scramble (copy)");
  check("the setup carries over (format, allowances)",
    copy?.format === "Scramble" && JSON.stringify(copy?.handicapAllowances) === "[35,15]");
  check("the previous result does not carry over", copy?.result === undefined);
  check("the copy has no scores of its own",
    Object.keys(st().scores[roundKey(newId, 1)] ?? {}).length === 0);
}

/* ------------------------------------------------------------------ */
console.log(
  `\n${failures.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (failures.length ? `, ${failures.length} failed:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exit(failures.length ? 1 : 0);
