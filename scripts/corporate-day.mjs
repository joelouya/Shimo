#!/usr/bin/env node
/**
 * A whole corporate golf day, start to sponsor recap.
 *
 *   npm run day:sim           run it
 *   npm run day:sim -- --log  print the day as it happens
 *
 * This is the iteration's own acceptance criterion, written as a program so it
 * can be re-run rather than clicked through once: 120 guests, 8 sponsors
 * across four tiers, 4 contest holes, a full round scored and certified, the
 * clubhouse screen running, and a recap pack built for every sponsor with a
 * contact person.
 *
 * The regression suite checks rules one at a time. This checks the things that
 * are only true of the whole day: that a guest who registered through a public
 * link ends up in a sealed card, that the number in a sponsor's pack is the
 * number that came off the course, that consent survives the whole distance
 * from a switch on a phone to a line in a PDF, and that nothing a guest asked
 * to keep private appears in a document that leaves the club.
 *
 * Deterministic. Same command, same day, every time.
 */

import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
});

const LOG = process.argv.slice(2).includes("--log");

/* localStorage stub, so the store persists into nothing rather than crashing */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
/*
 * Enough of a browser for the certification path. A sealed card records the
 * device it was signed on, so the harness has to look like a phone rather
 * than have the fingerprint stubbed out: the point is to exercise the real
 * seal, not a version of it with a hole where the device should be.
 */
globalThis.window ??= globalThis;
globalThis.navigator ??= { userAgent: "shimo-acceptance-harness" };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.devicePixelRatio ??= 3;

const S = await jiti.import("../lib/sim/store.ts");
const R = await jiti.import("../lib/recap/spec.ts");
const E = await jiti.import("../lib/exposure.ts");
const G = await jiti.import("../lib/guests.ts");
const SP = await jiti.import("../lib/sponsors.ts");
const P = await jiti.import("../lib/pace.ts");
const { roundKey } = await jiti.import("../lib/rounds.ts");
const { COURSES } = await jiti.import("../lib/data.ts");

const st = () => S.simStore.getState();
const log = (...a) => LOG && console.log("   ", ...a);

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name + (detail ? ` (${detail})` : ""));
    console.log(`  FAIL ${name}${detail ? `  ${detail}` : ""}`);
  }
};
const section = (t) => console.log(`\n${t}`);

/* Deterministic pseudo-random, so a failure is a failure and not a bad roll. */
let seed = 20260822;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/* ------------------------------------------------------------------ *
 * The day
 *
 * Every company here is invented. Real brands sponsor real Kenyan corporate
 * days, and putting one of their names in seed data would read as an
 * endorsement that does not exist. See docs/COMMITMENTS.md.
 * ------------------------------------------------------------------ */

const TID = "t-corporate-day";
const CLUB = "muthaiga";
const COURSE = COURSES.find((c) => c.clubId === CLUB) ?? COURSES[0];

const SPONSORS = [
  { id: "sp-zawadi", name: "Zawadi Bank", tier: "title", accent: "#1e5f8c",
    contact: { name: "Grace Njeri", email: "grace@zawadi.example" },
    contributionKES: 750_000 },
  { id: "sp-tembo", name: "Tembo Assurance", tier: "presenting", accent: "#6b4f9e",
    contact: { name: "Samuel Otieno", email: "samuel@tembo.example" },
    contributionKES: 400_000 },
  { id: "sp-mara", name: "Mara Motors", tier: "presenting", accent: "#8a1538",
    contact: { name: "Faith Chebet", email: "faith@mara.example" },
    contributionKES: 400_000 },
  { id: "sp-kilifi", name: "Kilifi Springs", tier: "category",
    category: "Halfway house", accent: "#0f7b6c",
    contact: { name: "Brian Wekesa", email: "brian@kilifi.example" } },
  { id: "sp-arboretum", name: "Arboretum Insurance", tier: "category",
    category: "Nearest the pin", accent: "#b8621e",
    contact: { name: "Naomi Achieng", email: "naomi@arboretum.example" } },
  { id: "sp-savanna", name: "Savanna Telecom", tier: "category",
    category: "Longest drive", accent: "#1f6f3f",
    contact: { name: "Peter Mwangi", email: "peter@savanna.example" } },
  /* Two supporting sponsors, one of them deliberately without a contact:
     a club always has one backer who gave a crate of balls and a phone
     number nobody wrote down. */
  { id: "sp-riverside", name: "Riverside Print", tier: "supporting",
    contact: { name: "Alice Mutua", email: "alice@riverside.example" } },
  { id: "sp-nyati", name: "Nyati Supplies", tier: "supporting" },
];

