"use client";

/**
 * Poster studio.
 *
 * The club picks fixture or results, sees the poster exactly as it will be
 * posted, and downloads it. The preview is the real render, not an approximation
 * of it: the page posts the spec to the renderer and shows the PNG that comes
 * back, so what is on screen is the file.
 */

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ImageIcon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TournamentNav } from "@/components/admin/tournament-nav";
import { useClubIdentity } from "@/components/club-brand";
import { COURSES, courseById } from "@/lib/data";
import { fixtureSpec, posterFileName, resultsSpec } from "@/lib/poster/spec";
import { roundKey, roundsOf } from "@/lib/rounds";
import { cumulativeStandings, type ViewMode } from "@/lib/scoring";
import { allTournaments, useSim } from "@/lib/sim/store";
import type { PosterKind, PosterSpec } from "@/lib/poster/spec";
import type { Player } from "@/lib/types";

function Choice({
  active,
  onClick,
  title,
  detail,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
        active
          ? "border-clay bg-clay-wash"
          : "border-border bg-card hover:border-input"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}

export default function PosterPage({
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
  const identity = useClubIdentity(t?.clubId ?? "");

  // Until the club picks, show the poster they came here for: an event that has
  // been played wants its result, one that has not wants announcing. The store
  // hydrates after first paint, so this is derived rather than an initial state.
  const [chosen, setKind] = useState<PosterKind | null>(null);
  // bumped by "Generate again", so the same spec can be rendered twice
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{
    spec: PosterSpec | null;
    attempt: number;
    url: string | null;
    error: string | null;
  }>({ spec: null, attempt: 0, url: null, error: null });
  // revoke the previous object URL rather than leaking one per render
  const lastUrl = useRef<string | null>(null);

  const standings = useMemo(() => {
    if (!t || t.status === "upcoming") return [];
    const fieldIds = [
      ...new Set(
        roundsOf(t).flatMap((r) =>
          (pairings[roundKey(t.id, r.number)] ?? []).flatMap((g) => g.playerIds),
        ),
      ),
    ];
    const field = fieldIds
      .map((pid) => roster.find((p) => p.id === pid))
      .filter((p): p is Player => !!p);
    const fallback = courseById(t.courseId);
    const mode: ViewMode = t.format === "Stableford" ? "points" : "net";
    return cumulativeStandings(
      field,
      roundsOf(t).map((r) => ({
        round: r.number,
        scores: scores[roundKey(t.id, r.number)] ?? {},
        course: COURSES.find((c) => c.id === r.courseId) ?? fallback,
      })),
      t.handicapAllowance,
      mode,
      (rnd, pid) =>
        (pairings[roundKey(t.id, rnd)] ?? []).some((g) =>
          g.playerIds.includes(pid),
        ),
    );
  }, [t, pairings, roster, scores]);

  // A tournament can be marked complete and still have no cards behind it: an
  // event Shimo only recorded the winner of. Offer the results poster when
  // there is a board to put on it, not merely when the status says so.
  const hasResults = standings.length > 0;
  const kind: PosterKind = chosen ?? (hasResults ? "results" : "fixture");

  const spec: PosterSpec | null = useMemo(() => {
    if (!t) return null;
    if (kind === "results") {
      const mode: ViewMode = t.format === "Stableford" ? "points" : "net";
      return resultsSpec(t, identity, standings, mode, {
        provisional: t.status !== "completed",
      });
    }
    return fixtureSpec(t, identity);
  }, [t, identity, kind, standings]);

  /*
   * Render whenever there is a new spec to render, and whenever the club asks
   * again. What came back is recorded against the spec that produced it, so
   * "still rendering" is a comparison rather than a flag someone has to
   * remember to clear.
   */
  useEffect(() => {
    if (!spec) return;
    let live = true;
    const run = async () => {
      try {
        const res = await fetch("/api/poster", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        if (!live) return;
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        const url = URL.createObjectURL(blob);
        lastUrl.current = url;
        setDone({ spec, attempt, url, error: null });
      } catch (e) {
        if (!live) return;
        setDone({
          spec,
          attempt,
          url: null,
          error:
            e instanceof Error
              ? e.message
              : "The poster could not be generated.",
        });
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [spec, attempt]);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const busy = Boolean(spec) && (done.spec !== spec || done.attempt !== attempt);
  const url = busy ? null : done.url;
  const error = busy ? null : done.error;

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

  return (
    <div>
      <Link
        href="/admin/tournaments"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Tournaments
      </Link>

      <header className="mt-6">
        <p className="smallcaps text-muted-foreground">Poster</p>
        <h1 className="mt-2 font-serif text-3xl text-foreground">{t.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          1080 × 1350, sized for Instagram and WhatsApp. Everything on it comes
          from the tournament and your club identity, so correct it there and
          generate again.
        </p>
      </header>

      <TournamentNav id={t.id} />

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-2xl border border-border bg-secondary/40 p-4">
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={url}
                alt={`${t.name} poster`}
                className="mx-auto w-full max-w-[440px] rounded-lg shadow-card"
              />
            ) : (
              <div className="mx-auto flex aspect-[1080/1350] w-full max-w-[440px] items-center justify-center rounded-lg border border-dashed border-input">
                <p className="text-sm text-muted-foreground">
                  {error ? "Nothing to show" : "Rendering…"}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="order-1 space-y-6 lg:order-2">
          <div>
            <p className="smallcaps text-muted-foreground">Poster</p>
            <div className="mt-3 flex gap-3">
              <Choice
                active={kind === "fixture"}
                onClick={() => setKind("fixture")}
                title="Fixture"
                detail="Announce the event"
              />
              <Choice
                active={kind === "results"}
                onClick={() => setKind("results")}
                title="Results"
                detail={
                  hasResults ? "Leaderboard, top 10" : "Once cards are in"
                }
                disabled={!hasResults}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="smallcaps text-muted-foreground">On this poster</p>
            <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
              <li>{identity.logoUrl ? "Your crest" : "No crest uploaded"}</li>
              <li>
                {identity.accent
                  ? `Your colour, ${identity.accent}`
                  : "Shimo's colour, no club colour set"}
              </li>
              <li>
                {t.sponsors?.length
                  ? `${t.sponsors.length} sponsor${t.sponsors.length > 1 ? "s" : ""}`
                  : "No sponsors"}
              </li>
              {kind === "fixture" ? (
                <li>
                  {identity.phone || identity.email
                    ? "Your contact details"
                    : "No contact details set"}
                </li>
              ) : (
                <li>
                  {standings.length
                    ? `Top ${Math.min(10, standings.length)} of ${standings.length}`
                    : "No scores yet"}
                </li>
              )}
            </ul>
            {(!identity.logoUrl || !identity.accent) && (
              <Link
                href="/admin/settings"
                className="mt-3 inline-block text-[13px] font-medium text-clay hover:underline"
              >
                Set up club identity
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="clay"
              size="lg"
              disabled={!url || busy}
              onClick={() => {
                if (!url || !spec) return;
                const a = document.createElement("a");
                a.href = url;
                a.download = posterFileName(spec);
                a.click();
              }}
            >
              <Download className="size-4" />
              Download PNG
            </Button>
            <Button
              variant="outline"
              onClick={() => setAttempt((n) => n + 1)}
              disabled={busy}
            >
              {busy ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <ImageIcon className="size-4" />
              )}
              {busy ? "Rendering" : "Generate again"}
            </Button>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-wash px-3 py-2 text-[13px] text-red-flag">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
