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
console.log(
  `\n${failures.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (failures.length ? `, ${failures.length} failed:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exit(failures.length ? 1 : 0);
