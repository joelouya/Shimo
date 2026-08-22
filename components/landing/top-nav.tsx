"use client";

/**
 * The floating landing nav.
 *
 * A single translucent pill, fixed at the top, so scrolling is never the only
 * way to move around the page. Its own cream backdrop keeps it legible over
 * both the navy cinematic and the paper page beneath. "How it works" jumps past
 * the pinned opening to the section below; the routes go straight into the two
 * halves of the product.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/logo";

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const linkClass =
  "rounded-full px-3.5 py-2 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground";

export function TopNav({ onGetStarted }: { onGetStarted?: () => void }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-[color-mix(in_srgb,var(--color-foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-cream)_82%,transparent)] py-1.5 pr-1.5 pl-4 shadow-lift backdrop-blur-md">
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          className="mr-1 transition-opacity hover:opacity-70"
        >
          <Logo className="text-[16px]" />
        </button>

        <span className="mx-1 hidden h-4 w-px bg-[color-mix(in_srgb,var(--color-foreground)_14%,transparent)] sm:block" />

        <div className="hidden items-center sm:flex">
          <button type="button" onClick={() => scrollToId("how-it-works")} className={linkClass}>
            How it works
          </button>
          <Link href="/admin" className={linkClass}>
            The club
          </Link>
          <Link href="/app" className={linkClass}>
            The golfer
          </Link>
        </div>

        <button
          type="button"
          onClick={onGetStarted}
          className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-clay px-4 py-2 text-[13px] font-medium text-cream shadow-xs transition-[background-color,transform] duration-200 hover:bg-clay-deep active:scale-[0.98]"
        >
          Get started
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}
