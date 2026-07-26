/**
 * Entry pricing.
 *
 * A club medal has one price. A championship has several: a member rate, a
 * loyalty rate for returning players, an early bird that expires before
 * entries close. So a tournament carries a sheet of tiers, and the single
 * `entryFee` on it is just the cheapest one currently available, kept so
 * lists and cards have a number to show.
 *
 * A player is always given the best price they qualify for. Nobody should pay
 * the guest rate because they did not notice the member one.
 */

import { membershipOf } from "./eligibility";
import type { FeeTier, Player, Tournament } from "./types";

/** Every tier, with the single-price case expressed as one. */
export function tiersOf(t: Tournament): FeeTier[] {
  if (t.feeTiers && t.feeTiers.length > 0) return t.feeTiers;
  return [
    { id: "standard", label: "Standard entry", amount: t.entryFee, audience: "all" },
  ];
}

/** Tiers still on offer: an early bird past its date has gone. */
export function availableTiers(t: Tournament, now = new Date()): FeeTier[] {
  const live = tiersOf(t).filter((x) => !x.until || new Date(x.until) > now);
  // never leave a tournament with no price at all
  return live.length ? live : tiersOf(t).slice(0, 1);
}

function qualifies(tier: FeeTier, t: Tournament, player: Player): boolean {
  if (tier.audience === "all") return true;
  const isMember = player.clubId === t.clubId;
  return tier.audience === "members" ? isMember : !isMember;
}

/** The best price this player can have today, and why. */
export function tierFor(
  t: Tournament,
  player: Player,
  now = new Date(),
): FeeTier {
  const eligible = availableTiers(t, now).filter((x) => qualifies(x, t, player));
  const pool = eligible.length ? eligible : availableTiers(t, now);
  return pool.reduce((best, x) => (x.amount < best.amount ? x : best), pool[0]);
}

/** The spread of prices on offer, for a card. */
export function priceRange(
  t: Tournament,
  now = new Date(),
): { min: number; max: number; single: boolean } {
  const amounts = availableTiers(t, now).map((x) => x.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { min, max, single: min === max };
}

/**
 * Keep `entryFee` in step with the sheet, so anything reading the single
 * number shows the cheapest price actually available rather than a stale one.
 */
export function withPricingSynced(t: Tournament): Tournament {
  const tiers = tiersOf(t);
  const amounts = tiers.map((x) => x.amount);
  return { ...t, feeTiers: tiers, entryFee: Math.min(...amounts) };
}

/** Whether a member rate is on the sheet, for wording on the card. */
export function hasMemberRate(t: Tournament): boolean {
  return tiersOf(t).some((x) => x.audience === "members");
}

/**
 * "You're getting the members rate" reads well; "the loyalty rate rate" does
 * not. Clubs name tiers both ways, so only add the noun when it is missing.
 */
export function tierPhrase(tier: FeeTier): string {
  const label = tier.label.trim();
  if (!label) return "standard rate";
  return /\b(rate|price|entry|fee)$/i.test(label)
    ? label.toLowerCase()
    : `${label.toLowerCase()} rate`;
}

export function makeTier(n: number): FeeTier {
  return {
    id: `tier-${n}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    amount: 0,
    audience: "all",
  };
}

/** True when the club has set up more than one price. */
export function isTiered(t: Tournament): boolean {
  return tiersOf(t).length > 1;
}

export { membershipOf };
