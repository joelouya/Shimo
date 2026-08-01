/**
 * Sponsor inventory.
 *
 * A corporate or charity day is sold as a set of positions. Someone bought top
 * billing, someone bought the halfway house, someone bought the nearest-the-pin
 * on 7. The club promised each of them a place on specific surfaces, and the
 * whole value of doing this in software rather than in a slide deck is that the
 * promise is kept on every surface without anyone remembering to.
 *
 * Ranking lived in two places before this, each with its own private map, and
 * the two disagreed the moment a tier was added. One order, here.
 */

import type { Contest, Sponsor, SponsorSurface, SponsorTier } from "./types";

/* ------------------------------------------------------------------ *
 * Tiers
 * ------------------------------------------------------------------ */

/**
 * The billing order. Lower sorts first and is billed larger.
 *
 * The two deprecated names map onto their successors rather than being dropped:
 * a tournament created before the inventory existed keeps its sponsors, and a
 * club is not asked to re-enter them.
 */
const RANK: Record<SponsorTier, number> = {
  title: 0,
  presenting: 1,
  category: 2,
  prize: 2,
  supporting: 3,
  partner: 3,
};

/** Collapse the deprecated names so everything downstream sees four tiers. */
export function normaliseTier(tier?: SponsorTier): SponsorTier {
  if (tier === "prize") return "category";
  if (tier === "partner") return "supporting";
  return tier ?? "supporting";
}

export function tierRank(tier?: SponsorTier): number {
  return RANK[tier ?? "supporting"] ?? 3;
}

export const TIER_LABEL: Record<
  "title" | "presenting" | "category" | "supporting",
  string
> = {
  title: "Title sponsor",
  presenting: "Presenting sponsor",
  category: "Category sponsor",
  supporting: "Supporting sponsor",
};

/**
 * Billing order, with a stable tiebreak.
 *
 * Sorting on tier alone leaves same-tier sponsors in whatever order the club
 * happened to type them, which changes between renders of the same poster.
 * A sponsor noticing they moved is a phone call the club does not need.
 */
export function inBillingOrder(sponsors: Sponsor[]): Sponsor[] {
  return [...sponsors].sort(
    (a, b) => tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name),
  );
}

/** The one sponsor with top billing, if the club sold it. */
export function titleSponsor(sponsors: Sponsor[]): Sponsor | undefined {
  return sponsors.find((s) => normaliseTier(s.tier) === "title");
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/**
 * What each tier gets when the club has not said otherwise.
 *
 * Title buys everything. Presenting buys everything except the contest
 * markers, which belong to whoever bought a contest. Category appears where
 * their category lives plus the recap. Supporting is the poster foot and the
 * recap, which is the honest version of what a supporting logo is worth.
 */
const DEFAULT_PLACEMENTS: Record<
  "title" | "presenting" | "category" | "supporting",
  SponsorSurface[]
> = {
  title: ["poster", "tournament-page", "leaderboard", "tv", "contest", "recap"],
  presenting: ["poster", "tournament-page", "leaderboard", "tv", "recap"],
  category: ["poster", "tournament-page", "contest", "recap"],
  supporting: ["poster", "recap"],
};

export function placementsOf(s: Sponsor): SponsorSurface[] {
  if (s.placements?.length) return s.placements;
  return DEFAULT_PLACEMENTS[
    normaliseTier(s.tier) as keyof typeof DEFAULT_PLACEMENTS
  ];
}

export function appearsOn(s: Sponsor, surface: SponsorSurface): boolean {
  return placementsOf(s).includes(surface);
}

/** Everyone entitled to one surface, in billing order. */
export function sponsorsOn(
  sponsors: Sponsor[],
  surface: SponsorSurface,
): Sponsor[] {
  return inBillingOrder(sponsors.filter((s) => appearsOn(s, surface)));
}

/* ------------------------------------------------------------------ *
 * What a club must have before it can publish
 * ------------------------------------------------------------------ */

export interface SponsorProblem {
  sponsorId?: string;
  message: string;
}

/**
 * Whether the inventory is sound enough to publish a corporate or charity day.
 *
 * These are the mistakes that are expensive after the fact rather than before.
 * A duplicated title sponsor means two companies were both told they had top
 * billing. A contest with no sponsor is a marker on a tee with a blank on it.
 * A sponsor with no contact is a recap pack that cannot be delivered, which is
 * discovered the week after the event when it is far too late to ask.
 */
export function sponsorProblems(
  sponsors: Sponsor[],
  contests: Contest[] = [],
): SponsorProblem[] {
  const out: SponsorProblem[] = [];

  if (sponsors.length === 0) {
    out.push({
      message:
        "A corporate or charity day needs at least one sponsor before it can be published.",
    });
    return out;
  }

  const titles = sponsors.filter((s) => normaliseTier(s.tier) === "title");
  if (titles.length > 1)
    out.push({
      message: `Two sponsors are set as title sponsor: ${titles
        .map((s) => s.name)
        .join(" and ")}. Only one can have top billing.`,
    });

  for (const s of sponsors) {
    if (normaliseTier(s.tier) === "category" && !s.category?.trim())
      out.push({
        sponsorId: s.id,
        message: `${s.name} is a category sponsor with no category. Say what they bought.`,
      });
    if (!s.contact?.name?.trim())
      out.push({
        sponsorId: s.id,
        message: `${s.name} has no contact person, so their recap pack has nowhere to go.`,
      });
  }

  for (const c of contests) {
    if (c.sponsorId && !sponsors.some((s) => s.id === c.sponsorId))
      out.push({
        message: `${c.name} on hole ${c.hole} points at a sponsor that is no longer on the sheet.`,
      });
  }

  return out;
}

/** Blocking problems only. A missing contact is a warning, not a blocker. */
export function canPublish(sponsors: Sponsor[], contests: Contest[] = []) {
  return !sponsorProblems(sponsors, contests).some(
    (p) => !/contact person/.test(p.message),
  );
}

/* ------------------------------------------------------------------ *
 * Contests
 * ------------------------------------------------------------------ */

/** The contest a player is standing on, if any. Used by the scoring screens. */
export function contestOnHole(
  contests: Contest[],
  hole: number,
  round = 1,
): Contest | undefined {
  return contests.find((c) => c.hole === hole && (c.round ?? 1) === round);
}

/** Contests this sponsor bought, in hole order. */
export function contestsFor(contests: Contest[], sponsorId: string): Contest[] {
  return contests
    .filter((c) => c.sponsorId === sponsorId)
    .sort((a, b) => a.hole - b.hole);
}
