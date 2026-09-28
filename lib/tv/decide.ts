"use client";

/**
 * Sending a decision to the screen.
 *
 * The only write in the whole of TV mode, and it is deliberately nowhere near
 * the television: the panel writes a row, the screen reads it. That keeps the
 * public route incapable of changing anything while still leaving the club in
 * charge of what it shows.
 *
 * Append-only, and identified by fact key rather than by any local id. A
 * decision is about the thing that happened, not about one screen's copy of
 * the message, so the same row lands correctly on a television that has been
 * running all day and on one switched on a minute ago.
 *
 * Without a cloud the row is kept on this device instead, where the screen
 * reads it through the shared local state (lib/sim/device-feeds.ts). The
 * panel does not need to know which; the screen folds both in the same way.
 */

import { recordTvDecision } from "@/lib/sim/store";
import { CLOUD_FEEDS, supabase } from "@/lib/sync/client";
import type { TvDecision } from "./types";

export async function decide(
  tournamentId: string,
  kind: TvDecision["kind"],
  opts: {
    factKey?: string;
    payload?: Record<string, string | number | boolean>;
    actor?: string;
  } = {},
) {
  if (!CLOUD_FEEDS) {
    recordTvDecision(tournamentId, kind, opts);
    return;
  }
  const sb = await supabase();
  const { error } = await sb.from("tv_decisions").insert({
    tournament_id: tournamentId,
    kind,
    fact_key: opts.factKey ?? null,
    payload: opts.payload ?? {},
    actor: opts.actor ?? "",
  });
  if (error) throw error;
}
