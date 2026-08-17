"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Camera, CloudOff, RefreshCw, ScanLine, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveBadge } from "@/components/live-dot";
import { PublishButton } from "@/components/admin/publish-card";
import { courseById } from "@/lib/data";
import { cardStats, rowStats, handicapSet } from "@/lib/scoring";
import { teamPlayingHandicap } from "@/lib/team-scoring";
import { roundKey } from "@/lib/rounds";
import type { Team } from "@/lib/types";
import { useActiveTournament, useSyncStatus,
  useRoundScores,
  useRoundMarkerScores,
  useRoundCardIn
} from "@/lib/sim/hooks";
import { retryFailedOps, setBulkScore, useSim } from "@/lib/sim/store";
import type { Course, Player } from "@/lib/types";
import { FEATURES } from "@/lib/flags";
import { cn, toPar } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* One score cell - local text state, saves on blur                    */
/* ------------------------------------------------------------------ */

const Cell = memo(function Cell({
  pid,
  holeIdx,
  value,
  par,
  gap,
  onEnter,
}: {
  pid: string;
  holeIdx: number;
  value: number | null;
  par: number;
  gap: boolean;
  onEnter: (pid: string) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  const [flash, setFlash] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value?.toString() ?? "");
  }, [value]);

  const commit = () => {
    const n = parseInt(text, 10);
    const gross = Number.isFinite(n) && n >= 1 && n <= 15 ? n : null;
    if (gross !== value) {
      setBulkScore(pid, holeIdx, gross);
      /*
       * The desk types eighteen numbers per player, forty players a day. This
       * is the most-repeated action in Shimo by an order of magnitude, so the
       * acknowledgement has to be the quietest thing in the app: on the instant
       * the value commits, then gone.
       *
       * It cannot be removed altogether. The cell saves on blur, so without a
       * mark the operator has no way of knowing the number took, and they are
       * looking at the paper card rather than the screen. Instant on, quick
       * fade off: the system answering, not the interface performing.
       */
      setFlash(true);
      setTimeout(() => setFlash(false), 420);
    }
  };

  const d = value == null ? 0 : value - par;

  return (
    <input
      data-cell={`${pid}:${holeIdx}`}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
        setText(next);
        // two digits can't grow further - hop to the next hole
        if (next.length === 2) {
          const sibling = document.querySelector<HTMLInputElement>(
            `[data-cell="${pid}:${holeIdx + 1}"]`,
          );
          sibling?.focus();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
          onEnter(pid);
        }
      }}
      className={cn(
        "h-11 w-11 rounded-lg border border-border bg-card text-center text-[17px] font-medium tnum outline-none transition-colors",
        "focus:border-clay focus:ring-2 focus:ring-clay/25",
        value != null && d < 0 && "text-clay-deep",
        value != null && d > 1 && "text-stone",
        // a skipped hole in the middle of a card: the one empty cell the desk
        // must not miss. Amber, per the Three Flags Rule, and only when unfocused
        // so it does not fight the clay focus ring while being typed.
        gap && "border-amber-flag/50 bg-amber-wash/50 focus:bg-card",
        // no transition on the way in, 300ms on the way out: an acknowledgement
        // should appear the moment it is earned and leave without being watched
        "transition-[background-color,border-color] duration-300 ease-[var(--ease-out)]",
        flash && "border-clay/60 bg-clay-wash/60 duration-0",
      )}
    />
  );
});

/* ------------------------------------------------------------------ */
/* One player row                                                      */
/* ------------------------------------------------------------------ */

interface RowProps {
  player: Player;
  scores: (number | null)[];
  scoresKey: string;
  cardIn: boolean;
  tournamentId: string;
  round: number;
  course: Course;
  allowance: number;
  isStableford: boolean;
  onEnter: (pid: string) => void;
  focused: boolean;
  onSelect: (pid: string | null) => void;
  /** whether a blank hole before a filled one is an error worth flagging */
  flagGaps: boolean;
}

