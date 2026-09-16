"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Menu,
  Radio,
  Settings,
  Smartphone,
  Trophy,
  Tv,
  Users,
  X,
} from "lucide-react";

import { DeskWelcome } from "@/components/admin/desk-welcome";
import { Button } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/logo";
import { DemoToggle } from "@/components/demo-toggle";
import { SimGate } from "@/components/sim-gate";
import { IS_PILOT } from "@/lib/mode";
import { clubNameOf, useSim } from "@/lib/sim/store";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/live", label: "Live Ops", icon: Radio },
  { href: "/admin/tv", label: "TV producer", icon: Tv },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function useNavState() {
  const pathname = usePathname();
  const openFlags = useSim(
    (s) => s.flags.filter((f) => f.status === "open" && (!IS_PILOT || f.kind !== "red")).length,
  );
  const live = useSim((s) => s.created.find((t) => t.id === s.liveTournamentId && t.status === "live"));
  const liveRound = useSim((s) => s.liveRound);
  const deskName = useSim((s) => s.deskName);
  const clubName = useSim((s) => clubNameOf(s));
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return { openFlags, live, liveRound, deskName, clubName, isActive };
}

/**
 * The top bar: wordmark, the six destinations as one row of pills, and on
 * the right the day (what is on the course) and who is at the desk. Navy,
 * like the band beneath it, so the head of every page reads as one piece.
 * Tables get the whole width of the screen below it.
 */
