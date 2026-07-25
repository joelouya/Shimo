"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Crown, Printer, Share2, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clubById, courseById, playerById } from "@/lib/data";
import {
  computeStandings,
  divisionFor,
  type StandingRow,
  type ViewMode,
} from "@/lib/scoring";
import { allTournaments, useSim } from "@/lib/sim/store";
import type { Player } from "@/lib/types";
import { formatDateLong, toPar } from "@/lib/utils";

function scoreLabel(r: StandingRow, mode: ViewMode) {
  if (mode === "points") return `${r.points} pts`;
  if (mode === "net") return toPar(r.netToPar);
  return toPar(r.grossToPar);
}

function SharePublicBoard({ tournamentId }: { tournamentId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            `${window.location.origin}/live/${tournamentId}`,
          );
        } catch {}
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }}
    >
      {copied ? <Check className="size-4 text-clay" /> : <Share2 className="size-4" />}
      {copied ? "Link copied" : "Share board"}
    </Button>
  );
}

export default function TournamentSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const created = useSim((s) => s.created);
  const pairings = useSim((s) => s.pairings);
  const roster = useSim((s) => s.roster);
  const scores = useSim((s) => s.scores);

  const t = allTournaments(created).find((x) => x.id === id);

  const { overall, divisions } = useMemo(() => {
    if (!t) return { overall: [] as StandingRow[], divisions: [] as { name: string; rows: StandingRow[] }[] };
    const groups = pairings[id] ?? [];
    const fieldIds = groups.flatMap((g) => g.playerIds);
    const field = fieldIds
      .map((pid) => roster.find((p) => p.id === pid) ?? safePlayer(pid))
      .filter((p): p is Player => !!p);
    const course = courseById(t.courseId);
    const mode: ViewMode = t.format === "Stableford" ? "points" : "net";
    const overall = computeStandings(field, scores, course, t.handicapAllowance, mode);

    const divs = t.divisions
      .filter((d) => d.name !== "Overall")
      .map((d) => {
        const inDiv = field.filter(
          (p) => divisionFor(p.handicap, t.divisions) === d.name,
        );
        return {
          name: d.name,
          rows: computeStandings(inDiv, scores, course, t.handicapAllowance, mode),
        };
      })
      .filter((d) => d.rows.length > 0);

    return { overall, divisions: divs };
  }, [t, id, pairings, roster, scores]);

  if (!t) {
    return (
      <div>
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Tournaments
        </Link>
        <p className="mt-8 font-serif text-2xl text-foreground">
          Tournament not found
        </p>
      </div>
    );
  }

  const club = clubById(t.clubId);
  const course = courseById(t.courseId);
  const mode: ViewMode = t.format === "Stableford" ? "points" : "net";
  const champion = overall[0];
  const isFinal = t.status === "completed";

  return (
    <div className="print:px-0">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Tournaments
        </Link>
        <div className="flex items-center gap-2">
          <SharePublicBoard tournamentId={t.id} />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

      {/* masthead */}
      <header className="mt-6 border-b border-border pb-6">
        <p className="smallcaps text-clay">
          {isFinal ? "Final results" : "Provisional standings"} · Prizegiving
        </p>
        <h1 className="mt-2 font-serif text-[38px] leading-tight text-foreground">
          {t.name}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {club.name} · {course.name} · {formatDateLong(t.date)} · {t.format} ·{" "}
          {t.handicapAllowance}% allowance
        </p>
      </header>

      {/* champion */}
      {champion && (
        <section className="mt-8 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-card">
          <div className="flex items-center gap-5 px-7 py-6">
            <Crown className="size-9 shrink-0 text-gold" />
            <div className="min-w-0 flex-1">
              <p className="smallcaps text-primary-foreground/50">Champion</p>
              <p className="mt-0.5 font-serif text-[30px] leading-tight">
                {champion.player.name}
              </p>
              <p className="text-[13px] text-primary-foreground/60">
                {clubById(champion.player.clubId).short} · HC{" "}
                {champion.player.handicap}
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-[40px] leading-none tnum">
                {mode === "points" ? champion.points : toPar(champion.netToPar)}
              </p>
              <p className="smallcaps text-primary-foreground/50">
                {mode === "points" ? "points" : "net"}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* division winners */}
      {divisions.length > 0 && (
        <section className="mt-6">
          <p className="smallcaps mb-3 text-muted-foreground">Division winners</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {divisions.map((d) => {
              const w = d.rows[0];
              if (!w) return null;
              return (
                <div key={d.name} className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-4 text-gold" />
                    <p className="text-[13px] font-semibold text-foreground">
                      {d.name}
                    </p>
                  </div>
                  <p className="mt-2 font-serif text-[20px] text-foreground">
                    {w.player.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    HC {w.player.handicap} · {scoreLabel(w, mode)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* prizes */}
      {t.prizes.length > 0 && (
        <section className="mt-8">
          <p className="smallcaps mb-3 text-muted-foreground">Prizes</p>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {t.prizes.map((p, i) => {
              // best-effort: pair the top finishers to the first prizes listed
              const finisher = overall[i];
              return (
                <div
                  key={p.place + i}
                  className={`flex items-center gap-3 px-5 py-3 ${
                    i > 0 ? "border-t border-border/60" : ""
                  }`}
                >
                  <Trophy className="size-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-foreground">
                      {p.place}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{p.prize}</p>
                  </div>
                  {finisher && i < 3 && (
                    <p className="shrink-0 text-right text-[13px] text-ink-soft">
                      {finisher.player.name}
                      <span className="ml-1.5 text-muted-foreground tnum">
                        {scoreLabel(finisher, mode)}
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Podium prizes are matched to the leaderboard automatically. Special
            prizes (nearest the pin, longest drive) are awarded on the day.
          </p>
        </section>
      )}

      {/* full field */}
      <section className="mt-8 pb-6">
        <p className="smallcaps mb-3 text-muted-foreground">
          Full field · {overall.length} players
        </p>
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="grid grid-cols-[2.5rem_1fr_3rem_4rem] items-center gap-2 border-b border-border bg-secondary/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Pos</span>
            <span>Player</span>
            <span className="text-center">Thru</span>
            <span className="text-right">{mode === "points" ? "Pts" : "Net"}</span>
          </div>
          {overall.map((r) => (
            <div
              key={r.player.id}
              className="grid grid-cols-[2.5rem_1fr_3rem_4rem] items-center gap-2 border-b border-border/50 px-5 py-2.5 last:border-b-0"
            >
              <span
                className={`font-serif text-[15px] tnum ${
                  r.position <= 3 ? "text-clay-deep" : "text-foreground"
                }`}
              >
                {r.tied ? "T" : ""}
                {r.position}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-foreground">
                  {r.player.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {clubById(r.player.clubId).short} · HC {r.player.handicap}
                </span>
              </span>
              <span className="text-center text-[12px] text-muted-foreground tnum">
                {r.thru >= 18 ? "F" : r.thru === 0 ? "·" : r.thru}
              </span>
              <span className="text-right font-serif text-[15px] tnum">
                {mode === "points" ? r.points : toPar(r.netToPar)}
              </span>
            </div>
          ))}
          {overall.length === 0 && (
            <p className="px-5 py-10 text-center text-[14px] text-muted-foreground">
              No scores were recorded for this tournament.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function safePlayer(id: string): Player | undefined {
  try {
    return playerById(id);
  } catch {
    return undefined;
  }
}
