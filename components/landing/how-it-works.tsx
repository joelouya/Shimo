"use client";

/**
 * How it works.
 *
 * The navy panel the cinematic lifts away from, put to work: the product in
 * four steps for someone seeing it for the first time. The flow is borrowed
 * from a circular testimonials carousel (a rotating stack of cards, autoplay,
 * arrows, keyboard, and a word-by-word reveal on the active copy) and rebuilt
 * in Shimo's world: ink ground, cream step cards, Fraunces for anything read,
 * one clay mark, the gold seal on the step that earns it.
 *
 * Reduced motion is honoured: no autoplay, no 3D swing, no per-word stagger.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MonitorPlay,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

type Step = {
  index: string;
  title: string;
  body: string;
  icon: LucideIcon;
  /** The one step that carries the seal. */
  sealed?: boolean;
};

const STEPS: Step[] = [
  {
    index: "01",
    title: "Set the day",
    body: "Create the tournament in a few minutes at the desk. Format, field, pairings and the tee sheet, without the morning of spreadsheets.",
    icon: CalendarPlus,
  },
  {
    index: "02",
    title: "Score on the course",
    body: "Golfers enter their scores hole by hole from their phone, and playing partners attest as they go. No paper cards to chase down.",
    icon: Smartphone,
  },
  {
    index: "03",
    title: "Every card, certified",
    body: "Dual entry, a marker's attestation, the player's certification and a tamper-evident seal on every figure. Results kept to the Rules of Golf.",
    icon: BadgeCheck,
    sealed: true,
  },
  {
    index: "04",
    title: "Live, and kept",
    body: "A leaderboard and a clubhouse screen worth watching while it runs. When the day ends, the whole tournament is kept like a document.",
    icon: MonitorPlay,
  },
];

const AUTOPLAY_MS = 6000;

