"use client";

/**
 * A list on the left and the chosen thing on the right, the way an invoice
 * ledger opens the selected invoice beside it. The list keeps its own scroll
 * on a tall page; the detail pane takes the rest. Below a laptop width the
 * two stack, list first, so nothing is hidden on a tablet.
 */

import { cn } from "@/lib/utils";

export function MasterDetail({
  list,
  detail,
  listWidth = 380,
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  listWidth?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-1 gap-6 lg:grid-cols-[var(--list)_minmax(0,1fr)]", className)}
      style={{ "--list": `${listWidth}px` } as React.CSSProperties}
    >
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">{list}</div>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}

/** A row in the list: selected rows carry the ink edge the desk is reading. */
export function ListRow({
  selected,
  onSelect,
  children,
  className,
}: {
  selected?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "focus-ring flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0",
        selected ? "bg-primary text-primary-foreground" : "hover:bg-accent/50",
        className,
      )}
    >
      {children}
    </button>
  );
}
