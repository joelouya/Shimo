/**
 * Publishing a recap pack, and reading one back.
 *
 * The pack is stored as published rather than recomputed on demand, and that
 * is the whole design. A recap is a statement about a day that has finished:
 * if the page rebuilt it from live data, a figure a sponsor read in September
 * could quietly differ from the one they read in November, and a document
 * whose numbers move is worth nothing to the person who paid for the day.
 * What the club published is what the sponsor sees, permanently.
 *
 * Resolution goes through an RPC rather than a table read, for the same reason
 * guest codes do: an open select would let anyone enumerate every sponsor pack
 * for every club, and those contain participant names.
 */

import { REMOTE_CONFIGURED, supabase } from "@/lib/sync/client";
import type { RecapSpec } from "./spec";

export interface PublishedPack {
  tournamentId: string;
  sponsorId: string;
  spec: RecapSpec;
  createdAt: string;
}

/**
 * Put a pack where a sponsor can reach it.
 *
 * One pack per (tournament, sponsor). A club that spots a typo and publishes
 * again replaces the pack rather than leaving two links alive, one of them
 * wrong; the replacement goes through republish_recap_pack, which needs the
 * pack's own token, so nobody holding only the public key can rewrite a
 * document a sponsor was handed.
 */
export async function publishPack(args: {
  token: string;
  tournamentId: string;
  sponsorId: string;
  spec: RecapSpec;
  actor?: string;
}): Promise<void> {
  if (!REMOTE_CONFIGURED) {
    throw new Error(
      "A sponsor link needs the club's database configured, because it has to be reachable from the sponsor's own browser.",
    );
  }
  const sb = await supabase();
  const { error } = await sb.from("recap_packs").insert({
    token: args.token,
    tournament_id: args.tournamentId,
    sponsor_id: args.sponsorId,
    spec: args.spec,
    actor: args.actor ?? "",
  });
  if (!error) return;
  // already published for this sponsor: replace it, proving the token
  if (error.code === "23505") {
    const { data, error: rpcError } = await sb.rpc("republish_recap_pack", {
      p_token: args.token,
      p_spec: args.spec,
      p_actor: args.actor ?? "",
    });
    if (rpcError) throw rpcError;
    if (!data) {
      throw new Error(
        "This pack was published with a different link. Withdraw it from the club's records before publishing again.",
      );
    }
    return;
  }
  throw error;
}

/**
 * The pack behind a link.
 *
 * Returns null for anything that does not resolve, and says no more than that:
 * distinguishing "no such token" from "that pack was withdrawn" would tell
 * someone guessing that they had guessed a real one.
 */
export async function resolvePack(token: string): Promise<PublishedPack | null> {
  if (!REMOTE_CONFIGURED) return null;
  const sb = await supabase();
  const { data, error } = await sb.rpc("resolve_recap_pack", {
    p_token: token.trim().toLowerCase(),
  });
  if (error) {
    // A read that failed is not a pack that does not exist. The caller shows
    // "we could not load this" rather than "this link is wrong".
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    tournamentId: row.tournament_id as string,
    sponsorId: row.sponsor_id as string,
    spec: row.spec as RecapSpec,
    createdAt: row.created_at as string,
  };
}
