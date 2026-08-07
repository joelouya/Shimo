/**
 * A whole field, on demand, that you can steer.
 *
 * The demo autoplay tells one curated story: Joel's group, Mutua's suspicious
 * card, a lead that resolves itself. This is the opposite - a full field with
 * no script, built so an operator can provoke the exact moments the product
 * was designed to handle and watch every surface react at once: the TV
 * producer choosing what to show, Live Ops deciding whether a card is worth a
 * look, the leaderboard reordering.
 *
 * It drives the real store, not a private copy. Every score goes through
 * `setBulkScore`, the same path the caddymaster desk uses, so the events
 * ticker, the pace flags, the integrity log and the standings are the genuine
 * article. A forced "eagle" is a three written on a par five, and the producer
 * notices it the same way it would notice a real one. Nothing here fakes a
 * reaction; it arranges the cause and lets the product respond.
 *
 * It runs only where a real tournament runs: pilot mode. In demo mode the
 * curated field is already ticking and the two would fight over the board.
 *
 * Not a test. The suites assert; this performs. Its whole purpose is to be
 * watched by a person deciding whether the behaviour feels right.
 */

import { COURSES } from "@/lib/data";
import { roundKey } from "@/lib/rounds";
import { computeStandings, generateGross, type StandingRow } from "@/lib/scoring";
import type { FieldProfile } from "@/lib/tv/types";
import type { Player, Tournament } from "@/lib/types";
import {
  addRosterMember,
  clearSimulatorData,
  createTournament,
  deleteTournament,
  requestCorrection,
  roundScores,
  savePairings,
  setBulkScore,
  simStore,
  startTournamentDay,
} from "@/lib/sim/store";

const COURSE = COURSES.find((c) => c.id === "muthaiga-main")!;
const SIM_ID = "sim-field";
const ROUND = 1;
/* Every simulated player's id starts with this, which is how the store knows
   what is safe to wipe on a rebuild without touching anything real. */
const PLAYER_PREFIX = "simp-";

/* ------------------------------------------------------------------ *
 * Profiles
 *
 * The field profile is not decoration: it is what tells the TV whether gross
 * figures mean anything, and the app already derives net-vs-gross-vs-points
 * from it. A tight championship and a wide medal are genuinely different
 * afternoons to produce, so the simulator has to be able to make both.
 * ------------------------------------------------------------------ */

export type Profile = "championship" | "medal" | "stableford";

interface ProfileSpec {
  label: string;
  blurb: string;
  format: Tournament["format"];
  fieldProfile: FieldProfile;
  coverage: "full" | "reduced" | "quiet";
  /** how the handicaps are drawn, which is the whole difference */
  handicap: (rnd: () => number) => number;
}

export const PROFILES: Record<Profile, ProfileSpec> = {
  championship: {
    label: "Tight championship",
    blurb: "Scratch to eight. Gross means something; the room is there for the golf.",
    format: "Stroke Play",
    fieldProfile: "championship",
    coverage: "full",
    handicap: (rnd) => Math.round(rnd() * 8),
  },
  medal: {
    label: "Wide club medal",
    blurb: "Handicaps nought to twenty-eight. Net is the fairer story.",
    format: "Stroke Play",
    fieldProfile: "club",
    coverage: "reduced",
    handicap: (rnd) => Math.round(rnd() * 28),
  },
  stableford: {
    label: "Stableford",
    blurb: "Points, wide field. The format compresses it before the TV has to.",
    format: "Stableford",
    fieldProfile: "stableford",
    coverage: "reduced",
    handicap: (rnd) => 4 + Math.round(rnd() * 24),
  },
};

/* ------------------------------------------------------------------ */

export interface SimStatus {
  active: boolean;
  running: boolean;
  profile: Profile | null;
  fieldSize: number;
  groups: number;
  /** holes completed across the whole field, and the total to play */
  holesIn: number;
  holesTotal: number;
  /** the current leader line, in the board's own unit */
  leader: string | null;
  /** ms between ticks; smaller is faster */
  intervalMs: number;
  lastEvent: string | null;
}

type Listener = (s: SimStatus) => void;

