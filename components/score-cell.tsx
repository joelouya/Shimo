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
 * Every card in the product draws through here, so the notation is the same
 * on the phone, on the desk and in the Committee room.
 */

import { cn } from "@/lib/utils";

const SIZE = {
  sm: "size-5 text-[11px]",
  md: "size-6 text-[12.5px]",
  lg: "size-7 text-[13px]",
} as const;

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
          SIZE[size],
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
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-medium tnum",
        SIZE[size],
        d === -1 && `rounded-full border ${ring}`,
        d <= -2 && `rounded-full border-2 ${ring}`,
        d === 1 && `rounded-sm border ${box}`,
        d >= 2 && `rounded-sm border-2 ${box}`,
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
