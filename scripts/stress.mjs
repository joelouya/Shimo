#!/usr/bin/env node
/**
 * Trying to break Shimo, in pilot mode.
 *
 *   npm run stress
 *
 * The other two scripts drive the product the way it is meant to go. This one
 * does not. Every case below is something a real tournament day will do by
 * accident and no happy path ever does: a form submitted twice because the
 * signal dropped, a card abandoned on the 11th, a marker who will not sign, a
 * member switched off mid-round, an organiser who pasted the wrong code, a
 * field of nobody, a field of two hundred and seventy.
 *
 * A `FAIL` here is a finding, and a crash is a better finding. The script is
 * written so a crash names the case it happened in rather than taking the
 * whole run down: everything is wrapped, because a stress test that stops at
 * the first problem only ever finds one.
 *
 * Pilot, deliberately. Demo has seed data and simulation to fall back on;
 * pilot is the build a club would actually run and has none of that.
 */

import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

process.env.NEXT_PUBLIC_SHIMO_MODE = "pilot";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
});

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window ??= globalThis;
globalThis.navigator ??= { userAgent: "shimo-stress" };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.devicePixelRatio ??= 3;

const S = await jiti.import("../lib/sim/store.ts");
const G = await jiti.import("../lib/guests.ts");
const M = await jiti.import("../lib/membership.ts");
const SP = await jiti.import("../lib/sponsors.ts");
const E = await jiti.import("../lib/exposure.ts");
const P = await jiti.import("../lib/pace.ts");
const R = await jiti.import("../lib/recap/spec.ts");
const { roundKey } = await jiti.import("../lib/rounds.ts");
const { COURSES } = await jiti.import("../lib/data.ts");
const { IS_PILOT } = await jiti.import("../lib/mode.ts");

const st = () => S.simStore.getState();

let pass = 0;
const findings = [];
const crashes = [];

const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    findings.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
};

/**
 * Run a hostile case without letting it end the run.
 *
 * A throw is the most interesting result this script can produce, so it is
 * caught, named and counted rather than allowed to stop everything after it.
 */
async function attempt(name, fn) {
  try {
    await fn();
  } catch (e) {
    crashes.push(`${name}: ${e?.message ?? e}`);
    console.log(`  CRASH ${name}\n        ${e?.message ?? e}`);
  }
}

const section = (t) => console.log(`\n${t}`);

const COURSE = COURSES[0];
const card = (v = 4) => Array(18).fill(v);

console.log(`Stress test · mode=${IS_PILOT ? "pilot" : "demo"}`);
check("the harness is really running pilot", IS_PILOT === true);

/* ------------------------------------------------------------------ *
 * Membership, attacked
 * ------------------------------------------------------------------ */

section("Membership");

S.addRosterMember({
  id: "m-1", clubId: "muthaiga", name: "Ada Kimani", handicap: 9,
  gender: "F", email: "ada@club.example",
});

await attempt("two devices race for one invitation", () => {
  const token = S.inviteMember("m-1");
  const first = S.activateInvite(token, "ada@club.example");
  const second = S.activateInvite(token, "someone.else@example.com");
  check("only the first device claims the membership",
    Boolean(first) && second === null);
  check("the loser did not overwrite who claimed it",
    st().roster.find((p) => p.id === "m-1").invite.claimedBy === "ada@club.example");
});

await attempt("a token with the right shape but wrong value", () => {
  check("a well-formed impostor claims nothing",
    S.activateInvite("aaaaaaaaaaaaaaaaaaaa", "x@y.com") === null);
});

