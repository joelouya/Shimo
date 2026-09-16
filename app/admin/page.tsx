"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  FileCheck,
  Flag,
  Plus,
  Radio,
  Users,
} from "lucide-react";

import { BandOverlap, PageHeader } from "@/components/admin/page-header";
import { StatCard, type StatDelta } from "@/components/admin/stat-card";
import { PlayerAvatar } from "@/components/player/identity";
import { Button } from "@/components/ui/button";
import { LiveBadge } from "@/components/live-dot";
import { clubById } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import {
  useActiveTournament,
  useRoundCardIn,
  useRoundCerts,
  useRoundScores,
  useSlowClock,
  useStandings,
} from "@/lib/sim/hooks";
import { viewModeFor } from "@/lib/scoring";
import { allTournaments, clubNameOf, groupHolesPlayed, useSim } from "@/lib/sim/store";
import { paceReadings } from "@/lib/pace";
import { roundKey } from "@/lib/rounds";
import { cn, formatDate, formatKES, toPar } from "@/lib/utils";

/** Count timestamps into `n` buckets of `sizeMs`, oldest first, ending now. */
function buckets(stamps: number[], now: number, n: number, sizeMs: number): number[] {
  const out = Array(n).fill(0) as number[];
  const start = now - n * sizeMs;
  for (const t of stamps) {
    if (t < start || t > now) continue;
    const i = Math.min(n - 1, Math.floor((t - start) / sizeMs));
    out[i]++;
  }
  return out;
}

/**
 * The four figures across the top, each with its recent shape. Derived
 * from what the desk already holds: certifications carry the time they
 * sealed, the score feed carries the time each score landed, the tee
 * sheet knows how far each group has played, and entries know when they
 * registered. Nothing here is a claim; every bar is a thing that happened.
 */
function useDayStats(now: number) {
  const active = useActiveTournament();
  const scores = useRoundScores();
  const certs = useRoundCerts();
  const events = useSim((s) => s.events);
  const entries = useSim((s) => s.entries);
  const created = useSim((s) => s.created);
  const roster = useSim((s) => s.roster);
  const paceState = useSim((s) => s.pace);
  const paceThreshold = useSim((s) => s.paceThresholdMin);
  const pairings = useSim((s) => s.pairings);
  const allScores = useSim((s) => s.scores);

  return useMemo(() => {
    const groups = active?.groups ?? [];
    const fieldIds = groups.flatMap((g) => g.playerIds);
    const thruOf = (pid: string) => (scores[pid] ?? []).filter((x) => x != null).length;

    // cards sealed
    const sealedAt = fieldIds
      .map((pid) => certs[pid])
      .filter((c) => c?.stage === "certified" && c.playerCertifiedAt)
      .map((c) => c!.playerCertifiedAt as number);
    const sealedRecent = sealedAt.filter((t) => t > now - 30 * 60_000).length;

    // scores landing
    const scoresIn = fieldIds.reduce((a, pid) => a + thruOf(pid), 0);
    const recentScores = events.filter((e) => e.ts > now - 15 * 60_000).length;

    // the field's progress and pace
    const groupsOut = groups.filter((g) => g.playerIds.some((pid) => thruOf(pid) < 18)).length;
    const progress = groups.map((g) =>
      g.playerIds.length ? Math.min(...g.playerIds.map(thruOf)) : 0,
    );
    let paceLine: StatDelta | undefined;
    if (active) {
      const key = roundKey(active.tournament.id, active.round ?? 1);
      const rows = Object.values(paceState).filter((p) => p.key === key);
      const holes = groupHolesPlayed({ pairings, scores: allScores } as never, key);
      const worst = paceReadings(rows, holes, now, paceThreshold)
        .filter((r) => r.outOfPosition)
        .sort((a, b) => (b.behind ?? 0) - (a.behind ?? 0))[0];
      if (worst) {
        const g = groups.find((gr) => gr.id === worst.groupId);
        paceLine = { text: `Group ${g?.number ?? "?"} is ${worst.behind ?? 0} min behind pace`, dir: "down" };
      } else if (groups.length) {
        paceLine = { text: groupsOut ? "Everyone in position" : "All groups finished", dir: "flat" };
      }
    }

    // registrations for the next event
    const next = created
      .filter((t) => t.status === "upcoming")
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const nextEntries = next
      ? entries.filter((e) => e.tournamentId === next.id && e.status !== "withdrawn")
      : [];
    const registered = nextEntries.filter((e) => e.status === "registered").length;
    const regStamps = nextEntries.map((e) => Date.parse(e.registeredAt)).filter((t) => !isNaN(t));
    const regRecent = regStamps.filter((t) => t > now - 86_400_000).length;

    return {
      active,
      field: fieldIds.length,
      sealed: sealedAt.length,
      sealedRecent,
      sealedSpark: buckets(sealedAt, now, 9, 20 * 60_000),
      scoresIn,
      recentScores,
      scoresSpark: buckets(events.map((e) => e.ts), now, 12, 15 * 60_000),
      groupsOut,
      groupsTotal: groups.length,
      progress,
      paceLine,
      next,
      registered,
      regRecent,
      regSpark: buckets(regStamps, now, 7, 86_400_000),
      members: roster.filter((p) => !p.guest).length,
    };
  }, [active, scores, certs, events, entries, created, roster, paceState, paceThreshold, pairings, allScores, now]);
}

