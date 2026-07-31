"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CircleUser,
  House,
  ListOrdered,
  Radio,
  Trophy,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { DemoToggle } from "@/components/demo-toggle";
import { NotificationToasts } from "@/components/notification-toasts";
import { OnboardingGate } from "@/components/golfer/onboarding";
import { useGolferRouteMemory } from "@/components/pwa";
import { SimGate } from "@/components/sim-gate";
import { IS_PILOT } from "@/lib/mode";
import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app", label: "Home", icon: House },
  { href: "/app/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/app/live", label: "Live", icon: Radio },
  { href: "/app/leaderboard", label: "Leaderboard", icon: ListOrdered },
  { href: "/app/profile", label: "Profile", icon: CircleUser },
];

function Splash() {
  return (
    <motion.div
      key="splash"
      exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
      /*
       * pointer-events-none, always. The splash is a logo and a line of text;
       * it never needs a click. Without this its ability to stop blocking the
       * app depends on a JavaScript exit animation completing and React then
       * unmounting it, and if that ever does not happen the whole app is
       * silently unusable behind a pane you cannot see. Costs nothing, removes
       * the failure mode.
       */
      className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo className="text-[44px]" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.6 }}
        className="smallcaps mt-5 text-muted-foreground"
      >
        Tournament golf, beautifully run
      </motion.p>
    </motion.div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const attested = useSim((s) => s.attested);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t border-border/70 bg-card/92 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur-md">
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          const showLive = tab.label === "Live" && !attested;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center gap-1 pt-2.5 pb-1 text-[10px] font-medium tracking-wide transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon
                  className="size-[21px]"
                  strokeWidth={active ? 2.1 : 1.7}
                />
                {showLive && (
                  <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-clay animate-live-pulse" />
                )}
              </span>
              {tab.label}
              {active && (
                <motion.span
                  layoutId="nav-dot"
                  className="absolute -bottom-0 h-[2.5px] w-7 rounded-full bg-clay"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function GolferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [splash, setSplash] = useState(true);
  useGolferRouteMemory();
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-dvh w-full">
      <AnimatePresence>{splash && <Splash />}</AnimatePresence>
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-background sm:border-x sm:border-border/60">
        <SimGate>
          <OnboardingGate>
            <NotificationToasts />
            <main className="pb-28">{children}</main>
            <BottomNav />
            {!IS_PILOT && <DemoToggle corner="phone" />}
          </OnboardingGate>
        </SimGate>
      </div>
    </div>
  );
}
