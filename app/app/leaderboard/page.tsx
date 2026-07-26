"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { EyeOff, Flame } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClubCrest, ClubSurface } from "@/components/club-brand";
import { SponsorStrip } from "@/components/sponsor-strip";
import { LiveBadge } from "@/components/live-dot";
import { LastUpdatedNote, SyncStrip } from "@/components/sync-status";
import { DEMO_USER_ID, GROUPS, clubById, courseById, playerById } from "@/lib/data";
import { roundsOf } from "@/lib/rounds";
import {
  formatCutLine,
  playingHandicap,
  stablefordPoints,
  type StandingRow,
  type ViewMode,
} from "@/lib/scoring";
import { useActiveTournament, useCumulative, useMeId, useStandings,
  useRoundScores

} from "@/lib/sim/hooks";
import {
  LIVE_COURSE,
  LIVE_TOURNAMENT,
  setHideLeaderboard,
  useSim,
} from "@/lib/sim/store";
import { IS_PILOT } from "@/lib/mode";
import { cn, toPar } from "@/lib/utils";


function fmtScore(r: StandingRow, mode: ViewMode) {
  if (mode === "points") return `${r.points}`;
  if (mode === "net") return toPar(r.netToPar);
  return toPar(r.grossToPar);
}

function fmtGap(r: StandingRow, mode: ViewMode) {
  if (r.position === 1 && r.gap === 0) return "·";
  return mode === "points" ? `-${r.gap}` : `+${r.gap}`;
}

/* ------------------------------------------------------------------ */

