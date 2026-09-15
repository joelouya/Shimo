"use client";

import Link from "next/link";
import { Check, Clock, Lock } from "lucide-react";

import { ClubCrest, ClubSurface } from "@/components/club-brand";
import { findClub } from "@/lib/data";
import { eligibilityFor, registrationOpen } from "@/lib/eligibility";
import { priceRange } from "@/lib/pricing";
import { isMultiRound, roundsOf, tournamentDates } from "@/lib/rounds";
import type { Tournament, TournamentEntry } from "@/lib/types";
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

/** "You're in" / "Waitlisted", where a card is for an event the player entered. */
export function EntryChip({ entry }: { entry?: TournamentEntry }) {
  if (!entry || entry.status === "withdrawn") return null;
  const waiting = entry.status === "waitlisted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium tracking-wide",
        waiting ? "bg-amber-wash text-amber-flag" : "bg-clay-wash text-clay-deep",
      )}
    >
      {waiting ? <Clock className="size-2.5" /> : <Check className="size-2.5" />}
      {waiting ? "Waitlisted" : "You're in"}
    </span>
  );
}

export function TournamentCard({
  t,
  entry,
  onRegister,
}: {
  t: Tournament;
  /** this player's entry, when they have one */
  entry?: TournamentEntry;
  /** offered when the player can enter with one tap from here */
  onRegister?: () => void;
}) {
  const clubName = findClub(t.clubId)?.name ?? "Your club";
  const date = new Date(t.date + "T12:00:00");
  const closed = !registrationOpen(t);
  const price = priceRange(t);
  const { start, end } = tournamentDates(t);
  const span =
    start === end ? formatDate(start) : `${formatDate(start)} to ${formatDate(end)}`;
  const entered = entry && entry.status !== "withdrawn";
  return (
    <div className="group rounded-2xl bg-card shadow-card transition-shadow duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:shadow-lift">
    <Link
      href={`/app/tournaments/${t.id}`}
      className="block p-4"
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
            {clubName} · {span}
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
            {entered ? (
              <EntryChip entry={entry} />
            ) : closed ? (
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
    {onRegister && !entered && !closed && (
      <div className="border-t border-border/60 px-4 py-2.5">
        <button
          type="button"
          onClick={onRegister}
          className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-clay text-[13px] font-medium text-cream transition-colors hover:bg-clay-deep cursor-pointer"
        >
          Register
        </button>
      </div>
    )}
    </div>
  );
}
