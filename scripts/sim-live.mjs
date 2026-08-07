#!/usr/bin/env node
/**
 * A full field, played into the real database, that you steer from a terminal.
 *
 *   npm run sim:live -- --profile medal --size 120
 *   npm run sim:live -- --purge            # just clean up, write nothing
 *
 * This is the opposite of a puppet inside one browser tab. It writes to the
 * real pilot Supabase the way a phone does - the same tables, the same row
 * shapes, the same anon key - so the real app reads it as a genuine
 * tournament. You open the deployed app (leaderboard, TV, Live Ops) in a
 * browser and watch it react to input it has no idea is simulated. That is the
 * only way to test the thing that ships: RLS, realtime, the public board, all
 * of it, end to end.
 *
 * It is interactive. Once it is running, type commands to steer:
 *
 *   go / pause         start or stop the field advancing
 *   rate <ms>          how fast holes come in (smaller is faster)
 *   eagle              a three on the next par five
 *   lead               give second place a run that changes the lead
 *   correction         a marker/player revision, into the corrections table
 *   burst              the desk keying a whole group's holes at once
 *   status             leader and progress
 *   end                cancel the tournament and purge every simulated row
 *   help               this list
 *
 * Everything it creates is prefixed - `sim-` tournaments, `simp-` players - so
 * `end` (or --purge, or `select purge_simulator_data()` in SQL) removes it all
 * and can never touch a real record. Purge needs schema-m17 run once; without
 * it the field is only cancelled, and the rows linger until it is.
 *
 * What it deliberately does not simulate: the integrity heuristic. That runs
 * only on scores typed at the desk on this device, never on scores arriving
 * over the wire, so an anomaly written from here shows on the board but not in
 * the committee log. That is a true property of the app, surfaced by testing
 * it honestly rather than papered over.
 */

import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";

/* ---- arguments ---- */
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PURGE_ONLY = argv.includes("--purge");
const PROFILE = arg("profile", "medal");
const SIZE = Number(arg("size", "120"));
const SEED = Number(arg("seed", String(Date.now() & 0xffffff)));

/* ---- environment: read .env.local the way the app's build does ---- */
function loadEnv() {
  const out = {};
  try {
    const text = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through to a clear error below */
  }
  return out;
}
const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error(
    "No Supabase credentials. Expected NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
  );
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

/* ---- app code, for the row shapes and the golf ---- */
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(root) },
  interopDefault: true,
});
const { tournamentToRow, playerToRow, pairingToRow, teamToRow, correctionToRow } =
  await jiti.import("../lib/sync/mappers.ts");
const { generateGross } = await jiti.import("../lib/scoring.ts");
const { COURSES } = await jiti.import("../lib/data.ts");
const COURSE = COURSES.find((c) => c.id === "muthaiga-main");

/* ---- a seeded afternoon, so a run can be repeated ---- */
let seed = SEED;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/* ------------------------------------------------------------------ *
 * Profiles
 * ------------------------------------------------------------------ */

const PROFILES = {
  championship: {
    format: "Stroke Play", fieldProfile: "championship", coverage: "full",
    handicap: () => Math.round(rnd() * 8),
  },
  medal: {
    format: "Stroke Play", fieldProfile: "club", coverage: "reduced",
    handicap: () => Math.round(rnd() * 28),
  },
  stableford: {
    format: "Stableford", fieldProfile: "stableford", coverage: "reduced",
    handicap: () => 4 + Math.round(rnd() * 24),
  },
  scramble: {
    // a two-person scramble: players pair up, play one ball, and the board
    // shows teams. `team` is players per team; `allowances` is the per-position
    // handicap split the app blends into a single team handicap.
    format: "Scramble", fieldProfile: "team", coverage: "reduced",
    handicap: () => 6 + Math.round(rnd() * 22),
    team: 2, allowances: [35, 15],
  },
};

