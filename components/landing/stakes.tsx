"use client";

/**
 * The stakes.
 *
 * Before any mechanism, name the pain plainly so a stranger has a reason to
 * care. This is the one place the page is allowed to feel like golf rather than
 * software, and it does it on-brand: no stock photography, just an editorial
 * paper-scorecard motif built from type and texture, carrying a query that
 * never got resolved cleanly. No CTA. Its only job is "yes, that is my problem."
 */

import { Reveal } from "@/components/landing/reveal";

/** The messy paper reality: a card with a queried figure, in Shimo's world. */
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
    <div className="relative mx-auto w-full max-w-[380px]">
      {/* the paper */}
      <div className="relative rotate-[-3deg] rounded-[6px] bg-[#fffdf8] p-6 shadow-lift ring-1 ring-black/5">
        {/* coffee ring */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-6 -right-4 size-24 rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, transparent 58%, rgba(120,80,40,0.18) 60%, rgba(120,80,40,0.10) 66%, transparent 70%)",
          }}
        />
        <div className="flex items-baseline justify-between border-b border-dashed border-[#d8cfbc] pb-3">
          <span className="smallcaps text-[#8a8171]">Scorecard</span>
          <span className="font-serif text-[15px] italic text-[#8a8171]">Captain&apos;s Prize</span>
        </div>

        <div className="mt-4 grid grid-cols-9 gap-1 text-center">
          {holes.map((r) => (
            <div key={r.h} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium text-[#a89f8c] tnum">{r.h}</span>
              <span
                className={
                  r.queried
                    ? "relative font-serif text-[17px] text-[#1a2332] tnum"
                    : "font-serif text-[17px] text-[#1a2332] tnum"
                }
              >
                {r.queried ? (
                  <>
                    <span className="line-through decoration-[#b84a2e]/70">{r.s}</span>
                    <span className="absolute -top-3 -right-2 font-serif text-[13px] text-[#b84a2e]">?</span>
                  </>
                ) : (
                  r.s
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-dashed border-[#d8cfbc] pt-3">
          <span className="text-[12px] text-[#a89f8c]">Marker&apos;s signature</span>
          <span className="font-serif text-[17px] italic text-[#c4bba6]">&nbsp;</span>
        </div>

        {/* the scrawled query */}
        <p className="mt-3 -rotate-[1.5deg] font-serif text-[14px] italic text-[#b84a2e]/80">
          check the 4th with David?
        </p>
      </div>
    </div>
  );
}

export function Stakes() {
  return (
    <section className="relative border-t border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-32">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            Tournament day, today
          </p>
          <h2 className="mt-5 font-serif text-[clamp(34px,5.2vw,58px)] font-medium leading-[1.03] tracking-[-0.02em] text-foreground text-balance">
            The day still runs
            <br className="hidden sm:block" /> on paper.
          </h2>
          <p className="mt-6 max-w-xl text-[clamp(16px,1.9vw,19px)] leading-[1.7] text-ink-soft">
            Cards come in by hand and are typed up at the desk. A score gets
            queried after the round. The result is compiled by whoever is free,
            and prize-giving waits on a spreadsheet.
          </p>
          <p className="mt-4 max-w-xl font-serif text-[clamp(18px,2.1vw,22px)] italic leading-[1.5] text-foreground">
            A good competition, held together by its most fragile hour.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="flex justify-center lg:justify-end">
          <PaperCard />
        </Reveal>
      </div>
    </section>
  );
}
