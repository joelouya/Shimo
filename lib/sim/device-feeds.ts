"use client";

/**
 * The clubhouse screen and the public board, read from this device.
 *
 * Both routes were written to read the cloud and nothing else, which is right
 * for a connected club: a television must not depend on the laptop that
 * started the day. A build with no cloud behind it (the demo, or a desk
 * running without keys) had nowhere to read from, so the screen sat on a
 * notice while the desk beside it filled with scores.
 *
 * This module builds the same snapshots the cloud feeds build, from the sim
 * store instead. It is used whenever CLOUD_FEEDS is off: the demo always,
 * and a pilot desk that has no keys. Every tab on one device shares that store through
 * localStorage and a BroadcastChannel, so a screen opened in a second tab,
 * or in the producer panel's preview frame, follows the desk within a beat.
 * It reaches no further than that, and does not pretend to: a phone across
 * the room still needs the cloud.
 */

import { COURSES, PLAYERS } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import { roundKey, roundsOf } from "@/lib/rounds";
import {
  allTournaments,
  clubIdentityOf,
  simStore,
  startSim,
  type SimState,
} from "@/lib/sim/store";
import type { PublicBoard } from "@/lib/sync/public-board";
import type { ScoreRow, TvSnapshot } from "@/lib/tv/types";
import type { Player } from "@/lib/types";

/**
 * When each figure was last written, as far as this device can tell.
 *
 * Figures the phone or desk wrote through the sync path carry a stamp. The
 * demo's simulated field writes straight into the store and carries none, so
 * a figure with no stamp is dated the moment this module first saw it change.
 * Anything already on the card when the screen was switched on is dated well
 * before that, so it counts as settled history rather than news: a television
 * turned on at the fourteenth must not spend its first two minutes announcing
 * the front nine.
 */
const seen = new Map<string, { gross: number | null; at: number }>();
let primed = false;
const HISTORY_MS = 10 * 60_000;

function cellAt(
  stamps: Record<string, string>,
  key: string,
  gross: number | null,
  now: number,
): number {
  const stamped = stamps[key];
  if (stamped) {
    const t = Date.parse(stamped);
    if (Number.isFinite(t)) return t;
  }
  const prev = seen.get(key);
  if (prev && prev.gross === gross) return prev.at;
  const at = primed ? now : now - HISTORY_MS;
  seen.set(key, { gross, at });
  return at;
}

function fieldOf(s: SimState): Map<string, Player> {
  const people = new Map<string, Player>();
  // the seed field plays in demo; in pilot every player is on the roster or a guest
  for (const p of [...s.roster, ...s.guests, ...(IS_PILOT ? [] : PLAYERS)]) {
    if (!people.has(p.id)) people.set(p.id, p);
  }
  return people;
}

function tournamentOf(s: SimState, id: string) {
  return allTournaments(s.created, s.dismissed).find((t) => t.id === id) ?? null;
}