const FIRST = [
  "James", "Peter", "Grace", "Mary", "David", "John", "Faith", "Daniel",
  "Joseph", "Esther", "Samuel", "Ann", "Paul", "Ruth", "Simon", "Jane",
  "Charles", "Alice", "George", "Nancy", "Dennis", "Beatrice", "Kevin",
  "Lucy", "Brian", "Caroline", "Eric", "Mercy", "Victor", "Rose",
];
const LAST = [
  "Kamau", "Wanjiku", "Otieno", "Mutua", "Kiptoo", "Njoroge", "Ochieng",
  "Wambui", "Kimani", "Achieng", "Mwangi", "Nyambura", "Korir", "Adhiambo",
  "Gitau", "Chebet", "Omondi", "Wairimu", "Rono", "Muthoni",
];
const nameFor = (i) =>
  `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;

/* ------------------------------------------------------------------ *
 * State the driver keeps in memory: its own picture of what it has
 * written, so it can decide what to write next without re-reading.
 * ------------------------------------------------------------------ */

const TID = `sim-live-${SEED.toString(36)}`;
const ROUND = 1;
let roster = []; // the actual players: { id, name, handicap, gender, groupIdx }
let teams = []; // scramble teams: { id, name, playerIds }
// the scoring units the board shows: players for an individual event, teams for
// a scramble (a team owns one card under its own id, exactly as the app stores it)
let field = []; // { id, name, handicap, groupIdx }
let groups = []; // { id, number, playerIds (roster), unitIds (scoring) }
let cards = new Map(); // unitId -> [gross|null x18]
let running = false;
let timer = null;
let intervalMs = 1600;

const thru = (id) => (cards.get(id) ?? []).filter((v) => v != null).length;
const groupThru = (g) => Math.min(...g.unitIds.map(thru));

/* ------------------------------------------------------------------ *
 * Writing to Supabase, the way the app does
 * ------------------------------------------------------------------ */

async function upsertScores(rows) {
  if (!rows.length) return;
  const { error } = await sb
    .from("scores")
    .upsert(rows, { onConflict: "tournament_id,round,player_id,hole,source" });
  if (error) console.error("  ! scores:", error.message);
}

/** Write one player's hole on both cards, from the group's phone. */
function scoreRows(pid, hole, gross, deviceId) {
  const at = new Date().toISOString();
  const base = {
    tournament_id: TID, round: ROUND, player_id: pid, hole, gross,
    client_id: deviceId, updated_at: at,
  };
  // a real phone writes the player's card and the marker's copy agrees
  return [
    { ...base, source: "player" },
    { ...base, source: "marker" },
  ];
}

function setScore(pid, hole, gross, deviceId, batch) {
  const card = cards.get(pid) ?? Array(18).fill(null);
  card[hole] = gross;
  cards.set(pid, card);
  for (const r of scoreRows(pid, hole, gross, deviceId)) batch.push(r);
}

/* ------------------------------------------------------------------ *
 * Build the field and put it on the first tee
 * ------------------------------------------------------------------ */

async function build() {
  const spec = PROFILES[PROFILE];
  if (!spec) {
    console.error(`Unknown profile "${PROFILE}". Try championship, medal or stableford.`);
    process.exit(1);
  }
  const size = Math.max(4, Math.round(SIZE / 4) * 4);
  // first names read better for team labels than surnames, which collide in a
  // small synthetic field
  const surname = (id) => roster.find((p) => p.id === id)?.name.split(" ")[0];

  roster = Array.from({ length: size }, (_, i) => ({
    id: `simp-${SEED.toString(36)}-${i}`,
    clubId: "muthaiga",
    name: nameFor(i),
    handicap: spec.handicap(),
    gender: i % 4 === 0 ? "F" : "M",
    groupIdx: Math.floor(i / 4),
  }));
  groups = [];
  for (let g = 0; g * 4 < size; g++) {
    groups.push({
      id: `simg-${g + 1}`,
      number: g + 1,
      teeTime: "07:00",
      playerIds: roster.slice(g * 4, g * 4 + 4).map((p) => p.id),
      unitIds: [],
    });
  }

  if (spec.team) {
    // pair players up within each tee-time group: a fourball holds two teams
    teams = [];
    let n = 0;
    for (const g of groups) {
      for (let k = 0; k < g.playerIds.length; k += spec.team) {
        const playerIds = g.playerIds.slice(k, k + spec.team);
        const id = `simt-${SEED.toString(36)}-${n++}`;
        teams.push({ id, name: playerIds.map(surname).join(" + "), playerIds });
        g.unitIds.push(id);
      }
    }
    // the board shows teams; each team scores off its better member
    field = teams.map((t) => ({
      id: t.id,
      name: t.name,
      handicap: Math.min(...t.playerIds.map((pid) => roster.find((p) => p.id === pid).handicap)),
      groupIdx: groups.findIndex((g) => g.unitIds.includes(t.id)),
    }));
  } else {
    field = roster;
    for (const g of groups) g.unitIds = [...g.playerIds];
  }
  for (const u of field) cards.set(u.id, Array(18).fill(null));

  const tournament = {
    id: TID, name: "Simulated Field (live)", clubId: "muthaiga",
    courseId: COURSE.id, date: new Date().toISOString().slice(0, 10),
    format: spec.format, entryFee: 0, status: "upcoming", membersOnly: false,
    divisions: [{ name: "Overall", range: [0, 36] }], description: "",
    prizes: [], maxPlayers: 200, regCloses: new Date().toISOString().slice(0, 10),
    handicapAllowance: 95, firstTee: "07:00", teeInterval: 10, fieldSize: size,
    fieldProfile: spec.fieldProfile, tvCoverage: spec.coverage,
    ...(spec.team ? { playersPerTeam: spec.team, handicapAllowances: spec.allowances } : {}),
    rounds: [{
      id: "sim-r1", number: ROUND, name: "Round 1",
      date: new Date().toISOString().slice(0, 10), courseId: COURSE.id,
      tees: "White", firstTee: "07:00", teeInterval: 10, cut: null,
    }],
  };

  const what = spec.team ? `${teams.length} teams` : `${size} players`;
  process.stdout.write(`Building ${what} in ${groups.length} groups ... `);

  const { error: te } = await sb
    .from("tournaments")
    .upsert([tournamentToRow(tournament)], { onConflict: "id" });
  if (te) return fail("tournament", te);

  const { error: pe } = await sb
    .from("players")
    .upsert(roster.map((p) => playerToRow(p)), { onConflict: "id" });
  if (pe) return fail("players", pe);

  const { error: ge } = await sb.from("pairings").upsert(
    groups.map((g) => pairingToRow(TID, ROUND, g)),
    { onConflict: "tournament_id,round,group_id" },
  );
  if (ge) return fail("pairings", ge);

  if (spec.team) {
    const { error: tme } = await sb.from("teams").upsert(
      teams.map((t) => teamToRow(TID, ROUND, { ...t, tournamentId: TID })),
      { onConflict: "tournament_id,round,team_id" },
    );
    if (tme) return fail("teams", tme);
  }

  // flip it live: findLiveTournamentId() looks for exactly this
  const { error: le } = await sb
    .from("tournaments")
    .update({ status: "live", updated_at: new Date().toISOString() })
    .eq("id", TID);
  if (le) return fail("go-live", le);

  console.log("live.");
  console.log(`  tournament id: ${TID}`);
  console.log("  open the app now; it will pick this up as today's live event.\n");
}

function fail(what, error) {
  console.log("failed.");
  console.error(`  ! ${what}: ${error.message}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * The afternoon
 * ------------------------------------------------------------------ */

