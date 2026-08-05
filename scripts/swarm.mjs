#!/usr/bin/env node
/**
 * A hundred and twenty phones, all scoring at once, all getting it wrong.
 *
 *   npm run swarm              a full field, interleaved, with human error
 *   npm run swarm -- --log     narrate every device action
 *   npm run swarm -- --seed 7  a different afternoon
 *
 * The other scripts drive one store. This one builds a separate store per
 * device, the way a real field is a separate phone per person, and routes
 * their outbox operations between them to play the part of Supabase Realtime.
 * That is the only way to reach the bug class that actually matters on a
 * tournament day: two devices holding different opinions about one card.
 *
 * There is a server in the middle, because in production there is one: ops
 * upsert into Postgres, which resolves a contested cell to a single value,
 * and Realtime broadcasts that winning row back to everyone. An earlier
 * version of this harness routed ops peer to peer, and it "found" a 3%
 * divergence that was really just the missing arbiter - two devices writing
 * one cell ended up holding each other's value with nothing to settle it.
 * A test has to model the architecture it is judging.
 *
 * What it does not test, and must not be read as testing: real network
 * latency, real Postgres concurrency under RLS, or how any of this behaves on
 * a mid-range Android in the sun. Those need a deployment and real handsets.
 * This tests Shimo's own reconciliation under concurrency, nothing more.
 *
 * Every device is a fresh module instance, so `mutate` on one cannot touch
 * another's state. Interleaving is deterministic from the seed, so a failure
 * can be replayed rather than chased.
 */

import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

process.env.NEXT_PUBLIC_SHIMO_MODE = "pilot";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const args = process.argv.slice(2);
const LOG = args.includes("--log");
const SEED = Number(args[args.indexOf("--seed") + 1]) || 20260822;

/* ---- assertions ---- */
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
async function attempt(name, fn) {
  try {
    await fn();
  } catch (e) {
    crashes.push(`${name}: ${e?.stack?.split("\n").slice(0, 2).join(" | ") ?? e}`);
    console.log(`  CRASH ${name}\n        ${e?.message ?? e}`);
  }
}
const section = (t) => console.log(`\n${t}`);
const log = (...a) => LOG && console.log("       ", ...a);

let seed = SEED;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const chance = (p) => rnd() < p;

/* ------------------------------------------------------------------ *
 * A device
 *
 * Its own module registry, so its own store, its own localStorage, its own
 * client id. Two devices sharing a module instance would share state and the
 * whole exercise would prove nothing.
 * ------------------------------------------------------------------ */

async function makeDevice(name) {
  const bag = new Map();
  /* Each device needs its own globals while its modules initialise, because
     the store reads localStorage and the client id at import time. */
  globalThis.localStorage = {
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => bag.set(k, String(v)),
    removeItem: (k) => bag.delete(k),
    clear: () => bag.clear(),
  };
  globalThis.window ??= globalThis;
  /* Node defines navigator as a getter, so it is redefined rather than
     assigned. Each device wants its own user agent, because the certification
     seal records the device that signed. */
  const define = (k, v) =>
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  define("navigator", { userAgent: `shimo-swarm/${name}` });
  define("screen", { width: 390, height: 844 });
  define("devicePixelRatio", 3);
  bag.set("shimo-client-id", name);

  const jiti = createJiti(import.meta.url, {
    alias: { "@": resolve(root) },
    interopDefault: true,
    /* A fresh registry per device. Without this every device is the same
       module instance and therefore the same store. */
    moduleCache: false,
  });
  const S = await jiti.import("../lib/sim/store.ts");
  return { name, S, bag, st: () => S.simStore.getState() };
}

/* ------------------------------------------------------------------ *
 * The transport
 *
 * Devices do not talk to each other; they hand operations to this, which
 * decides what arrives, when, and how many times. Real transports lose
 * things, deliver twice and deliver late, and a reconciliation that only
 * works on a perfect wire is not a reconciliation.
 * ------------------------------------------------------------------ */

