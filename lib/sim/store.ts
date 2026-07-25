"use client";

/**
 * The live-tournament simulation store.
 *
 * One deterministic initial state (seeded PRNG) so server render, first client
 * paint, and every open tab agree. After that, whichever tab is "leader" runs
 * the field simulation; every mutation is versioned, persisted to
 * localStorage, and broadcast over a BroadcastChannel so the golfer phone and
 * the admin laptop stay in lockstep.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import {
  COURSES,
  clubById,
  DEMO_USER_ID,
  GROUPS,
  LIVE_TOURNAMENT_ID,
  MARKER_ID,
  PLAYERS,
  TOURNAMENTS,
  USER_GROUP_ID,
  playerById,
} from "@/lib/data";
import {
  applyCut,
  computeStandings,
  cumulativeStandings,
  generateGross,
  handicapSet,
  mulberry32,
  rowStats,
  type RoundCards,
} from "@/lib/scoring";
import {
  APP_VERSION,
  deviceFingerprint,
  distanceM,
  getGpsFix,
  newAuditId,
  scorePayload,
  sha256Hex,
  type AuditRecord,
} from "@/lib/integrity";
import { IS_PILOT } from "@/lib/mode";
import { roundKey, roundOf, roundsOf } from "@/lib/rounds";
import {
  auditToRow,
  certToRow,
  correctionToRow,
  disputeToRow,
  pairingToRow,
  playerToRow,
  rowToAudit,
  rowToCert,
  rowToCorrection,
  rowToDispute,
  rowToPairing,
  rowToPlayer,
  rowToTournament,
  tournamentToRow,
} from "@/lib/sync/mappers";
import type { HydrationSnapshot } from "@/lib/sync/remote";
import type { HoleScores, Player, Tournament } from "@/lib/types";

const COURSE = COURSES.find((c) => c.id === "muthaiga-main")!;
const LIVE_T = TOURNAMENTS.find((t) => t.id === LIVE_TOURNAMENT_ID)!;
const GRACE_ID = "p-wanjiku-g";

const STORAGE_KEY = `shimo-sim-v9-${IS_PILOT ? "pilot" : "demo"}`;
const CHANNEL = `shimo-sim-v9-${IS_PILOT ? "pilot" : "demo"}`;
const SCHEMA = 9;

/** Device-local identity — which player this phone belongs to (pilot). Kept in
 *  its own key so it survives schema resets and is never uploaded. */
const IDENTITY_KEY = "shimo-device-identity";
function readIdentity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ScoreEvent {
  id: number;
  playerId: string;
  hole: number; // 1-based
  gross: number;
  par: number;
  ts: number;
}

export interface OpsFlag {
  id: string;
  kind: "amber" | "red";
  groupId: string;
  playerId?: string;
  hole?: number; // 1-based
  message: string;
  detail: string;
  status: "open" | "reviewed";
  ts: number;
}

export interface AppNotification {
  id: number;
  emoji: string;
  title: string;
  body?: string;
  ts: number;
}

/**
 * Deferred simulation work (the marker's phone confirming a score, Grace
 * playing her ball, a demo-mode auto-resolve). Stored in state — not in
 * setTimeout — so it survives reloads and runs on whichever tab leads.
 */
export interface EchoTask {
  kind:
    | "marker-joe"
    | "self-david"
    | "grace"
    | "auto-resolve"
    | "david-attests-joe" // David (as marker) attests Joel's card
    | "david-certifies"; // David certifies his own card
  hole: number; // 0-based index
  at: number; // epoch ms when due
}

/* ------------------------------------------------------------------ */
/* Certification (R&A 3.3b): marker attests, then player certifies     */
/* ------------------------------------------------------------------ */

export type SignMethod = "pin" | "signature" | "biometric" | "committee";

export type CertStage =
  | "in-progress"
  | "awaiting-marker"
  | "awaiting-player"
  | "certified"
  | "disputed"
  | "committee-review"
  | "dq";

export interface Certification {
  playerId: string;
  markerId: string;
  stage: CertStage;
  markerAttestedAt?: number;
  playerCertifiedAt?: number;
  markerMethod?: SignMethod;
  playerMethod?: SignMethod;
  /** finger-drawn signature path data, when that method was used */
  markerSignatureSvg?: string;
  playerSignatureSvg?: string;
  lockedHash?: string;
}

export interface Dispute {
  id: string;
  playerId: string;
  /** which round's card this concerns (1-based) */
  round: number;
  holeIdx: number; // 0-based
  markerValue: number | null;
  playerValue: number | null;
  markerEnteredAt: number;
  playerEnteredAt: number;
  reason: string;
  raisedBy: string;
  ts: number;
  status: "open" | "resolved";
  resolution?: string;
}

export interface CorrectionRequest {
  id: string;
  playerId: string;
  /** which round's card this concerns (1-based) */
  round: number;
  holeIdx: number; // 0-based
  currentGross: number | null;
  proposedGross: number;
  reason: string;
  ts: number;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decisionReason?: string;
  decidedAt?: number;
}

export interface SignatureArtifact {
  method: SignMethod;
  /** svg path data for finger-drawn signatures */
  svg?: string;
}

/** A playing group as saved with a tournament (pairings screen output). */
export interface SavedGroup {
  id: string;
  number: number;
  teeTime: string;
  playerIds: string[];
}

/**
 * A queued write in the local-first outbox. Everything lands in local state
 * instantly; the sync engine pushes ops to the remote (Supabase when
 * configured, simulated otherwise) and marks them off.
 */
export interface SyncOp {
  id: string;
  /** score/resolve → scores table; entity → a mapped row on a state table */
  kind: "score" | "resolve" | "entity";
  payload: Record<string, unknown>;
  ts: number;
  status: "pending" | "synced" | "failed";
  attempts: number;
  firstTriedAt?: number;
}

export interface SimState {
  schema: number;
  v: number;
  demoMode: boolean;
  /** scoreboard blindness — hide leaderboard references during the round */
  hideLeaderboard: boolean;
  /**
   * Each player's card as entered on their own phone (source of truth),
   * filed under roundKey(tournamentId, round) then player id. A multi-round
   * tournament keeps every round's cards side by side.
   */
  scores: Record<string, Record<string, HoleScores>>;
  /** what each player's MARKER has recorded for them, same keying */
  markerScores: Record<string, Record<string, HoleScores>>;
  /** discrepancy hole indices (0-based) the user has resolved */
  resolved: number[];
  attested: boolean;
  events: ScoreEvent[];
  flags: OpsFlag[];
  notifications: AppNotification[];
  lastUserPos: number;
  /** tournament ids the user registered for in this session */
  registrations: string[];
  /** tournaments created through the admin wizard */
  created: Tournament[];
  mutuaFlagged: boolean;
  extraAmberFired: boolean;
  pendingEchoes: EchoTask[];
  /** the club's member roster (editable in Members) */
  roster: Player[];
  /** saved pairings per roundKey(tournamentId, round) */
  pairings: Record<string, SavedGroup[]>;
  /** which tournament is being played today (null = none) */
  liveTournamentId: string | null;
  /** which round of it is on the course now (1-based) */
  liveRound: number;
  /** bulk entry: paper card fully entered + checked, per roundKey then player */
  cardIn: Record<string, Record<string, boolean>>;
  /** pilot: anomalies logged quietly for committee review, never alerted */
  integrityLog: OpsFlag[];
  /** local-first sync queue */
  outbox: SyncOp[];
  lastSyncedAt: number | null;
  /* ---- certification & compliance (v7) ---- */
  /** per roundKey then player: a card is certified one round at a time */
  certifications: Record<string, Record<string, Certification>>;
  /** append-only; committee interventions append, never overwrite */
  auditLog: AuditRecord[];
  disputes: Dispute[];
  corrections: CorrectionRequest[];
  userPin: string | null;
  adminPin: string | null;
  signMethod: SignMethod;
  tonePref: "editorial" | "classic";
  locationConsent: "unset" | "granted" | "declined";
  /** which player this device is (pilot); null until picked */
  deviceIdentity: string | null;
  /* ---- auth & onboarding (v8 / M2) ---- */
  /** signed-in email (magic link); null when signed out */
  authEmail: string | null;
  /** Supabase auth user id; null when signed out */
  authUserId: string | null;
  /** first-run onboarding completed or skipped on this device */
  onboarded: boolean;
}

/* ------------------------------------------------------------------ */
/* Initial state — deterministic                                       */
/* ------------------------------------------------------------------ */

const HOLES_PLAYED: Record<string, number> = {
  g1: 10, g2: 9, g3: 9, g4: 8, g5: 3, g6: 7,
  g7: 6, g8: 5, g9: 5, g10: 4, g11: 3, g12: 2,
};

const BIAS: Record<string, number> = {
  "p-mutua-d": -0.65, // the anomaly — HC 24 playing out of his skin
  "p-ochieng-s": -0.35,
  "p-fraser-i": -0.25,
};

function emptyCard(): HoleScores {
  return Array(18).fill(null);
}

