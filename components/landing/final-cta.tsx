"use client";

/**
 * Pricing (honest) + the final ask.
 *
 * Trust has been built across the sections above, so this is where the real,
 * heavier ask lands. Pricing is folded in as one honest line: the pilot is
 * free, and nothing beyond that is decided, so there are no tiers and no
 * numbers (docs/COMMITMENTS.md). The ask is a conversation when a contact
 * address is configured, and the desk itself when it is not: a phone that
 * opens the desk is shown the way to the golfer app there. A navy panel
 * bookends the navy overture at the top of the page.
 */

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { contactHref } from "@/lib/contact";

export function FinalCta() {
  const mail = contactHref("Running a tournament on Shimo");
  return (
    <section
      id="get-started"
      className="relative scroll-mt-24 overflow-hidden bg-primary text-primary-foreground"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.06), transparent 55%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-3xl px-6 py-28 text-center lg:py-36">
        <Reveal>
          <p className="smallcaps text-clay-lift">Free during the pilot</p>
          <h2 className="mx-auto mt-5 max-w-2xl font-serif text-[clamp(36px,6vw,68px)] font-medium leading-[1.02] tracking-[-0.02em] text-cream text-balance">
            Run your next tournament on Shimo.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[clamp(16px,2vw,19px)] leading-[1.6] text-cream/70">
            The pilot club pays nothing. We set up your first event with you,
            on your course and in your colours, and stand at the desk on the day.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {mail ? (
              <a
                href={mail}
                className="focus-ring group inline-flex items-center gap-2.5 rounded-xl bg-clay px-8 py-4 text-[16px] font-medium text-cream shadow-lift transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-clay-deep active:scale-[0.98]"
              >
                <Mail className="size-4" />
                Start a pilot with us
              </a>
            ) : (
              <Link
                href="/admin"
                className="focus-ring group inline-flex items-center gap-2.5 rounded-xl bg-clay px-8 py-4 text-[16px] font-medium text-cream shadow-lift transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-clay-deep active:scale-[0.98]"
              >
                Open the club desk
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            <Link
              href={mail ? "/admin" : "/app"}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-cream/20 px-6 py-4 text-[15px] font-medium text-cream transition-colors duration-200 hover:border-cream/40 hover:bg-cream/5"
            >
              {mail ? "Try the demo first" : "Try the golfer app"}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
