"use client";

import { use, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { CloudOff, Flame } from "lucide-react";

import { Logo } from "@/components/logo";
import { LiveBadge } from "@/components/live-dot";
import { clubById, courseById } from "@/lib/data";
import type { StandingRow, ViewMode } from "@/lib/scoring";
import { usePublicBoard, publicStandings } from "@/lib/sync/public-board";
import { cn, toPar } from "@/lib/utils";

function ago(ts: number | null, now: number) {
  if (!ts) return "just now";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function fmtScore(r: StandingRow, mode: ViewMode) {
  if (mode === "points") return `${r.points}`;
  if (mode === "net") return toPar(r.netToPar);
  return toPar(r.grossToPar);
}

export default function PublicLeaderboard({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const board = usePublicBoard(tournamentId);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<ViewMode>("points");
  const [division, setDivision] = useState("Overall");
  const [modePinned, setModePinned] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // default the view to the format's natural scoring, until a viewer picks one
  const naturalMode: ViewMode =
    board.tournament?.format === "Stroke Play" ? "net" : "points";
  const effectiveMode = modePinned ? mode : naturalMode;

  const rows = useMemo(
    () => publicStandings(board, effectiveMode, division),
    [board, effectiveMode, division],
  );

  const divisions = useMemo(
    () => [
      "Overall",
      ...(board.tournament?.divisions ?? [])
        .map((d) => d.name)
        .filter((n) => n !== "Overall"),
    ],
    [board.tournament],
  );

  if (board.status === "unconfigured") {
    return (
      <Shell>
        <p className="font-serif text-2xl text-foreground">
          Live scoring isn&apos;t connected
        </p>
        <p className="mt-2 text-[15px] text-muted-foreground">
          This board needs the club&apos;s live database configured.
        </p>
      </Shell>
    );
  }
  if (board.status === "loading") {
    return (
      <Shell>
        <Logo className="text-3xl opacity-40" />
      </Shell>
    );
  }
  if (board.status === "not-found" || !board.tournament) {
    return (
      <Shell>
        <p className="font-serif text-2xl text-foreground">
          No such tournament
        </p>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Check the link, or ask the club for the current board.
        </p>
      </Shell>
    );
  }

  const t = board.tournament;
  const club = clubById(t.clubId);
  const course = courseById(t.courseId);
  const isStableford = t.format === "Stableford";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            {t.status === "live" ? (
              <LiveBadge />
            ) : (
              <span className="smallcaps text-muted-foreground">Final</span>
            )}
            <span className="smallcaps text-muted-foreground">
              {club.short} · Par {course.par}
            </span>
          </div>
          <h1 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
            {t.name}
          </h1>
        </div>
        <Logo className="mt-1 text-[15px] shrink-0" />
      </header>

      <div className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
        {board.online ? (
          <span className="tnum">Updated {ago(board.lastUpdated, now)}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-flag">
            <CloudOff className="size-3.5" />
            Offline · last board from {ago(board.lastUpdated, now)}
          </span>
        )}
      </div>

      {/* controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-secondary p-1">
          {(["points", "net", "gross"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setModePinned(true);
              }}
              className={cn(
                "min-h-9 rounded-full px-3.5 text-[13px] font-medium capitalize transition-colors cursor-pointer",
                effectiveMode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "points" ? "Points" : m}
            </button>
          ))}
        </div>
        {divisions.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {divisions.map((d) => (
              <button
                key={d}
                onClick={() => setDivision(d)}
                className={cn(
                  "min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors cursor-pointer",
                  division === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* board */}
      <LayoutGroup>
        <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="grid grid-cols-[2.6rem_1fr_2.6rem_3rem_2.8rem] items-center gap-1 border-b border-border bg-secondary/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Pos</span>
            <span>Player</span>
            <span className="text-center">Thru</span>
            <span className="text-center">{isStableford ? "Pts" : "Score"}</span>
            <span className="text-center">Gap</span>
          </div>
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-[15px] text-muted-foreground">
              No scores in yet. The board fills as cards come back.
            </p>
          )}
          {rows.map((r) => (
            <motion.div
              key={r.player.id}
              layout="position"
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="grid grid-cols-[2.6rem_1fr_2.6rem_3rem_2.8rem] items-center gap-1 border-b border-border/50 px-4 py-2.5 last:border-b-0"
            >
              <span
                className={cn(
                  "font-serif text-[17px] tnum",
                  r.position <= 3 ? "text-clay-deep" : "text-foreground",
                )}
              >
                {r.tied ? "T" : ""}
                {r.position}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[16px] text-foreground">
                    {r.player.name}
                  </span>
                  {r.hotStreak >= 2 && (
                    <span className="flex items-center text-[11px] text-clay">
                      <Flame className="size-3 fill-clay/20" />
                      {r.hotStreak}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {clubById(r.player.clubId).short} · HC {r.player.handicap}
                </span>
              </span>
              <span className="text-center text-[13px] text-muted-foreground tnum">
                {r.thru >= 18 ? "F" : r.thru === 0 ? "·" : r.thru}
              </span>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={fmtScore(r, effectiveMode)}
                  initial={{ backgroundColor: "rgba(184,74,46,0.20)" }}
                  animate={{ backgroundColor: "rgba(184,74,46,0)" }}
                  transition={{ duration: 1.4 }}
                  className={cn(
                    "mx-auto rounded-md px-1 text-center font-serif text-[18px] tnum",
                    effectiveMode !== "points" &&
                      (effectiveMode === "net" ? r.netToPar : r.grossToPar) < 0
                      ? "text-clay-deep"
                      : "text-foreground",
                  )}
                >
                  {fmtScore(r, effectiveMode)}
                </motion.span>
              </AnimatePresence>
              <span className="text-center text-[12.5px] text-muted-foreground tnum">
                {r.position === 1 && r.gap === 0
                  ? "·"
                  : effectiveMode === "points"
                    ? `-${r.gap}`
                    : `+${r.gap}`}
              </span>
            </motion.div>
          ))}
        </div>
      </LayoutGroup>

      <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
        {t.format} · {t.handicapAllowance}% allowance · live via Shimo
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
