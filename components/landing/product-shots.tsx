"use client";

/**
 * Real product screenshots.
 *
 * Proof the software exists and works, shown unframed: these are actual captures
 * of the running app (Live Ops, tournament setup, on-course scoring), not
 * illustrative fragments inside mock device chrome. The interface is the
 * evidence here, so there is no golf photography and no CTA.
 */

import { Reveal } from "@/components/landing/reveal";

function Caption({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[15px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{children}</p>
    </div>
  );
}

export function ProductShots() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            The real thing
          </p>
          <h2 className="mt-5 max-w-2xl font-serif text-[clamp(32px,5vw,54px)] font-medium leading-[1.04] tracking-[-0.02em] text-foreground text-balance">
            This is the actual product.
          </h2>
          <p className="mt-5 max-w-lg text-[clamp(15px,1.8vw,17px)] leading-[1.65] text-ink-soft">
            Not mockups. These are the screens a club and its golfers use on the
            day, captured from the running app.
          </p>
        </Reveal>

        {/* Feature: Live Ops */}
        <Reveal className="mt-14">
          <figure>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
              <img
                src="/shots/live-ops.jpg"
                alt="The club's Live Ops screen: every group on the course, a live leaderboard and a running score feed."
                loading="lazy"
                className="block w-full"
              />
            </div>
            <Caption title="Live Ops, the club's command desk">
              Every group, flag and certification on one screen as the round runs.
            </Caption>
          </figure>
        </Reveal>

        {/* Setup + golfer scoring */}
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Reveal>
            <figure>
              <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                <img
                  src="/shots/setup.jpg"
                  alt="The tournament setup wizard: kind of day, name, date, course and format."
                  loading="lazy"
                  className="block w-full object-cover object-top"
                />
              </div>
              <Caption title="Set up a tournament in minutes">
                Format, field, pairings and the tee sheet, step by step.
              </Caption>
            </figure>
          </Reveal>

          <Reveal delay={0.08}>
            <figure>
              <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-card shadow-card">
                <img
                  src="/shots/scoring.jpg"
                  alt="The golfer's phone: entering scores hole by hole and marking a playing partner's card."
                  loading="lazy"
                  className="block w-full object-cover object-top"
                />
              </div>
              <Caption title="The golfer scores from their phone">
                Hole by hole, marking a partner's card, no download.
              </Caption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