function EventTicker() {
  const events = useSim((s) => s.events);
  const latest = events[0];
  if (!latest) return null;
  const p = playerById(latest.playerId);
  const d = latest.gross - latest.par;
  const word =
    d <= -2 ? "Eagle" : d === -1 ? "Birdie" : d === 0 ? "Par" : d === 1 ? "Bogey" : `Double+`;
  return (
    <div className="relative mt-3 h-6 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.p
          key={latest.id}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              d < 0 ? "bg-clay" : "bg-stone/60",
            )}
          />
          <span className={cn("font-medium", d < 0 ? "text-clay-deep" : "text-ink-soft")}>
            {word}
          </span>
          {p.name} · {latest.hole}
          <span className="text-muted-foreground/60">just now</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function FeaturedGroups() {
  const scores = useRoundScores();
  const featured = GROUPS.filter((g) => g.featured);
  return (
    <div className="no-scrollbar -mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1">
      {featured.map((g) => {
        const thru = Math.min(
          ...g.playerIds.map((pid) => scores[pid].filter((x) => x != null).length),
        );
        return (
          <div
            key={g.id}
            className="w-[210px] shrink-0 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card"
          >
            <div className="flex items-center justify-between">
              <p className="smallcaps text-[9px] text-primary-foreground/50">
                Featured · Group {g.number}
              </p>
              <p className="text-[10px] text-primary-foreground/50 tnum">
                {thru >= 18 ? "F" : `thru ${thru}`}
              </p>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {g.playerIds.map((pid) => {
                const p = playerById(pid);
                const ph = playingHandicap(p.handicap, LIVE_TOURNAMENT.handicapAllowance);
                const pts = scores[pid].reduce<number>(
                  (acc, gross, i) =>
                    gross == null
                      ? acc
                      : acc + stablefordPoints(LIVE_COURSE.holes[i], gross, ph),
                  0,
                );
                return (
                  <div key={pid} className="flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-[12.5px]",
                        pid === DEMO_USER_ID
                          ? "font-semibold text-white"
                          : "text-primary-foreground/85",
                      )}
                    >
                      {p.name}
                    </p>
                    <p className="font-serif text-[15px] text-clay-wash tnum">{pts}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ExpandedScorecard({ row }: { row: StandingRow }) {
  const scores = useRoundScores();
  const card = scores[row.player.id] ?? [];
  const ph = playingHandicap(row.player.handicap, LIVE_TOURNAMENT.handicapAllowance);

  const Nine = ({ from }: { from: number }) => (
    <div className="grid grid-cols-[3.4rem_repeat(9,minmax(0,1fr))] gap-y-1 text-center">
      <span className="smallcaps text-[8px] text-muted-foreground self-center text-left pl-1">
        {from === 0 ? "Out" : "In"}
      </span>
      {LIVE_COURSE.holes.slice(from, from + 9).map((h) => (
        <span key={h.hole} className="text-[9px] text-muted-foreground tnum">
          {h.hole}
        </span>
      ))}
      <span className="smallcaps text-[8px] text-muted-foreground self-center text-left pl-1">
        Par
      </span>
      {LIVE_COURSE.holes.slice(from, from + 9).map((h) => (
        <span key={h.hole} className="text-[10px] text-muted-foreground/70 tnum">
          {h.par}
        </span>
      ))}
      <span className="smallcaps text-[8px] text-foreground self-center text-left pl-1">
        Score
      </span>
      {LIVE_COURSE.holes.slice(from, from + 9).map((h, i) => {
        const gross = card[from + i];
        const d = gross == null ? 0 : gross - h.par;
        return (
          <span
            key={h.hole}
            className={cn(
              "mx-auto flex size-5 items-center justify-center text-[11px] tnum",
              gross == null && "text-muted-foreground/30",
              gross != null && d === -1 && "rounded-full border border-clay text-clay-deep",
              gross != null && d <= -2 && "rounded-full border-2 border-clay text-clay-deep",
              gross != null && d === 1 && "rounded-sm border border-stone/50 text-ink-soft",
              gross != null && d >= 2 && "rounded-sm border-2 border-stone/50 text-ink-soft",
              gross != null && d === 0 && "text-foreground",
            )}
          >
            {gross ?? "·"}
          </span>
        );
      })}
      <span className="smallcaps text-[8px] text-clay-deep self-center text-left pl-1">
        Pts
      </span>
      {LIVE_COURSE.holes.slice(from, from + 9).map((h, i) => {
        const gross = card[from + i];
        return (
          <span key={h.hole} className="text-[10px] text-clay-deep tnum">
            {gross == null ? "" : stablefordPoints(h, gross, ph)}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-secondary/50 p-3">
      <Nine from={0} />
      <div className="h-px bg-border/70" />
      <Nine from={9} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One board row, memoized hard so a score event only re-renders the rows
 * whose numbers actually changed — keeps the board smooth on low-end phones.
 */
const BoardRow = memo(
  function BoardRow({
    r,
    mode,
    isUser,
    isOpen,
    onToggle,
  }: {
    r: StandingRow;
    mode: ViewMode;
    isUser: boolean;
    isOpen: boolean;
    onToggle: (id: string) => void;
  }) {
    return (
      <motion.div
        layout="position"
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
        className={cn(
          "border-b border-border/50 last:border-b-0",
          isUser && "bg-clay-wash/45",
        )}
      >
        <button
          onClick={() => onToggle(r.player.id)}
          className="grid min-h-[52px] w-full grid-cols-[2.4rem_1fr_2.4rem_2.8rem_2.6rem] items-center gap-1 px-3 py-2.5 text-left cursor-pointer"
        >
          <span
            className={cn(
              "font-serif text-[16px] tnum",
              r.position <= 3 ? "text-clay-deep" : "text-foreground",
            )}
          >
            {r.tied ? "T" : ""}
            {r.position}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-[15px]",
                  isUser ? "font-semibold text-foreground" : "text-foreground",
                )}
              >
                {r.player.name}
                {isUser && (
                  <span className="ml-1 text-[11px] font-normal text-clay">you</span>
                )}
              </span>
              {r.hotStreak >= 2 && (
                <span
                  className="flex items-center text-[11px] text-clay"
                  title={`${r.hotStreak} under-par holes in a row`}
                >
                  <Flame className="size-3 fill-clay/20" />
                  {r.hotStreak}
                </span>
              )}
            </span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {clubById(r.player.clubId).short} · HC {r.player.handicap}
            </span>
          </span>
          <span className="text-center text-[13px] text-muted-foreground tnum">
            {r.thru >= 18 ? "F" : r.thru === 0 ? "·" : r.thru}
          </span>
          <motion.span
            key={fmtScore(r, mode)}
            initial={{ backgroundColor: "rgba(184,74,46,0.22)" }}
            animate={{ backgroundColor: "rgba(184,74,46,0)" }}
            transition={{ duration: 1.4 }}
            className={cn(
              "mx-auto rounded-md px-1.5 text-center font-serif text-[17px] tnum",
              mode !== "points" &&
                (mode === "net" ? r.netToPar : r.grossToPar) < 0
                ? "text-clay-deep"
                : "text-foreground",
            )}
          >
            {fmtScore(r, mode)}
          </motion.span>
          <span className="text-center text-[12.5px] text-muted-foreground tnum">
            {fmtGap(r, mode)}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3">
                <ExpandedScorecard row={r} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  },
  (a, b) =>
    a.r.player.id === b.r.player.id &&
    a.r.position === b.r.position &&
    a.r.tied === b.r.tied &&
    a.r.thru === b.r.thru &&
    a.r.points === b.r.points &&
    a.r.netToPar === b.r.netToPar &&
    a.r.grossToPar === b.r.grossToPar &&
    a.r.gap === b.r.gap &&
    a.r.hotStreak === b.r.hotStreak &&
    a.mode === b.mode &&
    a.isUser === b.isUser &&
    a.isOpen === b.isOpen,
);

/**
 * The multi-round board: every round summed, a column per round, and players
 * who missed the cut shown as MC with the scores they made.
 */
function CumulativeRows({
  mode,
  division,
  rounds,
}: {
  mode: ViewMode;
  division: string;
  rounds: number[];
}) {
  const board = useCumulative(mode, division);
  const me = useMeId();
  const fmt = (v: { points: number; netToPar: number; grossToPar: number }) =>
    mode === "points" ? `${v.points}` : toPar(mode === "net" ? v.netToPar : v.grossToPar);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
      <div
        className="grid items-center gap-1 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{
          gridTemplateColumns: `2.4rem 1fr ${rounds.map(() => "2.2rem").join(" ")} 3rem`,
        }}
      >
        <span>Pos</span>
        <span>Player</span>
        {rounds.map((r) => (
          <span key={r} className="text-center">
            R{r}
          </span>
        ))}
        <span className="text-center">{mode === "points" ? "Tot" : "Score"}</span>
      </div>
      {board.rows.map((r) => (
        <div
          key={r.player.id}
          className={cn(
            "grid items-center gap-1 border-b border-border/50 px-3 py-2.5 last:border-b-0",
            r.player.id === me && "bg-clay-wash/45",
            !r.madeCut && "opacity-55",
          )}
          style={{
            gridTemplateColumns: `2.4rem 1fr ${rounds.map(() => "2.2rem").join(" ")} 3rem`,
          }}
        >
          <span
            className={cn(
              "font-serif text-[15px] tnum",
              r.position <= 3 && r.madeCut ? "text-clay-deep" : "text-foreground",
            )}
          >
            {r.madeCut ? `${r.tied ? "T" : ""}${r.position}` : "MC"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] text-foreground">
              {r.player.name}
              {r.player.id === me && (
                <span className="ml-1 text-[11px] text-clay">you</span>
              )}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {clubById(r.player.clubId).short} · HC {r.player.handicap}
            </span>
          </span>
          {rounds.map((rn) => {
            const line = r.rounds.find((x) => x.round === rn);
            return (
              <span
                key={rn}
                className="text-center text-[12.5px] text-muted-foreground tnum"
              >
                {!line || line.missed ? "·" : line.thru === 0 ? "·" : fmt(line)}
              </span>
            );
          })}
          <span className="text-center font-serif text-[16px] text-foreground tnum">
            {fmt(r)}
          </span>
        </div>
      ))}
      {board.cut && (
        <p className="border-t border-border/60 bg-secondary/30 px-3 py-2 text-center text-[11.5px] text-muted-foreground">
          Cut after {`R${board.cut.afterRound}`}: top {board.cut.count} and ties
          {board.cut.line != null && ` · ${formatCutLine(board.cut.line, mode)}`}
        </p>
      )}
    </div>
  );
}

function LeaderboardRows({ mode, division }: { mode: ViewMode; division: string }) {
  const rows = useStandings(mode, division);
  const me = useMeId();
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = useCallback(
    (id: string) => setExpanded((cur) => (cur === id ? null : id)),
    [],
  );

  return (
    <LayoutGroup>
      <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="grid grid-cols-[2.4rem_1fr_2.4rem_2.8rem_2.6rem] items-center gap-1 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Pos</span>
          <span>Player</span>
          <span className="text-center">Thru</span>
          <span className="text-center">{mode === "points" ? "Pts" : "Score"}</span>
          <span className="text-center">Gap</span>
        </div>
        {rows.map((r) => (
          <BoardRow
            key={r.player.id}
            r={r}
            mode={mode}
            isUser={r.player.id === me}
            isOpen={expanded === r.player.id}
            onToggle={toggle}
          />
        ))}
      </div>
    </LayoutGroup>
  );
}

/* ------------------------------------------------------------------ */

export default function LeaderboardPage() {
  const hidden = useSim((s) => s.hideLeaderboard);
  const attested = useSim((s) => s.attested);
  const active = useActiveTournament();
  const [mode, setMode] = useState<ViewMode>(
    active?.tournament.format === "Stroke Play" ? "net" : "points",
  );
  const [division, setDivision] = useState("Overall");
  const [peeking, setPeeking] = useState(false);
  // "cumulative" or a round number, for multi-round events
  const [scope, setScope] = useState("cumulative");

  const blind = !IS_PILOT && hidden && !attested && !peeking;

  if (!active) {
    return (
      <div className="px-5 pt-5">
        <p className="smallcaps text-muted-foreground">Leaderboard</p>
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="font-serif text-xl text-foreground">Quiet out there</p>
          <p className="mx-auto mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            The board lights up when the club starts a tournament day.
          </p>
        </div>
      </div>
    );
  }

  const allRounds = roundsOf(active.tournament);
  const divisions = [
    "Overall",
    ...active.tournament.divisions
      .map((d) => d.name)
      .filter((n) => n !== "Overall"),
  ];
  const club = clubById(active.tournament.clubId);

  return (
    <div className="px-5 pt-5">
      <header>
        <div className="flex items-center justify-between">
          <p className="smallcaps text-muted-foreground">
            {active.roundInfo.name} · {club.short} · Par {active.course.par}
          </p>
          <LiveBadge />
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-serif text-[28px] leading-tight text-foreground">
            {active.tournament.name}
          </h1>
          <ClubCrest
            clubId={active.tournament.clubId}
            className="mt-0.5 size-9 shrink-0 object-contain opacity-90"
          />
        </div>
        {!blind && <EventTicker />}
        <LastUpdatedNote />
      </header>

      <SyncStrip className="mt-3" />

      {blind ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <EyeOff className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-4 font-serif text-xl text-foreground">
            You&apos;re playing blind
          </p>
          <p className="mx-auto mt-2 max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">
            The leaderboard is hidden until you sign your card. Play the course,
            not the field.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button variant="outline" onClick={() => setPeeking(true)}>
              Peek anyway
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setHideLeaderboard(false)}
            >
              Turn off scoreboard blindness
            </Button>
          </div>
        </div>
      ) : (
        <>
          {!IS_PILOT && <FeaturedGroups />}

          <div className="mt-5 flex items-center justify-between gap-2">
            <Tabs value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
              <TabsList className="h-11">
                <TabsTrigger value="points">Points</TabsTrigger>
                <TabsTrigger value="net">Net</TabsTrigger>
                <TabsTrigger value="gross">Gross</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* a multi-round event can be read as a whole or one round at a time */}
          {allRounds.length > 1 && (
            <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {[
                { key: "cumulative", label: "Cumulative" },
                ...allRounds.map((r) => ({
                  key: String(r.number),
                  label: r.number === active.round ? "This round" : r.name,
                })),
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setScope(opt.key)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors cursor-pointer",
                    scope === opt.key
                      ? "border-clay bg-clay text-white"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto pb-1">
            {divisions.map((d) => (
              <button
                key={d}
                onClick={() => setDivision(d)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors cursor-pointer",
                  division === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>

          {scope === "cumulative" && allRounds.length > 1 ? (
            <CumulativeRows
              mode={mode}
              division={division}
              rounds={allRounds.map((r) => r.number)}
            />
          ) : (
            <LeaderboardRows mode={mode} division={division} />
          )}
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            Scores update live as cards are entered ·{" "}
            {active.tournament.handicapAllowance}% allowance
          </p>
          {active.tournament.sponsors?.length ? (
            <div className="mt-4 border-t border-border/60 pt-3 pb-2">
              <SponsorStrip
                sponsors={active.tournament.sponsors}
                showTitleLabel={false}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
