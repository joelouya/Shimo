"use client";

/**
 * The head of every desk page, set in a navy band that runs the full width
 * of the screen beneath the top bar: one eyebrow, one serif title in cream,
 * one line of fact, and the page's actions on the right. The page's first
 * block may lift into the band (`overlap`), the way a sheet of cards sits
 * over the dark header in a well-kept ledger. Below the widest screens the
 * actions drop under the title and wrap, so nothing is cut off on a laptop.
 *
 * The band reaches the screen edges from inside a centred column: the
 * layout's main is a container, so 100cqw is its width without the
 * scrollbar, which 100vw is not.
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
  tone = "band",
  overlap = false,
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
  /** navy band (the desk's default) or plain on paper */
  tone?: "band" | "plain";
  /** leave room for the next block to lift into the band */
  overlap?: boolean;
  className?: string;
}) {
  const band = tone === "band";
  return (
    <header
      className={cn(
        "relative isolate",
        band &&
          "text-primary-foreground before:absolute before:inset-y-0 before:left-[calc(50%-50cqw)] before:-z-10 before:w-[100cqw] before:bg-primary",
        band ? (overlap ? "pt-7 pb-16 md:pt-8 md:pb-[72px]" : "pt-7 pb-8 md:pt-8 md:pb-9") : "pt-6",
        className,
      )}
    >
      {back && (
        <Link
          href={back.href}
          className={cn(
            "focus-ring mb-3 inline-flex items-center gap-1.5 rounded-md text-xs",
            band
              ? "text-primary-foreground/65 hover:text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="size-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <p className={cn("smallcaps", band ? "text-primary-foreground/60" : "text-muted-foreground")}>
              {eyebrow}
            </p>
            {live && <LiveBadge />}
          </div>
          <h1
            className={cn(
              "mt-2 font-serif text-[clamp(30px,3.8vw,44px)] font-medium leading-[1.02] tracking-[-0.016em]",
              band ? "text-cream" : "text-foreground",
            )}
          >
            {title}
          </h1>
          {meta && (
            <p className={cn("mt-1.5 text-[13px]", band ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {meta}
            </p>
          )}
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

/** The block that lifts into the band: pair with `overlap` on PageHeader. */
export function BandOverlap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("relative z-[1] -mt-10 md:-mt-12", className)}>{children}</div>;
}
