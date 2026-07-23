"use client";

/**
 * The remote side of the outbox. When Supabase credentials are present
 * (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) writes go to
 * Postgres and other devices receive them over realtime. Without them, a
 * simulated remote accepts writes after a short delay so the whole offline /
 * retry UX still behaves — append `?failsync` to any URL to force failures
 * and demo the recovery path.
 */

import type { SyncOp } from "@/lib/sim/store";

export interface ScoreRow {
  tournament_id: string;
  player_id: string;
  hole: number; // 0-based
  gross: number | null;
  source: string;
  client_id: string;
}

export interface RemoteAdapter {
  kind: "supabase" | "simulated";
  push(ops: SyncOp[], tournamentId: string): Promise<void>;
  /** subscribe to score changes from OTHER devices; returns unsubscribe */
  subscribeScores(cb: (row: ScoreRow) => void): () => void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

function forceFail() {
  return (
    typeof window !== "undefined" && window.location.search.includes("failsync")
  );
}

/* ------------------------------------------------------------------ */

function simulatedRemote(): RemoteAdapter {
  return {
    kind: "simulated",
    async push() {
      await new Promise((r) => setTimeout(r, 250));
      if (forceFail()) throw new Error("simulated sync failure");
    },
    subscribeScores() {
      return () => {};
    },
  };
}

/* ------------------------------------------------------------------ */

function supabaseRemote(url: string, key: string): RemoteAdapter {
  // lazy client so the bundle only pays for it when configured
  let clientPromise: Promise<import("@supabase/supabase-js").SupabaseClient> | null =
    null;
  const client = () => {
    clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, key, { auth: { persistSession: false } }),
    );
    return clientPromise;
  };

  return {
    kind: "supabase",
    async push(ops, tournamentId) {
      if (forceFail()) throw new Error("forced sync failure");
      const sb = await client();
      const scoreOps = ops.filter((o) => o.kind === "score" || o.kind === "resolve");
      if (scoreOps.length) {
        const rows = scoreOps.map((o) => ({
          tournament_id: tournamentId,
          player_id: String(o.payload.playerId),
          hole: Number(o.payload.hole),
          gross: (o.payload.gross ?? null) as number | null,
          source: String(o.payload.source ?? "app"),
          client_id: CLIENT_ID,
          updated_at: new Date(o.ts).toISOString(),
        }));
        const { error } = await sb
          .from("scores")
          .upsert(rows, { onConflict: "tournament_id,player_id,hole" });
        if (error) throw error;
      }
      const eventOps = ops.filter((o) => o.kind === "attest" || o.kind === "card-in");
      if (eventOps.length) {
        const { error } = await sb.from("events_log").insert(
          eventOps.map((o) => ({
            tournament_id: tournamentId,
            kind: o.kind,
            payload: o.payload,
            client_id: CLIENT_ID,
          })),
        );
        if (error) throw error;
      }
    },
    subscribeScores(cb) {
      let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
      client().then((sb) => {
        channel = sb
          .channel("shimo-scores")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "scores" },
            (payload) => {
              const row = payload.new as ScoreRow | null;
              if (row && row.client_id !== CLIENT_ID) cb(row);
            },
          )
          .subscribe();
      });
      return () => {
        channel?.unsubscribe();
      };
    },
  };
}

/* ------------------------------------------------------------------ */

export function getRemote(): RemoteAdapter {
  if (SUPABASE_URL && SUPABASE_KEY) return supabaseRemote(SUPABASE_URL, SUPABASE_KEY);
  return simulatedRemote();
}

export const REMOTE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