const PlayerRow = memo(
  function PlayerRow({
    player,
    scores,
    cardIn,
    tournamentId,
    round,
    course,
    allowance,
    isStableford,
    onEnter,
    focused,
    onSelect,
    flagGaps,
  }: RowProps) {
    const st = rowStats(player, scores, course, allowance);
    // A gap is an empty hole with a played hole after it: a number the desk
    // skipped, not a hole the group has simply not reached yet.
    const lastFilled = scores.reduce(
      (m: number, v: number | null, i: number) => (v != null ? i : m),
      -1,
    );
    return (
      <tr
        className={cn(
          "border-t border-border/60",
          cardIn && "bg-clay-wash/30",
          focused && "bg-accent/70",
        )}
      >
        <td
          onClick={() => onSelect(focused ? null : player.id)}
          className={cn(
            "sticky left-0 z-10 min-w-[168px] cursor-pointer px-3 py-1.5",
            focused ? "bg-accent shadow-[inset_3px_0_0_var(--clay)]" : "bg-background",
          )}
        >
          <p className="truncate text-[14px] font-medium text-foreground">
            {player.name}
          </p>
          <p className="text-[11px] text-muted-foreground tnum">
            HC {player.handicap} · PH {handicapSet(player.handicap, course, allowance).ph}
          </p>
        </td>
        {course.holes.map((h, i) => (
          <td
            key={h.hole}
            className={cn("px-0.5 py-1.5", i === 8 && "border-r-2 border-border")}
          >
            <Cell
              pid={player.id}
              holeIdx={i}
              value={scores[i] ?? null}
              par={h.par}
              gap={flagGaps && scores[i] == null && i < lastFilled}
              onEnter={onEnter}
            />
          </td>
        ))}
        <td
          className="sticky right-16 z-10 min-w-[132px] border-l border-border/60 px-3 py-1.5 text-right"
          style={{ background: cardIn ? "#F5ECE3" : "var(--background)" }}
        >
          <p className="leading-tight">
            <span className="font-serif text-[17px] text-foreground tnum">
              {st.thru ? st.grossTotal : "·"}
            </span>
            <span className="ml-1.5 text-[12px] text-muted-foreground tnum">
              {st.thru ? `${toPar(st.netToPar)} net` : ""}
            </span>
            {isStableford && st.thru > 0 && (
              <span className="ml-1.5 text-[14px] font-medium text-clay-deep tnum">
                {st.points} pts
              </span>
            )}
          </p>
          <p className="text-[10.5px] text-muted-foreground tnum">
            {st.thru >= 18 ? "Full card" : st.thru ? `thru ${st.thru}` : "no scores"}
          </p>
        </td>
        <td
          className="sticky right-0 z-10 w-16 px-3 text-center"
          style={{ background: cardIn ? "#F5ECE3" : "var(--background)" }}
        >
          <PublishButton
            player={player}
            published={cardIn}
            thru={st.thru}
            tournamentId={tournamentId}
            round={round}
          />
        </td>
      </tr>
    );
  },
  (a, b) =>
    a.player.id === b.player.id &&
    a.scoresKey === b.scoresKey &&
    a.cardIn === b.cardIn &&
    a.isStableford === b.isStableford &&
    a.focused === b.focused &&
    a.flagGaps === b.flagGaps,
);

/* ------------------------------------------------------------------ */

function ScanCardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <DialogTitle>Scan a paper card</DialogTitle>
            <Badge variant="claySoft">Coming soon</Badge>
          </div>
          <DialogDescription>
            Snap the scorecard with a phone or webcam. Shimo reads the grid,
            pre-fills the player&apos;s row, and asks you to confirm anything
            it isn&apos;t sure about.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/40 px-6 py-10 text-center">
          <Camera className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop a photo here, or use the camera
          </p>
          <Button variant="secondary" disabled>
            <Upload className="size-4" />
            Upload photo
          </Button>
        </div>
        <p className="text-center text-[11.5px] text-muted-foreground">
          On the roadmap for the pilot follow-up release.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A scramble team's row: one card, scored off the blended team handicap, with a
 * cell per hole that writes under the team's id. There is no per-player
 * attestation ceremony here - a team returns one card - so the last column
 * shows progress rather than the individual publish button.
 */
