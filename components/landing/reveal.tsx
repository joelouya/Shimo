"use client";

import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Reveal on scroll, once.
 *
 * `once` matters more than it looks: a section that re-animates every time it
 * crosses the viewport turns a page into a slideshow, and the second viewing is
 * always worse than the first. This is the page's baseline entrance; richer,
 * section-specific motion is layered on top later.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: still ? 0.25 : 0.7,
        ease: EASE,
        delay: still ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
}
