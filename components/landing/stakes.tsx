"use client";

/**
 * The stakes.
 *
 * Before any mechanism, name the pain plainly so a stranger has a reason to
 * care. This is the one place the page is allowed to feel like golf rather than
 * software: two players checking paper cards on the clubhouse terrace, with
 * the editorial scorecard motif laid over the corner of the photograph,
 * carrying a query that never got resolved cleanly. No CTA. Its only job is
 * "yes, that is my problem."
 */

import Image from "next/image";

import { Reveal } from "@/components/landing/reveal";

/**
 * The messy paper reality: a card with a queried figure, in Shimo's world.
 *
 * Sized in container units of the photograph it sits over (1cqw is one
 * percent of the frame's width), so the card keeps the same proportion to
 * the photograph at every screen size and its top edge always lands on the
 * table, below the faces, rather than climbing over them when the column
 * narrows. Floors keep the type legible on a phone.
 */
function PaperCard() {
  const holes = [
    { h: "1", s: "4" },
    { h: "2", s: "5" },
    { h: "3", s: "4" },
    { h: "4", s: "6", queried: true },
    { h: "5", s: "3" },
    { h: "6", s: "5" },
    { h: "7", s: "4" },
    { h: "8", s: "2" },
    { h: "9", s: "5" },
  ];
  return (
    <div className="relative w-full">
      {/* the paper */}
      <div className="relative rotate-[-3deg] rounded-[6px] bg-[#fffdf8] p-[max(4cqw,12px)] shadow-lift ring-1 ring-black/5">
        {/* coffee ring */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[4cqw] -right-[3cqw] size-[16cqw] rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, transparent 58%, rgba(120,80,40,0.18) 60%, rgba(120,80,40,0.10) 66%, transparent 70%)",
          }}
        />
        <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-[#d8cfbc] pb-[2cqw]">
          <span className="text-[length:max(1.9cqw,8px)] font-medium uppercase tracking-[0.14em] text-[#8a8171]">
            Scorecard
          </span>
          <span className="whitespace-nowrap font-serif text-[length:max(2.5cqw,10px)] italic text-[#8a8171]">
            Captain&apos;s Prize
          </span>
        </div>

        <div className="mt-[3cqw] grid grid-cols-9 gap-[0.5cqw] text-center">
          {holes.map((r) => (
            <div key={r.h} className="flex flex-col items-center gap-[1cqw]">
              <span className="text-[length:max(1.7cqw,8px)] font-medium text-[#a89f8c] tnum">{r.h}</span>
              <span
                className={
                  r.queried
                    ? "relative font-serif text-[length:max(3cqw,12px)] text-[#1a2332] tnum"
                    : "font-serif text-[length:max(3cqw,12px)] text-[#1a2332] tnum"
                }
              >
                {r.queried ? (
                  <>
                    <span className="line-through decoration-[#b84a2e]/70">{r.s}</span>
                    <span className="absolute -top-[2cqw] -right-[1.4cqw] font-serif text-[length:max(2.2cqw,9px)] text-[#b84a2e]">?</span>
                  </>
                ) : (
                  r.s
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-[3.5cqw] flex items-center justify-between border-t border-dashed border-[#d8cfbc] pt-[2cqw]">
          <span className="text-[length:max(2cqw,8px)] text-[#a89f8c]">Marker&apos;s signature</span>
        </div>

        {/* the scrawled query */}
        <p className="mt-[2cqw] -rotate-[1.5deg] font-serif text-[length:max(2.4cqw,10px)] italic text-[#b84a2e]/80">
          check the 4th with David?
        </p>
      </div>
    </div>
  );
}

export function Stakes() {
  return (
    <section className="relative border-t border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-24 pb-32 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-32 lg:pb-36">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            The problem
          </p>
          <h2 className="mt-5 font-serif text-[clamp(34px,5.2vw,58px)] font-medium leading-[1.03] tracking-[-0.02em] text-foreground text-balance">
            Most club tournaments still run on paper cards and a spreadsheet.
          </h2>
          <p className="mt-6 max-w-xl text-[clamp(16px,1.9vw,19px)] leading-[1.7] text-ink-soft">
            Cards come in by hand and get typed up at the desk. Scores are
            queried after the round. The result is compiled by whoever is
            free, and prizegiving waits on it. Shimo replaces that hour with
            one that runs itself.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="@container relative">
          {/* A taller crop than the photograph, so both faces sit in its
              upper half and the corner the card covers is table, not people. */}
          <div className="relative aspect-[5/4] overflow-hidden rounded-3xl shadow-lift ring-1 ring-black/5">
            <Image
              src="/photos/comparing-scorecards.png"
              fill
              quality={90}
              sizes="(min-width: 1024px) 560px, 100vw"
              alt="Two golfers on a clubhouse terrace, comparing their paper scorecards after the round."
              className="object-cover object-[62%_30%]"
            />
          </div>
          {/* the card sits over the photograph's bottom corner, the way it
              sits on the table in it, and never over a face */}
          <div className="pointer-events-none absolute -bottom-[6cqw] -left-[4cqw] w-[46cqw]">
            <PaperCard />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
