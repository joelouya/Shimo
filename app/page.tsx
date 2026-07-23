"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MonitorSmartphone, Smartphone } from "lucide-react";

import { Logo } from "@/components/logo";
import { LiveDot } from "@/components/live-dot";

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <Logo className="text-5xl sm:text-6xl" />
        <p className="smallcaps mt-5 text-muted-foreground">
          Tournament golf, beautifully run
        </p>
        <p className="mx-auto mt-6 max-w-md font-serif text-[19px] leading-relaxed text-ink-soft">
          Entries, tee times, live scoring and honest cards for the clubs of
          Kenya, and then the continent.
        </p>
      </motion.div>

      <motion.div
        {...fadeUp}
        transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mt-12 grid w-full max-w-2xl gap-4 sm:grid-cols-2"
      >
        <Link
          href="/app"
          className="group rounded-2xl bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-clay-wash text-clay">
            <Smartphone className="size-5" />
          </div>
          <h2 className="mt-4 font-serif text-xl text-foreground">The golfer</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Joel Ouya, HC 12, is three holes into the Captain&apos;s Prize at
            Muthaiga. Score his round, watch the board move.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-clay">
            <LiveDot />
            Open the app
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
          <p className="mt-1 text-[10.5px] text-muted-foreground/70">
            Best in a phone-sized window
          </p>
        </Link>

        <Link
          href="/admin"
          className="group rounded-2xl bg-primary p-6 text-primary-foreground shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-clay-wash">
            <MonitorSmartphone className="size-5" />
          </div>
          <h2 className="mt-4 font-serif text-xl">The club</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-primary-foreground/60">
            Muthaiga&apos;s tournament desk: create events, set pairings, and
            run tournament day from Live Ops.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-clay-wash">
            Open the admin
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
          <p className="mt-1 text-[10.5px] text-primary-foreground/40">
            Best on a laptop, full width
          </p>
        </Link>
      </motion.div>

      <motion.p
        {...fadeUp}
        transition={{ delay: 0.3, duration: 0.7 }}
        className="mt-10 max-w-md text-center text-[11.5px] leading-relaxed text-muted-foreground/80"
      >
        Open both side by side: a score entered on the golfer&apos;s phone
        lands in the club&apos;s Live Ops within a second. The ✦ button in
        either app auto-plays the round.
      </motion.p>

      <motion.p
        {...fadeUp}
        transition={{ delay: 0.4, duration: 0.7 }}
        className="smallcaps mt-12 text-muted-foreground/50"
      >
        Prototype · built for the Kenya Golf Union
      </motion.p>
    </div>
  );
}