function DayStats({ now }: { now: number }) {
  const d = useDayStats(now);
  const live = Boolean(d.active);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Cards sealed"
        value={live ? d.sealed : "·"}
        unit={live ? `of ${d.field}` : undefined}
        delta={
          live
            ? { text: d.sealedRecent ? `${d.sealedRecent} in the last 30 min` : "none in the last 30 min", dir: d.sealedRecent ? "up" : "flat" }
            : { text: "nothing on the course", dir: "flat" }
        }
        spark={live ? d.sealedSpark : undefined}
        icon={<FileCheck className="size-4" />}
        href="/admin/live#certification"
      />
      <StatCard
        label="Scores in"
        value={live ? d.scoresIn : "·"}
        delta={
          live
            ? { text: d.recentScores ? `${d.recentScores} in the last 15 min` : "quiet for 15 min", dir: d.recentScores ? "up" : "flat" }
            : { text: "the desk grid opens on start", dir: "flat" }
        }
        spark={live ? d.scoresSpark : undefined}
        icon={<ClipboardList className="size-4" />}
        href="/admin/scores"
      />
      <StatCard
        label="Groups out"
        value={live ? d.groupsOut : "·"}
        unit={live ? `of ${d.groupsTotal}` : undefined}
        delta={live ? d.paceLine : { text: "no tee sheet in play", dir: "flat" }}
        spark={live && d.progress.length ? d.progress : undefined}
        icon={<Radio className="size-4" />}
        href="/admin/live"
      />
      {d.next ? (
        <StatCard
          label={`Entries · ${d.next.name}`}
          value={d.registered}
          unit={d.next.maxPlayers ? `of ${d.next.maxPlayers}` : undefined}
          delta={{ text: d.regRecent ? `${d.regRecent} since yesterday` : "none since yesterday", dir: d.regRecent ? "up" : "flat" }}
          spark={d.regSpark}
          icon={<Users className="size-4" />}
          href={`/admin/tournaments/${d.next.id}/registrations`}
        />
      ) : (
        <StatCard
          label="Members on Shimo"
          value={d.members}
          delta={{ text: IS_PILOT ? "synced from the club roster" : "seeded field", dir: "flat" }}
          icon={<Users className="size-4" />}
          href="/admin/members"
        />
      )}
    </div>
  );
}

/**
 * What is on the course, as the navy panel beside the lists: the leader,
 * the top of the board, a quiet pace line, and the two doors into the day.
 * Empty on a quiet morning, and it says so rather than pretending.
 */
