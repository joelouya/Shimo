"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import { TournamentCard } from "@/components/golfer/tournament-card";
import { CLUBS } from "@/lib/data";
import { eligibilityFor } from "@/lib/eligibility";
import { allTournaments, useSim } from "@/lib/sim/store";
import type { Format } from "@/lib/types";
import { cn } from "@/lib/utils";

const FORMATS: Format[] = [
  "Stableford",
  "Stroke Play",
  "Match Play",
  "Better Ball",
  "Scramble",
];

const DATE_RANGES = [
  { id: "all", label: "Any date" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "July" },
  { id: "next-month", label: "August" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[13.5px] font-medium transition-[color,background-color,border-color] duration-[var(--dur-hover)] ease-[var(--ease-out)] cursor-pointer",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-ink-soft hover:border-stone/50",
      )}
    >
      {children}
    </button>
  );
}

export default function TournamentsPage() {
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const [format, setFormat] = useState<Format | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [range, setRange] = useState("all");
  const [eligibleOnly, setEligibleOnly] = useState(false);

  const list = useMemo(() => {
    return allTournaments(created, dismissed)
      .filter((t) => t.status === "upcoming")
      .filter((t) => !format || t.format === format)
      .filter((t) => !clubId || t.clubId === clubId)
      .filter((t) => {
        if (range === "week") return t.date >= "2026-07-17" && t.date <= "2026-07-24";
        if (range === "month") return t.date.startsWith("2026-07");
        if (range === "next-month") return t.date.startsWith("2026-08");
        return true;
      })
      .filter((t) => !eligibleOnly || eligibilityFor(t).kind === "eligible")
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [created, format, clubId, range, eligibleOnly]);

  return (
    <div className="pt-5">
      <header className="px-5">
        <p className="smallcaps text-clay">Discover</p>
        <h1 className="mt-1 font-serif text-[32px] font-medium leading-[1.04] tracking-[-0.012em] text-foreground">
          Tournaments across Kenya
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {list.length} upcoming · every affiliated club, one entry list
        </p>
      </header>

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={eligibleOnly} onClick={() => setEligibleOnly((v) => !v)}>
          Eligible for me
        </Chip>
        {FORMATS.map((f) => (
          <Chip
            key={f}
            active={format === f}
            onClick={() => setFormat(format === f ? null : f)}
          >
            {f}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
        {DATE_RANGES.map((r) => (
          <Chip
            key={r.id}
            active={range === r.id}
            onClick={() => setRange(range === r.id ? "all" : r.id)}
          >
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
        {CLUBS.map((c) => (
          <Chip
            key={c.id}
            active={clubId === c.id}
            onClick={() => setClubId(clubId === c.id ? null : c.id)}
          >
            {c.short}
          </Chip>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 px-5">
        {list.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <TournamentCard t={t} />
          </motion.div>
        ))}
        {list.length === 0 && (
          <div className="rounded-2xl bg-card p-8 text-center shadow-card">
            <p className="font-serif text-lg text-foreground">Nothing matches</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try clearing a filter or two.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