await attempt("tampering with a token", () => {
  const t = S.inviteMember("m-1");
  check("one character off opens nothing",
    S.activateInvite(t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"), "x@y.com") === null);
  check("the real one still works after a failed attempt",
    Boolean(S.activateInvite(t, "ada@club.example")));
});

await attempt("empty and absurd tokens", () => {
  for (const bad of ["", " ", "null", "undefined", "../../etc/passwd", "a".repeat(5000)]) {
    if (S.activateInvite(bad, "x@y.com") !== null) {
      check(`token ${JSON.stringify(bad.slice(0, 20))} was refused`, false);
      return;
    }
  }
  check("empty, absurd and path-shaped tokens are all refused", true);
});

await attempt("a deactivated member tries to get back in", () => {
  S.setMemberActive("m-1", false);
  const access = M.memberAccess(st().roster, "ada@club.example");
  check("a switched-off member is refused, not silently admitted",
    access.kind === "deactivated");
  check("and is told the club can switch it back on",
    /switch it back on/i.test(M.accessMessage(access).body));
  const t = S.inviteMember("m-1");
  check("re-inviting a switched-off member does not let them in",
    S.activateInvite(t, "ada@club.example") === null);
  S.setMemberActive("m-1", true);
});

/* ------------------------------------------------------------------ *
 * Registration, attacked
 * ------------------------------------------------------------------ */

section("Registration");

const TID = "t-stress";
S.createTournament({
  id: TID, name: "Stress Day", clubId: "muthaiga", courseId: COURSE.id,
  date: "2026-09-05", format: "Stableford", entryFee: 0, status: "upcoming",
  membersOnly: false, divisions: [{ name: "Overall", range: [0, 36] }],
  description: "", prizes: [], maxPlayers: 300, regCloses: "2026-09-01",
  handicapAllowance: 95, firstTee: "07:00", teeInterval: 10, fieldSize: 0,
  eventKind: "corporate", presentedBy: { name: "Stress Co" },
  sponsors: [
    { id: "s-ok", name: "Sound Sponsor", tier: "title",
      contact: { name: "A Person", email: "a@x.example" } },
    /* no logo, no contact, no category: the sponsor a club forgot to finish */
    { id: "s-bare", name: "Bare Sponsor", tier: "category" },
  ],
  contests: [
    { id: "c-reached", name: "Nearest the pin", hole: 3, sponsorId: "s-ok" },
    /* a contest on a hole this field will never reach */
    { id: "c-unreached", name: "Longest drive", hole: 17, sponsorId: "s-ok" },
  ],
  rounds: [{ id: "r1", number: 1, name: "Round 1", date: "2026-09-05",
    courseId: COURSE.id, tees: "White", firstTee: "07:00", teeInterval: 10, cut: null }],
});

await attempt("the same form submitted three times", () => {
  const a = S.registerGuest(TID, { name: "Double Tap", email: "dt@x.example", sponsorListConsent: false });
  const b = S.registerGuest(TID, { name: "Double Tap", email: "dt@x.example", sponsorListConsent: false });
  const c = S.registerGuest(TID, { name: "Double Tap", email: "dt@x.example", sponsorListConsent: false });
  check("one person, one entry, one code",
    a.code === b.code && b.code === c.code);
  check("and one guest record",
    st().guests.filter((g) => g.email === "dt@x.example").length === 1);
});

await attempt("two different people, same name, no email", () => {
  const a = S.registerGuest(TID, { name: "James Mwangi", sponsorListConsent: false });
  const b = S.registerGuest(TID, { name: "James Mwangi", sponsorListConsent: false });
  check("they are kept apart rather than merged", a.guestId !== b.guestId,
    "two people with one name must not become one scorecard");
});

await attempt("hostile registration input", () => {
  const nasty = [
    { name: "  ", sponsorListConsent: false },
    { name: "x", sponsorListConsent: false },
    { name: "Fine", email: "not-an-email", sponsorListConsent: false },
    { name: "Fine", handicap: 999, sponsorListConsent: false },
    { name: "Fine", handicap: -99, sponsorListConsent: false },
    { name: "Fine", handicap: Number.NaN, sponsorListConsent: false },
  ];
  const allRejected = nasty.every((r) => G.validateRegistration(r).length > 0);
  check("every malformed registration is refused with a reason", allRejected);
});

await attempt("a name that is an injection attempt", () => {
  const e = S.registerGuest(TID, {
    name: "<script>alert(1)</script>", email: "xss@x.example",
    company: "'; drop table players; --", sponsorListConsent: true,
  });
  const g = st().guests.find((x) => x.id === e.guestId);
  check("it is stored as text, not executed or mangled",
    g.name === "<script>alert(1)</script>");
  check("the roster is still intact", st().roster.length >= 1);
});

/* ------------------------------------------------------------------ *
 * A field of nobody, and a field of everybody
 * ------------------------------------------------------------------ */

section("Field sizes");

await attempt("an empty field", () => {
  S.savePairings(TID, [], 1);
  const key = roundKey(TID, 1);
  check("no groups means no pace rows, not a crash",
    S.pacesFor(st(), key).length === 0);
  check("holes played on nothing is an empty answer",
    Object.keys(S.groupHolesPlayed(st(), key)).length === 0);
  const readings = P.paceReadings([], {}, Date.now());
  check("pace readings over an empty field are empty", readings.length === 0);
});

const bigIds = [];
await attempt("two hundred and seventy players", () => {
  for (let i = 0; i < 270; i++) {
    const e = S.registerGuest(TID, {
      name: `Player ${i}`, email: `p${i}@stress.example`,
      handicap: i % 40, sponsorListConsent: i % 3 === 0,
    });
    bigIds.push(e.guestId);
  }
  check("all two hundred and seventy registered",
    S.guestsIn(st(), TID).length >= 270);
  check("every code is unique across the whole field",
    new Set(st().guestEntries.filter((e) => e.tournamentId === TID).map((e) => e.code)).size ===
      st().guestEntries.filter((e) => e.tournamentId === TID).length);
});

/* ------------------------------------------------------------------ *
 * The round, gone wrong
 * ------------------------------------------------------------------ */

section("The round");

const key = roundKey(TID, 1);
const groups = [];
await attempt("pairing a large field", () => {
  for (let i = 0; i < bigIds.length; i += 4) {
    groups.push({
      id: `sg${groups.length + 1}`, number: groups.length + 1,
      teeTime: "07:00", playerIds: bigIds.slice(i, i + 4),
    });
  }
  S.savePairings(TID, groups, 1);
  S.startTournamentDay(TID, 1);
  check("the day is live with a full field", st().liveTournamentId === TID);
});

await attempt("scores outside the possible", () => {
  const p = bigIds[0];
  for (const bad of [-5, 0, 999, Number.NaN, Number.POSITIVE_INFINITY]) {
    S.setBulkScore(p, 0, bad);
  }
  const v = S.roundScores(st(), key)[p]?.[0];
  check("an impossible score is not silently kept as a real one",
    v === null || v === undefined || (Number.isFinite(v) && v > 0 && v < 30),
    `stored ${JSON.stringify(v)}`);
});

await attempt("a card abandoned on the eleventh", () => {
  const p = bigIds[4];
  for (let h = 0; h < 11; h++) S.setBulkScore(p, h, 5);
  const cert = S.roundCerts(st(), key)[p];
  check("an incomplete card is not certifiable",
    !cert || cert.stage !== "certified");
});

await attempt("certifying without an attestation", async () => {
  const p = bigIds[8];
  for (let h = 0; h < 18; h++) S.setBulkScore(p, h, 4);
  await S.playerCertify(p, { method: "pin" });
  const cert = S.roundCerts(st(), key)[p];
  check("a player cannot certify a card nobody attested",
    !cert || cert.stage !== "certified",
    `stage was ${cert?.stage}`);
});

await attempt("certifying twice", async () => {
  const p = bigIds[12];
  const partner = bigIds[13];
  for (let h = 0; h < 18; h++) S.setBulkScore(p, h, 4);
  S.markerAttest(p, partner, { method: "pin" });
  await S.playerCertify(p, { method: "pin" });
  const first = S.roundCerts(st(), key)[p];
  await S.playerCertify(p, { method: "pin" });
  const second = S.roundCerts(st(), key)[p];
  check("the second certification changes nothing",
    first.lockedHash === second.lockedHash);
});

await attempt("a player attesting for themselves", () => {
  const p = bigIds[16];
  for (let h = 0; h < 18; h++) S.setBulkScore(p, h, 4);
  S.markerAttest(p, p, { method: "pin" });
  const cert = S.roundCerts(st(), key)[p];
  check("a card cannot be attested by its own player",
    cert?.markerId !== p,
    `marker recorded as ${cert?.markerId}`);
});

await attempt("a score changed after the seal", async () => {
  const p = bigIds[20];
  const partner = bigIds[21];
  for (let h = 0; h < 18; h++) S.setBulkScore(p, h, 4);
  S.markerAttest(p, partner, { method: "pin" });
  await S.playerCertify(p, { method: "pin" });
  const sealed = S.roundCerts(st(), key)[p].lockedHash;
  S.setBulkScore(p, 0, 2);
  const after = S.roundCerts(st(), key)[p];
  check("the seal does not silently follow the change",
    after.lockedHash === sealed,
    "a seal that moves with the card proves nothing");
});

/* ------------------------------------------------------------------ *
 * Guest access, attacked
 * ------------------------------------------------------------------ */

section("Guest access");

await attempt("codes from another event", () => {
  const other = S.registerGuest("t-somewhere-else", {
    name: "Elsewhere", email: "else@x.example", sponsorListConsent: false,
  });
  const hit = S.guestForCode(st(), other.code);
  check("a code resolves only to its own event",
    hit?.tournamentId === "t-somewhere-else");
});

await attempt("guessing codes", () => {
  let hits = 0;
  for (let i = 0; i < 4000; i++) {
    const guess = `${String(i).padStart(3, "a").slice(0, 3)}-${String(i).padStart(3, "b").slice(0, 3)}`;
    if (S.guestForCode(st(), guess)) hits++;
  }
  check("four thousand guesses open nothing", hits === 0, `${hits} hits`);
});

await attempt("malformed codes", () => {
  const bad = ["", "-", "abc", "abcdefghij", "../..", "%00", "abc-123-456", null, undefined];
  const anyOpened = bad.some((b) => {
    try { return Boolean(S.guestForCode(st(), b)); } catch { return false; }
  });
  check("no malformed code opens anything, and none of them throws", !anyOpened);
});

/* ------------------------------------------------------------------ *
 * Sponsors and the pack, attacked
 * ------------------------------------------------------------------ */

section("Sponsors and the recap");

await attempt("a contest nobody reached", () => {
  const cards = S.roundScores(st(), key);
  const faced = E.contestEngagement(cards, 17);
  check("a contest on an unreached hole reports nobody, not the field",
    faced === 0 || faced < S.guestsIn(st(), TID).length, `${faced}`);
});

await attempt("a pack for a sponsor with nothing filled in", () => {
  const t = st().created.find((x) => x.id === TID);
  const bare = t.sponsors.find((s) => s.id === "s-bare");
  const spec = R.recapSpec({
    sponsor: bare, tournament: t, club: { name: "Muthaiga Golf Club" },
    events: [], cards: S.roundScores(st(), key), winners: [],
    consented: [], withheld: 0, nameOf: () => undefined,
    dateLine: "Saturday", venueLine: "Muthaiga",
  });
  check("a bare sponsor still produces a pack", Boolean(spec.sponsor.name));
  check("with no invented figures",
    spec.figures.every((f) => typeof f.value.measured === "boolean"));
  check("and nothing observed is reported as measured",
    spec.figures.find((f) => f.label.includes("live board")).value.value === "0");
});

await attempt("a pack when nobody consented", () => {
  const t = st().created.find((x) => x.id === TID);
  const spec = R.recapSpec({
    sponsor: t.sponsors[0], tournament: t, club: { name: "Muthaiga Golf Club" },
    events: [], cards: {}, winners: [], consented: [], withheld: 270,
    nameOf: () => undefined, dateLine: "Saturday", venueLine: "Muthaiga",
  });
  check("an empty participant list is a legitimate answer",
    spec.participants.length === 0 && spec.participantsWithheld === 270);
});

await attempt("publishing cannot collide", () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(R.newRecapToken());
  check("five thousand recap tokens are all distinct", seen.size === 5000);
});

/* ------------------------------------------------------------------ *
 * Pace, attacked
 * ------------------------------------------------------------------ */

section("Pace");

await attempt("a group that started but never finished", () => {
  const readings = P.paceReadings(
    [{ key: "k", groupId: "gx", startedAt: new Date().toISOString() }],
    { gx: 4 }, Date.now() + 6 * 3_600_000,
  );
  check("a group out for six hours is still reported, not dropped",
    readings.length === 1 && readings[0].elapsed >= 359);
});

await attempt("a turn stamped before a start", () => {
  const now = Date.now();
  const readings = P.paceReadings(
    [{ key: "k", groupId: "gy",
       startedAt: new Date(now).toISOString(),
       turnAt: new Date(now - 3_600_000).toISOString() }],
    { gy: 9 }, now,
  );
  check("impossible timestamps do not crash the readings",
    readings.length === 1);
  check("and a negative front nine is not presented as a real figure",
    readings[0].front === undefined || readings[0].front <= 0,
    `front was ${readings[0].front}`);
});

/* ------------------------------------------------------------------ *
 * The store itself
 * ------------------------------------------------------------------ */

section("The store");

await attempt("looking up players that do not exist", () => {
  const nothing = ["", "nope", "../..", "g-", null, undefined].every((id) => {
    try { return S.playerInField(st(), id) === undefined; } catch { return false; }
  });
  check("unknown player ids resolve to nothing and never throw", nothing);
});

await attempt("recording exposure for nothing", () => {
  const before = st().exposure.length;
  S.recordExposure("", "board");
  S.recordExposure(TID, "board", -50);
  check("an empty tournament records nothing",
    st().exposure.length === before + 1);
  const rolled = E.summarise(st().exposure, TID);
  check("a negative duration does not produce negative screen time",
    (rolled.find((s) => s.surface === "tv").seconds ?? 0) >= 0);
});

await attempt("the whole state survives a persist round trip", () => {
  const raw = JSON.stringify(st());
  const parsed = JSON.parse(raw);
  check("state serialises without losing the field",
    (parsed.guests ?? []).length === st().guests.length);
  check("and without losing certifications",
    Object.keys(parsed.certifications ?? {}).length ===
      Object.keys(st().certifications).length);
});

/* ------------------------------------------------------------------ *
 * Mixed fields
 *
 * The spec says a member marker attests for a guest and vice versa. That is
 * asserted in prose and has never been executed, which is exactly the kind of
 * claim that turns out to be false.
 * ------------------------------------------------------------------ */

section("Members and guests in one group");

await attempt("a member and a guest marking for each other", async () => {
  S.addRosterMember({
    id: "m-mixed", clubId: "muthaiga", name: "Ruth Wanjala", handicap: 11,
    gender: "F", email: "ruth@club.example",
  });
  const guest = S.registerGuest(TID, {
    name: "Visiting Partner", email: "vp@stress.example",
    handicap: 16, sponsorListConsent: false,
  });

  const mixed = [{ id: "mix1", number: 999, teeTime: "12:00",
    playerIds: ["m-mixed", guest.guestId] }];
  S.savePairings(TID, [...groups, ...mixed], 1);
  S.startTournamentDay(TID, 1);

  for (let h = 0; h < 18; h++) {
    S.setBulkScore("m-mixed", h, 4);
    S.setBulkScore(guest.guestId, h, 5);
  }

  /* The guest signs the member's card, and the member signs the guest's. */
  S.markerAttest("m-mixed", guest.guestId, { method: "pin" });
  S.markerAttest(guest.guestId, "m-mixed", { method: "pin" });
  await S.playerCertify("m-mixed", { method: "pin" });
  await S.playerCertify(guest.guestId, { method: "pin" });

  const certs = S.roundCerts(st(), key);
  check("a guest's attestation of a member's card is valid",
    certs["m-mixed"]?.stage === "certified",
    `stage ${certs["m-mixed"]?.stage}`);
  check("a member's attestation of a guest's card is valid",
    certs[guest.guestId]?.stage === "certified",
    `stage ${certs[guest.guestId]?.stage}`);
  check("both cards sealed, and not with the same hash",
    Boolean(certs["m-mixed"]?.lockedHash) &&
    certs["m-mixed"].lockedHash !== certs[guest.guestId]?.lockedHash);
  /*
   * The audit record stores an id, which is correct: an id is stable and a
   * name is not. What has to resolve is the document a Committee opens, so
   * that is what this checks.
   */
  const { auditTrailCsv } = await jiti.import("../lib/integrity.ts");
  const byId = new Map(
    [...st().roster, ...st().guests].map((p) => [p.id, p]),
  );
  const csv = auditTrailCsv(
    st().auditLog.filter((a) => a.tournamentId === TID),
    (id) => byId.get(id)?.name ?? id,
  );
  check("no raw guest id survives into the exported audit trail",
    !/g-[a-z0-9]{6,}-[a-z0-9]+/.test(csv),
    "a Committee reading a dispute must see names");
  check("and the guest's name is actually in it",
    csv.includes("Visiting Partner"));
});

/* ------------------------------------------------------------------ *
 * Scores arriving from elsewhere
 * ------------------------------------------------------------------ */

section("Sync");

await attempt("garbage arriving over the wire", () => {
  const p = bigIds[30];
  const before = JSON.stringify(S.roundScores(st(), key)[p] ?? []);
  for (const bad of [Number.NaN, Infinity, -3, 0, 999, 1.5]) {
    S.applyRemoteScore(p, 0, bad, "player", 1, TID);
  }
  const after = S.roundScores(st(), key)[p]?.[0];
  check("a corrupt remote score does not poison a card",
    after == null || (Number.isInteger(after) && after > 0 && after <= 30),
    `stored ${JSON.stringify(after)} (was ${before.slice(0, 20)})`);
});

await attempt("a remote score for a hole that does not exist", () => {
  const p = bigIds[31];
  for (const h of [-1, 18, 99, Number.NaN]) {
    S.applyRemoteScore(p, h, 4, "player", 1, TID);
  }
  const c = S.roundScores(st(), key)[p] ?? [];
  check("out-of-range holes do not extend or dent the card",
    c.length === 0 || c.length === 18,
    `card length ${c.length}`);
});

await attempt("a remote score for somebody who is not playing", () => {
  const before = Object.keys(S.roundScores(st(), key)).length;
  S.applyRemoteScore("nobody-at-all", 0, 4, "player", 1, TID);
  const after = Object.keys(S.roundScores(st(), key)).length;
  check("a stranger's score does not silently create a player",
    after === before || S.playerInField(st(), "nobody-at-all") === undefined);
});

/* ------------------------------------------------------------------ */

console.log(
  `\n${findings.length || crashes.length ? "FOUND PROBLEMS" : "NOTHING BROKE"}  ` +
    `${pass} checks passed, ${findings.length} findings, ${crashes.length} crashes`,
);
if (findings.length) console.log(`\nFindings:\n  - ${findings.join("\n  - ")}`);
if (crashes.length) console.log(`\nCrashes:\n  - ${crashes.join("\n  - ")}`);
process.exit(findings.length || crashes.length ? 1 : 0);