function TeamRow({
  team,
  byId,
  scores,
  cardIn,
  course,
  allowances,
  maxCH,
  maxHoleScore,
  isStableford,
  onEnter,
}: {
  team: Team;
  byId: Map<string, Player>;
  scores: Record<string, (number | null)[]>;
  cardIn: Record<string, boolean>;
  tournamentId: string;
  round: number;
  course: Course;
  allowances: number[];
  maxCH?: number;
  maxHoleScore?: "none" | "net-double-bogey" | number;
  isStableford: boolean;
  onEnter: (pid: string) => void;
}) {
  const members = team.playerIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => Boolean(p));
  const teamPH = teamPlayingHandicap(members, course, allowances, maxCH ?? undefined);
  const card = scores[team.id] ?? [];
  const st = cardStats(card, course, teamPH, maxHoleScore ?? "none");
  const teamLastFilled = card.reduce(
    (m: number, v: number | null, i: number) => (v != null ? i : m),
    -1,
  );
  return (
    <tr className="border-t border-border/60">
      <td className="sticky left-0 z-10 min-w-[168px] bg-background px-3 py-1.5">
        <p className="truncate text-[14px] font-medium text-foreground">{team.name}</p>
        <p className="text-[11px] text-muted-foreground tnum">
          {members.map((m) => m.name.split(" ")[0]).join(" + ")} · PH {teamPH}
        </p>
      </td>
      {course.holes.map((h, i) => (
        <td
          key={h.hole}
          className={cn("px-0.5 py-1.5", i === 8 && "border-r-2 border-border")}
        >
          <Cell
            pid={team.id}
            holeIdx={i}
            value={card[i] ?? null}
            par={h.par}
            gap={card[i] == null && i < teamLastFilled}
            onEnter={onEnter}
          />
        </td>
      ))}
      <td className="sticky right-16 z-10 min-w-[132px] border-l border-border/60 bg-background px-3 py-1.5 text-right">
        <p className="leading-tight">
          <span className="font-serif text-[17px] text-foreground tnum">
            {st.thru ? st.grossTotal : "·"}
          </span>
          <span className="ml-1.5 text-[12px] text-muted-foreground tnum">
            {st.thru ? `${toPar(st.netToPar)} net` : ""}
          </span>
          {isStableford && st.thru > 0 && (
            <span className="ml-1.5 text-[14px] font-medium text-clay-deep tnum">
              {st.points} pts
            </span>
          )}
        </p>
      </td>
      <td className="sticky right-0 z-10 w-16 bg-background px-3 text-center text-[11px] text-muted-foreground tnum">
        {st.thru >= 18 ? "Full" : st.thru ? st.thru : "·"}
      </td>
    </tr>
  );
}

/** Desk view filters. "review" is a group carrying an open flag. */
type ScoreFilter = "all" | "incomplete" | "review" | "complete";

const FILTERS: { id: ScoreFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "incomplete", label: "Incomplete" },
  { id: "review", label: "Needs review" },
  { id: "complete", label: "Complete" },
];