function makeWire(devices, opts = {}) {
  const dropRate = opts.dropRate ?? 0;
  const dupeRate = opts.dupeRate ?? 0;
  const stats = {
    upserted: 0, delivered: 0, dropped: 0, duplicated: 0,
    reordered: 0, scores: 0, entities: 0, contested: 0,
  };

  /*
   * The server. Scores are keyed the way the table is - (tournament, player,
   * hole) plus which card it is - so a second write to the same cell replaces
   * the first rather than sitting beside it. That single stored value is what
   * every device is then told, which is the whole point of having a server.
   */
  const rows = new Map();
  /** Which ops have reached the server, and which broadcasts have landed. */
  const received = new Set();
  const landed = new Set();
  const offline = new Set();
  let queue = [];

  const scoreKey = (o) =>
    `score:${o.playerId}:${o.round ?? 1}:${o.hole}:${o.source ?? "player"}`;

  const apply = (to, op) => {
    if (op.kind === "entity") {
      to.S.applyRemoteEntity(op.payload.table, op.payload.row);
      stats.entities++;
    } else if (op.kind === "resolve") {
      for (const src of ["player", "marker"]) {
        to.S.applyRemoteScore(
          op.payload.playerId, op.payload.hole, op.payload.gross,
          src, op.payload.round, TID,
        );
      }
      stats.scores++;
    } else {
      to.S.applyRemoteScore(
        op.payload.playerId, op.payload.hole, op.payload.gross,
        op.payload.source, op.payload.round, TID,
      );
      stats.scores++;
    }
    stats.delivered++;
  };

  return {
    stats,
    cut: (name) => offline.add(name),
    heal: (name) => offline.delete(name),

    /**
     * One pass of the sync engine: drain outboxes into the server, then
     * broadcast what the server now holds. Both legs are lossy; the uplink is
     * retried because the outbox retries, and the downlink is retried because
     * the periodic rehydrate re-reads the snapshot.
     */
    pump() {
      /* ---- uplink: device -> server ---- */
      for (const from of devices) {
        if (offline.has(from.name)) continue;
        for (const op of from.st().outbox) {
          if (received.has(op.id)) continue;
          if (chance(dropRate)) { stats.dropped++; continue; } // retried next pump
          received.add(op.id);
          stats.upserted++;
          if (op.kind === "score") {
            const k = scoreKey(op.payload);
            if (rows.has(k) && rows.get(k).payload.gross !== op.payload.gross) {
              stats.contested++;
            }
            rows.set(k, op); // upsert: the newest write to this cell wins
          } else {
            rows.set(`op:${op.id}`, op);
          }
          /* ---- downlink: server -> everyone, including the writer ---- */
          for (const to of devices) {
            if (offline.has(to.name)) continue;
            queue.push({ to, key: op.kind === "score" ? scoreKey(op.payload) : `op:${op.id}`, at: rnd() });
            if (chance(dupeRate)) {
              stats.duplicated++;
              queue.push({ to, key: op.kind === "score" ? scoreKey(op.payload) : `op:${op.id}`, at: rnd() });
            }
          }
        }
      }

      const batch = queue;
      queue = [];
      const before = batch.map((b) => b.key).join(",");
      batch.sort((a, b) => a.at - b.at);
      if (batch.map((b) => b.key).join(",") !== before) stats.reordered++;
      for (const { to, key } of batch) {
        if (chance(dropRate)) { stats.dropped++; continue; } // the rehydrate will catch it
        const op = rows.get(key);
        if (op) apply(to, op);
      }
    },

    /**
     * The periodic reconcile in the sync engine: re-read the snapshot and
     * apply it. This is what guarantees a device that missed a broadcast is
     * not left behind, so the harness has to have it too.
     */
    rehydrate() {
      for (const to of devices) {
        if (offline.has(to.name)) continue;
        for (const op of rows.values()) {
          const mark = `${to.name}:${op.id}:${op.payload.gross}`;
          if (landed.has(mark)) continue;
          landed.add(mark);
          apply(to, op);
        }
      }
    },

    /** Drain everything, then reconcile, the way the day ends. */
    settle(rounds = 4) {
      for (let i = 0; i < rounds; i++) this.pump();
      this.rehydrate();
    },
  };
}

/* ------------------------------------------------------------------ */

console.log(`Swarm · seed ${SEED}`);
section("Building the field");

