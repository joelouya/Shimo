"use client";

/**
 * Sponsor billing.
 *
 * Sponsors pay for the day and expect to be seen, but a leaderboard is for
 * scores. So the strip is quiet by default and sized by tier: the title
 * sponsor gets the most room, everyone else shares a line. On the dark
 * leaderboard the marks sit at the foot, out of the way of the board itself.
 */

import type { Sponsor } from "@/lib/types";

/** Title first, then prize, then category, then the rest. */
const ORDER: Record<string, number> = {
  title: 0,
  prize: 1,
  category: 2,
  partner: 3,
};

export function sortedSponsors(sponsors: Sponsor[] | undefined): Sponsor[] {
  if (!sponsors?.length) return [];
  return [...sponsors].sort(
    (a, b) => (ORDER[a.tier ?? "partner"] ?? 9) - (ORDER[b.tier ?? "partner"] ?? 9),
  );
}

export function tierLabel(tier?: Sponsor["tier"]): string {
  return tier === "title"
    ? "Title sponsor"
    : tier === "prize"
      ? "Prize sponsor"
      : tier === "category"
        ? "Category sponsor"
        : "Partner";
}

export function SponsorStrip({
  sponsors,
  tone = "light",
  className,
  showTitleLabel = true,
}: {
  sponsors: Sponsor[] | undefined;
  tone?: "light" | "dark";
  className?: string;
  /** name the title sponsor in words, which is usually what they paid for */
  showTitleLabel?: boolean;
}) {
  const list = sortedSponsors(sponsors);
  if (!list.length) return null;

  const muted = tone === "dark" ? "text-primary-foreground/45" : "text-muted-foreground";
  const title = list.find((s) => s.tier === "title");
  const rest = list.filter((s) => s !== title);

  return (
    <div className={className}>
      <p className={`smallcaps text-[9px] ${muted}`}>
        {list.length === 1 ? "Sponsor" : "Sponsors"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {title && (
          <div className="flex items-center gap-2">
            {title.logoUrl ? (
              // a sponsor's own artwork, so Next's optimiser is bypassed
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={title.logoUrl}
                alt={title.name}
                className="h-8 w-auto max-w-[120px] object-contain"
              />
            ) : (
              <span
                className={
                  tone === "dark"
                    ? "text-[14px] font-medium text-primary-foreground/85"
                    : "text-[14px] font-medium text-foreground"
                }
              >
                {title.name}
              </span>
            )}
            {showTitleLabel && (
              <span className={`text-[10px] ${muted}`}>{tierLabel("title")}</span>
            )}
          </div>
        )}
        {rest.map((s) =>
          s.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={s.id}
              src={s.logoUrl}
              alt={s.name}
              title={`${s.name} · ${tierLabel(s.tier)}`}
              className="h-6 w-auto max-w-[92px] object-contain opacity-85"
            />
          ) : (
            <span
              key={s.id}
              title={tierLabel(s.tier)}
              className={`text-[12.5px] ${
                tone === "dark" ? "text-primary-foreground/70" : "text-ink-soft"
              }`}
            >
              {s.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
