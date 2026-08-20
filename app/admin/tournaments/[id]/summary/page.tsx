"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Crown,
  Image as ImageIcon,
  Printer,
  Share2,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TournamentNav } from "@/components/admin/tournament-nav";
import { ClubCrest, ClubSurface } from "@/components/club-brand";
import { SponsorStrip } from "@/components/sponsor-strip";
import { RecapPanel } from "@/components/admin/recap-panel";
import { COURSES, clubById, courseById, playerById } from "@/lib/data";
import { roundKey, roundsOf } from "@/lib/rounds";
import {
  cumulativeStandings,
  divisionFor,
  type CumulativeRow,
  type ViewMode,
} from "@/lib/scoring";
import { allTournaments, useSim } from "@/lib/sim/store";
import type { Player } from "@/lib/types";
import { formatDateLong, toPar } from "@/lib/utils";

function scoreLabel(r: CumulativeRow, mode: ViewMode) {
  if (mode === "points") return `${r.points} pts`;
  if (mode === "net") return toPar(r.netToPar);
  return toPar(r.grossToPar);
}

/**
 * The champion's figure, counted up.
 *
 * Prizegiving is the one ceremonial screen in the product, so the winning
 * number arrives rather than simply appears: it climbs from zero to the total
 * over a beat, the way a total is read out at the podium. Static results
 * everywhere else stay still; this is the single place a number performs.
 * Honours reduced motion by landing on the figure at once.
 */
function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic: fast, then settles
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{shown}</span>;
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
  const guests = useSim((s) => s.guests);
  const scores = useSim((s) => s.scores);

  const t = allTournaments(created).find((x) => x.id === id);

  const { overall, divisions } = useMemo(() => {
    if (!t)
      return {
        overall: [] as CumulativeRow[],
        divisions: [] as { name: string; rows: CumulativeRow[] }[],
      };
    // the field is everyone who appeared in any round
    const fieldIds = [
      ...new Set(
        roundsOf(t).flatMap((r) =>
          (pairings[roundKey(t.id, r.number)] ?? []).flatMap((g) => g.playerIds),
        ),
      ),
    ];
    const field = fieldIds
      /* Guests are half the field on a corporate day and are not on the
         roster, so this has to be the lookup that knows about them. */
      .map((pid) => guests.find((g) => g.id === pid) ?? roster.find((p) => p.id === pid) ?? safePlayer(pid))
      .filter((p): p is Player => !!p);
    const course = courseById(t.courseId);
    const mode: ViewMode = t.format === "Stableford" ? "points" : "net";
    const overall = cumulativeStandings(
      field,
      roundsOf(t).map((r) => ({
        round: r.number,
        scores: scores[roundKey(t.id, r.number)] ?? {},
        course: COURSES.find((c) => c.id === r.courseId) ?? course,
      })),
      t.handicapAllowance,
      mode,
      (rnd, pid) =>
        (pairings[roundKey(t.id, rnd)] ?? []).some((g) =>
          g.playerIds.includes(pid),
        ),
    );

    const divs = t.divisions
      .filter((d) => d.name !== "Overall")
      .map((d) => {
        const inDiv = field.filter(
          (p) => divisionFor(p.handicap, t.divisions) === d.name,
        );
        return {
          name: d.name,
          rows: cumulativeStandings(
            inDiv,
            roundsOf(t).map((r) => ({
              round: r.number,
              scores: scores[roundKey(t.id, r.number)] ?? {},
              course: COURSES.find((c) => c.id === r.courseId) ?? course,
            })),
            t.handicapAllowance,
            mode,
          ),
        };
      })
      .filter((d) => d.rows.length > 0);

    return { overall, divisions: divs };
  }, [t, id, pairings, roster, guests, scores]);

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
          <Button variant="outline" asChild>
            <Link href={`/admin/tournaments/${t.id}/poster`}>
              <ImageIcon className="size-4" />
              Results poster
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

      {/* masthead */}
      <ClubSurface
        clubId={t.clubId}
        as="header"
        className="mt-6 border-b border-border pb-6"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="smallcaps text-[var(--club-accent,var(--clay))]">
              {isFinal ? "Final results" : "Provisional standings"} · Prizegiving
            </p>
            <h1 className="mt-2 font-serif text-[clamp(34px,4.4vw,46px)] font-medium leading-[1.02] tracking-[-0.016em] text-foreground">
              {t.name}
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {club.name} · {course.name} · {formatDateLong(t.date)} · {t.format}{" "}
              · {t.handicapAllowance}% allowance
            </p>
          </div>
          <ClubCrest
            clubId={t.clubId}
            className="size-16 shrink-0 object-contain"
          />
        </div>
      </ClubSurface>

      <TournamentNav id={t.id} />

      {t.sponsors?.length ? (
        <div className="mt-5">
          <SponsorStrip sponsors={t.sponsors} />
        </div>
      ) : null}

      {/* champion — the one gold moment in the system, given its full weight */}
      {champion && (
        <section className="animate-enter-rise mt-8 overflow-hidden rounded-2xl border-t-[3px] border-gold-bright bg-primary text-primary-foreground shadow-lift ring-1 ring-gold-bright/25">
          <div className="flex items-center gap-5 px-7 py-7">
            <Crown className="size-11 shrink-0 text-gold-bright" />
            <div className="min-w-0 flex-1">
              <p className="smallcaps text-gold-bright">Champion</p>
              <p className="mt-1 font-serif text-[clamp(32px,4.6vw,44px)] font-medium leading-[1.02] tracking-[-0.012em]">
                {champion.player.name}
              </p>
              <p className="mt-1 text-[13px] text-primary-foreground/60">
                {clubById(champion.player.clubId).short} · HC{" "}
                {champion.player.handicap}
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-[clamp(46px,6.5vw,62px)] leading-none text-gold-bright tnum">
                {mode === "points" ? (
                  <CountUp value={champion.points} />
                ) : (
                  toPar(champion.netToPar)
                )}
              </p>
              <p className="smallcaps mt-1 text-primary-foreground/60">
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
                  <p className="mt-2 font-serif text-[19px] text-foreground">
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

      {/*
        Corporate and charity days end here rather than at a results screen:
        the club's next job is the sponsors, and this is the step the research
        says costs them four to twelve hours by hand.
      */}
      {t.eventKind && t.eventKind !== "standard" && (
        <RecapPanel
          tournament={t}
          winners={overall.slice(0, 3).map((r, i) => ({
            position: String(i + 1),
            name: r.player.name,
            detail: r.player.guest?.company ?? clubById(r.player.clubId).name,
            score: mode === "points" ? `${r.points} pts` : toPar(r.netToPar),
          }))}
        />
      )}
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
