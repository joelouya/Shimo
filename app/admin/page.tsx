"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LiveBadge } from "@/components/live-dot";
import { clubById } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import { useActiveTournament, useStandings } from "@/lib/sim/hooks";
import { allTournaments, useSim } from "@/lib/sim/store";
import { formatDate, formatKES, toPar } from "@/lib/utils";

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <p className="smallcaps text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-[32px] leading-none text-foreground tnum">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function LivePanel() {
  const active = useActiveTournament();
  const isStableford = active?.tournament.format !== "Stroke Play";
  const rows = useStandings(isStableford ? "points" : "net");
  const scores = useSim((s) => s.scores);
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift"
    >
      <div className="flex items-center justify-between p-6 pb-0">
        <div className="flex items-center gap-3">
          <LiveBadge />
          <p className="smallcaps text-primary-foreground/50">
            On course now
          </p>
        </div>
        {flags.length > 0 && (
          <span className="rounded-full bg-amber-wash px-2.5 py-0.5 text-[11px] font-medium text-amber-flag tnum">
            {flags.length} flag{flags.length > 1 ? "s" : ""} need attention
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-8 p-6">
        <div>
          <h2 className="font-serif text-[26px] leading-tight">
            {active.tournament.name}
          </h2>
          <p className="mt-1 text-[13px] text-primary-foreground/55">
            {active.tournament.format} · {fieldIds.length} players · first tee{" "}
            {active.tournament.firstTee}
          </p>
        </div>
        <div className="flex gap-10">
          <div>
            <p className="smallcaps text-primary-foreground/45">Groups out</p>
            <p className="mt-1 font-serif text-3xl tnum">{groupsOut}</p>
          </div>
          <div>
            <p className="smallcaps text-primary-foreground/45">Scores in</p>
            <p className="mt-1 font-serif text-3xl tnum">{scoresIn}</p>
          </div>
          <div>
            <p className="smallcaps text-primary-foreground/45">Leader</p>
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
      <div className="flex border-t border-white/10">
        <Link
          href="/admin/live"
          className="flex flex-1 items-center justify-between px-6 py-3.5 text-[13px] font-medium text-primary-foreground/85 transition-colors hover:bg-white/5"
        >
          Open Live Ops
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/admin/live#certification"
          className="flex items-center gap-2 border-l border-white/10 px-6 py-3.5 text-[13px] font-medium text-primary-foreground/85 transition-colors hover:bg-white/5"
        >
          Certification & disputes
        </Link>
      </div>
    </motion.div>
  );
}

function PilotTiles() {
  const roster = useSim((s) => s.roster);
  const created = useSim((s) => s.created);
  const cardIn = useSim((s) => s.cardIn);
  const active = useActiveTournament();
  const fieldIds = active ? active.groups.flatMap((g) => g.playerIds) : [];
  const cardsIn = fieldIds.filter((pid) => cardIn[pid]).length;
  return (
    <>
      <StatTile
        label="Members on Shimo"
        value={String(roster.length)}
        sub="synced from the club roster"
      />
      <StatTile
        label="Tournaments created"
        value={String(created.length)}
        sub={`${created.filter((t) => t.status === "upcoming").length} upcoming`}
      />
      <StatTile
        label="Live today"
        value={active ? "1" : "0"}
        sub={active?.tournament.name ?? "nothing started"}
      />
      <StatTile
        label="Cards in"
        value={fieldIds.length ? `${cardsIn}/${fieldIds.length}` : "·"}
        sub="from the scoring desk"
      />
    </>
  );
}

export default function AdminDashboard() {
  const created = useSim((s) => s.created);
  const upcoming = allTournaments(created)
    .filter((t) => t.status === "upcoming" && t.clubId === "muthaiga")
    .concat(
      allTournaments(created).filter(
        (t) => t.status === "upcoming" && t.clubId !== "muthaiga",
      ),
    )
    .slice(0, 5);
  const recent = allTournaments(created).filter((t) => t.status === "completed");

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <p className="smallcaps text-clay">
            {new Date().toLocaleDateString("en-KE", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            · Muthaiga Golf Club
          </p>
          <h1 className="mt-2 font-serif text-[38px] leading-[1.05] text-foreground">
            Good morning, Wanjiru.
          </h1>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      <div className="mt-8">
        <LivePanel />
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4">
        {IS_PILOT ? (
          <PilotTiles />
        ) : (
          <>
            <StatTile label="Members" value="486" sub="12 joined this quarter" />
            <StatTile label="Tournaments · July" value="4" sub="2 open for entries" />
            <StatTile label="Rounds scored on Shimo" value="1,248" sub="since March" />
            <StatTile label="Entry revenue · July" value="KES 428k" sub="via M-PESA & card" />
          </>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
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
          <p className="smallcaps mb-3 text-muted-foreground">Recent results</p>
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
                Results publish to the KGU handicap system automatically the
                moment cards are attested.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