const TID = "t-swarm";
const CLUB = "muthaiga";

/* One device per group of four, which is how a field actually looks: a phone
   in each fourball plus the desk, rather than a phone per person. Thirty
   groups and a desk is thirty-one independent stores. */
const GROUP_COUNT = 30;
const devices = [];
for (let g = 0; g < GROUP_COUNT; g++) {
  devices.push(await makeDevice(`phone-${g + 1}`));
}
const desk = await makeDevice("desk");
const all = [...devices, desk];
check("thirty-one independent stores exist", all.length === 31);
check("they really are independent", (() => {
  all[0].S.addRosterMember({
    id: "probe", clubId: CLUB, name: "Probe", handicap: 1, gender: "M",
  });
  const leaked = all[1].st().roster.some((p) => p.id === "probe");
  return !leaked;
})(), "one device's write must not appear in another's state");

const { COURSES } = await createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
}).import("../lib/data.ts");
const COURSE = COURSES[0];

const dayFor = () => ({
  id: TID, name: "Swarm Day", clubId: CLUB, courseId: COURSE.id,
  date: "2026-09-12", format: "Stableford", entryFee: 0, status: "upcoming",
  membersOnly: false, divisions: [{ name: "Overall", range: [0, 36] }],
  description: "", prizes: [], maxPlayers: 200, regCloses: "2026-09-10",
  handicapAllowance: 95, firstTee: "07:00", teeInterval: 10, fieldSize: 120,
  eventKind: "corporate", presentedBy: { name: "Swarm Co" },
  sponsors: [{ id: "sp", name: "Swarm Sponsor", tier: "title",
    contact: { name: "A Person", email: "a@x.example" } }],
  contests: [{ id: "ct", name: "Nearest the pin", hole: 7, sponsorId: "sp" }],
  rounds: [{ id: "r1", number: 1, name: "Round 1", date: "2026-09-12",
    courseId: COURSE.id, tees: "White", firstTee: "07:00",
    teeInterval: 10, cut: null }],
});

/*
 * Every device is told about the same day and the same field, which is what
 * hydration from the cloud does on a real morning.
 */
const field = [];
for (let i = 0; i < GROUP_COUNT * 4; i++) {
  field.push({
    id: `sw-${i}`, clubId: CLUB, name: `Swarm Player ${i}`,
    handicap: i % 30, gender: i % 4 === 0 ? "F" : "M",
  });
}
const groups = [];
for (let g = 0; g < GROUP_COUNT; g++) {
  groups.push({
    id: `swg${g + 1}`, number: g + 1, teeTime: "07:00",
    playerIds: field.slice(g * 4, g * 4 + 4).map((p) => p.id),
  });
}

for (const d of all) {
  d.S.createTournament(dayFor(d.name));
  for (const p of field) d.S.addRosterMember(p);
  d.S.savePairings(TID, groups, 1);
  d.S.startTournamentDay(TID, 1);
}
check("every device is on the same live round",
  all.every((d) => d.st().liveTournamentId === TID));

/* ------------------------------------------------------------------ *
 * The afternoon
 * ------------------------------------------------------------------ */

section("A hundred and twenty players, scoring at once");

const wire = makeWire(all, { dropRate: 0.06, dupeRate: 0.08 });
const errors = { doubleEntered: 0, corrected: 0, wrongPlayer: 0, deskOverrode: 0 };

