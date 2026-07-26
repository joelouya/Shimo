"use client";

/**
 * Club branding, scoped.
 *
 * A club's colour must reach its own surfaces and stop there: Shimo's wordmark,
 * type, cream field and navy panels are the product's identity and do not
 * change per club. So the accent is published as CSS variables on a wrapper,
 * and only the elements inside that wrapper opt into them. Anything that does
 * not ask for `--club-accent` keeps Shimo's terracotta.
 *
 * Two tones are published, because one colour cannot be legible on both the
 * cream field and the navy panels; see lib/contrast.ts.
 */

import { clubById } from "@/lib/data";
import {
  DEFAULT_ACCENT,
  accentOnDark,
  accentOnLight,
  textOnAccent,
} from "@/lib/contrast";
import { clubIdentityOf, useSim } from "@/lib/sim/store";
import type { ClubIdentity } from "@/lib/types";

export function useClubIdentity(clubId: string): ClubIdentity {
  return useSim((s) => clubIdentityOf(s, clubId));
}

/** The accent variables for a club, ready to spread onto a style prop. */
export function clubAccentVars(accent?: string): React.CSSProperties {
  const base = accent ?? DEFAULT_ACCENT;
  return {
    ["--club-accent" as string]: accentOnLight(base),
    ["--club-accent-dark" as string]: accentOnDark(base),
    ["--club-accent-text" as string]: textOnAccent(base),
  };
}

/**
 * Wrap a surface that belongs to a club. Inside, `var(--club-accent)` is the
 * club's colour on light surfaces and `var(--club-accent-dark)` on dark ones;
 * both fall back to Shimo's terracotta when the club has set nothing.
 */
export function ClubSurface({
  clubId,
  children,
  className,
  as: Tag = "div",
}: {
  clubId: string;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "header";
}) {
  const identity = useClubIdentity(clubId);
  return (
    <Tag className={className} style={clubAccentVars(identity.accent)}>
      {children}
    </Tag>
  );
}

/**
 * A club's crest, falling back to nothing rather than to a placeholder: an
 * empty space reads better than someone else's mark.
 */
export function ClubCrest({
  clubId,
  className,
  alt,
}: {
  clubId: string;
  className?: string;
  alt?: string;
}) {
  const identity = useClubIdentity(clubId);
  if (!identity.logoUrl) return null;
  return (
    // the club's own uploaded file, so Next's optimiser is bypassed
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={identity.logoUrl}
      alt={alt ?? `${clubById(clubId).name} crest`}
      className={className}
    />
  );
}
