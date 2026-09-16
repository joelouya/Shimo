"use client";

/**
 * One figure the desk keeps an eye on: a label, the figure in serif, a line
 * saying which way it has moved, and the recent shape beneath. Four of these
 * across the top of a page are the day at a glance; each can lead somewhere.
 */

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Sparkline } from "@/components/admin/sparkline";
import { cn } from "@/lib/utils";

export interface StatDelta {
  text: string;
  dir?: "up" | "down" | "flat";
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  spark,
  sparkKind = "bars",
  icon,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** a small word after the figure: "days", "of 48" */
  unit?: React.ReactNode;
  delta?: StatDelta;
  spark?: number[];
  sparkKind?: "bars" | "line";
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="smallcaps text-muted-foreground">{label}</p>
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-ink-soft">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 font-serif text-[34px] leading-none text-foreground tnum">
        {value}
        {unit && <span className="ml-1.5 text-[15px] text-muted-foreground">{unit}</span>}
      </p>
      {delta && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-muted-foreground">
          {delta.dir === "up" && <ArrowUpRight className="size-3.5 text-clay-deep" />}
          {delta.dir === "down" && <ArrowDownRight className="size-3.5 text-stone" />}
          {delta.dir === "flat" && <Minus className="size-3.5 text-stone" />}
          <span className={cn(delta.dir === "up" && "text-clay-deep")}>{delta.text}</span>
        </p>
      )}
      {spark && spark.length > 0 && (
        <div className="mt-4">
          <Sparkline values={spark} kind={sparkKind} />
        </div>
      )}
    </>
  );
  const shell = cn(
    "block rounded-2xl bg-card p-5 shadow-card",
    href && "focus-ring transition-shadow hover:shadow-lift",
    className,
  );
  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