export function buildInitialState(): SimState {
  // Demo plays a single round of the seeded tournament; pilot starts empty and
  // fills in when the club starts a round.
  const DEMO_KEY = roundKey(LIVE_TOURNAMENT_ID, 1);
  const cards: Record<string, HoleScores> = {};
  const markerCards: Record<string, HoleScores> = {};

  const roster = IS_PILOT
    ? PLAYERS.filter((p) => p.clubId === "muthaiga")
    : [...PLAYERS];

  for (const p of roster) {
    cards[p.id] = emptyCard();
    markerCards[p.id] = emptyCard();
  }

  if (!IS_PILOT) {
    const rnd = mulberry32(20260717);
    for (const g of GROUPS) {
      const played = HOLES_PLAYED[g.id] ?? 0;
      for (const pid of g.playerIds) {
        if (g.id === USER_GROUP_ID) continue;
        cards[pid] ??= emptyCard();
        markerCards[pid] ??= emptyCard();
        const hc = playerById(pid).handicap;
        for (let h = 0; h < played; h++) {
          const gross = generateGross(COURSE.holes[h], hc, rnd, BIAS[pid] ?? 0);
          cards[pid][h] = gross;
          markerCards[pid][h] = gross;
        }
      }
    }

    // the user's group: three holes in, everything agreed so far
    const seeded: Record<string, number[]> = {
      [DEMO_USER_ID]: [4, 5, 5],
      [MARKER_ID]: [5, 6, 5],
      [GRACE_ID]: [4, 5, 4],
    };
    for (const [pid, arr] of Object.entries(seeded)) {
      cards[pid] ??= emptyCard();
      markerCards[pid] ??= emptyCard();
      arr.forEach((gross, i) => {
        cards[pid][i] = gross;
        markerCards[pid][i] = gross;
      });
    }
  }

  const state: SimState = {
    schema: SCHEMA,
    v: 1,
    demoMode: false,
    hideLeaderboard: false,
    scores: IS_PILOT ? {} : { [DEMO_KEY]: cards },
    markerScores: IS_PILOT ? {} : { [DEMO_KEY]: markerCards },
    resolved: [],
    attested: false,
    events: [],
    flags: [],
    notifications: [],
    lastUserPos: 0,
    registrations: [],
    created: [],
    mutuaFlagged: false,
    extraAmberFired: false,
    pendingEchoes: [],
    roster,
    pairings: IS_PILOT
      ? {}
      : {
          [DEMO_KEY]: GROUPS.map((g) => ({
            id: g.id,
            number: g.number,
            teeTime: g.teeTime,
            playerIds: [...g.playerIds],
          })),
        },
    liveTournamentId: IS_PILOT ? null : LIVE_TOURNAMENT_ID,
    liveRound: 1,
    cardIn: {},
    integrityLog: [],
    outbox: [],
    lastSyncedAt: null,
    certifications: {},
    auditLog: [],
    disputes: [],
    corrections: [],
    userPin: null,
    adminPin: null,
    signMethod: "pin",
    tonePref: "editorial",
    locationConsent: "unset",
    deviceIdentity: readIdentity(),
    authEmail: null,
    authUserId: null,
    onboarded: false,
  };
  if (!IS_PILOT) state.lastUserPos = userPosition(state);
  return state;
}

/* ------------------------------------------------------------------ */
/* Round-scoped accessors                                              */
/* ------------------------------------------------------------------ */

/** The roundKey of whatever is on the course right now. */
export function liveKey(s: SimState): string {
  return roundKey(s.liveTournamentId ?? LIVE_TOURNAMENT_ID, s.liveRound || 1);
}

/** Every player's card for a round, creating the bucket if absent. */
function cardsFor(draft: SimState, key: string): Record<string, HoleScores> {
  return (draft.scores[key] ??= {});
}
function markerCardsFor(draft: SimState, key: string): Record<string, HoleScores> {
  return (draft.markerScores[key] ??= {});
}
function certsFor(draft: SimState, key: string): Record<string, Certification> {
  return (draft.certifications[key] ??= {});
}
function cardInFor(draft: SimState, key: string): Record<string, boolean> {
  return (draft.cardIn[key] ??= {});
}

/** Read-only round views, safe when the round has no data yet. */
export const EMPTY_CARDS: Record<string, HoleScores> = {};
export function roundScores(s: SimState, key?: string): Record<string, HoleScores> {
  return s.scores[key ?? liveKey(s)] ?? EMPTY_CARDS;
}
export function roundMarkerScores(
  s: SimState,
  key?: string,
): Record<string, HoleScores> {
  return s.markerScores[key ?? liveKey(s)] ?? EMPTY_CARDS;
}
const EMPTY_CERTS: Record<string, Certification> = {};
export function roundCerts(
  s: SimState,
  key?: string,
): Record<string, Certification> {
  return s.certifications[key ?? liveKey(s)] ?? EMPTY_CERTS;
}
const EMPTY_CARD_IN: Record<string, boolean> = {};
export function roundCardIn(s: SimState, key?: string): Record<string, boolean> {
  return s.cardIn[key ?? liveKey(s)] ?? EMPTY_CARD_IN;
}
const EMPTY_GROUPS: SavedGroup[] = [];
export function roundPairings(s: SimState, key?: string): SavedGroup[] {
  return s.pairings[key ?? liveKey(s)] ?? EMPTY_GROUPS;
}

function userPosition(s: SimState): number {
  const fieldIds = GROUPS.flatMap((g) => g.playerIds);
  const field = PLAYERS.filter((p) => fieldIds.includes(p.id));
  const rows = computeStandings(
    field,
    roundScores(s),
    COURSE,
    LIVE_T.handicapAllowance,
    "points",
  );
  return rows.find((r) => r.player.id === DEMO_USER_ID)?.position ?? 0;
}

/* ------------------------------------------------------------------ */
/* Store + sync plumbing                                               */
/* ------------------------------------------------------------------ */

export const simStore = createStore<SimState>(() => buildInitialState());

const isClient = typeof window !== "undefined";
let channel: BroadcastChannel | null = null;
let applyingRemote = false;
let eventSeq = 1;
let noteSeq = 1;
const tabId = Math.random().toString(36).slice(2);

function persist(s: SimState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

function mutate(fn: (draft: SimState) => void) {
  const draft = structuredClone(simStore.getState());
  fn(draft);
  // timestamp-based versions keep concurrent tabs from colliding on the
  // same version number and ignoring each other's writes
  draft.v = Math.max(draft.v + 1, Date.now());
  simStore.setState(draft, true);
  if (isClient && !applyingRemote) {
    persist(draft);
    channel?.postMessage({ type: "state", state: draft });
  }
}

function receive(remote: SimState) {
  if (remote.schema !== SCHEMA) return;
  if (remote.v <= simStore.getState().v) return;
  applyingRemote = true;
  simStore.setState(remote, true);
  applyingRemote = false;
}

/* ---- leader election: only one tab runs the field simulation ---- */

let isLeader = false;

function leaderLoop() {
  const KEY = "shimo-leader";
  const now = Date.now();
  try {
    const raw = localStorage.getItem(KEY);
    const cur = raw ? (JSON.parse(raw) as { id: string; ts: number }) : null;
    if (!cur || cur.id === tabId || now - cur.ts > 3500) {
      localStorage.setItem(KEY, JSON.stringify({ id: tabId, ts: now }));
      isLeader = true;
    } else {
      isLeader = false;
    }
  } catch {
    isLeader = true;
  }
}

/* ------------------------------------------------------------------ */
/* The field simulation                                                */
/* ------------------------------------------------------------------ */

function groupThru(s: SimState, groupId: string): number {
  const g = GROUPS.find((x) => x.id === groupId)!;
  const cards = roundScores(s);
  return Math.min(
    ...g.playerIds.map(
      (pid) => (cards[pid] ?? []).filter((x) => x != null).length,
    ),
  );
}

function pushEvent(draft: SimState, playerId: string, holeIdx: number, gross: number) {
  draft.events.unshift({
    id: eventSeq++ + Math.floor(Math.random() * 1000) * 100000,
    playerId,
    hole: holeIdx + 1,
    gross,
    par: COURSE.holes[holeIdx].par,
    ts: Date.now(),
  });
  draft.events = draft.events.slice(0, 24);
}

function checkStoryFlags(draft: SimState) {
  // red flag — the HC-24 player scoring far beyond expectation
  if (!draft.mutuaFlagged) {
    const mutua = playerById("p-mutua-d");
    const st = rowStats(
      mutua,
      roundScores(draft)["p-mutua-d"] ?? emptyCard(),
      COURSE,
      LIVE_T.handicapAllowance,
    );
    if (st.thru >= 8 && st.points >= st.thru * 2.2) {
      draft.mutuaFlagged = true;
      draft.flags.unshift({
        id: "flag-mutua",
        kind: "red",
        groupId: "g10",
        playerId: "p-mutua-d",
        message: "Pace flag · Dennis Mutua",
        detail: `Scoring ${st.points} pts through ${st.thru}, well ahead of expectation for a 24 handicap. Nothing to act on mid-round; worth a friendly look at recent cards after play.`,
        status: "open",
        ts: Date.now(),
      });
    }
  }
  // a second amber elsewhere in the field, so Live Ops has texture
  if (!draft.extraAmberFired && groupThru(draft, "g3") >= 12) {
    draft.extraAmberFired = true;
    draft.flags.unshift({
      id: "flag-g3",
      kind: "amber",
      groupId: "g3",
      playerId: "p-kimani-r",
      hole: 11,
      message: "Marker discrepancy · Group 3, hole 11",
      detail:
        "Robert Kimani's card shows 5; his marker recorded 6. Both phones have been prompted to re-confirm at the next tee.",
      status: "open",
      ts: Date.now(),
    });
  }
}

function maybeNotifyPosition(draft: SimState) {
  const pos = userPosition(draft);
  const prev = draft.lastUserPos;
  draft.lastUserPos = pos;
  if (pos < prev && pos <= 3 && !draft.attested) {
    const st = rowStats(
      playerById(DEMO_USER_ID),
      roundScores(draft)[DEMO_USER_ID] ?? emptyCard(),
      COURSE,
      LIVE_T.handicapAllowance,
    );
    const place = pos === 1 ? "the lead" : pos === 2 ? "2nd place" : "3rd place";
    draft.notifications.unshift({
      id: noteSeq++ + Math.floor(Math.random() * 1000) * 100000,
      emoji: "🏆",
      title: pos === 1 ? `You've taken the lead at Muthaiga Captain's Prize` : `You've moved into ${place} at Muthaiga Captain's Prize`,
      body: `${st.points} pts through ${st.thru}`,
      ts: Date.now(),
    });
    draft.notifications = draft.notifications.slice(0, 8);
  }
}

function advanceGroup(draft: SimState, groupId: string) {
  const g = GROUPS.find((x) => x.id === groupId)!;
  const h = groupThru(draft, groupId);
  if (h >= 18) return;
  const key = liveKey(draft);
  const cards = cardsFor(draft, key);
  const marks = markerCardsFor(draft, key);
  for (const pid of g.playerIds) {
    const gross = generateGross(
      COURSE.holes[h],
      playerById(pid).handicap,
      Math.random,
      BIAS[pid] ?? 0,
    );
    (cards[pid] ??= emptyCard())[h] = gross;
    (marks[pid] ??= emptyCard())[h] = gross;
    pushEvent(draft, pid, h, gross);
  }
}

function fieldTick() {
  const s = simStore.getState();
  const candidates = GROUPS.filter(
    (g) => g.id !== USER_GROUP_ID && groupThru(s, g.id) < 18,
  );
  if (!candidates.length) return;
  const n = s.demoMode ? 2 : 1;
  mutate((draft) => {
    for (let i = 0; i < n; i++) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      advanceGroup(draft, pick.id);
    }
    checkStoryFlags(draft);
    maybeNotifyPosition(draft);
  });
}

