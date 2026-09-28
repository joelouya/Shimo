"use client";

/**
 * Shared Supabase client + identity. Used by both the outbox sync engine and
 * the public read-only leaderboard, so the connection is created once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { IS_PILOT } from "@/lib/mode";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const REMOTE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * Whether the clubhouse screen and the public board read the cloud, and the
 * producer panel writes to it. The same rule the sync engine applies: a pilot
 * with keys, and nothing else. A demo build reads its own device even when a
 * developer's machine happens to hold keys, so what the demo shows is always
 * the demo's own day.
 */
export const CLOUD_FEEDS = IS_PILOT && REMOTE_CONFIGURED;

/** Stable per-device id so a device ignores the echoes of its own writes. */
export const CLIENT_ID = (() => {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem("shimo-client-id");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem("shimo-client-id", id);
    }
    return id;
  } catch {
    return "anon";
  }
})();

let clientPromise: Promise<SupabaseClient> | null = null;

/** Lazily create the client so the bundle only pays for it when configured. */
export function supabase(): Promise<SupabaseClient> {
  if (!REMOTE_CONFIGURED) {
    return Promise.reject(new Error("Supabase not configured"));
  }
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: {
        // persist the magic-link session so the phone stays signed in across
        // reloads and the JWT rides on every request (for authenticated RLS).
        persistSession: true,
        autoRefreshToken: true,
        // Sign-in works two ways, so the club does not have to customise its
        // email template: tapping the emailed link returns here with the
        // session in the URL (picked up by this flag), or the player types the
        // six-digit code if their template includes one.
        detectSessionInUrl: true,
        storageKey: "shimo-auth",
      },
      realtime: { params: { eventsPerSecond: 10 } },
    }),
  );
  return clientPromise;
}

export function forceFail() {
  return (
    typeof window !== "undefined" && window.location.search.includes("failsync")
  );
}

/** Every table the pilot state fans out across. */
export const SYNC_TABLES = [
  "clubs",
  "tournaments",
  "pairings",
  "teams",
  "players",
  "scores",
  "card_in",
  "certifications",
  "disputes",
  "corrections",
  "audit_log",
  "entries",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];
