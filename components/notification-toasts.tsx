"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useSim, type AppNotification } from "@/lib/sim/store";

/**
 * iOS-style push banners for the golfer app. Only notifications that arrive
 * after mount are shown — history never replays on load.
 */
export function NotificationToasts() {
  const notifications = useSim((s) => s.notifications);
  const [visible, setVisible] = useState<AppNotification[]>([]);
  const mountTs = useRef(Date.now());
  const shown = useRef<Set<number>>(new Set());

  useEffect(() => {
    const fresh = notifications.filter(
      (n) => n.ts > mountTs.current && !shown.current.has(n.id),
    );
    if (!fresh.length) return;
    fresh.forEach((n) => shown.current.add(n.id));
    setVisible((v) => [...fresh, ...v].slice(0, 2));
    fresh.forEach((n) =>
      setTimeout(
        () => setVisible((v) => v.filter((x) => x.id !== n.id)),
        5200,
      ),
    );
  }, [notifications]);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {visible.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-primary/95 p-3.5 pr-4 text-primary-foreground shadow-lift backdrop-blur"
            onClick={() => setVisible((v) => v.filter((x) => x.id !== n.id))}
          >
            <span className="text-xl leading-none">{n.emoji}</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="smallcaps text-primary-foreground/50">Shimo</p>
                <p className="text-[10px] text-primary-foreground/40">now</p>
              </div>
              <p className="mt-0.5 text-[13px] font-medium leading-snug">{n.title}</p>
              {n.body && (
                <p className="text-xs text-primary-foreground/60">{n.body}</p>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