/** The TV feed's snapshot, from this device's copy of the day. */
export function deviceTvSnapshot(s: SimState, tournamentId: string): TvSnapshot | null {
  const tournament = tournamentOf(s, tournamentId);
  if (!tournament) return null;
  const rounds = roundsOf(tournament);
  const now = Date.now();
  const people = fieldOf(s);

  const fieldByRound: Record<number, string[]> = {};
  const published: Record<number, Record<string, boolean>> = {};
  const rows: ScoreRow[] = [];
  const stamps = s.stamps ?? {};
  const played = new Set<number>();

  for (const r of rounds) {
    const key = roundKey(tournament.id, r.number);
    const groups = s.pairings[key] ?? [];
    fieldByRound[r.number] = groups.flatMap((g) => g.playerIds);

    const own = s.scores[key] ?? {};
    for (const [playerId, card] of Object.entries(own)) {
      card.forEach((gross, hole) => {
        if (gross == null) return;
        played.add(r.number);
        // a card the desk typed in carries a desk stamp; anything else is the player's own
        const deskKey = `scores:${tournament.id}:${r.number}:${playerId}:${hole}:desk`;
        const source: ScoreRow["source"] = stamps[deskKey] ? "desk" : "player";
        const stampKey = source === "desk"
          ? deskKey
          : `scores:${tournament.id}:${r.number}:${playerId}:${hole}:player`;
        rows.push({
          round: r.number,
          playerId,
          hole,
          gross,
          source,
          at: cellAt(stamps, stampKey, gross, now),
        });
      });
    }
    const marks = s.markerScores[key] ?? {};
    for (const [playerId, card] of Object.entries(marks)) {
      card.forEach((gross, hole) => {
        if (gross == null) return;
        const stampKey = `scores:${tournament.id}:${r.number}:${playerId}:${hole}:marker`;
        rows.push({
          round: r.number,
          playerId,
          hole,
          gross,
          source: "marker",
          at: cellAt(stamps, stampKey, gross, now),
        });
      });
    }

    const cardIn = s.cardIn[key];
    if (cardIn && Object.keys(cardIn).length) published[r.number] = { ...cardIn };
  }
  primed = true;

  const fieldIds = new Set(Object.values(fieldByRound).flat());
  const players = [...fieldIds]
    .map((id) => people.get(id))
    .filter((p): p is Player => !!p);

  // the round in play: the one the desk is running, else the last one scored
  const round =
    tournament.id === s.liveTournamentId
      ? s.liveRound || 1
      : ([...rounds].reverse().find((r) => played.has(r.number))?.number ?? rounds[0].number);
  const course =
    COURSES.find((c) => c.id === rounds.find((r) => r.number === round)?.courseId) ??
    COURSES.find((c) => c.id === tournament.courseId) ??
    COURSES[0];
  const identity = clubIdentityOf(s, tournament.clubId);

  return {
    at: now,
    tournament,
    course,
    players,
    round,
    rows,
    published,
    fieldByRound,
    groups: (s.pairings[roundKey(tournament.id, round)] ?? [])
      .map((g) => ({ number: g.number, teeTime: g.teeTime, playerIds: g.playerIds }))
      .sort((a, b) => a.number - b.number),
    identity,
    records: identity.courseRecords ?? [],
    decisions: (s.tvDecisions ?? [])
      .filter((d) => d.tournamentId === tournament.id)
      .map((d) => ({
        id: d.id,
        kind: d.kind,
        factKey: d.factKey,
        payload: d.payload ?? {},
        actor: d.actor,
        at: d.at,
      })),
    online: true,
  };
}

/** The public board, from this device's copy of the day. */
export function devicePublicBoard(s: SimState, tournamentId: string): PublicBoard {
  const tournament = tournamentOf(s, tournamentId);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!tournament) {
    return {
      status: "not-found",
      tournament: null,
      course: null,
      players: [],
      byRound: {},
      fieldByRound: {},
      lastUpdated: Date.now(),
      online,
    };
  }
  const people = fieldOf(s);
  const fieldByRound: Record<number, string[]> = {};
  const byRound: Record<number, Record<string, (number | null)[]>> = {};
  for (const r of roundsOf(tournament)) {
    const key = roundKey(tournament.id, r.number);
    fieldByRound[r.number] = (s.pairings[key] ?? []).flatMap((g) => g.playerIds);
    const cards = s.scores[key];
    if (!cards) continue;
    // only the player's own card is published; a marker's copy stays private
    const bucket: Record<string, (number | null)[]> = {};
    for (const [pid, card] of Object.entries(cards)) bucket[pid] = [...card];
    byRound[r.number] = bucket;
  }
  const fieldIds = new Set(Object.values(fieldByRound).flat());
  return {
    status: "ready",
    tournament,
    course: COURSES.find((c) => c.id === tournament.courseId) ?? null,
    players: [...fieldIds].map((id) => people.get(id)).filter((p): p is Player => !!p),
    byRound,
    fieldByRound,
    lastUpdated: Date.now(),
    online,
  };
}

/**
 * Follow the store and rebuild on change.
 *
 * Boots the sim if this tab has not (the screen and the board live outside
 * the desk's gate), delivers one build straight away, then one per change,
 * coalesced so a burst of writes costs one rebuild.
 */
export function watchDevice<T>(build: (s: SimState) => T, deliver: (v: T) => void): () => void {
  startSim();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const run = () => {
    timer = null;
    if (stopped) return;
    deliver(build(simStore.getState()));
  };
  run();
  const unsub = simStore.subscribe(() => {
    if (timer) return;
    timer = setTimeout(run, 400);
  });
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsub();
  };
}