function TopBar({ onMenu }: { onMenu: () => void }) {
  const { openFlags, live, liveRound, deskName, clubName, isActive } = useNavState();
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-5 md:px-8 xl:px-10">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onMenu}
          className="focus-ring -ml-2 flex size-10 items-center justify-center rounded-lg text-primary-foreground/80 hover:bg-cream/10 hover:text-cream lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        {/* The wordmark goes home, because every other product a caddymaster
            uses does and they will click it whether it works or not. */}
        <Link
          href="/admin"
          aria-label="Shimo, back to the dashboard"
          className="focus-ring flex shrink-0 items-center gap-2.5 rounded-md py-1 transition-opacity hover:opacity-80"
        >
          <LogoMark className="size-6" />
          <span className="hidden sm:block">
            <Logo tone="cream" className="text-[17px]" />
          </span>
        </Link>

        <nav
          aria-label="Desk"
          className="ml-2 hidden items-center gap-0.5 rounded-full bg-cream/8 p-1 lg:flex"
        >
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const isLiveOps = item.label === "Live Ops";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-cream text-foreground shadow-sm"
                    : "text-primary-foreground/70 hover:bg-cream/10 hover:text-cream",
                )}
              >
                <Icon className="size-3.5" strokeWidth={active ? 2.2 : 1.9} />
                <span className="hidden xl:inline">{item.label}</span>
                {isLiveOps && openFlags > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-semibold tnum",
                      active ? "bg-clay text-cream" : "bg-clay text-cream",
                    )}
                  >
                    {openFlags}
                  </span>
                )}
                {isLiveOps && live && openFlags === 0 && (
                  <span className="size-1.5 rounded-full bg-clay animate-live-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {/* the day, as one line: what is on the course, and where */}
          {live && (
            <Link
              href="/admin/live"
              className="focus-ring hidden min-w-0 items-center gap-2.5 rounded-full border border-cream/15 py-1.5 pl-2.5 pr-3.5 text-left transition-colors hover:bg-cream/5 md:flex"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-clay animate-live-pulse" />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] leading-tight text-cream">{live.name}</span>
                <span className="block text-[10.5px] leading-tight text-primary-foreground/60 tnum">
                  Round {liveRound || 1} · first tee {live.firstTee}
                </span>
              </span>
            </Link>
          )}
          <Link
            href="/admin/settings"
            className="focus-ring flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-cream/5"
            title="Desk and club settings"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-clay font-serif text-[13px] text-cream">
              {deskName?.trim() ? initials(deskName) : "·"}
            </span>
            <span className="hidden min-w-0 md:block">
              <span className="block truncate text-[12.5px] font-medium leading-tight text-cream">
                {deskName?.trim() || "The desk"}
              </span>
              <span className="block truncate text-[10.5px] leading-tight text-primary-foreground/60">
                {clubName}
              </span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The tablet's navigation, as a drawer with the same six destinations. */
function Drawer({ onClose }: { onClose: () => void }) {
  const { openFlags, live, liveRound, deskName, clubName, isActive } = useNavState();
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside className="animate-enter-rise absolute inset-y-0 left-0 flex w-72 flex-col bg-primary text-primary-foreground shadow-pane">
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="focus-ring absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg text-primary-foreground/70 hover:bg-cream/10 hover:text-cream"
        >
          <X className="size-4" />
        </button>
        <Link href="/admin" onClick={onClose} className="focus-ring block px-6 pt-7 pb-6">
          <Logo tone="cream" className="text-[22px]" />
          <p className="smallcaps mt-2 text-primary-foreground/60">Club administration</p>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-cream/10 text-cream"
                    : "text-primary-foreground/60 hover:bg-cream/5 hover:text-primary-foreground/90",
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.1 : 1.8} />
                {item.label}
                {item.label === "Live Ops" && (
                  <span className="ml-auto flex items-center gap-1.5">
                    {openFlags > 0 && (
                      <span className="rounded-full bg-clay px-1.5 text-[10px] font-semibold text-cream tnum">
                        {openFlags}
                      </span>
                    )}
                    {live && <span className="size-1.5 rounded-full bg-clay animate-live-pulse" />}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {live && (
          <Link
            href="/admin/live"
            onClick={onClose}
            className="focus-ring mx-3 mb-2 rounded-lg border border-cream/10 px-3 py-2.5 transition-colors hover:bg-cream/5"
          >
            <p className="smallcaps text-primary-foreground/60">On the course</p>
            <p className="mt-1 truncate text-[13px] text-cream">{live.name}</p>
            <p className="mt-0.5 text-[11px] text-primary-foreground/60 tnum">
              Round {liveRound || 1} · first tee {live.firstTee}
            </p>
          </Link>
        )}
        <div className="border-t border-cream/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-cream/5 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clay font-serif text-sm text-cream">
              {deskName?.trim() ? initials(deskName) : "·"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-cream">{deskName?.trim() || "The desk"}</p>
              <p className="truncate text-[11px] text-primary-foreground/60">{clubName}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/**
 * The desk is a laptop or tablet surface. A phone that lands here (a
 * bookmark, a forwarded link) is told so and offered the app it wants,
 * with a way through for the person who really does need the desk in
 * their hand.
 */
function PhoneGate({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center">
      <LogoMark className="size-10" />
      <p className="smallcaps mt-6 text-muted-foreground">The tournament desk</p>
      <h1 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
        Better on a bigger screen
      </h1>
      <p className="mt-3 max-w-[300px] text-[15px] leading-relaxed text-ink-soft">
        The desk runs the day: pairings, the scoring grid, the Committee room.
        Open it on a laptop or a tablet. On a phone, the golfer app is the one
        you want.
      </p>
      <div className="mt-8 flex w-full max-w-[300px] flex-col gap-2">
        <Button variant="clay" size="lg" asChild>
          <Link href="/app">
            <Smartphone className="size-4" />
            Open the golfer app
          </Link>
        </Button>
        <Button variant="ghost" className="text-muted-foreground" onClick={onContinue}>
          Continue to the desk anyway
        </Button>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [phoneOk, setPhoneOk] = useState(false);

  return (
    <SimGate
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Logo className="text-3xl opacity-40" />
        </div>
      }
    >
      <div className="min-h-dvh">
        {!phoneOk && (
          <div className="md:hidden">
            <PhoneGate onContinue={() => setPhoneOk(true)} />
          </div>
        )}
        <div className={cn(!phoneOk && "hidden md:block")}>
          <div className="sticky top-0 z-40">
            <TopBar onMenu={() => setDrawer(true)} />
          </div>
          {drawer && <Drawer onClose={() => setDrawer(false)} />}
          {/* a container, so a page's band can reach the screen edges with cqw */}
          <main className="@container min-h-dvh">
            <div className="mx-auto max-w-[1440px] px-5 pb-12 md:px-8 xl:px-10">{children}</div>
          </main>
        </div>
        {!IS_PILOT && <DemoToggle corner="br" />}
        <DeskWelcome />
      </div>
    </SimGate>
  );
}
