"use client";

/**
 * What Shimo does, said plainly.
 *
 * The one section a visitor can scan in five seconds and come away knowing
 * the shape of the product: six things a club gets, one line each, in the
 * order a tournament day happens. Nothing here is a claim about quality;
 * that is the section after. This one just names the parts.
 */

import {
  ClipboardList,
  FileCheck,
  Image as ImageIcon,
  ListOrdered,
  Smartphone,
  Users,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Entries and registration",
    body: "Members enter from their phones. Guests register through a link. The desk sees the field fill and admits from the waitlist.",
  },
  {
    icon: Users,
    title: "Pairings and the tee sheet",
    body: "Draw the groups, set the times, print the sheet. Each group carries a code that lands a player on their own card.",
  },
  {
    icon: Smartphone,
    title: "Live scoring on the course",
    body: "Players score hole by hole on their phone and keep their partner's card too. It works with no signal and syncs when it finds one.",
  },
  {
    icon: FileCheck,
    title: "Cards certified to the Rules",
    body: "Marker attests, player certifies, the card seals. Disputes and corrections go to the Committee with an audit trail.",
  },
  {
    icon: ListOrdered,
    title: "Leaderboard and clubhouse screen",
    body: "A live board on every phone and a television in the bar that runs the afternoon unattended, through to prizegiving.",
  },
  {
    icon: ImageIcon,
    title: "Results and posters",
    body: "The final standings frozen the moment the day ends, and fixture and results posters in the club's own crest and colour.",
  },
];

export function Features() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        <Reveal>
          <p className="smallcaps flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-8 bg-clay/60" />
            What Shimo does
          </p>
          <h2 className="mt-5 max-w-2xl font-serif text-[clamp(32px,5vw,54px)] font-medium leading-[1.04] tracking-[-0.02em] text-foreground text-balance">
            The whole tournament day, from entries to the winner&apos;s name.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={0.04 * i}>
                <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-card">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-clay-wash text-clay-deep">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 font-serif text-[22px] font-medium leading-tight text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-2.5 text-[14.5px] leading-[1.65] text-ink-soft">{f.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