function OnCoursePanel() {
  const active = useActiveTournament();
  const mode = viewModeFor(active?.tournament.format);
  const isStableford = mode === "points";
  const rows = useStandings(mode).slice(0, 6);
  const allFlags = useSim((s) => s.flags);
  const flags = allFlags.filter((f) => f.status === "open" && (!IS_PILOT || f.kind !== "red"));

  if (!active) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6">
        <p className="smallcaps text-muted-foreground">On the course</p>
        <p className="mt-2 font-serif text-[19px] leading-tight text-foreground">Nothing today</p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Create a tournament, draw the tee sheet, then start the day from the
          tournaments list. This panel becomes the board.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/admin/tournaments">Tournaments</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <LiveBadge />
          {flags.length > 0 && (
            <span className="rounded-full bg-amber-wash px-2.5 py-0.5 text-[11px] font-medium text-amber-flag tnum">
              {flags.length} flag{flags.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <h2 className="mt-3 font-serif text-[22px] leading-tight">{active.tournament.name}</h2>
        <p className="mt-1 text-[12.5px] text-primary-foreground/55">
          {active.tournament.format} · {active.roundInfo.name} · first tee {active.roundInfo.firstTee}
        </p>
      </div>
      <div className="border-t border-cream/10">
        <div className="flex items-center justify-between px-5 pt-3 pb-1.5">
          <p className="smallcaps text-primary-foreground/60">Leaderboard</p>
          <p className="text-[10.5px] text-primary-foreground/60">
            {isStableford ? "Stableford pts" : "Net to par"}
          </p>
        </div>
        {rows.length === 0 && (
          <p className="px-5 pb-4 text-[12.5px] text-primary-foreground/55">No scores in yet.</p>
        )}
        {rows.map((r) => (
          <div
            key={r.player.id}
            className="flex items-center gap-2.5 border-t border-cream/5 px-5 py-2"
          >
            <span className="w-6 font-serif text-[13px] text-primary-foreground/70 tnum">
              {r.tied ? "T" : ""}
              {r.position}
            </span>
            <PlayerAvatar player={r.player} size="sm" />
            <span className="flex-1 truncate text-[12.5px]">{r.player.name}</span>
            <span className="text-[10.5px] text-primary-foreground/60 tnum">
              {r.thru >= 18 ? "F" : r.thru || "·"}
            </span>
            <span className="w-8 text-right font-serif text-[15px] text-clay-wash tnum">
              {isStableford ? r.points : toPar(r.netToPar)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex border-t border-cream/10">
        <Link
          href="/admin/live"
          className="focus-ring flex flex-1 items-center justify-between px-5 py-3.5 text-[13px] font-medium text-primary-foreground/85 transition-colors hover:bg-cream/5"
        >
          Open Live Ops
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/admin/live#certification"
          className="focus-ring flex items-center gap-2 border-l border-cream/10 px-5 py-3.5 text-[13px] font-medium text-primary-foreground/85 transition-colors hover:bg-cream/5"
        >
          Committee
        </Link>
      </div>
    </div>
  );
}

/**
 * What is waiting on the desk, as a short list with a way to each item.
 * Derived from state the desk already holds; empty when nothing is, which
 * on a quiet morning is the right thing for it to say.
 */
function NeedsYou({ now }: { now: number }) {
  const active = useActiveTournament();
  const liveId = active?.tournament.id ?? null;
  const flags = useSim(
    (s) => s.flags.filter((f) => f.status === "open" && (!IS_PILOT || f.kind !== "red")).length,
  );
  const disputes = useSim(
    (s) => s.disputes.filter((d) => d.status === "open" && d.tournamentId === liveId).length,
  );
  const corrections = useSim(
    (s) => s.corrections.filter((c) => c.status === "pending" && c.tournamentId === liveId).length,
  );
  const certs = useRoundCerts();
  const scores = useRoundScores();
  const cardIn = useRoundCardIn();
  const created = useSim((s) => s.created);
  const entries = useSim((s) => s.entries);
  const fieldIds = active ? active.groups.flatMap((g) => g.playerIds) : [];
  const awaitingDesk = fieldIds.filter((pid) => {
    const thru = (scores[pid] ?? []).filter((x) => x != null).length;
    const c = certs[pid];
    return thru >= 18 && !cardIn[pid] && (!c || c.stage === "awaiting-marker");
  }).length;
  const today = new Date(now).toISOString().slice(0, 10);
  const startToday = created.filter((t) => t.status === "upcoming" && t.date === today && !active);
  const sinceYesterday = new Date(now - 86_400_000).toISOString();
  const newEntries = entries.filter(
    (e) => e.status !== "withdrawn" && e.registeredAt >= sinceYesterday,
  ).length;

  const items: { text: string; href: string; icon: React.ReactNode }[] = [];
  for (const t of startToday) {
    items.push({ text: `${t.name} is today and has not been started`, href: "/admin/tournaments", icon: <Radio className="size-3.5" /> });
  }
  if (disputes) items.push({ text: `${disputes} dispute${disputes > 1 ? "s" : ""} waiting for the Committee`, href: "/admin/live#certification", icon: <Flag className="size-3.5" /> });
  if (corrections) items.push({ text: `${corrections} correction request${corrections > 1 ? "s" : ""} to decide`, href: "/admin/live#certification", icon: <FileCheck className="size-3.5" /> });
  if (awaitingDesk) items.push({ text: `${awaitingDesk} finished card${awaitingDesk > 1 ? "s" : ""} not yet attested or in`, href: "/admin/scores", icon: <ClipboardList className="size-3.5" /> });
  if (flags) items.push({ text: `${flags} flag${flags > 1 ? "s" : ""} open in Live Ops`, href: "/admin/live", icon: <Flag className="size-3.5" /> });
  if (newEntries) items.push({ text: `${newEntries} new registration${newEntries > 1 ? "s" : ""} since yesterday`, href: "/admin/tournaments", icon: <Users className="size-3.5" /> });

  return (
    <section>
      <p className="smallcaps mb-3 text-muted-foreground">Needs you</p>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        {items.length === 0 ? (
          <p className="px-5 py-4 text-[13.5px] text-muted-foreground">Nothing waiting on the desk.</p>
        ) : (
          items.map((it, i) => (
            <Link
              key={it.text}
              href={it.href}
              className={cn(
                "focus-ring flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50",
                i > 0 && "border-t border-border/60",
              )}
            >
              <span className="flex items-center gap-3 text-[14px] text-foreground">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-clay-wash text-clay-deep">
                  {it.icon}
                </span>
                {it.text}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export default function AdminDashboard() {
  const clubName = useSim((s) => clubNameOf(s));
  const deskName = useSim((s) => s.deskName);
  const deskFirst = deskName?.trim().split(" ")[0] ?? "";
  const now = useSlowClock();
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const active = useActiveTournament();
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const upcoming = allTournaments(created, dismissed)
    .filter((t) => t.status === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const recent = allTournaments(created, dismissed).filter((t) => t.status === "completed");

  return (
    <div>
      <PageHeader
        overlap
        eyebrow={`${new Date(now).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })} · ${clubName}`}
        title={`${greeting}${deskFirst ? `, ${deskFirst}` : ""}.`}
        meta={
          active
            ? `${active.tournament.name} is on the course · ${active.roundInfo.name} · ${active.groups.flatMap((g) => g.playerIds).length} players`
            : "Nothing on the course today"
        }
        actions={
          <>
            <Button variant="outline" size="lg" asChild>
              <Link href="/admin/scores">
                <ClipboardList className="size-4" />
                Enter scores from cards
              </Link>
            </Button>
            <Button variant="clay" size="lg" asChild>
              <Link href="/admin/tournaments/new">
                <Plus className="size-4" />
                Create tournament
              </Link>
            </Button>
          </>
        }
      />

      <BandOverlap className="animate-enter-rise">
        <DayStats now={now} />
      </BandOverlap>

      <div className="animate-enter-rise mt-8 grid grid-cols-1 gap-6 [animation-delay:120ms] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          <NeedsYou now={now} />
          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="smallcaps text-muted-foreground">Upcoming</p>
              <Link
                href="/admin/tournaments"
                className="focus-ring flex items-center gap-1 rounded-md text-xs font-medium text-clay hover:text-clay-deep"
              >
                All tournaments <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl bg-card shadow-card">
              {upcoming.length === 0 && (
                <p className="px-5 py-4 text-[13.5px] text-muted-foreground">Nothing published yet.</p>
              )}
              {upcoming.map((t, i) => (
                <Link
                  key={t.id}
                  href={`/admin/tournaments/${t.id}/registrations`}
                  className={cn(
                    "focus-ring flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50",
                    i > 0 && "border-t border-border/60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-foreground">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {clubById(t.clubId).short} · {t.format} · {formatKES(t.entryFee)}
                    </p>
                  </div>
                  <p className="shrink-0 font-serif text-[15px] text-ink-soft tnum">{formatDate(t.date)}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
        <OnCoursePanel />
      </div>

      {recent.length > 0 && (
        <section className="animate-enter-rise mt-8 [animation-delay:200ms]">
          <p className="smallcaps mb-3 text-muted-foreground">Recent results</p>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {recent.map((t, i) => (
              <Link
                key={t.id}
                href={`/admin/tournaments/${t.id}/summary`}
                className={cn(
                  "focus-ring flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">{t.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {clubById(t.clubId).short} · {formatDate(t.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-medium text-foreground">{t.result?.winner ?? "·"}</p>
                  <p className="text-[11px] text-muted-foreground tnum">{t.result?.score}</p>
                </div>
              </Link>
            ))}
            <div className="border-t border-border/60 bg-secondary/30 px-5 py-3">
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Every attested card is sealed and export-ready for the club&apos;s handicap returns.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