/* ------------------------------------------------------------------ */
/* User actions (the golfer's phone)                                   */
/* ------------------------------------------------------------------ */

function queueEcho(draft: SimState, task: EchoTask) {
  if (!draft.pendingEchoes.some((t) => t.kind === task.kind && t.hole === task.hole)) {
    draft.pendingEchoes.push(task);
  }
}

/** Apply one due echo task. Returns silently if it no longer applies. */
function applyEcho(draft: SimState, task: EchoTask) {
  const h = task.hole;
  const key = liveKey(draft);
  const cards = cardsFor(draft, key);
  const marks = markerCardsFor(draft, key);
  if (task.kind === "marker-joe") {
    // "David's phone" confirms the user's own score —
    // except hole 4, where he has the user down for one more.
    const own = (cards[DEMO_USER_ID] ??= emptyCard())[h];
    if (own == null || (marks[DEMO_USER_ID] ??= emptyCard())[h] != null) return;
    const echo = h === 3 && !draft.resolved.includes(3) ? own + 1 : own;
    marks[DEMO_USER_ID][h] = echo;
    if (echo !== own) {
      draft.flags.unshift({
        id: `flag-user-h${h + 1}`,
        kind: "amber",
        groupId: USER_GROUP_ID,
        playerId: DEMO_USER_ID,
        hole: h + 1,
        message: `Marker discrepancy · Group 5, hole ${h + 1}`,
        detail: `Joel Ouya's card shows ${own}; David Kamau recorded ${echo}. Both players have been prompted to check at the next tee.`,
        status: "open",
        ts: Date.now(),
      });
      if (draft.demoMode) {
        queueEcho(draft, { kind: "auto-resolve", hole: h, at: Date.now() + 5200 });
      }
    }
  } else if (task.kind === "self-david") {
    // David's own phone agrees with what the user entered for him
    const marked = (marks[MARKER_ID] ??= emptyCard())[h];
    if (marked == null || (cards[MARKER_ID] ??= emptyCard())[h] != null) return;
    cards[MARKER_ID][h] = marked;
    pushEvent(draft, MARKER_ID, h, marked);
  } else if (task.kind === "grace") {
    // Grace plays alongside; her card fills in as the group moves through
    if ((cards[GRACE_ID] ??= emptyCard())[h] != null) return;
    const gross = generateGross(COURSE.holes[h], playerById(GRACE_ID).handicap, Math.random);
    cards[GRACE_ID][h] = gross;
    (marks[GRACE_ID] ??= emptyCard())[h] = gross;
    pushEvent(draft, GRACE_ID, h, gross);
  } else if (task.kind === "auto-resolve") {
    // demo mode settles the discrepancy hands-free
    if (!draft.demoMode || draft.resolved.includes(h)) return;
    const own = (cards[DEMO_USER_ID] ??= emptyCard())[h];
    if (own == null) return;
    (marks[DEMO_USER_ID] ??= emptyCard())[h] = own;
    draft.resolved.push(h);
    const flag = draft.flags.find((f) => f.id === `flag-user-h${h + 1}`);
    if (flag) flag.status = "reviewed";
  }
}

/** Leader-only: run any due echo tasks. */
function processEchoes() {
  if (!isLeader) return;
  const now = Date.now();
  const s = simStore.getState();
  if (!s.pendingEchoes.some((t) => t.at <= now)) return;
  const certTasks: EchoTask[] = [];
  mutate((draft) => {
    const due = draft.pendingEchoes.filter((t) => t.at <= now);
    draft.pendingEchoes = draft.pendingEchoes.filter((t) => t.at > now);
    for (const task of due) {
      if (task.kind === "david-attests-joe" || task.kind === "david-certifies") {
        certTasks.push(task); // these run through the public actions below
      } else {
        applyEcho(draft, task);
      }
    }
    maybeNotifyPosition(draft);
  });
  // David's phone doing its half of the certification ceremony
  for (const task of certTasks) {
    if (task.kind === "david-attests-joe") {
      markerAttest(DEMO_USER_ID, MARKER_ID, { method: "pin" });
    } else if (task.kind === "david-certifies") {
      const cert = roundCerts(simStore.getState())[MARKER_ID];
      if (cert?.stage === "awaiting-player") {
        void playerCertify(MARKER_ID, { method: "pin" });
      }
    }
  }
}

/** Queue a write for the sync engine. Local state is already updated. */
function enqueueOp(
  draft: SimState,
  kind: SyncOp["kind"],
  payload: Record<string, unknown>,
) {
  draft.outbox.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    ts: Date.now(),
    status: "pending",
    attempts: 0,
  });
  draft.outbox = draft.outbox.slice(-600);
}

/** Queue a mapped state row (tournament, pairing, cert, …) for the remote. */
function enqueueEntity(
  draft: SimState,
  table: string,
  row: Record<string, unknown>,
  opts: { conflict?: string; insertOnly?: boolean } = {},
) {
  enqueueOp(draft, "entity", {
    table,
    row,
    conflict: opts.conflict,
    insertOnly: opts.insertOnly,
  });
}

function syncCert(draft: SimState, playerId: string) {
  const c = roundCerts(draft)[playerId];
  if (!c) return;
  enqueueEntity(
    draft,
    "certifications",
    certToRow(activeTournamentOf(draft).id, draft.liveRound, c),
    { conflict: "tournament_id,round,player_id" },
  );
}

function syncAuditTail(draft: SimState, count: number) {
  for (const rec of draft.auditLog.slice(-count)) {
    enqueueEntity(draft, "audit_log", auditToRow(rec), { insertOnly: true });
  }
}

/** Make sure both card views exist for a player in a round. */
function ensureCard(draft: SimState, pid: string, key = liveKey(draft)) {
  cardsFor(draft, key)[pid] ??= emptyCard();
  markerCardsFor(draft, key)[pid] ??= emptyCard();
}

export function enterOwnScore(holeIdx: number, gross: number) {
  mutate((draft) => {
    const key = liveKey(draft);
    ensureCard(draft, DEMO_USER_ID, key);
    cardsFor(draft, key)[DEMO_USER_ID][holeIdx] = gross;
    markerCardsFor(draft, key)[DEMO_USER_ID][holeIdx] = null; // marker re-confirms
    pushEvent(draft, DEMO_USER_ID, holeIdx, gross);
    queueEcho(draft, { kind: "marker-joe", hole: holeIdx, at: Date.now() + 1700 });
    queueEcho(draft, { kind: "grace", hole: holeIdx, at: Date.now() + 2400 });
    maybeNotifyPosition(draft);
    enqueueOp(draft, "score", { playerId: DEMO_USER_ID, hole: holeIdx, gross, source: "player" });
  });
}

