"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { clubById } from "@/lib/data";
import { eligibilityFor } from "@/lib/eligibility";
import type { Tournament } from "@/lib/types";
import { cn, formatDate, formatKES } from "@/lib/utils";

export function EligibilityTag({ t }: { t: Tournament }) {
  const e = eligibilityFor(t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium tracking-wide",
        e.kind === "eligible" && "bg-clay-wash text-clay-deep",
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
  return (
    <Link
      href={`/app/tournaments/${t.id}`}
      className="group block rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start gap-4">
        <div className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-secondary/70 py-2">
          <span className="smallcaps text-[9px] text-muted-foreground">
            {date.toLocaleDateString("en-KE", { month: "short" })}
          </span>
          <span className="font-serif text-xl leading-none text-foreground tnum">
            {date.getDate()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[17px] leading-snug text-foreground group-hover:text-clay-deep transition-colors">
            {t.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {club.name} · {formatDate(t.date)}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[10.5px] font-medium text-ink-soft">
              {t.format}
            </span>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[10.5px] font-medium text-ink-soft tnum">
              {formatKES(t.entryFee)}
            </span>
            <EligibilityTag t={t} />
          </div>
        </div>
      </div>
    </Link>
  );
}
