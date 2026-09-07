"use client";

/**
 * Pricing (honest) + the final ask.
 *
 * Trust has been built across the sections above, so this is where the real,
 * heavier ask lands, distinct from the hero's low-commitment "See how it works."
 * Pricing is folded in as one honest line: PRODUCT.md commits to no pricing
 * during the pilot, so there are no tiers and no numbers, just "free during the
 * pilot." A navy panel bookends the navy overture at the top of the page.
 */

import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";

export function FinalCta({ onStart }: { onStart?: () => void }) {
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
            No licence and no tiers while we run pilots with founding clubs. We
            set up your first event with you, on your course and in your colours.
          </p>
          <div className="mt-10">
            <button
              type="button"
              onClick={onStart}
              className="group inline-flex items-center gap-2.5 rounded-xl bg-clay px-8 py-4 text-[16px] font-medium text-cream shadow-lift transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-clay-deep active:scale-[0.98]"
            >
              Start a pilot tournament
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
