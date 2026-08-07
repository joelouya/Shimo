"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Radio,
  Settings,
  Trophy,
  Tv,
  Users,
} from "lucide-react";

import { DeskWelcome } from "@/components/admin/desk-welcome";
import { Logo } from "@/components/logo";
import { DemoToggle } from "@/components/demo-toggle";
import { SimGate } from "@/components/sim-gate";
import { IS_PILOT } from "@/lib/mode";
import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/live", label: "Live Ops", icon: Radio },
  { href: "/admin/tv", label: "TV producer", icon: Tv },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function Sidebar() {
  const pathname = usePathname();
  const openFlags = useSim(
    (s) => s.flags.filter((f) => f.status === "open").length,
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-primary text-primary-foreground">
      {/* The wordmark goes home, because every other product a caddymaster
          uses does and they will click it whether it works or not. */}
      <Link
        href="/admin"
        aria-label="Shimo, back to the dashboard"
        className="block px-6 pt-7 pb-6 transition-opacity duration-[var(--dur-hover)] hover:opacity-80"
      >
        <Logo tone="cream" className="text-[22px]" />
        <p className="smallcaps mt-2 text-primary-foreground/60">
          Club administration
        </p>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors",
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
                  <span className="size-1.5 rounded-full bg-clay animate-live-pulse" />
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-cream/10 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-cream/5 p-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-clay font-serif text-sm text-cream">
            W
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-cream">
              Wanjiru Njenga
            </p>
            <p className="truncate text-[11px] text-primary-foreground/60">
              Muthaiga Golf Club
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SimGate
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Logo className="text-3xl opacity-40" />
        </div>
      }
    >
      <div className="min-h-dvh">
        <Sidebar />
        <main className="ml-60 min-h-dvh">
          <div className="mx-auto max-w-6xl px-10 py-9">{children}</div>
        </main>
        {!IS_PILOT && <DemoToggle corner="br" />}
        <DeskWelcome />
      </div>
    </SimGate>
  );
}