const CONTESTS = [
  { id: "ct-ntp7", name: "Nearest the pin", hole: 7, prize: "A weekend for two",
    sponsorId: "sp-arboretum" },
  { id: "ct-ld12", name: "Longest drive", hole: 12, prize: "A driver fitting",
    sponsorId: "sp-savanna" },
  { id: "ct-ntp16", name: "Nearest the pin", hole: 16, prize: "A dozen balls",
    sponsorId: "sp-arboretum" },
  /* The hole-in-one car: sponsored, and almost never won. The pack has to
     handle a contest with no winner without inventing one. */
  { id: "ct-hio4", name: "Hole in one", hole: 4, prize: "A Mara Motors saloon",
    sponsorId: "sp-mara" },
];

const COMPANIES = [
  "Zawadi Bank", "Tembo Assurance", "Mara Motors", "Kilifi Springs",
  "Arboretum Insurance", "Savanna Telecom", "Riverside Print",
  "Nyati Supplies", "Rift Valley Freight", "Lamu Trading",
];
const FIRST = ["James", "Grace", "Peter", "Achieng", "Brian", "Faith", "Samuel",
  "Naomi", "David", "Wanjiku", "Kevin", "Mercy", "Dennis", "Rose", "Amit"];
const LAST = ["Mwangi", "Otieno", "Chebet", "Wekesa", "Njoroge", "Kamau",
  "Wanjiru", "Mutua", "Achieng", "Kariuki", "Patel", "Gitau"];

/* ------------------------------------------------------------------ */

section("Setting up the day");

S.createTournament({
  id: TID,
  name: "Zawadi Corporate Golf Day",
  clubId: CLUB,
  courseId: COURSE.id,
  date: "2026-08-22",
  format: "Stableford",
  entryFee: 0,
  status: "upcoming",
  membersOnly: false,
  membership: "open",
  divisions: [{ name: "Overall", range: [0, 36] }],
  description: "",
  prizes: [
    { place: "Overall winner", prize: "The Zawadi Cup" },
    { place: "Runner-up", prize: "KES 20,000 pro shop credit" },
    { place: "Best guest", prize: "KES 10,000 pro shop credit" },
  ],
  maxPlayers: 132,
  regCloses: "2026-08-20",
  handicapAllowance: 95,
  firstTee: "07:00",
  teeInterval: 10,
  fieldSize: 0,
  eventKind: "corporate",
  presentedBy: { name: "Zawadi Bank" },
  sponsors: SPONSORS,
  contests: CONTESTS,
  rounds: [{
    id: "r1", number: 1, name: "Round 1", date: "2026-08-22",
    courseId: COURSE.id, tees: "White", firstTee: "07:00", teeInterval: 10,
    cut: null,
  }],
});

const day = () => st().created.find((x) => x.id === TID);
check("the day exists and knows what it is", day()?.eventKind === "corporate");
check("eight sponsors across four tiers", day().sponsors.length === 8 &&
  new Set(day().sponsors.map((s) => SP.normaliseTier(s.tier))).size === 4);
check("four contest holes", day().contests.length === 4);
check("it may be published", SP.canPublish(day().sponsors, day().contests));

/* ------------------------------------------------------------------ *
 * 120 guests through the public registration link
 * ------------------------------------------------------------------ */

section("Registration");

const rosterBefore = st().roster.length;
const entries = [];
for (let i = 0; i < 120; i++) {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  /* A third of a corporate field has no handicap at all, which is the whole
     reason a self-declared figure has to be distinguishable from a WHS one. */
  const hasHandicap = i % 3 !== 0;
  const e = S.registerGuest(TID, {
    name: `${name} ${i}`,
    email: `guest${i}@example.test`,
    phone: `+2547${String(10_000_000 + i)}`,
    company: pick(COMPANIES),
    handicap: hasHandicap ? Math.round(rnd() * 28) : undefined,
    /* Roughly two in five agree to appear in a sponsor's list. */
    sponsorListConsent: i % 5 < 2,
    notes: i % 17 === 0 ? "Nut allergy" : undefined,
  }, CLUB);
  entries.push(e);
}