export function enterMarkerScore(holeIdx: number, gross: number) {
  mutate((draft) => {
    const key = liveKey(draft);
    ensureCard(draft, MARKER_ID, key);
    markerCardsFor(draft, key)[MARKER_ID][holeIdx] = gross;
    queueEcho(draft, { kind: "self-david", hole: holeIdx, at: Date.now() + 1300 });
    enqueueOp(draft, "score", { playerId: MARKER_ID, hole: holeIdx, gross, source: "marker" });
  });
}

/* ------------------------------------------------------------------ */
/* Pilot dual entry: real players, real devices                        */
/* ------------------------------------------------------------------ */

/**
 * Who marks whom inside a group. Round-robin, so in a group of [A,B,C,D]
 * A marks B, B marks C, C marks D and D marks A. Every player therefore has
 * exactly one marker and marks exactly one other player, which is what
 * Rule 3.3b assumes, and it is derived from the saved pairings so every
 * device agrees without extra state.
 */
export function markedByMe(group: SavedGroup | undefined, me: string): string | null {
  if (!group) return null;
  const ids = group.playerIds;
  const i = ids.indexOf(me);
  if (i < 0 || ids.length < 2) return null;
  return ids[(i + 1) % ids.length];
}

/** The player who marks `me` (the inverse of markedByMe). */
export function markerOf(group: SavedGroup | undefined, me: string): string | null {
  if (!group) return null;
  const ids = group.playerIds;
  const i = ids.indexOf(me);
  if (i < 0 || ids.length < 2) return null;
  return ids[(i - 1 + ids.length) % ids.length];
}

/**
 * Pilot: this device's player records their own score. Lands locally at once
 * and syncs as source "player", so it never overwrites the marker's figure.
 */
export function enterOwnScorePilot(holeIdx: number, gross: number) {
  mutate((draft) => {
    const me = meId(draft);
    if (!me) return;
    const key = liveKey(draft);
    ensureCard(draft, me, key);
    cardsFor(draft, key)[me][holeIdx] = gross;
    pushEvent(draft, me, holeIdx, gross);
    enqueueOp(draft, "score", {
      playerId: me,
      round: draft.liveRound,
      hole: holeIdx,
      gross,
      source: "player",
    });
  });
}

/**
 * Pilot: this device's player, acting as marker, records what they saw their
 * playing partner score. Syncs as source "marker" against that partner.
 */
export function enterMarkerScoreFor(
  playerId: string,
  holeIdx: number,
  gross: number,
) {
  mutate((draft) => {
    const key = liveKey(draft);
    ensureCard(draft, playerId, key);
    markerCardsFor(draft, key)[playerId][holeIdx] = gross;
    enqueueOp(draft, "score", {
      playerId,
      round: draft.liveRound,
      hole: holeIdx,
      gross,
      source: "marker",
    });
  });
}

/* ------------------------------------------------------------------ */
/* Bulk entry (the caddymaster desk)                                   */
/* ------------------------------------------------------------------ */

/** Quiet integrity heuristic: log unusual cards for committee review. */
function checkIntegrity(draft: SimState, pid: string) {
  const player = draft.roster.find((p) => p.id === pid);
  if (!player || player.handicap < 15) return;
  const st = rowStats(
    player,
    roundScores(draft)[pid] ?? emptyCard(),
    COURSE,
    LIVE_T.handicapAllowance,
  );
  const already = draft.integrityLog.some((f) => f.playerId === pid);
  if (!already && st.thru >= 9 && st.points >= st.thru * 2.2) {
    draft.integrityLog.unshift({
      id: `integrity-${pid}`,
      kind: "red",
      groupId: "",
      playerId: pid,
      message: `Pace flag · ${player.name}`,
      detail: `${st.points} pts through ${st.thru}, well ahead of expectation for a ${player.handicap} handicap. Logged for committee review; nothing surfaced during play.`,
      status: "open",
      ts: Date.now(),
    });
  }
}

/** Desk entry of one cell from a paper card. Both card views stay agreed. */
export function setBulkScore(pid: string, holeIdx: number, gross: number | null) {
  mutate((draft) => {
    const key = liveKey(draft);
    ensureCard(draft, pid, key);
    const cards = cardsFor(draft, key);
    const prev = cards[pid][holeIdx];
    cards[pid][holeIdx] = gross;
    markerCardsFor(draft, key)[pid][holeIdx] = gross;
    if (gross != null && gross !== prev) pushEvent(draft, pid, holeIdx, gross);
    if (IS_PILOT) checkIntegrity(draft, pid);
    else maybeNotifyPosition(draft);
    enqueueOp(draft, "score", {
      playerId: pid,
      round: draft.liveRound,
      hole: holeIdx,
      gross,
      source: "desk",
    });
  });
}

export function setCardIn(pid: string, on: boolean) {
  mutate((draft) => {
    cardInFor(draft, liveKey(draft))[pid] = on;
    enqueueEntity(
      draft,
      "card_in",
      {
        tournament_id: activeTournamentOf(draft).id,
        round: draft.liveRound,
        player_id: pid,
        is_in: on,
        updated_at: new Date().toISOString(),
      },
      { conflict: "tournament_id,round,player_id" },
    );
  });
}

/* ------------------------------------------------------------------ */
/* Roster + pairings + tournament day                                  */
/* ------------------------------------------------------------------ */

export function addRosterMember(p: Player) {
  mutate((draft) => {
    draft.roster.unshift(p);
    ensureCard(draft, p.id);
    enqueueEntity(draft, "players", playerToRow(p), { conflict: "id" });
  });
}

export function updateRosterMember(id: string, patch: Partial<Player>) {
  mutate((draft) => {
    draft.roster = draft.roster.map((m) => (m.id === id ? { ...m, ...patch } : m));
    const updated = draft.roster.find((m) => m.id === id);
    if (updated) enqueueEntity(draft, "players", playerToRow(updated), { conflict: "id" });
  });
}

/** Pairings are per round: leaders get re-paired for the next one. */
export function savePairings(
  tournamentId: string,
  groups: SavedGroup[],
  round = 1,
) {
  mutate((draft) => {
    draft.pairings[roundKey(tournamentId, round)] = groups;
    // only publish pairings for a tournament that already exists in the cloud
    if (draft.liveTournamentId === tournamentId) {
      for (const g of groups) {
        enqueueEntity(draft, "pairings", pairingToRow(tournamentId, round, g), {
          conflict: "tournament_id,round,group_id",
        });
      }
    }
  });
}

/**
 * Pilot: flip a created tournament into today's live event. This is the
 * "publish" moment — the tournament, its pairings, and every player in the
 * field go to the cloud so any device that joins hydrates the whole thing.
 */