export default function BulkScoresPage() {
  const active = useActiveTournament();
  const scores = useRoundScores();
  const cardIn = useRoundCardIn();
  const liveRound = useSim((s) => s.liveRound);
  const teamsByKey = useSim((s) => s.teams);
  const { online, failed } = useSyncStatus();
  const [scanOpen, setScanOpen] = useState(false);
  // The desk's own view controls: which cards to show, and the one row being
  // worked. Neither touches scoring; they only decide what is on screen.
  const [filter, setFilter] = useState<ScoreFilter>("all");
  const [focusedPid, setFocusedPid] = useState<string | null>(null);
  const allFlags = useSim((s) => s.flags);

  const course = useMemo(
    () => (active ? courseById(active.tournament.courseId) : null),
    [active],
  );

  const flatPlayerIds = useMemo(
    () => (active ? active.groups.flatMap((g) => g.playerIds) : []),
    [active],
  );

  const byId = useMemo(
    () => new Map((active?.players ?? []).map((p) => [p.id, p] as const)),
    [active],
  );

  /** Enter: jump to the next player's first empty hole */
  const focusNextPlayer = useCallback(
    (pid: string) => {
      const idx = flatPlayerIds.indexOf(pid);
      // defer until after blur/save settles
      setTimeout(() => {
        // Walk forward to the next player whose cell is actually on screen. A
        // filter can hide the immediate next player, and jumping to a row that
        // is not mounted would silently drop focus rather than move it on.
        for (let i = idx + 1; i < flatPlayerIds.length; i++) {
          const nextPid = flatPlayerIds[i];
          const card = scores[nextPid] ?? [];
          let hole = card.findIndex((x) => x == null);
          if (hole === -1) hole = 0;
          const cell = document.querySelector<HTMLInputElement>(
            `[data-cell="${nextPid}:${hole}"]`,
          );
          if (cell) {
            cell.focus();
            return;
          }
        }
      }, 0);
    },
    [flatPlayerIds, scores],
  );

  if (!active || !course) {
    return (
      <div>
        <p className="smallcaps text-muted-foreground">Enter scores from cards</p>
        <h1 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
          No tournament running today
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          Start a tournament day from the tournaments list, set its pairings,
          and this desk lights up for the caddymaster.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/admin/tournaments">Go to tournaments</Link>
        </Button>
      </div>
    );
  }

  const { tournament, groups } = active;
  const isStableford = tournament.format === "Stableford";
  // Only stroke play requires every hole to be holed out, so a blank hole
  // before a filled one is unambiguously a missed entry there. Stableford and
  // Better Ball allow a legitimate pick-up, so a mid-card blank is not an error
  // and must not be flagged.
  const flagGaps = tournament.format === "Stroke Play";
  const fieldSize = flatPlayerIds.length;
  const cardsIn = flatPlayerIds.filter((pid) => cardIn[pid]).length;

  // Groups carrying an open flag, for the "Needs review" filter.
  const flaggedGroups = new Set(
    allFlags.filter((f) => f.status === "open").map((f) => f.groupId),
  );

  // Whether the active filter leaves anything on screen, so an empty result
  // reads as "all done here" rather than a blank table.
  const anyVisible =
    filter === "all" ||
    active.groups.some((g) =>
      g.playerIds.some((pid) =>
        filter === "complete"
          ? cardIn[pid]
          : filter === "incomplete"
            ? !cardIn[pid]
            : flaggedGroups.has(g.id),
      ),
    );

  // a scramble is entered as one card per team; a better ball keeps per-player
  // cards (the team is derived from the better member on each hole)
  const isScramble = tournament.format === "Scramble";
  const teams = teamsByKey[roundKey(tournament.id, liveRound)] ?? [];
  const teamAllowances = tournament.handicapAllowances ?? [tournament.handicapAllowance];

  const scoresKeyFor = (pid: string) => (scores[pid] ?? []).join(",");

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <p className="smallcaps text-muted-foreground">Enter scores from cards</p>
            <LiveBadge />
          </div>
          <h1 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
            {tournament.name}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {tournament.format} · {tournament.handicapAllowance}% allowance ·
            scores feed the live leaderboard instantly
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!online && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-wash px-3 py-1.5 text-[12px] font-medium text-amber-flag">
              <CloudOff className="size-3.5" />
              Offline. Scores saved locally
            </span>
          )}
          {online && failed > 0 && (
            <button
              onClick={retryFailedOps}
              className="flex items-center gap-1.5 rounded-full bg-amber-wash px-3 py-1.5 text-[12px] font-medium text-amber-flag transition-colors hover:bg-amber-wash/70 cursor-pointer"
            >
              <RefreshCw className="size-3.5" />
              {failed} score{failed > 1 ? "s" : ""} waiting to sync · Retry
            </button>
          )}
          <div className="rounded-xl bg-card px-4 py-2 text-center shadow-card">
            <p className="font-serif text-xl leading-none text-foreground tnum">
              {cardsIn}
              <span className="text-sm text-muted-foreground">/{fieldSize}</span>
            </p>
            <p className="smallcaps mt-0.5 text-[9px] text-muted-foreground">
              Cards in
            </p>
          </div>
          {FEATURES.scanCard && (
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine className="size-4" />
              Scan card
            </Button>
          )}
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted-foreground">
          <span className="font-medium text-ink-soft">Tab</span> moves across
          holes · <span className="font-medium text-ink-soft">Enter</span> drops
          to the next player · every cell saves the moment you leave it
        </p>
        {!isScramble && (
          <div className="flex rounded-xl border border-border bg-secondary/40 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-lg px-3 py-1 text-[12.5px] transition-colors",
                  filter === f.id
                    ? "bg-card font-medium text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 overflow-auto rounded-2xl bg-card pb-1 shadow-card max-h-[calc(100vh-15rem)]">
        <table className="w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-20">
            <tr className="bg-secondary/95 backdrop-blur">
              <th className="sticky left-0 z-30 min-w-[168px] bg-secondary px-3 py-2 text-left">
                <span className="smallcaps text-[9px] text-muted-foreground">
                  Player
                </span>
              </th>
              {course.holes.map((h, i) => (
                <th
                  key={h.hole}
                  className={cn(
                    "px-0.5 py-2 text-center",
                    // the turn: a band between the front nine and the back
                    i === 8 && "border-r-2 border-border",
                  )}
                >
                  <p className="text-[12px] font-semibold text-foreground tnum">
                    {h.hole}
                  </p>
                  <p className="text-[10px] font-normal text-muted-foreground tnum">
                    par {h.par}
                  </p>
                </th>
              ))}
              <th className="sticky right-16 z-30 min-w-[132px] border-l border-border/60 bg-secondary px-3 text-right smallcaps text-[9px] text-muted-foreground">
                Running totals
              </th>
              <th className="sticky right-0 z-30 w-16 bg-secondary px-3 text-center smallcaps text-[9px] text-muted-foreground">
                Card in
              </th>
            </tr>
          </thead>
          <tbody>
            {isScramble && teams.length
              ? teams.map((tm) => (
                  <TeamRow
                    key={tm.id}
                    team={tm}
                    byId={byId}
                    scores={scores}
                    cardIn={cardIn}
                    tournamentId={tournament.id}
                    round={liveRound}
                    course={course}
                    allowances={teamAllowances}
                    maxCH={tournament.maxCourseHandicap}
                    maxHoleScore={tournament.maxHoleScore}
                    isStableford={isStableford}
                    onEnter={focusNextPlayer}
                  />
                ))
              : groups.map((g) => (
                  <GroupRows
                    key={g.id}
                    group={g}
                    byId={byId}
                    scores={scores}
                    cardIn={cardIn}
                    tournamentId={tournament.id}
                    round={liveRound}
                    course={course}
                    allowance={tournament.handicapAllowance}
                    isStableford={isStableford}
                    onEnter={focusNextPlayer}
                    scoresKeyFor={scoresKeyFor}
                    colSpan={21}
                    filter={filter}
                    groupFlagged={flaggedGroups.has(g.id)}
                    focusedPid={focusedPid}
                    onSelectRow={setFocusedPid}
                    flagGaps={flagGaps}
                  />
                ))}
          </tbody>
        </table>
        {groups.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            No pairings saved for this tournament yet. Set them in Pairings &
            tee times first.
          </p>
        )}
        {groups.length > 0 && !isScramble && !anyVisible && (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {filter === "review"
              ? "No cards need review. Every group is running clean."
              : filter === "incomplete"
                ? "Every card is in. Nothing left to enter."
                : "No cards are in yet."}
          </p>
        )}
      </div>

      {FEATURES.scanCard && (
        <ScanCardDialog open={scanOpen} onOpenChange={setScanOpen} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function GroupRows({
  group,
  byId,
  scores,
  cardIn,
  tournamentId,
  round,
  course,
  allowance,
  isStableford,
  onEnter,
  scoresKeyFor,
  colSpan,
  filter,
  groupFlagged,
  focusedPid,
  onSelectRow,
  flagGaps,
}: {
  group: { id: string; number: number; teeTime: string; playerIds: string[] };
  byId: Map<string, Player>;
  scores: Record<string, (number | null)[]>;
  cardIn: Record<string, boolean>;
  tournamentId: string;
  round: number;
  course: Course;
  allowance: number;
  isStableford: boolean;
  onEnter: (pid: string) => void;
  scoresKeyFor: (pid: string) => string;
  colSpan: number;
  filter: ScoreFilter;
  groupFlagged: boolean;
  focusedPid: string | null;
  onSelectRow: (pid: string | null) => void;
  flagGaps: boolean;
}) {
  const players = group.playerIds
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => Boolean(p));

  // The filter only decides what is on screen; it never touches a score.
  const visible = players.filter((p) => {
    if (filter === "complete") return cardIn[p.id];
    if (filter === "incomplete") return !cardIn[p.id];
    if (filter === "review") return groupFlagged;
    return true;
  });
  if (!visible.length) return null;

  return (
    <>
      <tr>
        <td
          colSpan={colSpan}
          className="sticky left-0 border-t border-border bg-secondary/60 px-3 py-1"
        >
          <span className="smallcaps text-[10px] text-ink-soft">
            Group {group.number} · tee {group.teeTime}
            {groupFlagged && (
              <span className="ml-2 text-amber-flag">needs review</span>
            )}
          </span>
        </td>
      </tr>
      {visible.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          scores={scores[p.id] ?? []}
          scoresKey={scoresKeyFor(p.id)}
          cardIn={Boolean(cardIn[p.id])}
          tournamentId={tournamentId}
          round={round}
          course={course}
          allowance={allowance}
          isStableford={isStableford}
          onEnter={onEnter}
          focused={focusedPid === p.id}
          onSelect={onSelectRow}
          flagGaps={flagGaps}
        />
      ))}
    </>
  );
}
