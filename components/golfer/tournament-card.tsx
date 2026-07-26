"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { ClubCrest, ClubSurface } from "@/components/club-brand";
import { clubById } from "@/lib/data";
import { eligibilityFor, registrationOpen } from "@/lib/eligibility";
import { priceRange } from "@/lib/pricing";
import { isMultiRound, roundsOf, tournamentDates } from "@/lib/rounds";
import type { Tournament } from "@/lib/types";
import { cn, formatDate, formatKES } from "@/lib/utils";

export function EligibilityTag({ t }: { t: Tournament }) {
  const e = eligibilityFor(t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium tracking-wide",
        // inside a ClubSurface this picks up the club's colour; elsewhere it
        // falls back to Shimo's terracotta
        e.kind === "eligible" &&
          "bg-[color-mix(in_srgb,var(--club-accent,var(--clay))_14%,transparent)] text-[var(--club-accent,var(--clay-deep))]",
        e.kind === "locked" && "bg-secondary text-muted-foreground",
        e.kind === "limit" && "bg-secondary text-muted-foreground",
      )}
    >
      {e.kind !== "eligible" && <Lock className="size-2.5" />}
      {e.label}
    </span>
  );
}

export function TournamentCard({ t }: { t: Tournament }) {
  const club = clubById(t.clubId);
  const date = new Date(t.date + "T12:00:00");
  const closed = !registrationOpen(t);
  const price = priceRange(t);
  const { start, end } = tournamentDates(t);
  const span =
    start === end ? formatDate(start) : `${formatDate(start)} to ${formatDate(end)}`;
  return (
    <Link
      href={`/app/tournaments/${t.id}`}
      className="group block rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-lift"
    >
      <ClubSurface clubId={t.clubId} className="flex items-start gap-4">
        <div className="relative flex w-11 shrink-0 flex-col items-center rounded-xl bg-secondary/70 py-2">
          <span className="smallcaps text-[9px] text-muted-foreground">
            {date.toLocaleDateString("en-KE", { month: "short" })}
          </span>
          <span className="font-serif text-xl leading-none text-foreground tnum">
            {date.getDate()}
          </span>
          <ClubCrest
            clubId={t.clubId}
            className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-card object-contain p-px shadow-card"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[17px] leading-snug text-foreground group-hover:text-clay-deep transition-colors">
            {t.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {club.name} · {span}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[10.5px] font-medium text-ink-soft">
              {t.format}
            </span>
            {isMultiRound(t) && (
              <span className="rounded-full border border-border px-2.5 py-0.5 text-[10.5px] font-medium text-ink-soft">
                {roundsOf(t).length} rounds
              </span>
            )}
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[10.5px] font-medium text-ink-soft tnum">
              {price.single ? formatKES(price.min) : `From ${formatKES(price.min)}`}
            </span>
            {closed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground">
                <Lock className="size-2.5" />
                Registration closed
              </span>
            ) : (
              <EligibilityTag t={t} />
            )}
          </div>
          {t.eligibilityNote?.trim() && (
            <p className="mt-1.5 text-[11px] italic text-muted-foreground">
              {t.eligibilityNote.trim()}
            </p>
          )}
        </div>
      </ClubSurface>
    </Link>
  );
}
