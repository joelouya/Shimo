"use client";

/**
 * The sync engine: drains the outbox to the remote from the leader tab, marks
 * ops synced/failed, hydrates the live tournament on load, and merges realtime
 * rows from other devices.
 *
 * Rules per the pilot spec:
 * - writes always land locally first (the store does that); no spinner
 * - an op that keeps failing while online for 30s becomes "failed" and the UI
 *   offers Retry — never a raw error
 * - offline: everything waits, nothing fails
 */

import type { StoreApi } from "zustand";

import {
  applyRemoteEntity,
  applyRemoteScore,
  hydrateFromSnapshot,
  type SimState,
} from "@/lib/sim/store";
import { getRemote } from "./remote";

const FAIL_AFTER_MS = 30_000;
const TICK_MS = 3_000;
const PRUNE_SYNCED_AFTER_MS = 5 * 60_000;
const REHYDRATE_MS = 60_000;

interface EngineDeps {
  store: StoreApi<SimState>;
  isLeader: () => boolean;
  mutate: (fn: (draft: SimState) => void) => void;
}

let running = false;

export function startSyncEngine({ store, isLeader, mutate }: EngineDeps) {
  if (running || typeof window === "undefined") return;
  running = true;

  const remote = getRemote();

  /* ---- inbound: hydrate + realtime ---- */
  if (remote.kind === "supabase") {
    const hydrate = async () => {
      try {
        const liveId =
          store.getState().liveTournamentId ??
          (await remote.findLiveTournamentId());
        if (liveId) hydrateFromSnapshot(await remote.hydrate(liveId));
      } catch {
        /* offline or not-yet-created: try again on the next pass */
      }
    };
    hydrate();
    // periodic reconcile catches anything realtime missed (dropped socket)
    setInterval(() => {
      if (navigator.onLine) hydrate();
    }, REHYDRATE_MS);

    remote.subscribeTables((table, row) => {
      if (table === "scores") {
        applyRemoteScore(
          row.player_id as string,
          row.hole as number,
          (row.gross ?? null) as number | null,
          row.source as string | undefined,
        );
      } else {
        applyRemoteEntity(table, row);
      }
    });
  }

  /* ---- outbound: drain the outbox ---- */
  let pushing = false;

  const tick = async () => {
    if (!isLeader() || pushing) return;
    const s = store.getState();

    if (
      s.outbox.some(
        (o) => o.status === "synced" && Date.now() - o.ts > PRUNE_SYNCED_AFTER_MS,
      )
    ) {
      mutate((d) => {
        d.outbox = d.outbox.filter(
          (o) => !(o.status === "synced" && Date.now() - o.ts > PRUNE_SYNCED_AFTER_MS),
        );
      });
    }

    if (!navigator.onLine) return;
    const pending = s.outbox.filter((o) => o.status === "pending");
    if (!pending.length) return;

    pushing = true;
    const ids = new Set(pending.map((o) => o.id));
    const now = Date.now();
    try {
      await remote.push(pending, s.liveTournamentId ?? "unassigned");
      mutate((d) => {
        d.outbox = d.outbox.map((o) =>
          ids.has(o.id) ? { ...o, status: "synced" as const } : o,
        );
        d.lastSyncedAt = now;
      });
    } catch {
      mutate((d) => {
        d.outbox = d.outbox.map((o) => {
          if (!ids.has(o.id)) return o;
          const firstTriedAt = o.firstTriedAt ?? now;
          const failed = now - firstTriedAt >= FAIL_AFTER_MS;
          return {
            ...o,
            attempts: o.attempts + 1,
            firstTriedAt,
            status: failed ? ("failed" as const) : o.status,
          };
        });
      });
    } finally {
      pushing = false;
    }
  };

  setInterval(tick, TICK_MS);
  window.addEventListener("online", tick);
}
