"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";

import { Logo } from "@/components/logo";
import { LiveBadge } from "@/components/live-dot";
import { InstallPrompt } from "@/components/pwa";
import { IdentityGate } from "@/components/golfer/identity-pick";
import { TournamentCard } from "@/components/golfer/tournament-card";
import { DEMO_USER_ID, clubById, courseById, playerById } from "@/lib/data";
import { handicapSet } from "@/lib/scoring";
import { IS_PILOT } from "@/lib/mode";
import { useActiveTournament, useUserLive } from "@/lib/sim/hooks";
import { allTournaments, useSim } from "@/lib/sim/store";
import { formatDate, ordinal } from "@/lib/utils";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <p className="smallcaps text-muted-foreground">{children}</p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Pilot: the club's event today, scored at the desk; follow the board live. */
function PilotLiveCard() {
  const active = useActiveTournament();
  if (!active) return null;
  const club = clubById(active.tournament.clubId);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift"
    >
      <div className="p-5">
        <LiveBadge />
        <h2 className="mt-3 font-serif text-[22px] leading-tight">
          {active.tournament.name}
        </h2>
        <p className="mt-0.5 text-sm text-primary-foreground/55">
          {club.name} · {active.tournament.format}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-primary-foreground/70">
          Cards are being scored at the club desk as they come in. Follow the
          board live.
        </p>
      </div>
      <Link
        href="/app/leaderboard"
        className="flex items-center justify-center gap-2 bg-clay py-3.5 text-[15px] font-medium text-cream transition-colors hover:bg-clay-deep"
      >
        Live leaderboard
        <ArrowRight className="size-4" />
      </Link>
    </motion.div>
  );
}

function LiveNowCard() {
  const me = useUserLive();
  const hidden = useSim((s) => s.hideLeaderboard);
  const t = allTournaments([]).find((x) => x.status === "live")!;
  const club = clubById(t.clubId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift"
    >
      <div className="p-5">
        <div className="flex items-center justify-between">
          <LiveBadge />
          <span className="smallcaps text-primary-foreground/60">
            {me.attested ? "Round complete" : `Thru ${me.thru}`}
          </span>
        </div>
        <h2 className="mt-3 font-serif text-[22px] leading-tight">{t.name}</h2>
        <p className="mt-0.5 text-xs text-primary-foreground/55">
          {club.name} · {t.format}
        </p>

        <div className="mt-5 flex items-end gap-7">
          {!hidden && (
            <div>
              <p className="smallcaps text-primary-foreground/60">Position</p>
              <p className="mt-1 font-serif text-3xl leading-none tnum">
                {me.tied ? "T" : ""}
                {me.position}
                <span className="ml-1 text-sm text-primary-foreground/60">
                  of {36}
                </span>
              </p>
            </div>
          )}
          <div>
            <p className="smallcaps text-primary-foreground/60">Points</p>
            <p className="mt-1 font-serif text-3xl leading-none tnum">{me.points}</p>
          </div>
          <div>
            <p className="smallcaps text-primary-foreground/60">Playing HC</p>
            <p className="mt-1 font-serif text-3xl leading-none tnum">
              {
                handicapSet(
                  playerById(DEMO_USER_ID).handicap,
                  courseById(t.courseId),
                  t.handicapAllowance,
                ).ph
              }
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-t border-cream/10">
        <Link
          href="/app/live"
          className="flex flex-1 items-center justify-center gap-2 bg-clay py-3.5 text-[13px] font-medium text-cream transition-colors hover:bg-clay-deep"
        >
          {me.attested ? "View your card" : "Enter scores"}
          <ArrowRight className="size-3.5" />
        </Link>
        {!hidden && (
          <Link
            href="/app/leaderboard"
            className="flex flex-1 items-center justify-center gap-2 py-3.5 text-[13px] font-medium text-primary-foreground/80 transition-colors hover:bg-cream/5"
          >
            Leaderboard
          </Link>
        )}
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const registrations = useSim((s) => s.registrations);
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const tone = useSim((s) => s.tonePref);
  const roster = useSim((s) => s.roster);
  const identity = useSim((s) => s.deviceIdentity);
  const me =
    IS_PILOT && identity
      ? (roster.find((p) => p.id === identity) ?? playerById(DEMO_USER_ID))
      : playerById(DEMO_USER_ID);
  const user = me;
  const firstName = IS_PILOT && !identity ? "there" : me.name.split(" ")[0];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const upcoming = allTournaments(created, dismissed)
    .filter(
      (t) =>
        t.status === "upcoming" &&
        (t.registered || registrations.includes(t.id)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const recent = allTournaments(created, dismissed).filter(
    (t) => t.status === "completed",
  );

  return (
    <div className="px-5 pt-5">
      <header className="flex items-center justify-between">
        <Logo className="text-[17px]" />
        <p className="smallcaps text-muted-foreground">
          {new Date().toLocaleDateString("en-KE", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </p>
      </header>

      <div className="mt-7">
        <p className="smallcaps text-clay">
          {tone === "classic" ? clubById(user.clubId).name : greeting}
        </p>
        <h1 className="mt-1 font-serif text-[34px] leading-[1.05] text-foreground">
          {tone === "classic" ? (
            <>
              {greeting},
              <br />
              {firstName}.
            </>
          ) : (
            <>
              {firstName}, the course
              <br />
              is calling.
            </>
          )}
        </h1>
      </div>

      <InstallPrompt />

      {IS_PILOT ? (
        <PilotHomeLive />
      ) : (
        <section className="mt-7">
          <SectionLabel>Live now</SectionLabel>
          <LiveNowCard />
        </section>
      )}

      <section className="mt-8">
        <SectionLabel>Your upcoming tournaments</SectionLabel>
        <div className="flex flex-col gap-3">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing booked yet.{" "}
              <Link href="/app/tournaments" className="text-clay underline underline-offset-2">
                Browse tournaments
              </Link>
              .
            </p>
          )}
          {upcoming.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
        <Link
          href="/app/tournaments"
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-clay hover:text-clay-deep"
        >
          Discover tournaments across Kenya
          <ChevronRight className="size-3.5" />
        </Link>
      </section>

      {recent.length > 0 && (
      <section className="mt-8">
        <SectionLabel>Recent results</SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          {recent.map((t, i) => (
            <Link
              key={t.id}
              href={`/app/tournaments/${t.id}`}
              className={`flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 ${
                i > 0 ? "border-t border-border/70" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-foreground">
                  {t.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {clubById(t.clubId).short} · {formatDate(t.date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-[17px] text-foreground tnum">
                  {t.result ? ordinal(t.result.userPosition!) : "·"}
                </p>
                <p className="text-[11px] text-muted-foreground tnum">
                  {t.result?.userScore}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}

function PilotHomeLive() {
  const active = useActiveTournament();
  return (
    <>
      <IdentityGate />
      {active && (
        <section className="mt-7">
          <SectionLabel>Live now</SectionLabel>
          <PilotLiveCard />
        </section>
      )}
      {!active && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="font-serif text-lg text-foreground">
            No tournament running
          </p>
          <p className="mx-auto mt-2 max-w-[260px] text-[14px] leading-relaxed text-muted-foreground">
            When your club starts a tournament day, it appears here with the
            live leaderboard.
          </p>
        </div>
      )}
    </>
  );
}
