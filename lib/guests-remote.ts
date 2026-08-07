"use client";

/**
 * Resolving a guest code that was issued on another device.
 *
 * The local path (guestForCode) covers the ordinary case: a guest registers on
 * their own phone, so the entry is already there. This covers the other one -
 * an organiser prints a code card and a fresh phone scans it - which has to
 * ask the server, because guest_entries is deliberately non-enumerable and the
 * phone holds nothing.
 *
 * Two throttles guard it. The server keeps a per-IP lockout that escalates
 * after a run of misses; this file keeps a per-device cap on top, so a single
 * phone hammering codes is slowed before its requests ever leave. The device
 * cap is bypassable by anyone willing to clear storage - it is a courtesy to
 * honest devices and a speed bump for lazy abuse, not the real wall. The real
 * wall is the server, the short-lived code, and the code space itself.
 */

import { normaliseCode } from "@/lib/guests";
import { REMOTE_CONFIGURED, supabase } from "@/lib/sync/client";
import { getRemote } from "@/lib/sync/remote";
import { hydrateFromSnapshot, setDeviceIdentity } from "@/lib/sim/store";

export type GuestResolveResult =
  | { status: "ok"; tournamentId: string; guestId: string }
  | { status: "not-found" }
  | { status: "rate-limited"; until: Date | null }
  | { status: "unavailable" };

/* ---- the per-device speed bump ---- */

const KEY = "shimo-guest-resolve";
const WINDOW_MS = 10 * 60_000;
const DEVICE_CAP = 8; // misses on this device before it waits, below the server's

interface DeviceState {
  fails: number;
  windowStart: number;
  lockedUntil: number | null;
}

function read(): DeviceState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DeviceState;
  } catch {
    /* storage blocked: treat as a clean slate rather than a locked one */
  }
  return { fails: 0, windowStart: Date.now(), lockedUntil: null };
}

function write(s: DeviceState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* nothing to do; the server throttle still applies */
  }
}

/** Whether this device is currently asked to wait, and until when. */
function deviceLock(now: number): Date | null {
  const s = read();
  if (s.lockedUntil && s.lockedUntil > now) return new Date(s.lockedUntil);
  return null;
}

function recordMiss(now: number) {
  const s = read();
  if (now - s.windowStart > WINDOW_MS) {
    s.fails = 0;
    s.windowStart = now;
    s.lockedUntil = null;
  }
  s.fails += 1;
  if (s.fails >= DEVICE_CAP) {
    // a flat two minutes: the server owns the escalating part
    s.lockedUntil = now + 2 * 60_000;
  }
  write(s);
}

function clearDevice() {
  write({ fails: 0, windowStart: Date.now(), lockedUntil: null });
}

/* ---- the server error carries the unlock time in its hint ---- */

function lockedUntilFromError(err: { hint?: string; message?: string }): Date | null {
  const t = err.hint ? Date.parse(err.hint) : NaN;
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Resolve a code against the server, honouring both throttles.
 *
 * Returns a plain result rather than throwing, because every branch is a thing
 * the guest screen has to say in words: opened, did not open, too many tries,
 * or we could not reach the server.
 */
export async function resolveGuestCodeRemote(
  input: string,
): Promise<GuestResolveResult> {
  if (!REMOTE_CONFIGURED) return { status: "unavailable" };

  const now = Date.now();
  const locked = deviceLock(now);
  if (locked) return { status: "rate-limited", until: locked };

  const code = normaliseCode(input);
  if (code.length !== 7) return { status: "not-found" };

  try {
    const sb = await supabase();
    const { data, error } = await sb.rpc("resolve_guest_code", { p_code: code });
    if (error) {
      if (/rate_limited/i.test(error.message ?? "")) {
        return { status: "rate-limited", until: lockedUntilFromError(error) };
      }
      return { status: "unavailable" };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      recordMiss(now);
      return { status: "not-found" };
    }
    clearDevice();
    return {
      status: "ok",
      tournamentId: row.tournament_id as string,
      guestId: row.guest_id as string,
    };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Pull down the tournament a resolved code belongs to and step into it.
 *
 * The code told us which tournament and which guest; hydrating brings the
 * event, its field and this guest's own player row into local state, after
 * which the app renders exactly as it would for a guest who registered here.
 */
export async function enterResolvedGuest(
  tournamentId: string,
  guestId: string,
): Promise<boolean> {
  try {
    hydrateFromSnapshot(await getRemote().hydrate(tournamentId));
    setDeviceIdentity(guestId);
    return true;
  } catch {
    return false;
  }
}

/* ---- the club-facing signal ---- */

export interface GuestAbuseSummary {
  bursts: number;
  lastAt: Date | null;
}

/**
 * How many times a connection has locked itself out trying codes lately.
 *
 * Counts only: the server holds the addresses and never hands them over, so a
 * caddymaster sees that someone is poking at the codes without being handed a
 * page of personal data they have no use for.
 */
export async function guestResolveAbuseSummary(): Promise<GuestAbuseSummary | null> {
  if (!REMOTE_CONFIGURED) return null;
  try {
    const sb = await supabase();
    const { data, error } = await sb.rpc("guest_resolve_abuse_summary");
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { bursts: 0, lastAt: null };
    return {
      bursts: Number(row.bursts ?? 0),
      lastAt: row.last_at ? new Date(row.last_at as string) : null,
    };
  } catch {
    return null;
  }
}