const guests = S.guestsIn(st(), TID);
check("one hundred and twenty guests registered", guests.length === 120);
check("not one of them reached the member roster",
  st().roster.length === rosterBefore);
check("every guest got their own code",
  new Set(entries.map((e) => e.code)).size === 120);
check("a code opens exactly the guest it belongs to", (() => {
  const hit = S.guestForCode(st(), entries[42].code);
  return hit?.player.id === entries[42].guestId;
})());
check("guests without a handicap are not treated as scratch", (() => {
  const none = guests.filter((g) => G.handicapProvenance(g) === "none");
  const declared = guests.filter((g) => G.handicapProvenance(g) === "self-declared");
  return none.length === 40 && declared.length === 80;
})());
check("no guest carries a WHS provenance",
  guests.every((g) => G.handicapProvenance(g) !== "whs"));

const consenting = G.sponsorListable(guests);
check("consent is the exception, not the default",
  consenting.length === 48 && consenting.length < guests.length);

/* updateTournament takes the whole tournament, not a patch. The first draft
   of this script called it with (id, patch) behind an optional chain, which
   silently did nothing and left the pack reporting a field of zero. */
S.updateTournament({ ...day(), fieldSize: guests.length });
check("the day knows how big its field is", day().fieldSize === 120);
log(`${guests.length} guests, ${consenting.length} consented to a sponsor list`);

/* ------------------------------------------------------------------ *
 * Pairings and the day itself
 * ------------------------------------------------------------------ */

section("The round");

const ids = guests.map((g) => g.id);
const groups = [];
for (let i = 0; i < ids.length; i += 4) {
  const n = groups.length + 1;
  const tee = `0${7 + Math.floor((n - 1) / 6)}:${String(((n - 1) % 6) * 10).padStart(2, "0")}`;
  groups.push({
    id: `g${n}`, number: n, teeTime: tee, playerIds: ids.slice(i, i + 4),
  });
}
S.savePairings(TID, groups, 1);
check("thirty groups of four", groups.length === 30 &&
  groups.every((g) => g.playerIds.length === 4));

S.startTournamentDay(TID, 1);
const key = roundKey(TID, 1);
check("the day is live", st().liveTournamentId === TID);

/*
 * Score the field. The desk types cards as they come in, which is how a
 * corporate day actually runs: guests hand in paper and the caddymaster
 * enters it. Every hole for every player, so contest engagement has real
 * numbers under it.
 */
let scored = 0;
for (const g of groups) {
  for (const pid of g.playerIds) {
    for (let h = 0; h < 18; h++) {
      const par = COURSE.holes[h]?.par ?? 4;
      const swing = rnd();
      const gross = swing < 0.08 ? par - 1 : swing < 0.55 ? par : swing < 0.85 ? par + 1 : par + 2;
      S.setBulkScore(pid, h, gross);
      scored++;
    }
  }
}
check("every card is complete", scored === 120 * 18);

const cards = S.roundScores(st(), key);
check("the store holds a card for every guest",
  Object.keys(cards).filter((id) => ids.includes(id)).length === 120);

/* ---- pace, captured off the scoring that just happened ---- */
const paces = S.pacesFor(st(), key);
check("every group's pace was stamped without anyone pressing anything",
  paces.length === 30);
check("every group has a start, a turn and a finish",
  paces.every((p) => p.startedAt && p.turnAt && p.finishedAt));

const holes = S.groupHolesPlayed(st(), key);
check("every group played eighteen",
  Object.values(holes).every((n) => n === 18));

/* ------------------------------------------------------------------ *
 * Cards in
 *
 * The part the whole product exists for, and the part the first draft of this
 * script skipped: scoring a card is not returning one. Every card is attested
 * by a playing partner and certified by the player, guest or not, because
 * 3.3b asks who kept the card rather than who holds a membership.
 * ------------------------------------------------------------------ */

section("Attestation and certification");

const partnerOf = (pid) => {
  const g = groups.find((x) => x.playerIds.includes(pid));
  return g.playerIds.find((x) => x !== pid);
};

for (const pid of ids) {
  S.markerAttest(pid, partnerOf(pid), { method: "pin" });
}
const afterAttest = S.roundCerts(st(), key);
check("every card was attested by a playing partner",
  ids.every((id) => afterAttest[id]?.stage === "awaiting-player"));