export function HowItWorks({ onGetStarted }: { onGetStarted?: () => void }) {
  const reduce = useReducedMotion();
  const count = STEPS.length;
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeStep = useMemo(() => STEPS[active], [active]);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const next = useCallback(() => {
    stop();
    setActive((p) => (p + 1) % count);
  }, [count, stop]);

  const prev = useCallback(() => {
    stop();
    setActive((p) => (p - 1 + count) % count);
  }, [count, stop]);

  // Autoplay, unless the visitor prefers reduced motion.
  useEffect(() => {
    if (reduce) return;
    timer.current = setInterval(() => setActive((p) => (p + 1) % count), AUTOPLAY_MS);
    return stop;
  }, [reduce, count, stop]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  // Where each card sits in the 3D stack relative to the active one.
  function cardStyle(i: number): React.CSSProperties {
    const isActive = i === active;
    const isPrev = (active - 1 + count) % count === i;
    const isNext = (active + 1) % count === i;
    const transition = reduce ? "opacity 0.4s ease" : "all 0.7s cubic-bezier(.4,1.4,.35,1)";
    if (isActive) {
      return { zIndex: 3, opacity: 1, transform: "translateX(0) translateY(0) scale(1) rotateY(0deg)", transition };
    }
    if (isPrev) {
      return { zIndex: 2, opacity: reduce ? 0 : 0.55, transform: "translateX(-30%) translateY(-6%) scale(0.86) rotateY(16deg)", transition };
    }
    if (isNext) {
      return { zIndex: 2, opacity: reduce ? 0 : 0.55, transform: "translateX(30%) translateY(-6%) scale(0.86) rotateY(-16deg)", transition };
    }
    return { zIndex: 1, opacity: 0, transform: "scale(0.8)", transition, pointerEvents: "none" };
  }

  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 overflow-hidden bg-primary text-primary-foreground"
    >
      {/* A soft light from the top-left gives the ink panel depth without a flat
          fill; a whisper of grain keeps it reading as material, not a screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 15% 0%, rgba(255,255,255,0.06), transparent 55%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.02] mix-blend-screen"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"100%\" height=\"100%\" filter=\"url(%23n)\"/></svg>')",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        {/* Section header */}
        <div className="max-w-2xl">
          <p className="smallcaps flex items-center gap-3 text-cream/55">
            <span className="h-px w-8 bg-clay" />
            How it works
          </p>
          <h2 className="mt-5 font-serif text-[clamp(32px,5vw,56px)] font-medium leading-[1.02] tracking-[-0.02em] text-cream text-balance">
            A tournament day,
            <br className="hidden sm:block" /> end to end.
          </h2>
          <p className="mt-5 max-w-lg text-[clamp(15px,1.8vw,17px)] leading-[1.65] text-cream/65">
            Four steps from an empty tee sheet to a sealed, certified result the
            whole club can trust.
          </p>
        </div>

        {/* The flow */}
        <div className="mt-14 grid items-center gap-12 lg:mt-16 lg:grid-cols-2 lg:gap-16">
          {/* Rotating card stack */}
          <div
            className="relative mx-auto h-[300px] w-full max-w-[380px] sm:h-[340px]"
            style={{ perspective: "1200px" }}
          >
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.index}
                  type="button"
                  onClick={() => {
                    stop();
                    setActive(i);
                  }}
                  aria-label={`Step ${step.index}: ${step.title}`}
                  aria-current={i === active}
                  className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[28px] border border-black/5 bg-card p-8 text-left shadow-lift"
                  style={cardStyle(i)}
                >
                  {/* Oversized glyph, faint, so the card reads as a plate rather
                      than a mostly-empty box. */}
                  <Icon
                    aria-hidden="true"
                    strokeWidth={1}
                    className="pointer-events-none absolute -right-6 bottom-2 size-44 text-foreground/[0.04]"
                  />
                  <div className="relative flex items-start justify-between">
                    <span
                      className={`font-serif text-[40px] leading-none tnum ${
                        step.sealed ? "text-gold-deep" : "text-clay"
                      }`}
                    >
                      {step.index}
                    </span>
                    <span
                      className={`flex size-12 items-center justify-center rounded-full ${
                        step.sealed ? "bg-gold-wash text-gold-deep" : "bg-clay-wash text-clay-deep"
                      }`}
                    >
                      <Icon className="size-6" strokeWidth={1.75} />
                    </span>
                  </div>
                  <div>
                    <h3 className="font-serif text-[26px] font-medium leading-tight tracking-[-0.01em] text-foreground">
                      {step.title}
                    </h3>
                    {step.sealed && (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-wash px-2.5 py-1 text-[11px] font-medium text-gold-deep">
                        <BadgeCheck className="size-3.5" /> Sealed
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active step narrative */}
          <div>
            <p className="smallcaps text-cream/50">
              Step {activeStep.index} <span className="text-cream/30">/ 0{count}</span>
            </p>

            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h3 className="mt-3 font-serif text-[clamp(28px,3.6vw,42px)] font-medium leading-[1.05] tracking-[-0.015em] text-cream">
                  {activeStep.title}
                </h3>
                <p className="mt-5 max-w-md text-[clamp(16px,1.9vw,18px)] leading-[1.7] text-cream/70">
                  {reduce
                    ? activeStep.body
                    : activeStep.body.split(" ").map((word, i) => (
                        <motion.span
                          key={`${active}-${i}`}
                          initial={{ filter: "blur(8px)", opacity: 0, y: 4 }}
                          animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, ease: "easeOut", delay: 0.02 * i }}
                          className="inline-block"
                        >
                          {word}&nbsp;
                        </motion.span>
                      ))}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Controls */}
            <div className="mt-9 flex items-center gap-5">
              <div className="flex items-center gap-2" role="tablist" aria-label="Steps">
                {STEPS.map((step, i) => (
                  <button
                    key={step.index}
                    type="button"
                    role="tab"
                    aria-selected={i === active}
                    aria-label={`Go to step ${step.index}`}
                    onClick={() => {
                      stop();
                      setActive(i);
                    }}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === active ? "w-7 bg-clay" : "w-1.5 bg-cream/25 hover:bg-cream/40"
                    }`}
                  />
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous step"
                  className="flex size-10 items-center justify-center rounded-full border border-cream/15 text-cream/80 transition-colors hover:border-cream/30 hover:bg-cream/5 hover:text-cream"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next step"
                  className="flex size-10 items-center justify-center rounded-full border border-cream/15 text-cream/80 transition-colors hover:border-cream/30 hover:bg-cream/5 hover:text-cream"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
            </div>

            {/* Close with the one action */}
            <div className="mt-10 border-t border-cream/10 pt-8">
              <button
                type="button"
                onClick={onGetStarted}
                className="group inline-flex items-center gap-2.5 rounded-xl bg-clay px-6 py-3.5 font-medium text-cream shadow-lift transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-clay-deep active:scale-[0.98]"
              >
                Get started
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
