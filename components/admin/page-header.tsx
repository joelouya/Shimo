"use client";

/**
 * The head of every desk page: one eyebrow, one serif title, one line of
 * fact underneath, and the page's actions on the right. Below the widest
 * screens the actions drop under the title and wrap, so nothing is ever cut
 * off at the edge of a laptop. A page that is inside an event carries the
 * back link above, the way a printed sheet carries its heading.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LiveBadge } from "@/components/live-dot";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
  back,
  live,
  className,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  /** one line of fact under the title: date, club, format, counts */
  meta?: React.ReactNode;
  /** the page's controls; the one clay action at most, per the Red Pencil Rule */
  actions?: React.ReactNode;
  /** where this page came from, for pages inside an event */
  back?: { href: string; label: string };
  /** a round is on the course and this page is part of it */
  live?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("animate-enter-rise", className)}>
      {back && (
        <Link
          href={back.href}
          className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <p className="smallcaps text-muted-foreground">{eyebrow}</p>
            {live && <LiveBadge />}
          </div>
          <h1 className="mt-2 font-serif text-[clamp(30px,3.8vw,44px)] font-medium leading-[1.02] tracking-[-0.016em] text-foreground">
            {title}
          </h1>
          {meta && <p className="mt-1.5 text-[13px] text-muted-foreground">{meta}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end xl:pb-1">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
