"use client";

/**
 * The local nav for a tournament in play.
 *
 * Once the desk is inside an event, its destinations stop being separate parts
 * of the product and become tabs of the same thing: the pairings, the scoring
 * desk, the live room, the results, the poster, the screen. The global rail
 * still handles Dashboard, Tournaments, Members and Settings; this handles the
 * one event. Hidden from print, because a poster does not carry navigation.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export function TournamentNav({ id }: { id: string }) {
  const pathname = usePathname();
  // Scoring, Live and TV are single global desks that always follow whichever
  // tournament is live. Offering them from another event's pages would send the
  // desk into a different tournament, so they appear only when this event is
  // the live one; every other event shows just its own artifacts.
  const isLive = useSim((s) => s.liveTournamentId === id);
  const items = [
    { label: "Pairings", href: `/admin/tournaments/${id}/pairings` },
    ...(isLive
      ? [
          { label: "Scoring", href: "/admin/scores" },
          { label: "Live", href: "/admin/live" },
        ]
      : []),
    { label: "Results", href: `/admin/tournaments/${id}/summary` },
    { label: "Poster", href: `/admin/tournaments/${id}/poster` },
    ...(isLive ? [{ label: "TV", href: "/admin/tv" }] : []),
  ];

  return (
    <nav className="mt-5 flex flex-wrap gap-1 border-b border-border/70 print:hidden">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.label}
            href={it.href}
            className={cn(
              "-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
