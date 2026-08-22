"use client";

/**
 * For the golfer / for the club.
 *
 * Two readers evaluate this page: an admin deciding whether to run their day on
 * it, and a golfer who will use it on the course. Give each a short, parallel
 * beat addressed to them. The light/dark split signals "two different people"
 * at a glance. Job is relevance, not conversion, so the only actions are the two
 * genuine product entry points, as quiet links rather than another CTA.
 */

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";

const GOLFER = [
  "Open your card from a link, no download",
  "Mark a playing partner's card too",
  "Keep your own score, hole by hole",
  "Follow the leaderboard as it moves",
  "Certify and sign when the round is in",
];

const CLUB = [
  "Build the event, field and pairings",
  "Publish the tee sheet",
  "Follow every group live",
  "Resolve a query with an audit trail",
  "Publish the result and the posters",
];

function List({ items, tone }: { items: string[]; tone: "ink" | "cream" }) {
  const dark = tone === "cream";
  return (
    <ul className="mt-7 space-y-3.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
              dark ? "bg-cream/10 text-cream" : "bg-clay-wash text-clay-deep"
            }`}
          >
            <Check className="size-3" strokeWidth={2.5} />
          </span>
          <span
            className={`text-[15px] leading-snug ${
              dark ? "text-cream/80" : "text-ink-soft"
            }`}
          >
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Audiences() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            Two ways in
          </p>
          <h2 className="mt-5 max-w-2xl font-serif text-[clamp(32px,5vw,54px)] font-medium leading-[1.04] tracking-[-0.02em] text-foreground text-balance">
            Made for both sides of the round.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* For the golfer */}
          <Reveal className="h-full">
            <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-8 shadow-card lg:p-10">
              <p className="smallcaps text-clay">For the golfer</p>
              <p className="mt-3 font-serif text-[clamp(22px,3vw,28px)] font-medium leading-tight text-foreground">
                On your phone, on the course.
              </p>
              <p className="mt-2 text-[14px] text-muted-foreground">
                No training and no download. It opens from a link.
              </p>
              <List items={GOLFER} tone="ink" />
              <Link
                href="/app"
                className="group mt-8 inline-flex items-center gap-1.5 text-[14px] font-medium text-clay hover:text-clay-deep"
              >
                Open the golfer&apos;s app
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>

          {/* For the club */}
          <Reveal delay={0.08} className="h-full">
            <div className="flex h-full flex-col rounded-3xl bg-primary p-8 text-primary-foreground shadow-lift lg:p-10">
              <p className="smallcaps text-clay-lift">For the club</p>
              <p className="mt-3 font-serif text-[clamp(22px,3vw,28px)] font-medium leading-tight text-cream">
                At the desk, in control of the day.
              </p>
              <p className="mt-2 text-[14px] text-cream/60">
                The caddymaster runs the whole competition from here.
              </p>
              <List items={CLUB} tone="cream" />
              <Link
                href="/admin"
                className="group mt-8 inline-flex items-center gap-1.5 text-[14px] font-medium text-clay-lift hover:text-cream"
              >
                Open the club console
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
