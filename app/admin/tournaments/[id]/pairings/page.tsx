"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, FileDown, GripVertical, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GROUPS, clubById } from "@/lib/data";
import { allTournaments, savePairings, useSim } from "@/lib/sim/store";
import type { Player } from "@/lib/types";
import { cn, formatDateLong } from "@/lib/utils";

interface DraftGroup {
  id: string;
  playerIds: string[];
}

function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function PlayerChip({
  p,
  onRemove,
  onSelect,
  selected,
}: {
  p: Player;
  onRemove?: () => void;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const pid = p.id;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", pid);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-xs transition-all active:cursor-grabbing hover:shadow-card",
        selected ? "border-clay ring-1 ring-clay/40" : "border-border",
      )}
    >
      <GripVertical className="size-3 text-muted-foreground/50" />
      <span className="flex-1 truncate text-[12.5px] text-foreground">{p.name}</span>
      <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground tnum">
        {p.handicap}
      </span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hidden text-muted-foreground hover:text-red-flag group-hover:block cursor-pointer"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export default function PairingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const created = useSim((s) => s.created);
  const roster = useSim((s) => s.roster);
  const saved = useSim((s) => s.pairings[id]);
  const t = allTournaments(created).find((x) => x.id === id);

  const isCaptains = id === "t-captains-prize";
  const [groups, setGroups] = useState<DraftGroup[]>(() => {
    if (saved?.length)
      return saved.map((g) => ({ id: g.id, playerIds: [...g.playerIds] }));
    if (isCaptains)
      return GROUPS.map((g) => ({ id: g.id, playerIds: [...g.playerIds] }));
    return Array.from({ length: 6 }, (_, i) => ({ id: `ng${i + 1}`, playerIds: [] }));
  });
  const [firstTee, setFirstTee] = useState(t?.firstTee ?? "07:30");
  const [exported, setExported] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(roster.map((p) => [p.id, p] as const)),
    [roster],
  );
  const assigned = useMemo(
    () => new Set(groups.flatMap((g) => g.playerIds)),
    [groups],
  );
  const pool = useMemo(
    () => roster.filter((p) => !assigned.has(p.id)).map((p) => p.id),
    [roster, assigned],
  );

  // autosave pairings + tee times so tournament day can pick them up
  const interval = t?.teeInterval || 10;
  useEffect(() => {
    if (!t) return;
    savePairings(
      id,
      groups.map((g, i) => ({
        id: g.id,
        number: i + 1,
        teeTime: addMinutes(firstTee, i * interval),
        playerIds: g.playerIds,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, firstTee]);

  if (!t) {
    return (
      <div>
        <p className="font-serif text-xl">Tournament not found</p>
        <Link href="/admin/tournaments" className="text-sm text-clay underline">
          Back
        </Link>
      </div>
    );
  }

  const movePlayer = (pid: string, toGroup: string | null) => {
    setGroups((gs) => {
      const cleared = gs.map((g) => ({
        ...g,
        playerIds: g.playerIds.filter((x) => x !== pid),
      }));
      if (toGroup == null) return cleared;
      return cleared.map((g) =>
        g.id === toGroup && g.playerIds.length < 4
          ? { ...g, playerIds: [...g.playerIds, pid] }
          : g,
      );
    });
  };

  const exportPdf = () => {
    setExported(true);
    setTimeout(() => setExported(false), 2600);
  };

  return (
    <div>
      <Link
        href="/admin/tournaments"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Tournaments
      </Link>
      <header className="mt-3 flex items-end justify-between">
        <div>
          <p className="smallcaps text-clay">Pairings & tee times</p>
          <h1 className="mt-1 font-serif text-[30px] leading-tight text-foreground">
            {t.name}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatDateLong(t.date)} · {clubById(t.clubId).name} · 10-minute intervals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">First tee</span>
            <Input
              type="time"
              value={firstTee}
              onChange={(e) => setFirstTee(e.target.value)}
              className="h-9 w-[110px]"
            />
          </div>
          <Button variant="outline" onClick={exportPdf}>
            <FileDown className="size-4" />
            Export tee sheet PDF
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {exported && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed right-8 top-6 z-50 flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[13px] text-primary-foreground shadow-lift"
          >
            <Check className="size-4 text-clay-wash" />
            Tee sheet exported and sent to the starter&apos;s desk
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-7 grid grid-cols-[280px_1fr] gap-6">
        {/* registered pool */}
        <div>
          <p className="smallcaps mb-2.5 text-muted-foreground">
            Registered · unassigned ({pool.length})
          </p>
          {selected && (
            <p className="mb-2 rounded-lg bg-clay-wash px-3 py-2 text-[11px] text-clay-deep">
              Now click a group to place{" "}
              {byId.get(selected)?.name.split(" ")[0] ?? "the player"}
            </p>
          )}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              movePlayer(e.dataTransfer.getData("text/plain"), null);
            }}
            className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto rounded-2xl border border-dashed border-border bg-card/50 p-3"
          >
            {pool.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Everyone&apos;s in a group. Drag here to unassign
              </p>
            )}
            {pool.map((pid) => (
              <PlayerChip
                key={pid}
                p={byId.get(pid)!}
                selected={selected === pid}
                onSelect={() => setSelected(selected === pid ? null : pid)}
              />
            ))}
          </div>
        </div>

        {/* groups */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="smallcaps text-muted-foreground">
              Groups ({groups.length}) · drag players in
            </p>
            <button
              onClick={() =>
                setGroups((gs) => [...gs, { id: `ng${Date.now()}`, playerIds: [] }])
              }
              className="flex items-center gap-1 text-xs font-medium text-clay hover:text-clay-deep cursor-pointer"
            >
              <Plus className="size-3.5" />
              Add group
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {groups.map((g, i) => (
              <div
                key={g.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  movePlayer(e.dataTransfer.getData("text/plain"), g.id);
                }}
                onClick={() => {
                  if (selected) {
                    movePlayer(selected, g.id);
                    setSelected(null);
                  }
                }}
                className={cn(
                  "rounded-2xl bg-card p-3.5 shadow-card transition-all",
                  g.playerIds.length === 0 && "border border-dashed border-border bg-card/50 shadow-none",
                  selected && g.playerIds.length < 4 && "cursor-pointer ring-1 ring-clay/30 hover:ring-clay/60",
                )}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-foreground">
                    Group {i + 1}
                  </p>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-ink-soft tnum">
                    {addMinutes(firstTee, i * (t.teeInterval || 10))}
                  </span>
                </div>
                <div className="flex min-h-[88px] flex-col gap-1.5">
                  {g.playerIds.map((pid) =>
                    byId.get(pid) ? (
                      <PlayerChip
                        key={pid}
                        p={byId.get(pid)!}
                        onRemove={() => movePlayer(pid, null)}
                      />
                    ) : null,
                  )}
                  {g.playerIds.length === 0 && (
                    <p className="py-7 text-center text-[11px] text-muted-foreground/60">
                      Drop players here
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
