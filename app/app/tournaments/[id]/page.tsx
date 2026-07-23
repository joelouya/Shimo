"use client";

import { use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Flag, Lock, MapPin, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EligibilityTag } from "@/components/golfer/tournament-card";
import { LiveBadge } from "@/components/live-dot";
import { clubById, courseById } from "@/lib/data";
import { eligibilityFor } from "@/lib/eligibility";
import {
  allTournaments,
  registerForTournament,
  useSim,
} from "@/lib/sim/store";
import { formatDateLong, formatKES } from "@/lib/utils";

const FORMAT_EXPLAINERS: Record<string, string> = {
  Stableford:
    "Points on every hole against your handicap: two for a net par, three for a net birdie, and a blob costs you nothing. The highest points total wins, so one bad hole never ruins the card.",
  "Stroke Play":
    "Every stroke counts and the card must come home. Lowest net score against the field wins. The purest, and least forgiving, form of the game.",
  "Match Play":
    "Hole by hole, head to head. Win more holes than your opponent and the match is yours; the scorecard total never matters.",
  "Better Ball":
    "Pairs: both play their own ball, and the better net score on each hole counts for the team.",
  Scramble:
    "Teams play from the best ball's position every shot. Fast, sociable, and kind to wild drivers.",
};

export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const created = useSim((s) => s.created);
  const registrations = useSim((s) => s.registrations);
  const t = allTournaments(created).find((x) => x.id === id);

  if (!t) {
    return (
      <div className="px-5 pt-16 text-center">
        <p className="font-serif text-xl">Tournament not found</p>
        <Link href="/app/tournaments" className="mt-2 inline-block text-sm text-clay underline">
          Back to tournaments
        </Link>
      </div>
    );
  }

  const club = clubById(t.clubId);
  const course = courseById(t.courseId);
  const totalYards = course.holes.reduce((a, h) => a + h.yards, 0);
  const eligibility = eligibilityFor(t);
  const isRegistered = t.registered || registrations.includes(t.id);
  const canRegister = eligibility.kind === "eligible" && t.status === "upcoming";

  return (
    <div>
      {/* hero */}
      <div className="bg-primary px-5 pb-7 pt-5 text-primary-foreground">
        <div className="flex items-center justify-between">
          <Link
            href="/app/tournaments"
            className="inline-flex items-center gap-1.5 text-xs text-primary-foreground/60 hover:text-primary-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Tournaments
          </Link>
          {t.status === "live" && <LiveBadge />}
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="smallcaps mt-6 text-primary-foreground/50">
            {t.format} · {formatDateLong(t.date)}
          </p>
          <h1 className="mt-2 font-serif text-[30px] leading-[1.1]">{t.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-primary-foreground/60">
            <MapPin className="size-3.5" />
            {club.name}, {club.town}
          </p>
        </motion.div>
      </div>

      <div className="px-5">
        {/* entry card overlapping the hero */}
        <div className="-mt-4 rounded-2xl bg-card p-4 shadow-lift">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="smallcaps text-muted-foreground">Entry</p>
              <p className="mt-0.5 font-serif text-2xl text-foreground tnum">
                {formatKES(t.entryFee)}
              </p>
            </div>
            <EligibilityTag t={t} />
          </div>
          <div className="mt-3">
            {isRegistered ? (
              <Button className="w-full" variant="secondary" size="lg" disabled>
                <Check className="size-4 text-clay" />
                You&apos;re registered
              </Button>
            ) : canRegister ? (
              <Button
                className="w-full"
                variant="clay"
                size="lg"
                onClick={() => registerForTournament(t.id)}
              >
                Register · {formatKES(t.entryFee)}
              </Button>
            ) : (
              <Button className="w-full" variant="secondary" size="lg" disabled>
                <Lock className="size-3.5" />
                {eligibility.label}
              </Button>
            )}
          </div>
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
            Registration closes {formatDateLong(t.regCloses)} · {t.fieldSize} of{" "}
            {t.maxPlayers} entered
          </p>
        </div>

        <section className="mt-7">
          <p className="smallcaps mb-2 text-muted-foreground">About this event</p>
          <p className="text-[16px] leading-relaxed text-ink-soft">{t.description}</p>
        </section>

        <section className="mt-7 rounded-2xl bg-card p-4 shadow-card">
          <p className="smallcaps mb-3 text-muted-foreground">The course</p>
          <p className="font-serif text-lg text-foreground">{course.name}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Par", value: course.par },
              { label: "Yards", value: totalYards.toLocaleString() },
              { label: "Tees", value: course.tees },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-secondary/60 py-2.5">
                <p className="font-serif text-lg text-foreground tnum">{s.value}</p>
                <p className="smallcaps text-[9px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7 rounded-2xl border border-clay/20 bg-clay-wash/50 p-4">
          <p className="smallcaps mb-2 flex items-center gap-1.5 text-clay-deep">
            <Flag className="size-3" />
            How {t.format} works
          </p>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            {FORMAT_EXPLAINERS[t.format]}
          </p>
          {t.handicapAllowance !== 100 && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Played off {t.handicapAllowance}% handicap allowance.
            </p>
          )}
        </section>

        <section className="mt-7">
          <p className="smallcaps mb-3 text-muted-foreground">Prizes</p>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {t.prizes.map((p, i) => (
              <div
                key={p.place}
                className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/70" : ""}`}
              >
                <Trophy className="mt-0.5 size-4 shrink-0 text-gold" />
                <div>
                  <p className="text-[13px] font-medium text-foreground">{p.place}</p>
                  <p className="text-xs text-muted-foreground">{p.prize}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {t.divisions.length > 1 && (
          <section className="mt-7 pb-4">
            <p className="smallcaps mb-3 text-muted-foreground">Divisions</p>
            <div className="flex flex-wrap gap-2">
              {t.divisions.map((d) => (
                <span
                  key={d.name}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-ink-soft"
                >
                  {d.name} · HC {d.range[0]}–{d.range[1]}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
