"use client";

/**
 * A row of pills for switching what a page shows: All, Draft 3, Unpaid 5.
 * One selected, drawn in ink; the rest quiet on sand. Counts sit in the pill
 * so the desk knows what is behind each before choosing it.
 */

import { cn } from "@/lib/utils";

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
  /** a little dot: something in this segment wants attention */
  attention?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  items: SegmentedItem<T>[];
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-secondary p-1",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "focus-ring flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-colors",
              size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-4 text-[13px]",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-ink-soft hover:text-foreground",
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tnum",
                  active ? "bg-cream/15 text-cream" : "bg-card text-muted-foreground",
                )}
              >
                {it.count}
              </span>
            )}
            {it.attention && <span className="size-1.5 rounded-full bg-clay" />}
          </button>
        );
      })}
    </div>
  );
}
