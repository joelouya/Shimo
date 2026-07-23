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
import { Switch } from "@/components/ui/switch";
import { LiveBadge } from "@/components/live-dot";
import { courseById } from "@/lib/data";
import { rowStats, handicapSet } from "@/lib/scoring";
import { useActiveTournament, useSyncStatus } from "@/lib/sim/hooks";
import { retryFailedOps, setBulkScore, setCardIn, useSim } from "@/lib/sim/store";
import type { Course, Player } from "@/lib/types";
import { cn, toPar } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* One score cell — local text state, saves on blur                    */
/* ------------------------------------------------------------------ */

const Cell = memo(function Cell({
  pid,
  holeIdx,
  value,
  par,
  onEnter,
}: {
  pid: string;
  holeIdx: number;
  value: number | null;
  par: number;
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
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
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
        // two digits can't grow further — hop to the next hole
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
        flash && "border-clay/60 bg-clay-wash/60",
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
  course: Course;
  allowance: number;
  isStableford: boolean;
  onEnter: (pid: string) => void;
}

const PlayerRow = memo(
  function PlayerRow({
    player,
    scores,
    cardIn,
    course,
    allowance,
    isStableford,
    onEnter,
  }: RowProps) {
    const st = rowStats(player, scores, course, allowance);
    return (
      <tr className={cn("border-t border-border/60", cardIn && "bg-clay-wash/30")}>
        <td className="sticky left-0 z-10 min-w-[168px] bg-background px-3 py-1.5">
          <p className="truncate text-[14px] font-medium text-foreground">
            {player.name}
          </p>
          <p className="text-[11px] text-muted-foreground tnum">
            HC {player.handicap} · PH {handicapSet(player.handicap, course, allowance).ph}
          </p>
        </td>
        {course.holes.map((h, i) => (
          <td key={h.hole} className="px-0.5 py-1.5">
            <Cell
              pid={player.id}
              holeIdx={i}
              value={scores[i] ?? null}
              par={h.par}
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
          <Switch
            tabIndex={-1}
            checked={cardIn}
            onCheckedChange={(on) => setCardIn(player.id, on)}
            aria-label={`Mark ${player.name}'s card in`}
          />
        </td>
      </tr>
    );
  },
  (a, b) =>
    a.player.id === b.player.id &&
    a.scoresKey === b.scoresKey &&
    a.cardIn === b.cardIn &&
    a.isStableford === b.isStableford,
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
          <Camera className="size-8 text-muted-foreground/60" />
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

export default function BulkScoresPage() {
  const active = useActiveTournament();
  const scores = useSim((s) => s.scores);
  const cardIn = useSim((s) => s.cardIn);
  const { online, failed } = useSyncStatus();
  const [scanOpen, setScanOpen] = useState(false);

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
      const nextPid = flatPlayerIds[idx + 1];
      if (!nextPid) return;
      const card = scores[nextPid] ?? [];
      let hole = card.findIndex((x) => x == null);
      if (hole === -1) hole = 0;
      // defer until after blur/save settles
      setTimeout(() => {
        document
          .querySelector<HTMLInputElement>(`[data-cell="${nextPid}:${hole}"]`)
          ?.focus();
      }, 0);
    },
    [flatPlayerIds, scores],
  );

  if (!active || !course) {
    return (
      <div>
        <p className="smallcaps text-clay">Enter scores from cards</p>
        <h1 className="mt-2 font-serif text-[32px] leading-tight text-foreground">
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
  const fieldSize = flatPlayerIds.length;
  const cardsIn = flatPlayerIds.filter((pid) => cardIn[pid]).length;

  const scoresKeyFor = (pid: string) => (scores[pid] ?? []).join(",");

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <p className="smallcaps text-clay">Enter scores from cards</p>
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
          <Button variant="outline" onClick={() => setScanOpen(true)}>
            <ScanLine className="size-4" />
            Scan card
          </Button>
        </div>
      </header>

      <p className="mt-4 text-[12.5px] text-muted-foreground">
        <span className="font-medium text-ink-soft">Tab</span> moves across
        holes · <span className="font-medium text-ink-soft">Enter</span> drops
        to the next player · every cell saves the moment you leave it
      </p>

      <div className="mt-3 overflow-auto rounded-2xl bg-card pb-1 shadow-card max-h-[calc(100vh-15rem)]">
        <table className="w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-20">
            <tr className="bg-secondary/95 backdrop-blur">
              <th className="sticky left-0 z-30 min-w-[168px] bg-secondary px-3 py-2 text-left">
                <span className="smallcaps text-[9px] text-muted-foreground">
                  Player
                </span>
              </th>
              {course.holes.map((h) => (
                <th key={h.hole} className="px-0.5 py-2 text-center">
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
            {groups.map((g) => (
              <GroupRows
                key={g.id}
                group={g}
                byId={byId}
                scores={scores}
                cardIn={cardIn}
                course={course}
                allowance={tournament.handicapAllowance}
                isStableford={isStableford}
                onEnter={focusNextPlayer}
                scoresKeyFor={scoresKeyFor}
                colSpan={21}
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
      </div>

      <ScanCardDialog open={scanOpen} onOpenChange={setScanOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function GroupRows({
  group,
  byId,
  scores,
  cardIn,
  course,
  allowance,
  isStableford,
  onEnter,
  scoresKeyFor,
  colSpan,
}: {
  group: { id: string; number: number; teeTime: string; playerIds: string[] };
  byId: Map<string, Player>;
  scores: Record<string, (number | null)[]>;
  cardIn: Record<string, boolean>;
  course: Course;
  allowance: number;
  isStableford: boolean;
  onEnter: (pid: string) => void;
  scoresKeyFor: (pid: string) => string;
  colSpan: number;
}) {
  const players = group.playerIds
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => Boolean(p));
  if (!players.length) return null;
  return (
    <>
      <tr>
        <td
          colSpan={colSpan}
          className="sticky left-0 border-t border-border bg-secondary/60 px-3 py-1"
        >
          <span className="smallcaps text-[10px] text-ink-soft">
            Group {group.number} · tee {group.teeTime}
          </span>
        </td>
      </tr>
      {players.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          scores={scores[p.id] ?? []}
          scoresKey={scoresKeyFor(p.id)}
          cardIn={Boolean(cardIn[p.id])}
          course={course}
          allowance={allowance}
          isStableford={isStableford}
          onEnter={onEnter}
        />
      ))}
    </>
  );
}
