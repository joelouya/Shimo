"use client";

/**
 * The hero artifact: a card being returned.
 *
 * The whole product argument in one object. Nine holes fill in the way a
 * marker fills them in, one at a time, marked in classic notation. Then the
 * marker attests, the player certifies, and the card seals. Anyone who has
 * handed a card to a desk recognises the sequence without a caption, which is
 * the point: the landing page explains Shimo by performing a returned card
 * rather than by describing one.
 *
 * Everything here is the real notation from the app, not an illustration of
 * it. The rings and boxes are the same rule the score cell uses.
 *
 * Terracotta appears exactly twice: on the marks themselves and on the figure
 * under par. Every label around them is grey, because a label is not a result.
 */

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** A believable front nine: two rings, one box, one under par. */
const HOLES = [
  { hole: 1, par: 4, gross: 4 },
  { hole: 2, par: 5, gross: 4 },
  { hole: 3, par: 4, gross: 4 },
  { hole: 4, par: 3, gross: 3 },
  { hole: 5, par: 4, gross: 5 },
  { hole: 6, par: 4, gross: 4 },
  { hole: 7, par: 5, gross: 5 },
  { hole: 8, par: 3, gross: 2 },
  { hole: 9, par: 4, gross: 4 },
];

const OUT_PAR = HOLES.reduce((n, h) => n + h.par, 0);
const OUT_GROSS = HOLES.reduce((n, h) => n + h.gross, 0);

/** The score cell rule, exactly as the app marks it. */
function mark(gross: number, par: number) {
  const d = gross - par;
  if (d <= -2) return "rounded-full border-2 border-clay text-clay-deep";
  if (d === -1) return "rounded-full border border-clay text-clay-deep";
  if (d >= 2) return "rounded-sm border-2 border-stone/60 text-ink-soft";
  if (d === 1) return "rounded-sm border border-stone/60 text-ink-soft";
  return "text-foreground";
}

/** Rows of the card, in the order a card is actually completed. */
const SIGN_DELAY = 0.34 + HOLES.length * 0.075;

export function ReturnedCard() {
  const still = useReducedMotion();

  /** Reduced motion keeps the arrival, drops the journey and the sequence. */
  const cell = (i: number) =>
    still
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y: 6, scale: 0.86 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: {
            delay: 0.34 + i * 0.075,
            duration: 0.42,
            ease: [0.23, 1, 0.32, 1] as const,
          },
        };

  const line = (delay: number) =>
    still
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: {
            delay: SIGN_DELAY + delay,
            duration: 0.5,
            ease: [0.23, 1, 0.32, 1] as const,
          },
        };

  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 18, rotate: -2.4 }}
      animate={still ? { opacity: 1 } : { opacity: 1, y: 0, rotate: -1.2 }}
      transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-[380px] rounded-2xl bg-card p-5 shadow-pane sm:max-w-[420px] sm:p-6"
      /* A card on a desk is never quite square to the edge. */
      style={{ transformOrigin: "60% 100%" }}
    >
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <div>
          <p className="smallcaps text-muted-foreground">Captain&apos;s Prize</p>
          <p className="mt-1 font-serif text-[17px] leading-none text-foreground">
            Joel Ouya
          </p>
        </div>
        <div className="text-right">
          <p className="smallcaps text-muted-foreground">Handicap</p>
          <p className="mt-1 font-serif text-[17px] leading-none text-foreground tnum">
            12
          </p>
        </div>
      </div>

      {/* The grid. Hole, par, then the marked figure. */}
      <div className="mt-4 grid grid-cols-[auto_repeat(9,1fr)] items-center gap-y-2 text-center">
        <span className="smallcaps pr-2 text-left text-muted-foreground">Hole</span>
        {HOLES.map((h) => (
          <span
            key={h.hole}
            className="text-[11px] text-muted-foreground tnum"
          >
            {h.hole}
          </span>
        ))}

        <span className="smallcaps pr-2 text-left text-muted-foreground">Par</span>
        {HOLES.map((h) => (
          <span key={h.hole} className="text-[11px] text-stone tnum">
            {h.par}
          </span>
        ))}

        <span className="smallcaps pr-2 text-left text-muted-foreground">Score</span>
        {HOLES.map((h, i) => (
          <span key={h.hole} className="flex justify-center">
            <motion.span
              {...cell(i)}
              className={cn(
                "inline-flex size-6 items-center justify-center font-serif text-[13px] tnum",
                mark(h.gross, h.par),
              )}
            >
              {h.gross}
            </motion.span>
          </span>
        ))}
      </div>

      <motion.div
        {...line(0)}
        className="mt-4 flex items-baseline justify-between border-t border-border pt-3"
      >
        <span className="smallcaps text-muted-foreground">Out</span>
        <span className="font-serif text-[22px] leading-none text-foreground tnum">
          {OUT_GROSS}
          <span className="ml-2 text-[13px] text-clay">
            {OUT_GROSS - OUT_PAR} to par
          </span>
        </span>
      </motion.div>

      {/* The part that is actually the product. */}
      <div className="mt-4 space-y-2 rounded-xl bg-secondary/60 p-3">
        <motion.div {...line(0.12)} className="flex items-center gap-2">
          <Check className="size-3.5 shrink-0 text-stone" />
          <span className="text-[13px] text-ink-soft">
            Marker attested
            <span className="text-muted-foreground"> by D. Kamau</span>
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground tnum">14:22</span>
        </motion.div>
        <motion.div {...line(0.26)} className="flex items-center gap-2">
          <Check className="size-3.5 shrink-0 text-stone" />
          <span className="text-[13px] text-ink-soft">Player certified</span>
          <span className="ml-auto text-[11px] text-muted-foreground tnum">14:24</span>
        </motion.div>
        <motion.div
          {...line(0.42)}
          className="flex items-center gap-2 border-t border-border/70 pt-2"
        >
          <span className="smallcaps text-muted-foreground">Sealed</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground tnum">
            a3f9c2e1b7
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