await attempt("eighteen holes, all groups interleaved", () => {
  for (let hole = 0; hole < 18; hole++) {
    /* Groups do not play a hole in order, so the device order shuffles every
       hole. This is what makes the interleaving worth anything. */
    const order = devices
      .map((d, i) => ({ d, i, k: rnd() }))
      .sort((a, b) => a.k - b.k);

    for (const { d, i } of order) {
      const group = groups[i];
      for (const pid of group.playerIds) {
        const par = COURSE.holes[hole]?.par ?? 4;
        const roll = rnd();
        const gross = roll < 0.1 ? par - 1 : roll < 0.6 ? par : roll < 0.87 ? par + 1 : par + 2;

        d.S.setBulkScore(pid, hole, gross);

        /* ---- human error, mixed in ---- */

        // the same score entered twice because the first tap looked ignored
        if (chance(0.05)) {
          d.S.setBulkScore(pid, hole, gross);
          errors.doubleEntered++;
        }

        // entered wrong, noticed, corrected on the next tee
        if (chance(0.04)) {
          const fixed = Math.max(1, gross + (chance(0.5) ? 1 : -1));
          d.S.setBulkScore(pid, hole, fixed);
          errors.corrected++;
        }

        // typed onto the wrong player's line, then put right
        if (chance(0.03)) {
          const other = group.playerIds.find((x) => x !== pid);
          if (other) {
            d.S.setBulkScore(other, hole, gross);
            errors.wrongPlayer++;
          }
        }

        // the desk types the paper card for the same hole, at the same time
        if (chance(0.04)) {
          desk.S.setBulkScore(pid, hole, gross);
          errors.deskOverrode++;
        }
      }
      /* Deliver mid-hole sometimes, so devices see each other's writes while
         still writing rather than only at a tidy boundary. */
      if (chance(0.3)) wire.pump();
    }
    wire.pump();
  }
  log("errors injected:", JSON.stringify(errors));
  log("wire:", JSON.stringify(wire.stats));
});

/* Let the outbox finish draining, the way it would between the last putt and
   the prizegiving. After this every device should agree exactly. */
wire.settle(8);

check("the wire actually misbehaved",
  wire.stats.dropped > 0 && wire.stats.duplicated > 0,
  `${JSON.stringify(wire.stats)}`);
check("cells were genuinely contested",
  wire.stats.contested > 0,
  "if no two devices ever wrote the same cell there was nothing to reconcile");
check("human error actually happened",
  Object.values(errors).every((n) => n > 0), JSON.stringify(errors));

/* ------------------------------------------------------------------ *
 * What every device believes
 * ------------------------------------------------------------------ */

section("Do the devices agree?");

const { roundKey } = await createJiti(import.meta.url, {
  alias: { "@": resolve(root) }, interopDefault: true,
}).import("../lib/rounds.ts");
const key = roundKey(TID, 1);

const cardOn = (d, pid) => d.st().scores?.[key]?.[pid] ?? [];

await attempt("no card holds an impossible figure anywhere", () => {
  let bad = null;
  for (const d of all) {
    for (const p of field) {
      for (const v of cardOn(d, p.id)) {
        if (v === null || v === undefined) continue;
        if (!Number.isInteger(v) || v <= 0 || v > 30) {
          bad = `${d.name}/${p.id} holds ${JSON.stringify(v)}`;
          break;
        }
      }
      if (bad) break;
    }
    if (bad) break;
  }
  check("every score on every device is a real score", bad === null, bad ?? "");
});

await attempt("the desk sees the whole field", () => {
  const seen = field.filter((p) => cardOn(desk, p.id).some((v) => v != null));
  check("the desk holds a card for every player who scored",
    seen.length === field.length,
    `${seen.length} of ${field.length}`);
});

await attempt("devices converge on the same figures", () => {
  /*
   * With the outbox retrying, a lossy wire is a delay rather than a loss, so
   * once it has drained every device must hold exactly what the desk holds.
   * Anything less means a write was silently abandoned somewhere, which on a
   * real day is a player's card quietly missing a hole.
   */
  let compared = 0;
  let differing = 0;
  for (const p of field) {
    const deskCard = cardOn(desk, p.id);
    for (const d of devices) {
      const card = cardOn(d, p.id);
      for (let h = 0; h < 18; h++) {
        if (card[h] == null || deskCard[h] == null) continue;
        compared++;
        if (card[h] !== deskCard[h]) differing++;
      }
    }
  }
  const rate = compared ? differing / compared : 0;
  log(`compared ${compared} figures, ${differing} differ (${(rate * 100).toFixed(2)}%)`);
  check("every device agrees with the desk, exactly",
    differing === 0, `${differing} of ${compared} figures differ`);
  check("something was actually compared", compared > 10_000, `${compared}`);
});

/* ------------------------------------------------------------------ *
 * Certification under contention
 * ------------------------------------------------------------------ */

section("Certifying while everything is still moving");

