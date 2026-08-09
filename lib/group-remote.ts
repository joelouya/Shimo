"use client";

/**
 * Resolving a group code from a device that does not hold the event.
 *
 * The local path (groupForCode) covers the device that ran the pairings or has
 * already opened the tournament. This covers the other one - a player's own
 * phone, fresh, typing the code off the printed sheet - which has to ask the
 * server for which tournament and group the code names.
 *
 * Unlike a guest code this is an ordinary read. Pairings are public: an anon
 * read returns the whole tee sheet already, so resolving a group code reveals
 * nothing beyond what is pinned to the wall. It names a group and stops there;
 * turning that into a scorecard still needs the player to sign in or produce
 * their own registration code on the screen it lands them on.
 */

import { normaliseGroupCode } from "@/lib/group-code";
import { REMOTE_CONFIGURED, supabase } from "@/lib/sync/client";
import { getRemote } from "@/lib/sync/remote";
import { groupForCode, hydrateFromSnapshot, simStore } from "@/lib/sim/store";

export type GroupResolveResult =
  | { status: "ok"; tournamentId: string; round: number; groupId: string }
  | { status: "not-found" }
  | { status: "unavailable" };

/**
 * Which tournament, round and group a code names.
 *
 * Local first, because the caddymaster's tablet resolves instantly and works
 * with no signal. Then the server, preferring the most recently touched match
 * so a code reused in a long-finished event never shadows the live one.
 */
export async function resolveGroupCode(input: string): Promise<GroupResolveResult> {
  const code = normaliseGroupCode(input);
  if (!code) return { status: "not-found" };

  const local = groupForCode(simStore.getState(), code);
  if (local) {
    return {
      status: "ok",
      tournamentId: local.tournamentId,
      round: local.round,
      groupId: local.group.id,
    };
  }

  if (!REMOTE_CONFIGURED) return { status: "unavailable" };
  try {
    const sb = await supabase();
    const { data, error } = await sb
      .from("pairings")
      .select("tournament_id, round, group_id, updated_at")
      .eq("code", code)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) return { status: "unavailable" };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { status: "not-found" };
    return {
      status: "ok",
      tournamentId: row.tournament_id as string,
      round: (row.round as number) ?? 1,
      groupId: row.group_id as string,
    };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Pull down the tournament a group belongs to, so its field, pairings and every
 * player's row are in local state before the player picks themselves out.
 *
 * Returns whether it landed; the screen that called it renders from the store
 * afterwards exactly as it would for someone who had the event all along.
 */
export async function hydrateForGroup(tournamentId: string): Promise<boolean> {
  // already here (the local resolve path): nothing to fetch.
  if (simStore.getState().pairings) {
    const has = Object.keys(simStore.getState().pairings).some((k) =>
      k.startsWith(tournamentId),
    );
    if (has) return true;
  }
  if (!REMOTE_CONFIGURED) return false;
  try {
    hydrateFromSnapshot(await getRemote().hydrate(tournamentId));
    return true;
  } catch {
    return false;
  }
}