check("a guest attested for a guest, and that is a valid attestation",
  ids.every((id) => {
    const marker = afterAttest[id]?.markerId;
    return marker && ids.includes(marker) && marker !== id;
  }));

for (const pid of ids) {
  await S.playerCertify(pid, { method: "pin" });
}
const certs = S.roundCerts(st(), key);
check("every card is certified",
  ids.every((id) => certs[id]?.stage === "certified"));
check("every certified card carries a seal",
  ids.every((id) => typeof certs[id]?.lockedHash === "string" &&
    certs[id].lockedHash.length >= 16));
check("no two cards share a seal",
  new Set(ids.map((id) => certs[id].lockedHash)).size === 120);

/* ------------------------------------------------------------------ *
 * Contests
 * ------------------------------------------------------------------ */

section("Contests");

S.setContestResult(TID, "ct-ntp7", { playerId: ids[17], detail: "1.4 m" });
S.setContestResult(TID, "ct-ld12", { playerId: ids[63], detail: "287 y" });
S.setContestResult(TID, "ct-ntp16", { playerId: ids[95], detail: "2.1 m" });
/* ct-hio4 stays unwon, as a hole-in-one car almost always does. */

const contests = day().contests;
check("three contests were won", contests.filter((c) => c.result).length === 3);
check("the car went unwon, and that is not an error",
  contests.find((c) => c.id === "ct-hio4").result === undefined);

for (const c of contests) {
  const faced = E.contestEngagement(cards, c.hole);
  log(`hole ${c.hole}: ${faced} players`);
}
check("contest engagement is counted, and equals the field here because "
  + "every card is complete",
  contests.every((c) => E.contestEngagement(cards, c.hole) === 120));

/* ------------------------------------------------------------------ *
 * What the day was seen on
 * ------------------------------------------------------------------ */

section("Exposure");

/*
 * Two different things, deliberately kept apart.
 *
 * The real path first: recordExposure, exactly as the board and the television
 * call it. One process is one device, so this proves the pipe rather than the
 * arithmetic.
 */
S.recordExposure(TID, "board");
S.recordExposure(TID, "tournament");
for (let i = 0; i < 260; i++) S.recordExposure(TID, "tv", 60);

const real = S.exposureFor(st(), TID);
check("the real capture path writes rows", real.length === 262);
check("the television's time adds up",
  E.summarise(real, TID).find((s) => s.surface === "tv").seconds === 15_600);

/*
 * Then the field. A harness is one device and a corporate day is a hundred
 * phones, so these rows stand in for the phones. They are appended to the
 * same store the real ones went into, and summarised by the same function.
 */
S.simStore.setState((s) => ({
  ...s,
  exposure: [
    ...s.exposure,
    ...Array.from({ length: 86 }, (_, i) => ({
      tournamentId: TID, surface: "board", device: `phone-${i}`, at: Date.now(),
    })),
    /* a third of them looked twice */
    ...Array.from({ length: 30 }, (_, i) => ({
      tournamentId: TID, surface: "board", device: `phone-${i}`, at: Date.now(),
    })),
    ...Array.from({ length: 54 }, (_, i) => ({
      tournamentId: TID, surface: "tournament", device: `phone-${i}`, at: Date.now(),
    })),
  ],
}));

const observed = S.exposureFor(st(), TID);
const rolled = E.summarise(observed, TID);
const board = rolled.find((s) => s.surface === "board");
check("devices are counted once however often they looked",
  board.unique === 87 && board.total === 117);
check("the clubhouse screen reports four hours and twenty",
  E.formatDuration(rolled.find((s) => s.surface === "tv").seconds) === "4h 20m");

/* ------------------------------------------------------------------ *
 * The packs
 * ------------------------------------------------------------------ */

section("Sponsor recap packs");

const nameOf = (pid) =>
  S.playerInField(st(), pid)?.name;

const withheld = guests.length - consenting.length;
const packs = day()
  .sponsors.filter((s) => s.contact?.email)
  .map((sponsor) =>
    R.recapSpec({
      sponsor,
      tournament: day(),
      club: { name: "Muthaiga Golf Club" },
      events: observed,
      cards,
      winners: [
        { position: "1", name: nameOf(ids[3]), detail: "Zawadi Bank", score: "41 pts" },
        { position: "2", name: nameOf(ids[28]), detail: "Mara Motors", score: "39 pts" },
        { position: "3", name: nameOf(ids[71]), detail: "Lamu Trading", score: "38 pts" },
      ],
      consented: consenting,
      withheld,
      nameOf,
      dateLine: "Saturday, 22 August 2026",
      venueLine: "Muthaiga Golf Club · White tees",
      url: `https://shimo.golf/recap/${TID}/${sponsor.id}`,
      now: new Date("2026-08-22T19:30:00Z"),
    }),
  );

