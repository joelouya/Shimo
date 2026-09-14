"use client";

/**
 * How Shimo works on the day, in four cards: the two cards on the Live tab,
 * the leaderboard, signing off, and playing without signal. Each card shows
 * the thing it describes rather than describing it, because the claim is more
 * convincing shown than stated and a screen of type reads as unfinished.
 *
 * Runs as a step in first-run onboarding (before the signature choice, so the
 * PIN being asked for has just been explained) and again from Profile under
 * "How Shimo works", so nobody has to remember it from the first morning.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, ListOrdered, PenLine, Radio, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EASE, Reveal, StepBody } from "@/components/golfer/onboarding-shell";
import { cn } from "@/lib/utils";

/* ---- the art: each card shows the surface it is about ---- */

function LiveArt() {
  const tile = (label: string, name: string, score: string, note: string, mine: boolean) => (
    <div
      className={cn(
        "rounded-xl p-3",
        mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-card",
      )}
    >
      <p className={cn("smallcaps", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
        {label}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="truncate font-serif text-[15px] leading-tight">{name}</p>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg font-serif text-[16px] tnum",
            mine ? "bg-cream/15 text-cream" : "bg-secondary text-foreground",
          )}
        >
          {score}
        </span>
      </div>
      <p className={cn("mt-1.5 text-[11px]", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
        {note}
      </p>
    </div>
  );
  return (
    <div className="space-y-2">
      {tile("Your ball", "You", "4", "matches your marker", true)}
      {tile("You mark", "Your playing partner", "5", "their own entry agrees", false)}
    </div>
  );
}

function BoardArt() {
  const rows = [
    { pos: 1, name: "A. Wanjiru", score: "38" },
    { pos: 2, name: "D. Kamau", score: "36" },
    { pos: 3, name: "M. Otieno", score: "35" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="space-y-2 p-4">
        {rows.map((r) => (
          <div key={r.pos} className="flex items-baseline gap-3">
            <span className="w-3 font-serif text-[13px] text-muted-foreground tnum">{r.pos}</span>
            <span className="flex-1 font-serif text-[15px] text-foreground">{r.name}</span>
            <span className="font-serif text-[15px] text-foreground tnum">{r.score}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
        <span className="smallcaps text-primary-foreground/60">Your line</span>
        <span className="font-serif text-[14px] tnum">
          12th · 31 <span className="text-primary-foreground/60">· 7 back</span>
        </span>
      </div>
    </div>
  );
}

function SignArt() {
  const row = (letter: string, title: string, sub: string, done: boolean) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-medium",
          done ? "border-clay/40 bg-clay-wash text-clay-deep" : "border-clay bg-clay text-cream",
        )}
      >
        {done ? <Check className="size-3.5" /> : letter}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-foreground">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{sub}</span>
      </span>
    </div>
  );
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      {row("A", "Your marker attests", "the card they kept for you", true)}
      <div className="border-t border-border/60" />
      {row("B", "You certify with your PIN", "the card is returned and locked", false)}
      <div className="flex justify-center gap-3 border-t border-border/60 py-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-3 rounded-full border-2",
              i < 2 ? "border-clay bg-clay" : "border-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function OfflineArt() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5 rounded-xl bg-secondary px-4 py-3 text-[13px] text-ink-soft">
        <WifiOff className="size-4 shrink-0 text-muted-foreground" />
        Offline. 2 scores saved on this phone
      </div>
      <div className="flex items-center gap-2.5 rounded-xl bg-card px-4 py-3 text-[13px] text-foreground shadow-card">
        <Check className="size-4 shrink-0 text-clay" />
        Back in range. Everything synced
      </div>
    </div>
  );
}

export const WALKTHROUGH_CARDS = [
  {
    key: "live",
    icon: <Radio className="size-6" />,
    title: "Two cards on the Live tab",
    body: "Your own ball is on top. Below it is the card you keep for your playing partner, the same swap you would make with paper on the first tee. Tap a score and it lands at once.",
    art: <LiveArt />,
  },
  {
    key: "board",
    icon: <ListOrdered className="size-6" />,
    title: "The leaderboard follows you",
    body: "Points, net or gross, live as cards come in. When your own row scrolls off the top, your line stays pinned, so you always know where you stand.",
    art: <BoardArt />,
  },
  {
    key: "sign",
    icon: <PenLine className="size-6" />,
    title: "Signing off, the proper way",
    body: "At the end of the round your marker attests the card they kept for you, then you certify it with your PIN. The card is returned and locked, exactly like handing it in at the desk.",
    art: <SignArt />,
  },
  {
    key: "offline",
    icon: <WifiOff className="size-6" />,
    title: "No signal? Keep playing",
    body: "Every score saves on this phone first and syncs when you are back in range. Nothing is lost and nothing needs entering twice.",
    art: <OfflineArt />,
  },
] as const;

/**
 * The four cards, with their own small progress marks. Draws inside whatever
 * frame hosts it: the onboarding shell, or a dialog from Profile.
 */
export function Walkthrough({
  onDone,
  onSkip,
  doneLabel = "Got it",
}: {
  onDone: () => void;
  onSkip?: () => void;
  doneLabel?: string;
}) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const card = WALKTHROUGH_CARDS[i];
  const last = i === WALKTHROUGH_CARDS.length - 1;
  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setI(n);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-6 flex gap-1.5" aria-hidden>
        {WALKTHROUGH_CARDS.map((c, k) => (
          <span
            key={c.key}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              k <= i ? "bg-clay" : "bg-border",
            )}
          />
        ))}
      </div>
      <motion.div
        key={card.key}
        initial={{ opacity: 0, x: 28 * dir }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="flex flex-1 flex-col"
      >
        <StepBody icon={card.icon} title={card.title}>
          <Reveal i={2}>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">{card.body}</p>
          </Reveal>
          <Reveal i={3} className="mt-6">
            {card.art}
          </Reveal>
        </StepBody>
      </motion.div>
      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Button
          variant="clay"
          size="lg"
          className="w-full"
          onClick={() => (last ? onDone() : go(i + 1))}
        >
          {last ? doneLabel : "Next"}
          <ArrowRight className="size-4" />
        </Button>
        {i > 0 ? (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => go(i - 1)}
          >
            Back
          </Button>
        ) : onSkip ? (
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>
            Skip
          </Button>
        ) : null}
      </div>
    </div>
  );
}
