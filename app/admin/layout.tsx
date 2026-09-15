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

/**
 * The navigation spine, drawn two ways: fixed on the left of a desk screen
 * (a full rail from 1280px, an icon rail from 1024px, labels returning on
 * hover as titles), and as a drawer on a tablet. The same content in both,
 * so nothing is learned twice.
 */
function Rail({
  variant,
  onNavigate,
}: {
  variant: "fixed" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // the badge counts what Live Ops will show: pilot keeps red flags out of
  // the room, so they are not counted at its door either
  const openFlags = useSim(
    (s) => s.flags.filter((f) => f.status === "open" && (!IS_PILOT || f.kind !== "red")).length,
  );
  const live = useSim((s) => s.created.find((t) => t.id === s.liveTournamentId && t.status === "live"));
  const liveRound = useSim((s) => s.liveRound);
  const deskName = useSim((s) => s.deskName);
  const clubName = useSim((s) => clubNameOf(s));
  // labels hide on the icon rail (lg to xl) and always show in the drawer
  const label = variant === "fixed" ? "hidden xl:inline" : "inline";
  const wide = variant === "fixed" ? "hidden xl:block" : "block";
  const pad = variant === "fixed" ? "px-3 xl:px-3" : "px-3";

  return (
    <div className="flex h-full flex-col">
      {/* The wordmark goes home, because every other product a caddymaster
          uses does and they will click it whether it works or not. */}
      <Link
        href="/admin"
        aria-label="Shimo, back to the dashboard"
        onClick={onNavigate}
        className={cn(
          "focus-ring block rounded-md transition-opacity duration-[var(--dur-hover)] hover:opacity-80",
          variant === "fixed" ? "px-5 pt-7 pb-6 xl:px-6" : "px-6 pt-7 pb-6",
        )}
      >
        <span className={wide}>
          <Logo tone="cream" className="text-[22px]" />
          <p className="smallcaps mt-2 text-primary-foreground/60">Club administration</p>
        </span>
        {variant === "fixed" && (
          <span className="flex justify-center xl:hidden">
            <LogoMark className="size-7" />
          </span>
        )}
      </Link>
      <nav className={cn("flex flex-1 flex-col gap-0.5", pad)}>
        {NAV.map((item) => {
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const isLiveOps = item.label === "Live Ops";
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                variant === "fixed" && "justify-center xl:justify-start",
                active
                  ? "bg-cream/10 text-cream"
                  : "text-primary-foreground/60 hover:bg-cream/5 hover:text-primary-foreground/90",
              )}
            >
              <span className="relative">
                <Icon className="size-4" strokeWidth={active ? 2.1 : 1.8} />
                {isLiveOps && live && variant === "fixed" && (
                  <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-clay animate-live-pulse xl:hidden" />
                )}
              </span>
              <span className={label}>{item.label}</span>
              {isLiveOps && (
                <span className={cn("ml-auto flex items-center gap-1.5", label)}>
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
      {/* the day, as one ledger line: what is on the course, and where */}
      {live && (
        <Link
          href="/admin/live"
          onClick={onNavigate}
          className={cn(
            "focus-ring mx-3 mb-2 rounded-lg border border-cream/10 px-3 py-2.5 transition-colors hover:bg-cream/5",
            wide,
          )}
        >
          <p className="smallcaps text-primary-foreground/60">On the course</p>
          <p className="mt-1 truncate text-[13px] text-cream">{live.name}</p>
          <p className="mt-0.5 text-[11px] text-primary-foreground/60 tnum">
            Round {liveRound || 1} · first tee {live.firstTee}
          </p>
        </Link>
      )}
      <div className={cn("border-t border-cream/10", variant === "fixed" ? "p-3 xl:p-4" : "p-4")}>
        <div className={cn("flex items-center gap-3 rounded-xl bg-cream/5 p-3", variant === "fixed" && "justify-center xl:justify-start")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clay font-serif text-sm text-cream">
            {deskName?.trim() ? initials(deskName) : "·"}
          </div>
          <div className={cn("min-w-0", wide)}>
            <p className="truncate text-[13px] font-medium text-cream">
              {deskName?.trim() || "The desk"}
            </p>
            <p className="truncate text-[11px] text-primary-foreground/60">{clubName}</p>
          </div>
        </div>
      </div>
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
  const clubName = useSim((s) => clubNameOf(s));

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
          {/* tablet: a top bar and a drawer instead of the rail */}
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/95 px-5 py-3 backdrop-blur lg:hidden">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
              className="focus-ring flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-accent"
            >
              <Menu className="size-5" />
            </button>
            <Link href="/admin" className="focus-ring rounded-md">
              <Logo className="text-[17px]" />
            </Link>
            <span className="ml-auto truncate text-[13px] text-muted-foreground">{clubName}</span>
          </div>
          {drawer && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div
                className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
                onClick={() => setDrawer(false)}
                aria-hidden
              />
              <aside className="animate-enter-rise absolute inset-y-0 left-0 flex w-72 flex-col bg-primary text-primary-foreground shadow-pane">
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setDrawer(false)}
                  className="focus-ring absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg text-primary-foreground/70 hover:bg-cream/10 hover:text-cream"
                >
                  <X className="size-4" />
                </button>
                <Rail variant="drawer" onNavigate={() => setDrawer(false)} />
              </aside>
            </div>
          )}
          {/* desk: the rail, full from 1280px and icons only from 1024px */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col bg-primary text-primary-foreground lg:flex xl:w-60">
            <Rail variant="fixed" />
          </aside>
          <main className="min-h-dvh lg:ml-[72px] xl:ml-60">
            <div className="mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-8 xl:px-10 xl:py-9">
              {children}
            </div>
          </main>
        </div>
        {!IS_PILOT && <DemoToggle corner="br" />}
        <DeskWelcome />
      </div>
    </SimGate>
  );
}
