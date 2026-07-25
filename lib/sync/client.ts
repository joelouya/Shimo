"use client";

/**
 * Shared Supabase client + identity. Used by both the outbox sync engine and
 * the public read-only leaderboard, so the connection is created once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const REMOTE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);

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
        // we verify a 6-digit code in-app, not a URL redirect
        detectSessionInUrl: false,
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
  "tournaments",
  "pairings",
  "players",
  "scores",
  "card_in",
  "certifications",
  "disputes",
  "corrections",
  "audit_log",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];
