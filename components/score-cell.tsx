"use client";

/**
 * The score cell, the component that most defines the system (DESIGN.md).
 *
 * One gross figure, marked the way a card has been marked for a century:
 * a terracotta ring for a birdie, a double ring for an eagle or better, a
 * stone box for a bogey, a double box for worse, and nothing at all on a
 * par. A figure the two cards disagree on is flagged in amber, shape and
 * all, so the desk sees both what was scored and that it is contested.
 * A missing figure is a quiet dot.
 *
 * The double shapes are two concentric lines with paper between them, drawn
 * with a pseudo-element inside the outer border, not a thicker single line.
 * At 24px a thicker line reads as a darker ring, and the scorer's eye is
 * looking for two.
 *
 * Every card in the product draws through here, so the notation is the same
 * on the phone, on the desk and in the Committee room.
 */

import { cn } from "@/lib/utils";

const SIZE = {
  sm: { cell: "size-5 text-[11px]", inner: "before:inset-[2px]" },
  md: { cell: "size-6 text-[12.5px]", inner: "before:inset-[2.5px]" },
  lg: { cell: "size-7 text-[13px]", inner: "before:inset-[3px]" },
} as const;

/** The inner line of a double ring or double box, sized to the cell. */
const INNER = "relative before:pointer-events-none before:absolute before:border";

export function ScoreCell({
  gross,
  par,
  size = "md",
  dim,
  flag,
  className,
}: {
  gross: number | null | undefined;
  par: number;
  size?: keyof typeof SIZE;
  /** the marker's copy, or any figure that is not the one being read */
  dim?: boolean;
  /** the two cards disagree here */
  flag?: boolean;
  className?: string;
}) {
  if (gross == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground",
          SIZE[size].cell,
          flag && "rounded-md bg-amber-wash text-amber-flag",
          className,
        )}
        aria-label="no score"
      >
        ·
      </span>
    );
  }
  const d = gross - par;
  const ring = flag ? "border-amber-flag" : "border-clay";
  const box = flag ? "border-amber-flag" : "border-stone/60";
  const innerRing = flag ? "before:border-amber-flag" : "before:border-clay";
  const innerBox = flag ? "before:border-amber-flag" : "before:border-stone/60";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-medium tnum",
        SIZE[size].cell,
        d === -1 && `rounded-full border ${ring}`,
        d <= -2 &&
          `rounded-full border ${ring} ${INNER} before:rounded-full ${innerRing} ${SIZE[size].inner}`,
        d === 1 && `rounded-sm border ${box}`,
        d >= 2 &&
          `rounded-sm border ${box} ${INNER} before:rounded-[1px] ${innerBox} ${SIZE[size].inner}`,
        flag
          ? "bg-amber-wash text-amber-flag"
          : d < 0
            ? "text-clay-deep"
            : d > 0
              ? "text-ink-soft"
              : "text-foreground",
        flag && d === 0 && "rounded-md",
        dim && "opacity-70",
        className,
      )}
      title={
        d <= -2 ? "Eagle or better" : d === -1 ? "Birdie" : d === 0 ? "Par" : d === 1 ? "Bogey" : "Double bogey or worse"
      }
    >
      {gross}
    </span>
  );
}
