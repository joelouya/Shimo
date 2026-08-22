"use client";

/**
 * Proof / credibility.
 *
 * Answers "does this actually work, is this real" without fabricating anything
 * (PRODUCT.md forbids invented customers, numbers, quotes, or logos). The three
 * binding positioning claims stand as the substance, each beside a different
 * piece of evidence, under one honest framing line. The credibility strip is
 * deliberately claim-free of numbers and is the slot real pilot stats drop into
 * later, without a rebuild.
 */

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/landing/reveal";

/* ------------------------------------------------------------------ *
 * The evidence beside each claim. Three deliberately different shapes:
 * a row of matching cards is the thing this page exists not to be.
 * ------------------------------------------------------------------ */

function ChainEvidence() {
  const steps = [
    { label: "Entered twice", detail: "player and marker, independently" },
    { label: "Attested", detail: "by the marker who kept the card" },
    { label: "Certified", detail: "by the player" },
    { label: "Sealed", detail: "SHA-256 over every figure on it" },
  ];
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      {steps.map((s, i) => (
        <div key={s.label} className="flex gap-3.5">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "mt-1.5 size-1.5 rounded-full",
                i === steps.length - 1 ? "bg-clay" : "bg-stone/50",
              )}
            />
            {i < steps.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className={i < steps.length - 1 ? "pb-4" : ""}>
            <p className="text-[13px] font-medium text-foreground">{s.label}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OfflineEvidence() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-flag" />
        <span className="smallcaps text-amber-flag">Reconnecting</span>
      </div>
      <p className="mt-3 font-serif text-[22px] leading-tight text-foreground">
        Holding 11 scores
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        The board keeps the last figure it trusted. Nothing blanks and nothing
        reloads, and the moment the phone finds the club again everything
        reconciles in order.
      </p>
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="smallcaps text-muted-foreground">Last seen</span>
        <span className="ml-auto text-[13px] text-ink-soft tnum">14:07</span>
      </div>
    </div>
  );
}

function BoardEvidence() {
  const rows = [
    { pos: 1, name: "A. Wanjiru", score: "-4" },
    { pos: 2, name: "J. Ouya", score: "-2" },
    { pos: 3, name: "D. Kamau", score: "-1" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-broadcast-ink p-5 shadow-card">
      <p className="smallcaps text-cream/55">Through 14</p>
      <p className="mt-1 font-serif text-[22px] leading-tight text-cream">
        Captain&apos;s Prize
      </p>
      <div className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <div key={r.pos} className="flex items-baseline gap-3">
            <span
              className={`w-4 font-serif text-[13px] tnum ${
                r.pos === 1 ? "text-clay-lift" : "text-cream/55"
              }`}
            >
              {r.pos}
            </span>
            <span
              className={`flex-1 font-serif text-[15px] ${
                r.pos === 1 ? "text-cream" : "text-cream/70"
              }`}
            >
              {r.name}
            </span>
            <span
              className={`font-serif text-[15px] tnum ${
                r.pos === 1 ? "text-clay-lift" : "text-cream/70"
              }`}
            >
              {r.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CLAIMS = [
  {
    n: "01",
    title: "A result that holds up.",
    body: "Dual entry under Rule 3.3b: the player scores, the marker keeps a second card, and any disagreement surfaces before it reaches the board. The marker attests, the player certifies, and the card seals with a tamper-evident hash over every figure and every identity on it. The Committee gets an append-only audit trail and a real dispute path.",
    evidence: <ChainEvidence />,
  },
  {
    n: "02",
    title: "Works where the golf is.",
    body: "Parts of a golf course have no signal, and that is an ordinary condition rather than an error. Shimo scores offline, holds what it knows, says so quietly, and reconciles the moment the phone finds the club again.",
    evidence: <OfflineEvidence />,
  },
  {
    n: "03",
    title: "The club looks superb.",
    body: "Generated fixture and results posters in the club's own crest and colour, and a clubhouse screen that runs the whole afternoon unattended and holds the room through prizegiving. It never shows a member's worst hole.",
    evidence: <BoardEvidence />,
  },
];

export function Proof() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            Why it holds up
          </p>
          <h2 className="mt-5 max-w-2xl font-serif text-[clamp(32px,5vw,54px)] font-medium leading-[1.04] tracking-[-0.02em] text-foreground text-balance">
            Built for the clubs of Kenya, and tested on tournament-day work.
          </h2>
        </Reveal>

        <div className="mt-6">
          {CLAIMS.map((c, i) => (
            <Reveal key={c.n} delay={0.04}>
              <article
                className={`grid gap-8 py-12 lg:grid-cols-[1fr_auto] lg:gap-16 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="max-w-xl">
                  <span className="font-serif text-[clamp(32px,4.6vw,46px)] leading-none text-clay tnum">
                    {c.n}
                  </span>
                  <h3 className="mt-3 font-serif text-[clamp(29px,4.2vw,44px)] font-medium leading-[1.04] tracking-[-0.012em] text-foreground text-balance">
                    {c.title}
                  </h3>
                  <p className="mt-5 max-w-prose text-[clamp(15px,1.7vw,16.5px)] leading-[1.7] text-ink-soft">
                    {c.body}
                  </p>
                </div>
                <div className="w-full lg:w-[320px]">{c.evidence}</div>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Honest credibility strip. No fabricated numbers; this is where real
            pilot stats and quotes drop in later without a rebuild. */}
        <Reveal>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border pt-8 text-[14px] text-muted-foreground">
            <span>Built for the clubs of Kenya</span>
            <span className="hidden size-1 rounded-full bg-border sm:block" />
            <span>Tested on tournament-day workflows</span>
            <span className="hidden size-1 rounded-full bg-border sm:block" />
            <span>Currently in pilot</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