await attempt("the same card, certified from two phones at once", async () => {
  const pid = field[0].id;
  const marker = field[1].id;
  const a = devices[0];
  const b = devices[1];

  /* Both phones hold the identical card, which is the good case: the seal is
     a hash of the figures, so two honest devices must reach the same one. A
     seal that varied by device would prove nothing about the card. */
  for (const d of [a, b]) {
    for (let h = 0; h < 18; h++) d.S.setBulkScore(pid, h, 4);
    d.S.markerAttest(pid, marker, { method: "pin" });
  }
  await Promise.all([
    a.S.playerCertify(pid, { method: "pin" }),
    b.S.playerCertify(pid, { method: "pin" }),
  ]);
  const ha = a.S.roundCerts(a.st(), key)[pid]?.lockedHash;
  const hb = b.S.roundCerts(b.st(), key)[pid]?.lockedHash;
  check("both phones sealed the card", Boolean(ha) && Boolean(hb));
  check("an identical card seals to an identical hash on both", ha === hb,
    "a seal that depends on which phone signed it is not evidence of anything");
});

await attempt("two phones that disagree about the card both seal it", async () => {
  /*
   * The case the single-store stress run structurally could not reach, and
   * the one that decides whether the seal is worth anything. Two devices hold
   * genuinely different figures for one player because a message was lost.
   * Both certify. If they produced the same hash the seal would be blind to
   * the very disagreement it exists to catch.
   */
  const pid = field[2].id;
  const marker = field[3].id;
  const a = devices[2];
  const b = devices[3];
  for (const d of [a, b]) for (let h = 0; h < 18; h++) d.S.setBulkScore(pid, h, 4);
  b.S.setBulkScore(pid, 7, 6); // b never heard the correction on the 8th
  for (const d of [a, b]) d.S.markerAttest(pid, marker, { method: "pin" });
  await Promise.all([
    a.S.playerCertify(pid, { method: "pin" }),
    b.S.playerCertify(pid, { method: "pin" }),
  ]);
  const ha = a.S.roundCerts(a.st(), key)[pid]?.lockedHash;
  const hb = b.S.roundCerts(b.st(), key)[pid]?.lockedHash;
  check("two different cards seal to two different hashes", ha !== hb,
    "the seal must be able to tell that these phones disagree");
  check("and the disagreement is visible rather than silently merged",
    a.st().scores[key][pid][7] !== b.st().scores[key][pid][7]);
});

await attempt("a score arrives after the card was sealed", () => {
  const pid = field[0].id;
  const a = devices[0];
  const sealed = a.S.roundCerts(a.st(), key)[pid].lockedHash;
  a.S.applyRemoteScore(pid, 3, 9, "player", 1, TID);
  const after = a.S.roundCerts(a.st(), key)[pid].lockedHash;
  check("a late score does not silently move the seal", after === sealed,
    "a hash that follows the card after signing records nothing");
});

/* ------------------------------------------------------------------ *
 * A phone that was out of signal for half the round
 * ------------------------------------------------------------------ */

section("Nine holes in a dead spot, then everything at once");

await attempt("a partitioned phone keeps scoring and heals", () => {
  const lost = devices[10];
  const group = groups[10];
  /* What the desk holds before the phone goes quiet. The assertion below is
     that this does not move while the phone is cut off, which is a real
     statement about delivery; comparing against a fixed number would only be
     testing whether the round happened to produce that score. */
  const deskBefore = JSON.stringify(
    group.playerIds.map((pid) => desk.st().scores?.[key]?.[pid] ?? []),
  );
  wire.cut(lost.name);

  /* It carries on. Local-first means the round does not stop because the
     signal did, and this is the ordinary case on a course with a valley in
     it, not an edge case. */
  /* A distinctive figure, so "the desk received the backlog" cannot be
     satisfied by a score the main round happened to produce. */
  const MARK = 9;
  for (let h = 0; h < 9; h++) {
    for (const pid of group.playerIds) lost.S.setBulkScore(pid, h, MARK);
  }
  for (let i = 0; i < 5; i++) wire.pump(); // the rest of the field plays on

  const strandedLocally = group.playerIds.every(
    (pid) => (lost.st().scores?.[key]?.[pid] ?? [])[4] === MARK,
  );
  check("the cut phone still recorded its own group", strandedLocally,
    "a phone that stops working without signal is not local-first");
  const deskNow = JSON.stringify(
    group.playerIds.map((pid) => desk.st().scores?.[key]?.[pid] ?? []),
  );
  check("and nothing from the cut phone reached the desk", deskNow === deskBefore,
    "a device off the air must not appear to be delivering");

  const queued = lost.st().outbox.filter((o) => o.status === "pending").length;
  check("the writes are still queued rather than lost", queued > 0, `${queued} pending`);

  wire.heal(lost.name);
  wire.settle();
  const healed = group.playerIds.every(
    (pid) => (desk.st().scores?.[key]?.[pid] ?? [])[4] === MARK,
  );
  check("when signal returns the desk gets the whole nine", healed);
});

