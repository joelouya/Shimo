"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Sparkles, X } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { resetDemo, setDemoMode, useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

/**
 * The presenter's corner control: auto-advances the live round so the demo
 * never has to wait for golf to happen.
 */
export function DemoToggle({ corner = "br" }: { corner?: "br" | "phone" }) {
  const demoMode = useSim((s) => s.demoMode);
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "fixed z-40",
        corner === "phone"
          ? // clamp to the right edge of the centred 430px phone column
            "bottom-24 left-[calc(50%+min(50%,215px)-56px)]"
          : "bottom-6 right-6",
      )}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-12 right-0 w-60 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lift"
          >
            <div className="flex items-center justify-between">
              <p className="smallcaps text-primary-foreground/60">Demo mode</p>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-0.5 text-primary-foreground/50 hover:text-primary-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[13px] leading-snug text-primary-foreground/85">
                Auto-play the live round
              </p>
              <Switch checked={demoMode} onCheckedChange={setDemoMode} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-primary-foreground/50">
              Scores enter themselves every few seconds. Watch the leaderboard
              and Live Ops move.
            </p>
            <button
              onClick={() => {
                resetDemo();
                setOpen(false);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground/80 hover:bg-white/15 cursor-pointer"
            >
              <RotateCcw className="size-3" />
              Reset demo data
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-12 items-center justify-center rounded-full shadow-lift transition-colors cursor-pointer",
          demoMode
            ? "bg-clay text-white"
            : "bg-primary text-primary-foreground hover:bg-ink-soft",
        )}
        title="Demo mode"
      >
        <Sparkles className={cn("size-4", demoMode && "animate-pulse")} />
      </button>
    </div>
  );
}