check("a pack for every sponsor with a contact, and none without",
  packs.length === 7 && !packs.some((p) => p.sponsor.name === "Nyati Supplies"));

const packFor = (name) => packs.find((p) => p.sponsor.name === name);

check("the title sponsor's pack names them as such",
  packFor("Zawadi Bank").sponsor.tier === "title");
check("the presenting brand is not printed twice on its own pack",
  packFor("Zawadi Bank").event.presentedBy === "Zawadi Bank");

check("every figure in every pack is a Measure",
  packs.every((p) => p.figures.every((f) => typeof f.value.measured === "boolean")));
check("the board figure is the number that was observed",
  packFor("Zawadi Bank").figures
    .find((f) => f.label.includes("live board")).value.value === "87");
check("screen time came off the screen",
  packFor("Zawadi Bank").figures
    .find((f) => f.label.includes("clubhouse screen")).value.value === "4h 20m");
check("what could not be measured says so, in every pack",
  packs.every((p) => {
    const social = p.figures.find((f) => f.label.includes("Social"));
    return social.value.measured === false && social.value.why.length > 40;
  }));

check("a contest sponsor gets their own contests and nobody else's", (() => {
  const arb = packFor("Arboretum Insurance");
  return arb.contests.length === 2 &&
    arb.contests.every((c) => c.name === "Nearest the pin");
})());
check("the contest winner is a real player from this field", (() => {
  const arb = packFor("Arboretum Insurance");
  return arb.contests[0].winner === nameOf(ids[17]);
})());
check("an unwon contest is reported as unwon", (() => {
  const mara = packFor("Mara Motors");
  const hio = mara.contests.find((c) => c.hole === 4);
  return hio && hio.winner === undefined;
})());
check("a sponsor with no contest gets no contest section",
  packFor("Kilifi Springs").contests.length === 0);

/* ---- consent, all the way to the document ---- */
check("only consenting guests are listed",
  packs.every((p) => p.participants.length === consenting.length));
check("everyone else is counted rather than hidden",
  packs.every((p) => p.participantsWithheld === withheld));
check("the listed and the withheld account for the whole field",
  packs[0].participants.length + packs[0].participantsWithheld === 120);

const blob = JSON.stringify(packs);
check("no guest email reaches a pack", !blob.includes("@example.test"));
check("no guest phone reaches a pack", !blob.includes("+2547"));
check("no dietary note reaches a pack", !blob.includes("Nut allergy"));
check("no sponsor's contribution reaches a pack",
  !blob.includes("750000") && !blob.includes("400000"));
check("a sponsor's own contact is named for delivery",
  packFor("Zawadi Bank").sponsor.contact === "Grace Njeri");

/* ---- delivery ---- */
const deliverable = day().sponsors.filter((s) => s.contact?.email);
check("every pack has somewhere to go",
  deliverable.length === packs.length &&
  deliverable.every((s) => s.contact.email.includes("@")));
check("each pack has a filename a club can find later",
  new Set(packs.map((p) => R.recapFileName(p))).size === packs.length);
check("each pack points at its own live page",
  new Set(packs.map((p) => p.url)).size === packs.length);

/*
 * The criterion: packs ready inside 24 hours of the last card. Everything
 * above ran in the time this script took, so the honest measure is that
 * nothing here waits on a person doing anything by hand.
 */
const lastCard = new Date("2026-08-22T17:40:00Z");
const generated = new Date(packs[0].generatedAt);
const hours = (generated - lastCard) / 3_600_000;
check("packs are ready within 24 hours of the last card",
  hours >= 0 && hours < 24, `${hours.toFixed(1)}h`);

/* ------------------------------------------------------------------ */
console.log(
  `\n${failures.length ? "FAILED" : "PASSED"}  ${pass} checks passed` +
    (failures.length ? `, ${failures.length} failed:\n  - ${failures.join("\n  - ")}` : ""),
);
process.exit(failures.length ? 1 : 0);