/* ------------------------------------------------------------------ *
 * The admin doing something drastic mid-round
 * ------------------------------------------------------------------ */

section("The desk changes its mind while 120 people are on the course");

await attempt("a member is deactivated while their group is scoring", () => {
  const victim = field[40].id;
  const phone = devices[10];
  const before = (phone.st().scores?.[key]?.[victim] ?? []).filter((v) => v != null).length;
  /* The real roster call, named directly. Reaching for a function that does
     not exist behind an optional chain is how a check ends up passing while
     testing nothing. */
  desk.S.setMemberActive(victim, false);
  wire.pump();
  phone.S.setBulkScore(victim, 12, 5);
  const card = phone.st().scores?.[key]?.[victim] ?? [];
  const after = card.filter((v) => v != null).length;
  check("a round already under way is not voided by a roster change",
    after >= before,
    "deactivating a member mid-round must not erase the card they are playing");
  check("and the score entered after deactivation still landed", card[12] === 5,
    "the person is on the course; the desk closing their account is next week's problem");
  check("the desk really did deactivate them",
    desk.st().roster.find((p) => p.id === victim)?.active === false,
    "if this is not false the check above proved nothing");
});

await attempt("the tournament is cancelled while phones are scoring", () => {
  const phone = devices[20];
  const pid = groups[20].playerIds[0];
  const held = (phone.st().scores?.[key]?.[pid] ?? []).filter((v) => v != null).length;

  desk.S.deleteTournament(TID);
  wire.settle();

  check("the phone stood its live board down", phone.st().liveTournamentId !== TID,
    "a cancelled event must not keep showing as live");
  const kept = (phone.st().scores?.[key]?.[pid] ?? []).filter((v) => v != null).length;
  check("but the scores already played are still on the phone", kept === held,
    "cancelling must not destroy the record of what was actually played");
});

section("The board under load");

await attempt("standings on a full, partly-diverged field", async () => {
  const { cumulativeStandings } = await createJiti(import.meta.url, {
    alias: { "@": resolve(root) }, interopDefault: true,
  }).import("../lib/scoring.ts");
  const rows = cumulativeStandings(
    field,
    [{ round: 1, scores: desk.st().scores[key] ?? {}, course: COURSE }],
    95, "points",
  );
  check("every player has a row", rows.length === field.length);
  check("no position is NaN",
    rows.every((r) => Number.isFinite(r.points)),
    "one NaN score poisons a whole leaderboard");
  check("the board is ordered", (() => {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].points < rows[i].points) return false;
    }
    return true;
  })());
  log("leader:", rows[0]?.player?.name, rows[0]?.points, "pts");
});

/* ------------------------------------------------------------------ */

console.log(
  `\n${findings.length || crashes.length ? "FOUND PROBLEMS" : "NOTHING BROKE"}  ` +
    `${pass} checks passed, ${findings.length} findings, ${crashes.length} crashes` +
    `\n  wire: ${JSON.stringify(wire.stats)}` +
    `\n  human error: ${JSON.stringify(errors)}`,
);
if (findings.length) console.log(`\nFindings:\n  - ${findings.join("\n  - ")}`);
if (crashes.length) console.log(`\nCrashes:\n  - ${crashes.join("\n  - ")}`);
process.exit(findings.length || crashes.length ? 1 : 0);
