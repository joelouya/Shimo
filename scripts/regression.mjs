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
  identity: { clubId: "sigona" }, records: [], decisions: [], online: true, ...extra,
});
/** both parties agree on `gross` at time `at` */
const pair = (pid, hole, gross, at) => [
  { round: 1, playerId: pid, hole, gross, source: "player", at },
  { round: 1, playerId: pid, hole, gross, source: "marker", at },
];
const eagleHole = tvC.holes.findIndex((h) => h.par === 5);
const eagleRows = (pid, at) => pair(pid, eagleHole, tvC.holes[eagleHole].par - 2, at);

const S0 = PR.initialState({ cooldownMs: 120_000, spacingMs: 15_000 });

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
  playing.history[0].text === "Eagle — Alice Wanjiru");

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
  s = PR.reduce(s, { type: "config", patch: { quiet: true } }, 130_100);
  s = PR.reduce(s, { type: "tick" }, 200_000);
  return s.queue.length === 0 && s.mode === "leaderboard" &&
    s.history.some((h) => h.kind === "quiet-on");
})());
check("leaving quiet mode does not replay what was silenced", (() => {
  let s = PR.reduce(S0, { type: "snapshot", snapshot: snap(eagleRows("p1", 0), 0) }, 130_000);
  s = PR.reduce(s, { type: "config", patch: { quiet: true } }, 130_100);
  s = PR.reduce(s, { type: "config", patch: { quiet: false } }, 200_000);
  s = PR.reduce(s, { type: "tick" }, 200_100);
  return s.mode === "leaderboard";
})());
check("quiet mode interrupts nothing that is already on screen", (() => {
  let s = PR.reduce(settledState, { type: "tick" }, 130_000);
  s = PR.reduce(s, { type: "config", patch: { quiet: true } }, 131_000);
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
    return s.config.quiet === true && s.mode === "leaderboard" && s.queue.length === 0;
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
    return s.config.quiet === false && s.queue.length === 0 && s.mode === "leaderboard";
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
    return s.config.quiet === false && s.queue.length === 1;
  })());
  check("a screen switched on late catches up on everything it missed", (() => {
    const fk = "eagle:1:p1:" + eagleHole;
    const s = PR.reduce(PR.initialState(), { type: "snapshot",
      snapshot: heldSnap(500_000, [
        dec(1, "quiet", { payload: { on: true } }),
        dec(2, "reject", { factKey: fk }),
        dec(3, "quiet", { payload: { on: false } }),
      ]) }, 500_000);
    return s.appliedDecision === 3 && s.config.quiet === false &&
      s.pending.length === 0 && s.queue.length === 0;
  })());
}

/* ------------------------------------------------------------------ */
console.log(
  `\n${failures.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (failures.length ? `, ${failures.length} failed:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exit(failures.length ? 1 : 0);