let running = false;
let profile: Profile | null = null;
let field: Player[] = [];
let groups: { id: string; playerIds: string[] }[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = 1400;
let lastEvent: string | null = null;
let seed = 0;
const listeners = new Set<Listener>();

/* A small deterministic stream so a session is repeatable within a run, but
   reseeded from the clock each build so two builds are not identical. */
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function mode(): "points" | "net" | "gross" {
  if (!profile) return "net";
  if (profile === "stableford") return "points";
  return PROFILES[profile].fieldProfile === "championship" ? "gross" : "net";
}

function board(): StandingRow[] {
  const s = simStore.getState();
  if (s.liveTournamentId !== SIM_ID) return [];
  const t = s.created.find((x) => x.id === SIM_ID);
  if (!t) return [];
  return computeStandings(field, roundScores(s), COURSE, t.handicapAllowance, mode());
}

function leaderLine(): string | null {
  const rows = board();
  if (!rows.length || rows[0].thru === 0) return null;
  const r = rows[0];
  const fig =
    mode() === "points"
      ? `${r.points} pts`
      : mode() === "net"
        ? fmtToPar(r.netToPar)
        : fmtToPar(r.grossToPar);
  return `${r.player.name} · ${fig} · thru ${r.thru}`;
}

function fmtToPar(n: number): string {
  if (n === 0) return "level";
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Reattach to a field the store still holds.
 *
 * The running state - which profile, which players, the timer - lives in this
 * module, not in the store, so a page reload loses it while the tournament
 * itself keeps playing. Rather than strand the operator on the build screen
 * with a live field they cannot steer, rebuild the view from what the store
 * knows. The one thing that cannot come back is the interval, so a reattached
 * field is paused until the operator resumes.
 */
function ensureHydrated() {
  if (profile !== null) return; // the module already knows what is running
  const s = simStore.getState();
  const t = s.created.find((x) => x.id === SIM_ID);
  if (!t || s.liveTournamentId !== SIM_ID) return;
  profile =
    t.format === "Stableford"
      ? "stableford"
      : t.fieldProfile === "championship"
        ? "championship"
        : "medal";
  field = s.roster.filter((p) => p.id.startsWith(PLAYER_PREFIX));
  groups = (s.pairings[roundKey(SIM_ID, ROUND)] ?? []).map((g) => ({
    id: g.id,
    playerIds: g.playerIds,
  }));
  running = false;
  lastEvent = "Reattached to a field already in progress";
}

function status(): SimStatus {
  ensureHydrated();
  const s = simStore.getState();
  const cards = s.liveTournamentId === SIM_ID ? roundScores(s) : {};
  const holesIn = field.reduce(
    (n, p) => n + (cards[p.id] ?? []).filter((v) => v != null).length,
    0,
  );
  return {
    active: profile !== null,
    running,
    profile,
    fieldSize: field.length,
    groups: groups.length,
    holesIn,
    holesTotal: field.length * 18,
    leader: leaderLine(),
    intervalMs,
    lastEvent,
  };
}

/* The last computed status, cached so a React subscriber gets a stable object
   identity between changes and does not have to recompute it on every render. */
let current: SimStatus | null = null;

function emit() {
  current = status();
  for (const fn of listeners) fn(current);
}

/**
 * Register for updates. Deliberately does not fire immediately: a subscriber
 * seeds itself from `getSimStatus`, and firing here would be a synchronous
 * setState inside an effect, which the compiler rightly objects to.
 */
export function subscribeSim(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSimStatus(): SimStatus {
  return (current ??= status());
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

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

/* Unique by construction for a field of up to FIRST×LAST: the first name
   cycles fastest, the surname advances only when it wraps, so no two players
   share a name on a leaderboard the operator is watching. */
function name(i: number): string {
  const first = FIRST[i % FIRST.length];
  const last = LAST[Math.floor(i / FIRST.length) % LAST.length];
  return `${first} ${last}`;
}

/**
 * Stand up a full field and put it on the first tee. Any previous simulated
 * tournament is cleared first, so building twice does not leave two.
 */
export function buildField(p: Profile, fieldSize = 120): SimStatus {
  teardown();
  profile = p;
  const spec = PROFILES[p];
  seed = Date.now() & 0x7fffffff;

  const size = Math.max(4, Math.min(160, Math.round(fieldSize / 4) * 4));
  field = Array.from({ length: size }, (_, i) => ({
    id: `simp-${i}`,
    clubId: "muthaiga",
    name: name(i),
    handicap: spec.handicap(rnd),
    gender: i % 4 === 0 ? ("F" as const) : ("M" as const),
  }));

  groups = [];
  for (let g = 0; g * 4 < size; g++) {
    groups.push({
      id: `simg-${g + 1}`,
      playerIds: field.slice(g * 4, g * 4 + 4).map((pl) => pl.id),
    });
  }

  const t: Tournament = {
    id: SIM_ID,
    name: "Simulated Field",
    clubId: "muthaiga",
    courseId: COURSE.id,
    date: new Date().toISOString().slice(0, 10),
    format: spec.format,
    entryFee: 0,
    status: "upcoming",
    membersOnly: false,
    divisions: [{ name: "Overall", range: [0, 36] }],
    description: "A simulated field, for rehearsal.",
    prizes: [],
    maxPlayers: 200,
    regCloses: new Date().toISOString().slice(0, 10),
    handicapAllowance: 95,
    firstTee: "07:00",
    teeInterval: 10,
    fieldSize: size,
    fieldProfile: spec.fieldProfile,
    tvCoverage: spec.coverage,
    rounds: [
      {
        id: "sim-r1",
        number: ROUND,
        name: "Round 1",
        date: new Date().toISOString().slice(0, 10),
        courseId: COURSE.id,
        tees: "White",
        firstTee: "07:00",
        teeInterval: 10,
        cut: null,
      },
    ],
  };

  createTournament(t);
  for (const pl of field) addRosterMember(pl);
  savePairings(
    SIM_ID,
    groups.map((g, i) => ({
      id: g.id,
      number: i + 1,
      teeTime: "07:00",
      playerIds: g.playerIds,
    })),
    ROUND,
  );
  startTournamentDay(SIM_ID, ROUND);
  lastEvent = `Built ${size} players in ${groups.length} groups`;
  running = false;
  emit();
  return status();
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

function thruOf(pid: string): number {
  const cards = roundScores(simStore.getState());
  return (cards[pid] ?? []).filter((v) => v != null).length;
}

function groupThru(g: { playerIds: string[] }): number {
  return Math.min(...g.playerIds.map(thruOf));
}

/** One advance: move the least-far-along groups on by a hole. */
function step() {
  const playing = groups.filter((g) => groupThru(g) < 18);
  if (!playing.length) {
    pause();
    lastEvent = "Every card is complete";
    emit();
    return;
  }
  // the back of the field moves first, the way a real field bunches and clears
  playing.sort((a, b) => groupThru(a) - groupThru(b));
  const advancing = playing.slice(0, Math.max(1, Math.round(playing.length / 6)));
  for (const g of advancing) {
    const h = groupThru(g);
    if (h >= 18) continue;
    for (const pid of g.playerIds) {
      if (thruOf(pid) !== h) continue; // do not overwrite a hole already in
      const player = field.find((pl) => pl.id === pid)!;
      setBulkScore(pid, h, generateGross(COURSE.holes[h], player.handicap, rnd));
    }
  }
  emit();
}

export function resume(): SimStatus {
  if (!profile) return status();
  if (timer) clearInterval(timer);
  running = true;
  timer = setInterval(step, intervalMs);
  emit();
  return status();
}

/** One advance, exposed so a headless harness can drive the field without a
 *  wall-clock interval. The UI never calls this; `resume` owns the timer. */
export function stepOnce(): SimStatus {
  step();
  return status();
}

export function pause(): SimStatus {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  emit();
  return status();
}

export function setRate(ms: number): SimStatus {
  intervalMs = Math.max(200, Math.min(4000, Math.round(ms)));
  if (running) resume();
  else emit();
  return status();
}

export function teardown(): SimStatus {
  pause();
  if (simStore.getState().created.some((t) => t.id === SIM_ID)) {
    deleteTournament(SIM_ID);
  }
  // the round key is reused on the next build, so its cards, flags and roster
  // are cleared rather than left to bleed into a fresh field
  clearSimulatorData(SIM_ID, ROUND, PLAYER_PREFIX);
  profile = null;
  field = [];
  groups = [];
  lastEvent = null;
  emit();
  return status();
}

/* ------------------------------------------------------------------ *
 * Forced events
 *
 * Each one arranges a real cause. It does not tell the TV what to say; it puts
 * a fact on a card and lets every surface decide for itself what that fact is
 * worth. That is the point of watching.
 * ------------------------------------------------------------------ */

/** A player mid-round, so there is a card to disturb. */
function someoneMidRound(pred?: (p: Player) => boolean): Player | null {
  const candidates = field.filter((p) => {
    const t = thruOf(p.id);
    return t > 0 && t < 18 && (!pred || pred(p));
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(rnd() * candidates.length)];
}

const PAR5S = COURSE.holes
  .map((h, i) => (h.par === 5 ? i : -1))
  .filter((i) => i >= 0);

/** Write a real eagle: a three on the next par five ahead of a mid-round card. */
export function forceEagle(): SimStatus {
  // a player with at least one par five still in front of them
  const lastPar5 = PAR5S[PAR5S.length - 1];
  const player = field.find((p) => {
    const t = thruOf(p.id);
    return t > 0 && t <= lastPar5;
  });
  if (!player) {
    lastEvent = "Every group is past the last par five";
    emit();
    return status();
  }
  const from = thruOf(player.id);
  const par5 = PAR5S.find((i) => i >= from)!;
  // fill up to the par five honestly, then drop the eagle on it
  for (let h = from; h < par5; h++) {
    setBulkScore(player.id, h, generateGross(COURSE.holes[h], player.handicap, rnd));
  }
  setBulkScore(player.id, par5, 3);
  lastEvent = `Eagle written · ${player.name} on the ${ordinal(par5 + 1)}`;
  emit();
  return status();
}

/**
 * Make the lead actually change hands: give whoever is second a run good
 * enough to pass first on the holes they have left, then let the producer
 * notice. Nothing is announced here; the standings simply move.
 */
export function forceLeadChange(): SimStatus {
  const rows = board();
  if (rows.length < 2 || rows[0].thru === 0) {
    lastEvent = "Nobody has posted enough for a lead to change yet";
    emit();
    return status();
  }
  const challenger = field.find((p) => p.id === rows[1].player.id)!;
  // three birdies-or-better in a row, which will move any board it can move
  let h = thruOf(challenger.id);
  for (let i = 0; i < 3 && h < 18; i++, h++) {
    const par = COURSE.holes[h].par;
    setBulkScore(challenger.id, h, Math.max(2, par - 1));
  }
  const after = board();
  const moved = after[0]?.player.id !== rows[0].player.id;
  lastEvent = moved
    ? `Lead changed · ${after[0].player.name} ahead`
    : `${challenger.name} charged; the lead held`;
  emit();
  return status();
}

/** A correction request on a hole already played, the amber Live Ops reviews. */
export function forceCorrection(): SimStatus {
  const player = someoneMidRound();
  if (!player) {
    lastEvent = "No card is far enough along to correct";
    emit();
    return status();
  }
  const hole = Math.max(0, thruOf(player.id) - 1);
  const current = roundScores(simStore.getState())[player.id]?.[hole] ?? 4;
  const proposed = Math.max(1, current - 1);
  requestCorrection(
    player.id,
    hole,
    proposed,
    "Marker and player agreed the figure was keyed wrong at the turn.",
  );
  lastEvent = `Correction requested · ${player.name}, hole ${hole + 1}`;
  emit();
  return status();
}

/**
 * Provoke the integrity heuristic honestly: take a high-handicap player and
 * give them a burst so good the pace of their scoring outruns expectation. In
 * pilot mode that lands in the committee log, quietly, exactly as designed. It
 * is not planted there; the detector finds it.
 */
export function forceAnomaly(): SimStatus {
  const player =
    someoneMidRound((p) => p.handicap >= 18) ??
    field.filter((p) => p.handicap >= 18)[0] ??
    null;
  if (!player) {
    lastEvent = "This profile has no high handicap to flag";
    emit();
    return status();
  }
  // fill to at least nine holes of near-perfect golf; the heuristic wakes at
  // roughly nine with points well ahead of a high handicap's expectation
  let h = thruOf(player.id);
  const target = Math.min(18, Math.max(h, 10));
  while (h < target) {
    setBulkScore(player.id, h, COURSE.holes[h].par - 1);
    h++;
  }
  lastEvent = `Anomaly provoked · ${player.name} (HC ${player.handicap})`;
  emit();
  return status();
}

/**
 * A caddymaster catching a group up: the desk keys several holes of a paper
 * card in one go. The board jumps rather than creeps, which is the case the
 * pace and standings logic has to absorb without flinching.
 */
export function forceCaddyBurst(): SimStatus {
  const behind = groups
    .filter((g) => groupThru(g) < 18)
    .sort((a, b) => groupThru(a) - groupThru(b))[0];
  if (!behind) {
    lastEvent = "No group is behind enough to catch up";
    emit();
    return status();
  }
  const from = groupThru(behind);
  const to = Math.min(18, from + 5);
  for (const pid of behind.playerIds) {
    const player = field.find((p) => p.id === pid)!;
    for (let h = thruOf(pid); h < to; h++) {
      setBulkScore(pid, h, generateGross(COURSE.holes[h], player.handicap, rnd));
    }
  }
  lastEvent = `Desk burst · group of ${behind.playerIds.length} caught up to the ${ordinal(to)}`;
  emit();
  return status();
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
