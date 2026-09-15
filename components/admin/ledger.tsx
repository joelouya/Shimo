"use client";

/**
 * A ruled table for the desk: one sheet, hairline rules, a quiet uppercase
 * heading row, and a horizontal scroll inside its own frame when the screen
 * is narrower than the columns. The page never scrolls sideways; the ledger
 * does. Rows are plain grids so each page keeps its own column recipe.
 */

import { cn } from "@/lib/utils";

export function Ledger({
  children,
  minWidth = 720,
  className,
}: {
  children: React.ReactNode;
  /** the width below which the sheet scrolls inside its frame, in px */
  minWidth?: number;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl bg-card shadow-card", className)}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

/** The heading row: uppercase, tracked, a hairline beneath, sand ground. */
export function LedgerHead({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={style}
      className={cn(
        "grid items-center gap-3 border-b border-border bg-secondary/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A body row: hairline between rows, a paper wash on hover where it acts. */
export function LedgerRow({
  className,
  style,
  children,
  interactive,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      style={style}
      className={cn(
        "grid items-center gap-3 border-b border-border/50 px-5 py-3 last:border-b-0",
        interactive && "transition-colors hover:bg-accent/40",
        className,
      )}
    >
      {children}
    </div>
  );
}