async function step() {
  const playing = groups.filter((g) => groupThru(g) < 18);
  if (!playing.length) {
    running = false;
    if (timer) {
    clearInterval(timer);
    timer = null;
  }
    console.log("\nEvery card is complete.");
    return;
  }
  playing.sort((a, b) => groupThru(a) - groupThru(b));
  const advancing = playing.slice(0, Math.max(1, Math.round(playing.length / 6)));
  const batch = [];
  for (const g of advancing) {
    const h = groupThru(g);
    if (h >= 18) continue;
    for (const uid of g.unitIds) {
      if (thru(uid) !== h) continue;
      const unit = field.find((p) => p.id === uid);
      setScore(uid, h, generateGross(COURSE.holes[h], unit.handicap, rnd), g.id, batch);
    }
  }
  await upsertScores(batch);
}

function resume() {
  if (timer) clearInterval(timer);
  running = true;
  timer = setInterval(() => void step(), intervalMs);
}
function pause() {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/* ------------------------------------------------------------------ *
 * Forced moments - each arranges a real cause the app reacts to
 * ------------------------------------------------------------------ */

const PAR5S = COURSE.holes.map((h, i) => (h.par === 5 ? i : -1)).filter((i) => i >= 0);

async function forceEagle() {
  const last5 = PAR5S[PAR5S.length - 1];
  const player = field.find((p) => thru(p.id) > 0 && thru(p.id) <= last5);
  if (!player) return say("No group is short of a par five just now.");
  const from = thru(player.id);
  const par5 = PAR5S.find((i) => i >= from);
  const g = groups[player.groupIdx];
  const batch = [];
  for (let h = from; h < par5; h++)
    setScore(player.id, h, generateGross(COURSE.holes[h], player.handicap, rnd), g.id, batch);
  setScore(player.id, par5, 3, g.id, batch);
  await upsertScores(batch);
  say(`Eagle written · ${player.name} on the ${ordinal(par5 + 1)}.`);
}

async function forceLeadChange() {
  const board = standings();
  if (board.length < 2 || board[0].thru === 0)
    return say("Nobody has posted enough for a lead to change yet.");
  const challenger = field.find((p) => p.id === board[1].id);
  const g = groups[challenger.groupIdx];
  const batch = [];
  let h = thru(challenger.id);
  for (let i = 0; i < 3 && h < 18; i++, h++)
    setScore(challenger.id, h, Math.max(2, COURSE.holes[h].par - 1), g.id, batch);
  await upsertScores(batch);
  const after = standings();
  say(
    after[0].id !== board[0].id
      ? `Lead changed · ${after[0].name} ahead.`
      : `${challenger.name} charged; the lead held.`,
  );
}

async function forceBurst() {
  const behind = groups.filter((g) => groupThru(g) < 18).sort((a, b) => groupThru(a) - groupThru(b))[0];
  if (!behind) return say("No group is behind enough to catch up.");
  const from = groupThru(behind);
  const to = Math.min(18, from + 5);
  const batch = [];
  for (const uid of behind.unitIds) {
    const unit = field.find((p) => p.id === uid);
    for (let h = thru(uid); h < to; h++)
      setScore(uid, h, generateGross(COURSE.holes[h], unit.handicap, rnd), behind.id, batch);
  }
  await upsertScores(batch);
  say(`Desk burst · group ${behind.number} caught up to the ${ordinal(to)}.`);
}

async function forceCorrection() {
  const player = field.find((p) => thru(p.id) > 1);
  if (!player) return say("No card is far enough along to correct.");
  const hole = thru(player.id) - 1;
  const current = (cards.get(player.id) ?? [])[hole] ?? 4;
  const correction = {
    id: `corr-sim-${Date.now().toString(36)}`,
    playerId: player.id, round: ROUND, holeIdx: hole,
    currentGross: current, proposedGross: Math.max(1, current - 1),
    reason: "Marker and player agreed the figure was keyed wrong at the turn.",
    ts: Date.now(), status: "pending",
  };
  const { error } = await sb
    .from("corrections")
    .upsert([correctionToRow(TID, correction)], { onConflict: "id" });
  if (error) return say(`correction failed: ${error.message}`);
  say(`Correction requested · ${player.name}, hole ${hole + 1}. (See Live Ops.)`);
}

/* ------------------------------------------------------------------ *
 * A cheap local leaderboard, gross, just to name the leader
 * ------------------------------------------------------------------ */

function standings() {
  return field
    .map((p) => {
      const card = cards.get(p.id) ?? [];
      let gross = 0, par = 0, t = 0;
      card.forEach((g, i) => {
        if (g != null) { gross += g; par += COURSE.holes[i].par; t++; }
      });
      return { id: p.id, name: p.name, thru: t, toPar: gross - par };
    })
    .filter((r) => r.thru > 0)
    .sort((a, b) => a.toPar - b.toPar || b.thru - a.thru);
}

function printStatus() {
  const holesIn = field.reduce((n, p) => n + thru(p.id), 0);
  const total = field.length * 18;
  const b = standings();
  console.log(
    `\n  ${PROFILE} · ${running ? "playing" : "paused"} · ${holesIn}/${total} holes` +
      ` (${Math.round((holesIn / total) * 100)}%)` +
      (b[0] ? `\n  leader: ${b[0].name}  ${fmt(b[0].toPar)}  thru ${b[0].thru}` : "") +
      "\n",
  );
}

/* ------------------------------------------------------------------ *
 * Teardown
 * ------------------------------------------------------------------ */

async function purge() {
  const { error } = await sb.rpc("purge_simulator_data");
  if (error) {
    console.log(
      `  purge RPC unavailable (${error.message}).\n` +
        "  Run supabase/schema-m17.sql once, then `select purge_simulator_data();`.",
    );
    return false;
  }
  return true;
}

async function end() {
  pause();
  process.stdout.write("Cancelling and purging ... ");
  await sb
    .from("tournaments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", TID);
  const ok = await purge();
  console.log(ok ? "done." : "cancelled (rows remain until m17 is run).");
}

/* ------------------------------------------------------------------ *
 * The console
 * ------------------------------------------------------------------ */

const fmt = (n) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
function say(msg) {
  console.log(`  ${msg}`);
}

const help = () => `
  go / resume     start the field advancing
  pause           stop it
  rate <ms>       tick interval (smaller is faster), currently ${intervalMs}
  eagle           a three on the next par five
  lead            give second place a run that changes the lead
  correction      a revision, into the corrections table (Live Ops)
  burst           the desk keying a whole group at once
  status          leader and progress
  end             cancel the tournament and purge every simulated row
  help            this list
`;

async function main() {
  if (PURGE_ONLY) {
    process.stdout.write("Purging simulated data ... ");
    const ok = await purge();
    console.log(ok ? "done." : "");
    process.exit(ok ? 0 : 1);
  }

  console.log(`\nsim:live · seed ${SEED} · profile ${PROFILE}\n`);
  await build();
  resume();
  console.log("Type a command (help for the list). The field is playing.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "sim> " });
  rl.prompt();
  rl.on("line", async (line) => {
    const [cmd, a] = line.trim().split(/\s+/);
    try {
      switch (cmd) {
        case "": break;
        case "go": case "resume": resume(); say("playing."); break;
        case "pause": pause(); say("paused."); break;
        case "rate": intervalMs = Math.max(200, Math.min(6000, Number(a) || intervalMs)); if (running) resume(); say(`rate ${intervalMs}ms.`); break;
        case "eagle": await forceEagle(); break;
        case "lead": await forceLeadChange(); break;
        case "correction": case "corr": await forceCorrection(); break;
        case "burst": await forceBurst(); break;
        case "anomaly": say("Anomaly note: the integrity heuristic runs only on desk-typed scores, never on synced ones, so a burst here shows on the board but not in the committee log. Firing a birdie burst anyway."); await forceBurst(); break;
        case "status": printStatus(); break;
        case "help": console.log(help()); break;
        case "end": case "quit": case "exit": await end(); rl.close(); return;
        default: say(`unknown command "${cmd}". Type help.`);
      }
    } catch (e) {
      say(`error: ${e?.message ?? e}`);
    }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

/* Ctrl-C should still clean up rather than abandon a live tournament. */
process.on("SIGINT", async () => {
  console.log("\n(interrupted)");
  await end();
  process.exit(0);
});

await main();
