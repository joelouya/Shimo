"use client";

/**
 * First run at the desk.
 *
 * A caddymaster is not going to sit through seven screens, and they do not
 * need to: they already know how a tournament day works. What they do not know
 * is which four things in this particular interface are the day. So this is one
 * card, four lines, and a way in, shown once.
 *
 * Deliberately not the golfer flow. The desk arrives with a task, and an
 * orientation that stands between them and it is a cost, not a courtesy.
 */

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ClipboardCheck, Radio, Trophy, Tv } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { setDeskWelcomed, useSim } from "@/lib/sim/store";

const EASE = [0.23, 1, 0.32, 1] as const;

const BEATS = [
  {
    icon: Trophy,
    label: "Before the day",
    detail: "Create the event, set pairings and tee times, publish the sheet.",
  },
  {
    icon: ClipboardCheck,
    label: "As cards come in",
    detail:
      "Type a returned card at the desk, then publish it under your own PIN.",
  },
  {
    icon: Radio,
    label: "While they play",
    detail:
      "Live Ops holds anything that needs a human: discrepancies, disputes, corrections.",
  },
  {
    icon: Tv,
    label: "In the clubhouse",
    detail: "Put the screen on a television and steer it from the producer panel.",
  },
];

export function DeskWelcome() {
  const welcomed = useSim((s) => s.deskWelcomed);
  const still = useReducedMotion();
  // Held locally so the card can animate out before the flag unmounts it.
  const [open, setOpen] = useState(true);
  const show = !welcomed && open;

  const dismiss = () => {
    setOpen(false);
    setDeskWelcomed(true);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="desk-welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6 backdrop-blur-[2px]"
        >
          <motion.div
            initial={still ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="w-full max-w-xl rounded-2xl bg-card p-8 shadow-pane"
          >
            <LogoMark className="size-8" />
            <p className="smallcaps mt-5 text-muted-foreground">
              The tournament desk
            </p>
            <h2 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
              A tournament day, in four moves
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
              Everything here is arranged around the afternoon rather than
              around the database. This is the whole shape of it.
            </p>

            <div className="mt-7 space-y-4">
              {BEATS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div
                    key={b.label}
                    initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.45,
                      ease: EASE,
                      delay: still ? 0 : 0.18 + i * 0.07,
                    }}
                    className="flex gap-3.5"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-ink-soft">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-[15px] font-medium text-foreground">
                        {b.label}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        {b.detail}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="clay" size="lg" onClick={dismiss}>
                Take me to the desk
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="ghost" size="lg" asChild onClick={dismiss}>
                <Link href="/admin/tournaments">Start with a tournament</Link>
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
