"use client";

/**
 * FAQ.
 *
 * Defuses the specific objections a skeptical club admin has before they bounce.
 * Every answer matches what is actually built (PRODUCT.md): browser-based, no
 * download; offline-first; certification and disputes to R&A 3.3b; the real list
 * of formats. Payment is described honestly as a demonstrated preview, not a
 * live feature. Native details/summary keeps it accessible and motion-free.
 */

import { ChevronDown } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";

const FAQS = [
  {
    q: "Do golfers need to download anything?",
    a: "No. Shimo opens from a link in the phone's browser. There is no app to install and nothing to set up before a round.",
  },
  {
    q: "What happens when there is no signal on the course?",
    a: "Scoring works offline. The phone holds what it knows, says so quietly, and reconciles with the club the moment it reconnects. Nothing blanks and nothing is lost.",
  },
  {
    q: "How is a card certified?",
    a: "Two cards are kept, the player's and the marker's, under R&A Rule 3.3b. The marker attests, the player certifies, and the card seals with a tamper-evident hash over every figure. The Committee keeps an append-only audit trail.",
  },
  {
    q: "What happens if a score is disputed?",
    a: "Discrepancies between the two cards surface before they reach the board. The Committee can correct, resolve, or disqualify under 3.3b, and every step is recorded.",
  },
  {
    q: "Which formats are supported?",
    a: "Stableford, Stroke Play, Match Play, Better Ball and Scramble, across single or multi-round events with cuts.",
  },
  {
    q: "Can members pay entry fees in Shimo?",
    a: "Entry fees, tiers and an M-PESA flow are built and can be demonstrated, but payment is not a committed, live integration yet. Treat it as a preview rather than a settled feature.",
  },
  {
    q: "What does the clubhouse screen need?",
    a: "A television the club already owns. It runs unattended through the afternoon, read-only, and never shows a member's worst hole.",
  },
];

export function Faq() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-32">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            Questions
          </p>
          <h2 className="mt-5 font-serif text-[clamp(32px,4.6vw,52px)] font-medium leading-[1.04] tracking-[-0.02em] text-foreground text-balance">
            Before you commit a tournament to it.
          </h2>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="border-t border-border">
            {FAQS.map((item) => (
              <details key={item.q} className="group border-b border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-serif text-[clamp(18px,2.2vw,21px)] font-medium leading-snug text-foreground">
                    {item.q}
                  </span>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="max-w-prose pb-6 text-[15px] leading-[1.7] text-ink-soft">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
