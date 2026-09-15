"use client";

/**
 * The frame the first-run flows share: a persistent shell with one thin
 * progress line, a step body (icon, title, content) and the cascade that
 * assembles each step top to bottom. Onboarding and the walkthrough both draw
 * inside it, so a player sees one story rather than two products.
 */

import { motion } from "framer-motion";

import { Logo } from "@/components/logo";

export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * A block inside a step, cascading in behind the one before it. `i` is its
 * place in the cascade, so the content assembles top to bottom. Plain inline
 * initial/animate objects rather than named variants: under AnimatePresence
 * the indirection could leave an entering step stalled part-way through.
 */
export function Reveal({
  children,
  className,
  i = 0,
}: {
  children: React.ReactNode;
  className?: string;
  i?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.1 + i * 0.07 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * The persistent frame: it never unmounts, so the story stays continuous.
 *
 * Progress is one thin line that fills as the flow advances, not a row of
 * segments. A counter tells a player how much is left to endure; a line that
 * simply grows tells them the same thing without ever naming a number.
 */
export function Shell({
  children,
  progress,
}: {
  children: React.ReactNode;
  progress: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: EASE } }}
      className="fixed inset-0 z-50 overflow-hidden bg-background"
    >
      {/*
        Ambient wash for depth. Deliberately static: a large blurred layer is
        cheap to composite once but expensive to re-rasterise every frame, so
        animating it would jank on the mid-range Androids the pilot targets.
        The sense of travel comes from the content, which moves on transform
        and opacity only.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[520px] -translate-x-1/2 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--clay-wash), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),20px)]">
        <div className="flex items-center gap-4 py-4">
          <Logo className="text-[15px]" />
          <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-border">
            <motion.span
              className="block h-full w-full origin-left rounded-full bg-clay"
              initial={false}
              animate={{ scaleX: Math.max(0, Math.min(1, progress)) }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </span>
        </div>
        {/* steps stack here absolutely, so one can leave as the next arrives */}
        <div className="relative flex-1 overflow-x-hidden">{children}</div>
      </div>
    </motion.div>
  );
}

export function StepBody({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <Reveal i={0}>
        <div className="mt-6 flex size-12 items-center justify-center rounded-2xl bg-clay-wash text-clay-deep">
          {icon}
        </div>
      </Reveal>
      <Reveal i={1}>
        <h1 className="mt-5 font-serif text-[28px] leading-tight text-foreground">
          {title}
        </h1>
      </Reveal>
      {children}
    </div>
  );
}
