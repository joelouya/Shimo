/**
 * Who marks whom inside a group.
 *
 * Rule 3.3b wants every card kept by a second person. Shimo pairs players
 * off: in a fourball A and B swap cards and C and D swap cards, which is how
 * a real group does it on the first tee. A group of three ends in a triangle
 * (A marks B, B marks C, C marks A) so nobody is left without a marker; a
 * group of one has no marker and the desk attests the card.
 *
 * The assignment is saved on the group and travels with the tee sheet, so
 * every device reads the same one. When a saved group carries none (a row
 * written before this existed), every device derives the same default from
 * the same player order, which is the property that matters: two phones in
 * one group must never disagree about who marks whom.
 *
 * Pure: no store, no React, so the harness can drive it directly.
 */

import type { SavedGroup } from "@/lib/sim/store";

/** playerId -> the id of the player who marks their card */
export type MarkerMap = Record<string, string>;

/** Pairs in play order; an odd group ends in a triangle. */
export function defaultMarkers(ids: string[]): MarkerMap {
  const m: MarkerMap = {};
  if (ids.length < 2) return m;
  const n = ids.length;
  const pairsEnd = n % 2 === 0 ? n : n - 3;
  for (let i = 0; i < pairsEnd; i += 2) {
    m[ids[i]] = ids[i + 1];
    m[ids[i + 1]] = ids[i];
  }
  if (pairsEnd < n) {
    const [a, b, c] = ids.slice(pairsEnd);
    m[a] = b;
    m[b] = c;
    m[c] = a;
  }
  return m;
}

/**
 * A usable assignment: every player has a marker who is in the group and is
 * not themselves, and every player marks exactly one card (a bijection).
 */
export function validMarkers(
  ids: string[],
  m: MarkerMap | undefined,
): m is MarkerMap {
  if (!m) return false;
  if (ids.length < 2) return Object.keys(m).length === 0;
  const set = new Set(ids);
  if (Object.keys(m).length !== ids.length) return false;
  const marking = new Set<string>();
  for (const id of ids) {
    const marker = m[id];
    if (!marker || marker === id || !set.has(marker)) return false;
    if (marking.has(marker)) return false;
    marking.add(marker);
  }
  return true;
}

/** The assignment in force for a group: what was saved, or the default. */
export function markersFor(
  g: Pick<SavedGroup, "playerIds" | "markers">,
): MarkerMap {
  return validMarkers(g.playerIds, g.markers)
    ? g.markers
    : defaultMarkers(g.playerIds);
}

/** The player who marks `me`'s card. */
export function markerOf(g: SavedGroup | undefined, me: string): string | null {
  if (!g || !g.playerIds.includes(me)) return null;
  return markersFor(g)[me] ?? null;
}

/** The player whose card `me` keeps (the inverse of markerOf). */
export function markedByMe(g: SavedGroup | undefined, me: string): string | null {
  if (!g || !g.playerIds.includes(me)) return null;
  const m = markersFor(g);
  for (const [player, marker] of Object.entries(m)) {
    if (marker === me) return player;
  }
  return null;
}

/**
 * Every way a group can be paired off. A fourball has three perfect
 * matchings; the desk cycles through them when two players who arrived
 * together want to keep each other's cards. Other sizes offer the default.
 */
export function pairingOptions(ids: string[]): MarkerMap[] {
  if (ids.length !== 4) return [defaultMarkers(ids)];
  const [a, b, c, d] = ids;
  const pair = (x: string, y: string, z: string, w: string): MarkerMap => ({
    [x]: y,
    [y]: x,
    [z]: w,
    [w]: z,
  });
  return [pair(a, b, c, d), pair(a, c, b, d), pair(a, d, b, c)];
}

/** "A ⇄ B · C ⇄ D", or "A → B → C → A" for a triangle, for the desk. */
export function describeMarkers(
  g: Pick<SavedGroup, "playerIds" | "markers">,
  nameOf: (id: string) => string,
): string[] {
  const m = markersFor(g);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of g.playerIds) {
    if (seen.has(id)) continue;
    const marker = m[id];
    if (!marker) continue;
    if (m[marker] === id) {
      out.push(`${nameOf(id)} ⇄ ${nameOf(marker)}`);
      seen.add(id);
      seen.add(marker);
    } else {
      // walk the cycle
      const cycle = [id];
      let cur = marker;
      while (cur && cur !== id && !cycle.includes(cur)) {
        cycle.push(cur);
        cur = m[cur];
      }
      for (const x of cycle) seen.add(x);
      out.push([...cycle, id].map(nameOf).join(" → "));
    }
  }
  return out;
}
