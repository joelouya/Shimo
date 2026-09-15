"use client";

import { PageHeader } from "@/components/admin/page-header";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ClipboardList, Plus } from "lucide-react";

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

type Metric = { label: string; value: string; sub?: string };

/*
 * The day's figures read as one ruled ledger rather than four floating tiles:
 * a single sheet divided into columns by hairlines, the way the totals line is
 * ruled off the foot of a scorecard. One object with internal rhythm, not a row
 * of identical cards competing with the live panel above it. Exactly four cells,
 * laid out 1 / 2 / 4 across the breakpoints, so the dividers fall cleanly.
 */
function DayLedger({ items }: { items: Metric[] }) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-2xl bg-card shadow-card sm:grid-cols-2 lg:grid-cols-4">
      {items.map((m, i) => (
        <div
          key={m.label}
          className={cn(
            "px-5 py-[18px]",
            i > 0 && "border-border/60",
            i > 0 && "border-t sm:border-t-0",
            i % 2 !== 0 && "sm:border-l",
            i % 2 === 0 && i > 0 && "sm:border-t lg:border-t-0",
            i % 4 !== 0 && "lg:border-l",
          )}
        >
          <p className="smallcaps text-muted-foreground">{m.label}</p>
          <p className="mt-2 font-serif text-[30px] leading-none text-foreground tnum">
            {m.value}
          </p>
          {m.sub && (
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">{m.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function LivePanel() {
  const active = useActiveTournament();
  const mode = viewModeFor(active?.tournament.format);
  const isStableford = mode === "points";
  const rows = useStandings(mode);
  const scores = useRoundScores();
  const allFlags = useSim((s) => s.flags);
  const flags = allFlags.filter(
    (f) => f.status === "open" && (!IS_PILOT || f.kind !== "red"),
  );
  const leader = rows[0];
  const fieldIds = active ? active.groups.flatMap((g) => g.playerIds) : [];
  const scoresIn = fieldIds.reduce(
    (a, pid) => a + (scores[pid] ?? []).filter((x) => x != null).length,
    0,
  );
  const groupsOut = (active?.groups ?? []).filter((g) =>
    g.playerIds.some(
      (pid) => (scores[pid] ?? []).filter((x) => x != null).length < 18,
    ),
  ).length;

  /*
   * One trustworthy operational line, derived from pace the desk already
   * captures: the group furthest out of position, if any. A quiet fact for the
   * caddymaster, never an alarm and never shown to players.
   */
  const now = useSlowClock();
  const paceState = useSim((s) => s.pace);
  const paceThreshold = useSim((s) => s.paceThresholdMin);
  const pairings = useSim((s) => s.pairings);
  const allScores = useSim((s) => s.scores);
  const behindGroup = useMemo(() => {
    if (!active) return null;
    const key = roundKey(active.tournament.id, active.round ?? 1);
    const paceRows = Object.values(paceState).filter((p) => p.key === key);
    const holes = groupHolesPlayed({ pairings, scores: allScores } as never, key);
    const worst = paceReadings(paceRows, holes, now, paceThreshold)
      .filter((r) => r.outOfPosition)
      .sort((a, b) => (b.behind ?? 0) - (a.behind ?? 0))[0];
    if (!worst) return null;
    const g = active.groups.find((gr) => gr.id === worst.groupId);
    return g ? { number: g.number, behind: worst.behind ?? 0 } : null;
  }, [active, paceState, paceThreshold, pairings, allScores, now]);

  if (!active) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-dashed border-border bg-card/50 px-6 py-5">
        <div>
          <p className="font-serif text-lg text-foreground">
            Nothing on the course today
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Create a tournament, set pairings, then start the day from the
            tournaments list.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/tournaments">Tournaments</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-enter-rise overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift">
      <div className="flex items-center justify-between p-6 pb-0">
        <div className="flex items-center gap-3">
          <LiveBadge />
          <p className="smallcaps text-primary-foreground/60">
            On course now
          </p>
        </div>
        {flags.length > 0 && (
          <span className="rounded-full bg-amber-wash px-2.5 py-0.5 text-[11px] font-medium text-amber-flag tnum">
            {flags.length} flag{flags.length > 1 ? "s" : ""} need attention
          </span>
        )}
      </div>
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:gap-8">
        <div>
          <h2 className="font-serif text-[26px] leading-tight">
            {active.tournament.name}
          </h2>
          <p className="mt-1 text-[13px] text-primary-foreground/55">
            {active.tournament.format} · {fieldIds.length} players · first tee{" "}
            {active.tournament.firstTee}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <p className="smallcaps text-primary-foreground/60">Groups out</p>
            <p className="mt-1 font-serif text-3xl tnum">{groupsOut}</p>
          </div>
          <div>
            <p className="smallcaps text-primary-foreground/60">Scores in</p>
            <p className="mt-1 font-serif text-3xl tnum">{scoresIn}</p>
          </div>
          <div>
            <p className="smallcaps text-primary-foreground/60">Leader</p>
            <p className="mt-1 font-serif text-xl leading-tight">
              {leader
                ? leader.player.name
                    .split(" ")
                    .map((s, i) => (i === 0 ? s[0] + ". " : s))
                : "·"}
              <span className="ml-1 text-clay-wash tnum">
                {leader
                  ? isStableford
                    ? `${leader.points} pts`
                    : `${toPar(leader.netToPar)} net`
                  : ""}
              </span>
            </p>
          </div>
        </div>
      </div>
      {behindGroup && (
        <div className="flex items-center gap-2 border-t border-cream/10 px-6 py-2.5 text-[12.5px] text-primary-foreground/70">
          <span className="size-1.5 shrink-0 rounded-full bg-clay-lift" />
          Group {behindGroup.number} is {behindGroup.behind} min behind pace
        </div>
      )}
      <div className="flex border-t border-cream/10">
        <Link
          href="/admin/live"
          className="flex flex-1 items-center justify-between px-6 py-3.5 text-[13px] font-medium text-primary-foreground/85 transition-colors hover:bg-cream/5"
        >
          Open Live Ops
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/admin/live#certification"
          className="flex items-center gap-2 border-l border-cream/10 px-6 py-3.5 text-[13px] font-medium text-primary-foreground/85 transition-colors hover:bg-cream/5"
        >
          Certification & disputes
        </Link>
      </div>
    </div>
  );
}

function usePilotMetrics(): Metric[] {
  const roster = useSim((s) => s.roster);
  const created = useSim((s) => s.created);
  const cardIn = useSim((s) => s.cardIn);
  const active = useActiveTournament();
  const fieldIds = active ? active.groups.flatMap((g) => g.playerIds) : [];
  const cardsIn = fieldIds.filter((pid) => cardIn[pid]).length;
  return [
    {
      label: "Members on Shimo",
      value: String(roster.length),
      sub: "synced from the club roster",
    },
    {
      label: "Tournaments created",
      value: String(created.length),
      sub: `${created.filter((t) => t.status === "upcoming").length} upcoming`,
    },
    {
      label: "Live today",
      value: active ? "1" : "0",
      sub: active?.tournament.name ?? "nothing started",
    },
    {
      label: "Cards in",
      value: fieldIds.length ? `${cardsIn}/${fieldIds.length}` : "·",
      sub: "from the scoring desk",
    },
  ];
}

/**
 * What is waiting on the desk, as a short list with a way to each item.
 * Derived from state the desk already holds; empty when nothing is, which
 * on a quiet morning is the right thing for it to say.
 */
function NeedsYou() {
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
  // the page's slow clock, so the list is pure in render and still moves
  const now = useSlowClock();
  const today = new Date(now).toISOString().slice(0, 10);
  const startToday = created.filter((t) => t.status === "upcoming" && t.date === today && !active);
  const sinceYesterday = new Date(now - 86_400_000).toISOString();
  const newEntries = entries.filter(
    (e) => e.status !== "withdrawn" && e.registeredAt >= sinceYesterday,
  ).length;

  const items: { text: string; href: string }[] = [];
  for (const t of startToday) {
    items.push({ text: `${t.name} is today and has not been started`, href: "/admin/tournaments" });
  }
  if (disputes) items.push({ text: `${disputes} dispute${disputes > 1 ? "s" : ""} waiting for the Committee`, href: "/admin/live#certification" });
  if (corrections) items.push({ text: `${corrections} correction request${corrections > 1 ? "s" : ""} to decide`, href: "/admin/live#certification" });
  if (awaitingDesk) items.push({ text: `${awaitingDesk} finished card${awaitingDesk > 1 ? "s" : ""} not yet attested or in`, href: "/admin/scores" });
  if (flags) items.push({ text: `${flags} flag${flags > 1 ? "s" : ""} open in Live Ops`, href: "/admin/live" });
  if (newEntries) items.push({ text: `${newEntries} new registration${newEntries > 1 ? "s" : ""} since yesterday`, href: "/admin/tournaments" });

  return (
    <section className="animate-enter-rise mt-6 [animation-delay:160ms]">
      <p className="smallcaps mb-3 text-muted-foreground">Needs you</p>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        {items.length === 0 ? (
          <p className="px-5 py-4 text-[13.5px] text-muted-foreground">
            Nothing waiting on the desk.
          </p>
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
                <span className="size-1.5 shrink-0 rounded-full bg-clay" />
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

const DEMO_METRICS: Metric[] = [
  { label: "Members", value: "486", sub: "12 joined this quarter" },
  { label: "Tournaments · July", value: "4", sub: "2 open for entries" },
  { label: "Rounds scored on Shimo", value: "1,248", sub: "since March" },
  { label: "Cards certified · July", value: "312", sub: "sealed and export-ready" },
];

export default function AdminDashboard() {
  const clubName = useSim((s) => clubNameOf(s));
  const deskName = useSim((s) => s.deskName);
  const deskFirst = deskName?.trim().split(" ")[0] ?? "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const pilotMetrics = usePilotMetrics();
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const upcoming = allTournaments(created, dismissed)
    .filter((t) => t.status === "upcoming" && t.clubId === "muthaiga")
    .concat(
      allTournaments(created, dismissed).filter(
        (t) => t.status === "upcoming" && t.clubId !== "muthaiga",
      ),
    )
    .slice(0, 5);
  const recent = allTournaments(created, dismissed).filter(
    (t) => t.status === "completed",
  );

  return (
    <div>
      <PageHeader
        eyebrow={`${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })} · ${clubName}`}
        title={`${greeting}${deskFirst ? `, ${deskFirst}` : ""}.`}
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

      <div className="mt-8">
        <LivePanel />
      </div>

      <div className="animate-enter-rise mt-6 [animation-delay:120ms]">
        <DayLedger items={IS_PILOT ? pilotMetrics : DEMO_METRICS} />
      </div>

      <NeedsYou />

      <div className="mt-8 grid grid-cols-1 gap-6 animate-enter-rise [animation-delay:200ms] md:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="smallcaps text-muted-foreground">Upcoming</p>
            <Link
              href="/admin/tournaments"
              className="flex items-center gap-1 text-xs font-medium text-clay hover:text-clay-deep"
            >
              All tournaments <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {upcoming.map((t, i) => (
              <Link
                key={t.id}
                href={`/admin/tournaments/${t.id}/pairings`}
                className={`flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50 ${
                  i > 0 ? "border-t border-border/60" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {clubById(t.clubId).short} · {t.format} · {formatKES(t.entryFee)}
                  </p>
                </div>
                <p className="shrink-0 font-serif text-[15px] text-ink-soft tnum">
                  {formatDate(t.date)}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex h-[18px] items-center">
            <p className="smallcaps text-muted-foreground">Recent results</p>
          </div>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {recent.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 px-5 py-3.5 ${
                  i > 0 ? "border-t border-border/60" : ""
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
                  <p className="text-[13px] font-medium text-foreground">
                    {t.result?.winner}
                  </p>
                  <p className="text-[11px] text-muted-foreground tnum">
                    {t.result?.score}
                  </p>
                </div>
              </div>
            ))}
            <div className="border-t border-border/60 bg-secondary/30 px-5 py-3">
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Every attested card is sealed and export-ready for the club&apos;s
                handicap returns.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