export function startTournamentDay(tournamentId: string, round = 1) {
  mutate((draft) => {
    draft.liveTournamentId = tournamentId;
    draft.liveRound = round;
    const t = draft.created.find((x) => x.id === tournamentId);
    if (t) t.status = "live";
    const key = roundKey(tournamentId, round);
    const groups = draft.pairings[key] ?? [];
    for (const g of groups) {
      for (const pid of g.playerIds) ensureCard(draft, pid, key);
    }
    // publish everything a joining device needs
    if (t) enqueueEntity(draft, "tournaments", tournamentToRow(t), { conflict: "id" });
    for (const g of groups) {
      enqueueEntity(draft, "pairings", pairingToRow(tournamentId, round, g), {
        conflict: "tournament_id,round,group_id",
      });
    }
    const fieldIds = new Set(groups.flatMap((g) => g.playerIds));
    for (const p of draft.roster) {
      if (fieldIds.has(p.id)) {
        enqueueEntity(draft, "players", playerToRow(p), { conflict: "id" });
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Round lifecycle                                                     */
/* ------------------------------------------------------------------ */

/** Every round's cards plus the course it was played on, for cumulative work. */
export function roundCardsOf(s: SimState, t: Tournament): RoundCards[] {
  return roundsOf(t).map((r) => ({
    round: r.number,
    scores: s.scores[roundKey(t.id, r.number)] ?? EMPTY_CARDS,
    course: COURSES.find((c) => c.id === r.courseId) ?? COURSE,
  }));
}

/** The field of a given round, from that round's pairings. */
export function fieldOfRound(s: SimState, tournamentId: string, round: number) {
  return (s.pairings[roundKey(tournamentId, round)] ?? []).flatMap(
    (g) => g.playerIds,
  );
}

/**
 * Who survives the cut configured after `round`, computed from the cumulative
 * standings up to and including it. Returns null when that round has no cut.
 */
export function cutAfterRound(
  s: SimState,
  t: Tournament,
  round: number,
): { survivors: string[]; line: number | null; count: number } | null {
  const r = roundsOf(t).find((x) => x.number === round);
  if (!r?.cut || r.cut.topN <= 0) return null;
  const upTo = roundCardsOf(s, t).filter((rc) => rc.round <= round);
  const ids = new Set(
    roundsOf(t)
      .filter((x) => x.number <= round)
      .flatMap((x) => fieldOfRound(s, t.id, x.number)),
  );
  const players = [...ids]
    .map((pid) => s.roster.find((p) => p.id === pid) ?? PLAYERS.find((p) => p.id === pid))
    .filter((p): p is Player => !!p);
  const mode = t.format === "Stableford" ? "points" : "net";
  const rows = cumulativeStandings(players, upTo, t.handicapAllowance, mode);
  const cut = applyCut(rows, r.cut.topN, mode);
  return { survivors: [...cut.survivors], line: cut.line, count: cut.count };
}

/**
 * Close the round on the course and open the next one. If the round that just
 * finished has a cut, the next round's pairings are seeded with the survivors
 * in leaderboard order, leaders out last, which is how championships re-pair.
 */
export function startNextRound(tournamentId: string) {
  mutate((draft) => {
    const t = draft.created.find((x) => x.id === tournamentId);
    if (!t) return;
    const rounds = roundsOf(t);
    const current = draft.liveRound || 1;
    const next = rounds.find((r) => r.number === current + 1);
    if (!next) return;

    const nextKey = roundKey(tournamentId, next.number);
    // carry the field forward if the admin has not set this round's pairings
    if (!draft.pairings[nextKey]?.length) {
      const cut = cutAfterRound(draft, t, current);
      const carried = cut
        ? cut.survivors
        : fieldOfRound(draft, tournamentId, current);
      const ordered = orderByStandings(draft, t, current, carried);
      draft.pairings[nextKey] = groupsFromOrder(ordered, next.firstTee, next.teeInterval);
    }

    draft.liveRound = next.number;
    for (const g of draft.pairings[nextKey] ?? []) {
      for (const pid of g.playerIds) ensureCard(draft, pid, nextKey);
      enqueueEntity(draft, "pairings", pairingToRow(tournamentId, next.number, g), {
        conflict: "tournament_id,round,group_id",
      });
    }
    enqueueEntity(draft, "tournaments", tournamentToRow(t), { conflict: "id" });
  });
}

/** Leaderboard order after `throughRound`, worst first so leaders tee off last. */
export function orderByStandings(
  s: SimState,
  t: Tournament,
  throughRound: number,
  ids: string[],
): string[] {
  const players = ids
    .map((pid) => s.roster.find((p) => p.id === pid) ?? PLAYERS.find((p) => p.id === pid))
    .filter((p): p is Player => !!p);
  const mode = t.format === "Stableford" ? "points" : "net";
  const rows = cumulativeStandings(
    players,
    roundCardsOf(s, t).filter((rc) => rc.round <= throughRound),
    t.handicapAllowance,
    mode,
  );
  // reverse: the last group out is the leading group
  return rows.map((r) => r.player.id).reverse();
}

/** Split an ordered field into threes with staggered tee times. */
export function groupsFromOrder(
  ids: string[],
  firstTee: string,
  interval: number,
  size = 3,
): SavedGroup[] {
  const [hh, mm] = firstTee.split(":").map((x) => parseInt(x, 10));
  const start = (isNaN(hh) ? 7 : hh) * 60 + (isNaN(mm) ? 30 : mm);
  const groups: SavedGroup[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const n = groups.length;
    const mins = start + n * interval;
    groups.push({
      id: `g${n + 1}`,
      number: n + 1,
      teeTime: `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
      playerIds: ids.slice(i, i + size),
    });
  }
  return groups;
}

export function retryFailedOps() {
  mutate((draft) => {
    draft.outbox = draft.outbox.map((op) =>
      op.status === "failed"
        ? { ...op, status: "pending", attempts: 0, firstTriedAt: undefined }
        : op,
    );
  });
}

export function resolveDiscrepancy(playerId: string, holeIdx: number, agreed: number) {
  mutate((draft) => {
    const key = liveKey(draft);
    ensureCard(draft, playerId, key);
    cardsFor(draft, key)[playerId][holeIdx] = agreed;
    markerCardsFor(draft, key)[playerId][holeIdx] = agreed;
    if (!draft.resolved.includes(holeIdx)) draft.resolved.push(holeIdx);
    const flag = draft.flags.find((f) => f.id === `flag-user-h${holeIdx + 1}`);
    if (flag) flag.status = "reviewed";
    maybeNotifyPosition(draft);
    enqueueOp(draft, "resolve", {
      playerId,
      round: draft.liveRound,
      hole: holeIdx,
      gross: agreed,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Certification: marker attests, player certifies, card returns       */
/* ------------------------------------------------------------------ */

function ensureCert(draft: SimState, playerId: string, markerId: string) {
  const certs = certsFor(draft, liveKey(draft));
  certs[playerId] ??= { playerId, markerId, stage: "awaiting-marker" };
  return certs[playerId];
}

function pushAudit(draft: SimState, rec: Omit<AuditRecord, "id" | "appVersion">) {
  draft.auditLog.push({ ...rec, id: newAuditId(), appVersion: APP_VERSION });
}

function activeTournamentOf(draft: SimState): Tournament {
  if (!IS_PILOT) return LIVE_T;
  return draft.created.find((t) => t.id === draft.liveTournamentId) ?? LIVE_T;
}

/** Stage A: the marker attests the card of the player they marked. */
export function markerAttest(
  playerId: string,
  markerId: string,
  artifact: SignatureArtifact,
) {
  mutate((draft) => {
    const t = activeTournamentOf(draft);
    const cert = ensureCert(draft, playerId, markerId);
    if (cert.stage === "disputed" || cert.stage === "certified") return;
    cert.stage = "awaiting-player";
    cert.markerAttestedAt = Date.now();
    cert.markerMethod = artifact.method;
    if (artifact.svg) cert.markerSignatureSvg = artifact.svg;
    pushAudit(draft, {
      kind: "marker-attested",
      tournamentId: t.id,
      round: draft.liveRound,
      playerId,
      actor: markerId,
      ts: Date.now(),
      detail: `Marker attested the card (${artifact.method}).`,
    });
    syncCert(draft, playerId);
    syncAuditTail(draft, 1);
    // the demo counterpart: when Joel attests David's card, David's phone
    // attests Joel's a moment later, then certifies his own once Joel has
    if (!IS_PILOT && markerId === DEMO_USER_ID) {
      queueEcho(draft, { kind: "david-attests-joe", hole: 0, at: Date.now() + 2600 });
    }
  });
}

/**
 * Stage B: the player certifies their own marker-attested card. Computes the
 * tamper-evidence record (hash, device, location, clubhouse distance) and
 * appends it — the card is now "returned" in the R&A sense.
 */
export async function playerCertify(
  playerId: string,
  artifact: SignatureArtifact,
) {
  const s = simStore.getState();
  const round = s.liveRound;
  const cert = roundCerts(s)[playerId];
  if (!cert || cert.stage !== "awaiting-player") return;
  const t = IS_PILOT
    ? (s.created.find((x) => x.id === s.liveTournamentId) ?? LIVE_T)
    : LIVE_T;
  // the course of the round being certified, which may differ per round
  const course =
    COURSES.find((c) => c.id === roundOf(t, round).courseId) ?? COURSE;
  const player =
    s.roster.find((p) => p.id === playerId) ?? playerById(playerId);

  const hash = await sha256Hex(
    scorePayload({
      tournamentId: t.id,
      round,
      courseId: course.id,
      playerId,
      markerId: cert.markerId,
      scores: roundScores(s)[playerId] ?? [],
    }),
  );
  const gps =
    s.locationConsent === "granted" && playerId === DEMO_USER_ID
      ? await getGpsFix()
      : null;
  const club = clubById(t.clubId);
  const distance = gps ? distanceM(gps, club) : null;
  const hcs = handicapSet(player.handicap, course, t.handicapAllowance);
  const now = Date.now();

  mutate((draft) => {
    const c = roundCerts(draft)[playerId];
    if (!c || c.stage !== "awaiting-player") return;
    c.stage = "certified";
    c.playerCertifiedAt = now;
    c.playerMethod = artifact.method;
    if (artifact.svg) c.playerSignatureSvg = artifact.svg;
    c.lockedHash = hash;
    pushAudit(draft, {
      kind: "player-certified",
      tournamentId: t.id,
      round,
      playerId,
      actor: playerId,
      ts: now,
      detail: `Player certified the card (${artifact.method}).`,
    });
    pushAudit(draft, {
      kind: "card-returned",
      tournamentId: t.id,
      round,
      playerId,
      actor: playerId,
      ts: now,
      hash,
      device: deviceFingerprint(),
      gps,
      distanceFromClubhouseM: distance,
      handicaps: hcs,
      detail: `Card returned and locked. Marker ${cert.markerId} attested ${
        cert.markerAttestedAt ? new Date(cert.markerAttestedAt).toISOString() : ""
      }; player certified. HI ${hcs.hi} · CH ${hcs.ch} · PH ${hcs.ph}.`,
    });
    if (playerId === DEMO_USER_ID) {
      draft.attested = true;
      draft.notifications.unshift({
        id: noteSeq++ + Math.floor(Math.random() * 1000) * 100000,
        emoji: "🔒",
        title: "Card returned · locked",
        body: "Integrity record written. Your score is official.",
        ts: now,
      });
      // David certifies his own card shortly after
      queueEcho(draft, { kind: "david-certifies", hole: 0, at: now + 2200 });
    }
    syncCert(draft, playerId);
    syncAuditTail(draft, 2);
  });
}

/** Either party can hold the card for the Committee. */
export function raiseDispute(
  playerId: string,
  holeIdx: number,
  reason: string,
  raisedBy: string,
) {
  mutate((draft) => {
    const t = activeTournamentOf(draft);
    const cert = ensureCert(
      draft,
      playerId,
      roundCerts(draft)[playerId]?.markerId ?? MARKER_ID,
    );
    cert.stage = "disputed";
    draft.disputes.unshift({
      id: `disp-${Date.now().toString(36)}`,
      playerId,
      round: draft.liveRound,
      holeIdx,
      markerValue: roundMarkerScores(draft)[playerId]?.[holeIdx] ?? null,
      playerValue: roundScores(draft)[playerId]?.[holeIdx] ?? null,
      markerEnteredAt: Date.now() - 90_000,
      playerEnteredAt: Date.now() - 150_000,
      reason,
      raisedBy,
      ts: Date.now(),
      status: "open",
    });
    pushAudit(draft, {
      kind: "dispute-raised",
      tournamentId: t.id,
      round: draft.liveRound,
      playerId,
      actor: raisedBy,
      ts: Date.now(),
      detail: `Dispute on hole ${holeIdx + 1}: ${reason}`,
    });
    const who = draft.roster.find((p) => p.id === playerId)?.name ?? playerId;
    draft.flags.unshift({
      id: `flag-dispute-${playerId}-${holeIdx}`,
      kind: "amber",
      groupId: "",
      playerId,
      hole: holeIdx + 1,
      message: `Dispute · ${who}, hole ${holeIdx + 1}`,
      detail: `Card held for the Committee. ${reason}`,
      status: "open",
      ts: Date.now(),
    });
    const disp = draft.disputes[0];
    enqueueEntity(draft, "disputes", disputeToRow(t.id, disp), { conflict: "id" });
    syncCert(draft, playerId);
    syncAuditTail(draft, 1);
  });
}

export function markCommitteeReview(playerId: string) {
  mutate((draft) => {
    const c = roundCerts(draft)[playerId];
    if (c && c.stage === "disputed") c.stage = "committee-review";
    syncCert(draft, playerId);
  });
}

/** Committee resolution; appends, never overwrites. */
export async function resolveDispute(
  disputeId: string,
  decision: {
    kind: "marker" | "player" | "committee" | "dq";
    score?: number;
    reason: string;
  },
) {
  const s = simStore.getState();
  const d = s.disputes.find((x) => x.id === disputeId);
  if (!d) return;
  const t = IS_PILOT
    ? (s.created.find((x) => x.id === s.liveTournamentId) ?? LIVE_T)
    : LIVE_T;
  // a dispute belongs to the round it was raised in, which may not be the
  // round now on the course
  const dkey = roundKey(t.id, d.round);
  const course =
    COURSES.find((c) => c.id === roundOf(t, d.round).courseId) ?? COURSE;

  const agreed =
    decision.kind === "marker"
      ? d.markerValue
      : decision.kind === "player"
        ? d.playerValue
        : decision.kind === "committee"
          ? (decision.score ?? d.playerValue)
          : null;

  const nextScores = [...(roundScores(s, dkey)[d.playerId] ?? [])];
  if (agreed != null) nextScores[d.holeIdx] = agreed;
  const hash =
    decision.kind === "dq"
      ? undefined
      : await sha256Hex(
          scorePayload({
            tournamentId: t.id,
            round: d.round,
            courseId: course.id,
            playerId: d.playerId,
            markerId: roundCerts(s, dkey)[d.playerId]?.markerId ?? "",
            scores: nextScores,
          }),
        );

  mutate((draft) => {
    const disp = draft.disputes.find((x) => x.id === disputeId);
    if (!disp || disp.status === "resolved") return;
    disp.status = "resolved";
    const cert = certsFor(draft, dkey)[d.playerId];
    if (decision.kind === "dq") {
      disp.resolution = `DQ under Rule 3.3b(3): ${decision.reason}`;
      if (cert) cert.stage = "dq";
    } else {
      if (agreed != null) {
        ensureCard(draft, d.playerId, dkey);
        cardsFor(draft, dkey)[d.playerId][d.holeIdx] = agreed;
        markerCardsFor(draft, dkey)[d.playerId][d.holeIdx] = agreed;
      }
      disp.resolution = `${decision.kind === "committee" ? "Committee score" : decision.kind === "marker" ? "Marker's figure" : "Player's figure"} ${agreed} for hole ${d.holeIdx + 1}: ${decision.reason}`;
      if (cert) {
        cert.stage = "certified";
        cert.playerCertifiedAt = Date.now();
        cert.playerMethod = "committee";
        cert.lockedHash = hash;
      }
      if (d.playerId === DEMO_USER_ID) draft.attested = true;
    }
    const flag = draft.flags.find(
      (f) => f.id === `flag-dispute-${d.playerId}-${d.holeIdx}`,
    );
    if (flag) flag.status = "reviewed";
    pushAudit(draft, {
      kind: "dispute-resolved",
      tournamentId: t.id,
      round: d.round,
      playerId: d.playerId,
      actor: "committee",
      ts: Date.now(),
      hash,
      device: deviceFingerprint(),
      detail: disp.resolution ?? decision.reason,
    });
    enqueueEntity(draft, "disputes", disputeToRow(t.id, disp), { conflict: "id" });
    if (agreed != null) {
      enqueueOp(draft, "resolve", {
        playerId: d.playerId,
        round: d.round,
        hole: d.holeIdx,
        gross: agreed,
        source: "committee",
      });
    }
    syncCert(draft, d.playerId);
    syncAuditTail(draft, 1);
  });
}

/* ---- correction window (R&A 2024 time-based "returned") ---- */

export function requestCorrection(
  playerId: string,
  holeIdx: number,
  proposedGross: number,
  reason: string,
) {
  mutate((draft) => {
    const t = activeTournamentOf(draft);
    draft.corrections.unshift({
      id: `corr-${Date.now().toString(36)}`,
      playerId,
      round: draft.liveRound,
      holeIdx,
      currentGross: roundScores(draft)[playerId]?.[holeIdx] ?? null,
      proposedGross,
      reason,
      ts: Date.now(),
      status: "pending",
    });
    pushAudit(draft, {
      kind: "correction-requested",
      tournamentId: t.id,
      round: draft.liveRound,
      playerId,
      actor: playerId,
      ts: Date.now(),
      detail: `Correction requested for hole ${holeIdx + 1}: ${roundScores(draft)[playerId]?.[holeIdx]} → ${proposedGross}. ${reason}`,
    });
    const who = draft.roster.find((p) => p.id === playerId)?.name ?? playerId;
    draft.flags.unshift({
      id: `flag-corr-${playerId}-${holeIdx}`,
      kind: "amber",
      groupId: "",
      playerId,
      hole: holeIdx + 1,
      message: `Correction request · ${who}, hole ${holeIdx + 1}`,
      detail: reason,
      status: "open",
      ts: Date.now(),
    });
    enqueueEntity(draft, "corrections", correctionToRow(t.id, draft.corrections[0]), {
      conflict: "id",
    });
    syncAuditTail(draft, 1);
  });
}

export async function decideCorrection(
  correctionId: string,
  approve: boolean,
  reason: string,
) {
  const s = simStore.getState();
  const c = s.corrections.find((x) => x.id === correctionId);
  if (!c || c.status !== "pending") return;
  const t = IS_PILOT
    ? (s.created.find((x) => x.id === s.liveTournamentId) ?? LIVE_T)
    : LIVE_T;
  // a correction belongs to the round whose card it amends
  const ckey = roundKey(t.id, c.round);
  const course =
    COURSES.find((x) => x.id === roundOf(t, c.round).courseId) ?? COURSE;

  let hash: string | undefined;
  if (approve) {
    const nextScores = [...(roundScores(s, ckey)[c.playerId] ?? [])];
    nextScores[c.holeIdx] = c.proposedGross;
    hash = await sha256Hex(
      scorePayload({
        tournamentId: t.id,
        round: c.round,
        courseId: course.id,
        playerId: c.playerId,
        markerId: roundCerts(s, ckey)[c.playerId]?.markerId ?? "",
        scores: nextScores,
      }),
    );
  }

  mutate((draft) => {
    const corr = draft.corrections.find((x) => x.id === correctionId);
    if (!corr || corr.status !== "pending") return;
    corr.status = approve ? "approved" : "rejected";
    corr.decidedBy = "committee";
    corr.decisionReason = reason;
    corr.decidedAt = Date.now();
    if (approve) {
      ensureCard(draft, corr.playerId, ckey);
      cardsFor(draft, ckey)[corr.playerId][corr.holeIdx] = corr.proposedGross;
      markerCardsFor(draft, ckey)[corr.playerId][corr.holeIdx] = corr.proposedGross;
      const cert = certsFor(draft, ckey)[corr.playerId];
      if (cert) cert.lockedHash = hash;
    }
    const flag = draft.flags.find(
      (f) => f.id === `flag-corr-${corr.playerId}-${corr.holeIdx}`,
    );
    if (flag) flag.status = "reviewed";
    pushAudit(draft, {
      kind: "correction-decided",
      tournamentId: t.id,
      round: corr.round,
      playerId: corr.playerId,
      actor: "committee",
      ts: Date.now(),
      hash,
      detail: `Correction ${approve ? "approved" : "rejected"} for hole ${corr.holeIdx + 1} (${corr.currentGross} → ${corr.proposedGross}): ${reason}`,
    });
    enqueueEntity(draft, "corrections", correctionToRow(t.id, corr), { conflict: "id" });
    if (approve) {
      enqueueOp(draft, "resolve", {
        playerId: corr.playerId,
        round: corr.round,
        hole: corr.holeIdx,
        gross: corr.proposedGross,
        source: "committee",
      });
    }
    syncCert(draft, corr.playerId);
    syncAuditTail(draft, 1);
  });
}

/* ---- preferences + PINs ---- */

export function setUserPin(pin: string) {
  mutate((d) => {
    d.userPin = pin;
  });
}
export function setAdminPin(pin: string) {
  mutate((d) => {
    d.adminPin = pin;
  });
}
export function setSignMethod(m: SignMethod) {
  mutate((d) => {
    d.signMethod = m;
  });
}
export function setTonePref(t: "editorial" | "classic") {
  mutate((d) => {
    d.tonePref = t;
  });
}
export function setLocationConsent(v: "granted" | "declined") {
  mutate((d) => {
    d.locationConsent = v;
  });
}

export function setDeviceIdentity(playerId: string | null) {
  try {
    if (playerId) localStorage.setItem(IDENTITY_KEY, playerId);
    else localStorage.removeItem(IDENTITY_KEY);
  } catch {}
  mutate((d) => {
    d.deviceIdentity = playerId;
  });
}

/** Sign-in landed: remember who this device is, by the roster email match. */
export function setAuth(email: string | null, userId: string | null) {
  mutate((d) => {
    d.authEmail = email ? email.trim().toLowerCase() : null;
    d.authUserId = userId;
  });
}

export function setOnboarded(v: boolean) {
  mutate((d) => {
    d.onboarded = v;
  });
}

/** Roster player matched to the signed-in email, if any. */
export function authedPlayerId(s: SimState): string | null {
  if (!s.authEmail) return null;
  const email = s.authEmail.toLowerCase();
  return s.roster.find((p) => (p.email ?? "").toLowerCase() === email)?.id ?? null;
}

/**
 * The player this device acts as. Demo: always Joel. Pilot: the signed-in
 * player (email → roster match); falls back to the manually-picked identity
 * so the caddymaster/follow-only path still works without an account.
 */
export function meId(s: SimState): string {
  if (!IS_PILOT) return DEMO_USER_ID;
  return authedPlayerId(s) ?? s.deviceIdentity ?? "";
}

export function registerForTournament(id: string) {
  mutate((draft) => {
    if (!draft.registrations.includes(id)) draft.registrations.push(id);
    const t = [...draft.created, ...TOURNAMENTS].find((x) => x.id === id);
    draft.notifications.unshift({
      id: noteSeq++ + Math.floor(Math.random() * 1000) * 100000,
      emoji: "⛳️",
      title: `You're in: ${t?.name ?? "tournament"}`,
      body: "Entry confirmed. Tee times publish 48h before.",
      ts: Date.now(),
    });
  });
}

export function createTournament(t: Tournament) {
  mutate((draft) => {
    draft.created.unshift(t);
    enqueueEntity(draft, "tournaments", tournamentToRow(t), { conflict: "id" });
  });
}

/** Edit a created tournament that hasn't started yet. Re-publishes the row. */
export function updateTournament(t: Tournament) {
  mutate((draft) => {
    const i = draft.created.findIndex((x) => x.id === t.id);
    if (i >= 0) draft.created[i] = t;
    else draft.created.unshift(t);
    enqueueEntity(draft, "tournaments", tournamentToRow(t), { conflict: "id" });
  });
}

/**
 * Remove a created tournament before it has started (a mistake, a cancelled
 * event). Anon can't DELETE rows, so we mark it `cancelled` in the cloud —
 * every device that holds it drops it — and remove it locally.
 */
export function deleteTournament(id: string) {
  mutate((draft) => {
    const t = draft.created.find((x) => x.id === id);
    if (t) {
      enqueueEntity(
        draft,
        "tournaments",
        { ...tournamentToRow(t), status: "cancelled" },
        { conflict: "id" },
      );
    }
    draft.created = draft.created.filter((x) => x.id !== id);
    delete draft.pairings[id];
    if (draft.liveTournamentId === id) draft.liveTournamentId = null;
  });
}

/**
 * Close a live tournament: freeze the final standings into `result` (winner +
 * this device's finish, for the prizegiving summary and the app's history),
 * flip the status to `completed`, and stand the live board down. The full
 * final board stays recomputable from the synced scores on any device.
 */
export function endTournamentDay(id: string) {
  mutate((draft) => {
    const t = draft.created.find((x) => x.id === id);
    if (!t) return;
    // the field is everyone who appeared in any round's pairings
    const rounds = roundsOf(t);
    const fieldIds = new Set(
      rounds.flatMap((r) =>
        (draft.pairings[roundKey(id, r.number)] ?? []).flatMap((g) => g.playerIds),
      ),
    );
    const players = [...fieldIds]
      .map((pid) => draft.roster.find((p) => p.id === pid) ?? PLAYERS.find((p) => p.id === pid))
      .filter((p): p is Player => !!p);
    const mode = t.format === "Stableford" ? "points" : "net";
    if (players.length) {
      const toParStr = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);
      const standings = cumulativeStandings(
        players,
        roundCardsOf(draft, t),
        t.handicapAllowance,
        mode,
        (rnd, pid) =>
          (draft.pairings[roundKey(id, rnd)] ?? []).some((g) =>
            g.playerIds.includes(pid),
          ),
      );
      const win = standings[0];
      const me = meId(draft);
      const meRow = standings.find((r) => r.player.id === me);
      const fmt = (r: (typeof standings)[number]) =>
        mode === "points" ? `${r.points} pts` : toParStr(r.netToPar);
      if (win) {
        t.result = {
          winner: win.player.name,
          score: fmt(win),
          userPosition: meRow?.position,
          userScore: meRow ? fmt(meRow) : undefined,
        };
      }
    }
    t.status = "completed";
    draft.liveTournamentId = null;
    draft.liveRound = 1;
    enqueueEntity(draft, "tournaments", tournamentToRow(t), { conflict: "id" });
  });
}

export function reviewFlag(id: string) {
  mutate((draft) => {
    const f = draft.flags.find((x) => x.id === id);
    if (f) f.status = "reviewed";
  });
}

export function reviewIntegrityEntry(id: string) {
  mutate((draft) => {
    const f = draft.integrityLog.find((x) => x.id === id);
    if (f) f.status = "reviewed";
  });
}

export function setDemoMode(on: boolean) {
  mutate((draft) => {
    draft.demoMode = on;
  });
}

export function setHideLeaderboard(on: boolean) {
  mutate((draft) => {
    draft.hideLeaderboard = on;
  });
}

export function resetDemo() {
  const fresh = buildInitialState();
  fresh.v = Math.max(simStore.getState().v + 1, Date.now());
  simStore.setState(fresh, true);
  if (isClient) {
    persist(fresh);
    channel?.postMessage({ type: "state", state: fresh });
  }
}

/* ------------------------------------------------------------------ */
/* Demo-mode autoplay of the user's group                              */
/* ------------------------------------------------------------------ */

function demoAutoplay() {
  const s = simStore.getState();
  if (!s.demoMode || !isLeader || s.attested) return;
  // next hole where the user's own card is empty
  const cards = roundScores(s);
  const marks = roundMarkerScores(s);
  const own = cards[DEMO_USER_ID] ?? emptyCard();
  const ownNext = own.findIndex((x) => x == null);
  const markerNext = (marks[MARKER_ID] ?? emptyCard()).findIndex((x) => x == null);
  // a waiting discrepancy pauses play for a beat, then resolves itself
  const mine = marks[DEMO_USER_ID] ?? emptyCard();
  const discIdx = own.findIndex(
    (v, i) => v != null && mine[i] != null && mine[i] !== v,
  );
  if (discIdx >= 0) {
    resolveDiscrepancy(DEMO_USER_ID, discIdx, own[discIdx]!);
    return;
  }
  if (ownNext === -1 && markerNext === -1) {
    // walk the certification ceremony hands-free
    const certs = roundCerts(s);
    const davidCert = certs[MARKER_ID];
    const joeCert = certs[DEMO_USER_ID];
    if (!davidCert || davidCert.stage === "awaiting-marker") {
      markerAttest(MARKER_ID, DEMO_USER_ID, { method: "pin" });
    } else if (joeCert?.stage === "awaiting-player") {
      void playerCertify(DEMO_USER_ID, { method: "pin" });
    }
    return;
  }
  const holeIdx = Math.min(
    ownNext === -1 ? 18 : ownNext,
    markerNext === -1 ? 18 : markerNext,
  );
  if (holeIdx >= 18) return;
  // wait for echoes on the previous hole before moving on
  if (holeIdx > 0 && s.markerScores[DEMO_USER_ID][holeIdx - 1] == null) return;
  if (s.scores[DEMO_USER_ID][holeIdx] == null) {
    const gross = generateGross(
      COURSE.holes[holeIdx],
      playerById(DEMO_USER_ID).handicap,
      Math.random,
      -0.6, // Joe is having the round of his season
    );
    enterOwnScore(holeIdx, gross);
  }
  if (s.markerScores[MARKER_ID][holeIdx] == null) {
    const gross = generateGross(
      COURSE.holes[holeIdx],
      playerById(MARKER_ID).handicap,
      Math.random,
    );
    enterMarkerScore(holeIdx, gross);
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle — call once from any layout                               */
/* ------------------------------------------------------------------ */

let started = false;

export function startSim() {
  if (!isClient || started) return;
  started = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as SimState;
      if (saved.schema === SCHEMA) {
        applyingRemote = true;
        simStore.setState(saved, true);
        applyingRemote = false;
      }
    }
  } catch {}

  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e) => {
    if (e.data?.type === "state") receive(e.data.state as SimState);
  };

  leaderLoop();
  setInterval(leaderLoop, 1200);

  // the simulated field only plays in demo mode — pilot data is all real
  if (!IS_PILOT) {
    const scheduleField = () => {
      const delay = simStore.getState().demoMode ? 1600 : 6500;
      setTimeout(() => {
        if (isLeader) fieldTick();
        scheduleField();
      }, delay);
    };
    scheduleField();

    setInterval(processEchoes, 700);
    setInterval(demoAutoplay, 2400);
  }

  // the sync engine runs in both modes (leader tab only)
  import("@/lib/sync/engine").then(({ startSyncEngine }) =>
    startSyncEngine({
      store: simStore,
      isLeader: () => isLeader,
      mutate,
    }),
  );
}

/** Exposed for the sync engine's remote-merge path. */
/**
 * Write one inbound score into the right card view.
 *
 *   player : the player's own card
 *   marker : what their marker recorded for them, kept separate so a
 *            discrepancy is visible instead of being silently overwritten
 *   desk   : the caddymaster's entry from the paper card. That figure is the
 *            agreed one, so it settles both views.
 */
function applyScoreRow(
  draft: SimState,
  key: string,
  pid: string,
  holeIdx: number,
  gross: number | null,
  source?: string,
) {
  ensureCard(draft, pid, key);
  if (source === "marker") {
    markerCardsFor(draft, key)[pid][holeIdx] = gross;
    return;
  }
  if (source === "player") {
    cardsFor(draft, key)[pid][holeIdx] = gross;
    return;
  }
  // desk, resolved discrepancies, and anything older that predates sources
  cardsFor(draft, key)[pid][holeIdx] = gross;
  markerCardsFor(draft, key)[pid][holeIdx] = gross;
}

export function applyRemoteScore(
  pid: string,
  holeIdx: number,
  gross: number | null,
  source?: string,
  round?: number,
  tournamentId?: string,
) {
  const s = simStore.getState();
  const key = roundKey(
    tournamentId ?? s.liveTournamentId ?? LIVE_TOURNAMENT_ID,
    round ?? s.liveRound ?? 1,
  );
  const current =
    source === "marker"
      ? roundMarkerScores(s, key)[pid]?.[holeIdx]
      : roundScores(s, key)[pid]?.[holeIdx];
  if (current === gross) return;
  mutate((draft) => {
    applyScoreRow(draft, key, pid, holeIdx, gross, source);
    // the ticker only follows the round on the course, and only the player's
    // own card, never the marker's copy
    if (gross != null && source !== "marker" && key === liveKey(draft)) {
      pushEvent(draft, pid, holeIdx, gross);
    }
  });
}

/**
 * Apply one realtime row from another device. Never enqueues — these are
 * inbound merges. Idempotent so a self-echo or a re-delivery is harmless.
 */
export function applyRemoteEntity(table: string, row: Record<string, unknown>) {
  mutate((draft) => {
    switch (table) {
      case "tournaments": {
        const t = rowToTournament(row);
        if (t.status === "cancelled") {
          // deleted elsewhere before it started: drop it everywhere
          draft.created = draft.created.filter((x) => x.id !== t.id);
          for (const k of Object.keys(draft.pairings)) {
            if (k.startsWith(`${t.id}#`)) delete draft.pairings[k];
          }
          if (draft.liveTournamentId === t.id) draft.liveTournamentId = null;
          break;
        }
        const i = draft.created.findIndex((x) => x.id === t.id);
        if (i >= 0) draft.created[i] = t;
        else draft.created.unshift(t);
        if (t.status === "live") draft.liveTournamentId = t.id;
        // ended elsewhere: stand the live board down on this device too
        else if (draft.liveTournamentId === t.id) draft.liveTournamentId = null;
        break;
      }
      case "pairings": {
        const tid = row.tournament_id as string;
        const rnd = (row.round as number) ?? 1;
        const key = roundKey(tid, rnd);
        const g = rowToPairing(row);
        const list = (draft.pairings[key] ??= []);
        const i = list.findIndex((x) => x.id === g.id);
        if (i >= 0) list[i] = g;
        else list.push(g);
        list.sort((a, b) => a.number - b.number);
        for (const pid of g.playerIds) ensureCard(draft, pid, key);
        break;
      }
      case "players": {
        const p = rowToPlayer(row);
        const i = draft.roster.findIndex((x) => x.id === p.id);
        if (i >= 0) draft.roster[i] = p;
        else draft.roster.push(p);
        ensureCard(draft, p.id);
        break;
      }
      case "card_in": {
        const key = roundKey(
          row.tournament_id as string,
          (row.round as number) ?? 1,
        );
        cardInFor(draft, key)[row.player_id as string] = Boolean(row.is_in);
        break;
      }
      case "certifications": {
        const key = roundKey(
          row.tournament_id as string,
          (row.round as number) ?? 1,
        );
        const c = rowToCert(row);
        const certs = certsFor(draft, key);
        certs[c.playerId] = { ...certs[c.playerId], ...c };
        break;
      }
      case "disputes": {
        const d = rowToDispute(row);
        const i = draft.disputes.findIndex((x) => x.id === d.id);
        if (i >= 0) draft.disputes[i] = d;
        else draft.disputes.unshift(d);
        break;
      }
      case "corrections": {
        const c = rowToCorrection(row);
        const i = draft.corrections.findIndex((x) => x.id === c.id);
        if (i >= 0) draft.corrections[i] = c;
        else draft.corrections.unshift(c);
        break;
      }
      case "audit_log": {
        const a = rowToAudit(row);
        if (!draft.auditLog.some((x) => x.id === a.id)) draft.auditLog.push(a);
        break;
      }
    }
  });
}

/**
 * Merge a full cloud snapshot into local state on load / discovery. Only fires
 * when there is a real tournament in the snapshot, so it can never blank out a
 * device that has local-only state.
 */
export function hydrateFromSnapshot(snap: HydrationSnapshot) {
  if (!snap.tournament) return;
  mutate((draft) => {
    const t = rowToTournament(snap.tournament!);
    const i = draft.created.findIndex((x) => x.id === t.id);
    if (i >= 0) draft.created[i] = t;
    else draft.created.unshift(t);
    if (t.status === "live") draft.liveTournamentId = t.id;

    draft.pairings[t.id] = snap.pairings
      .map(rowToPairing)
      .sort((a, b) => a.number - b.number);

    for (const r of snap.players) {
      const p = rowToPlayer(r);
      const j = draft.roster.findIndex((x) => x.id === p.id);
      if (j >= 0) draft.roster[j] = p;
      else draft.roster.push(p);
      ensureCard(draft, p.id);
    }
    // Replay scores in write order so a later desk entry overrides what the
    // players recorded, and route each row to the card view it belongs to:
    // the player's own card, their marker's view of it, or (from the desk) the
    // agreed figure that settles both.
    const ordered = [...snap.scores].sort((a, b) =>
      String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? "")),
    );
    for (const r of ordered) {
      const key = roundKey(t.id, r.round ?? 1);
      applyScoreRow(draft, key, r.player_id, r.hole, r.gross, r.source);
    }
    for (const r of snap.cardIn) {
      const key = roundKey(t.id, (r.round as number) ?? 1);
      cardInFor(draft, key)[r.player_id as string] = Boolean(r.is_in);
    }
    for (const r of snap.certifications) {
      const key = roundKey(t.id, (r.round as number) ?? 1);
      const c = rowToCert(r);
      certsFor(draft, key)[c.playerId] = c;
    }
    draft.disputes = snap.disputes.map(rowToDispute);
    draft.corrections = snap.corrections.map(rowToCorrection);
    for (const r of snap.audit) {
      const a = rowToAudit(r);
      if (!draft.auditLog.some((x) => x.id === a.id)) draft.auditLog.push(a);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useSim<T>(selector: (s: SimState) => T): T {
  return useStore(simStore, selector);
}

export function allTournaments(created: Tournament[]): Tournament[] {
  // pilot hides every seeded tournament — the club's own events only
  return IS_PILOT ? created : [...created, ...TOURNAMENTS];
}

export const LIVE_COURSE = COURSE;
export const LIVE_TOURNAMENT = LIVE_T;
