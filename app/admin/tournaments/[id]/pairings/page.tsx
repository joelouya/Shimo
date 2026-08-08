"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  FileDown,
  GripVertical,
  Plus,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GROUPS, clubById } from "@/lib/data";
import {
  allTournaments,
  saveTeams,
  cutAfterRound,
  fieldOfRound,
  groupsFromOrder,
  orderByStandings,
  savePairings,
  simStore,
  useSim,
} from "@/lib/sim/store";
import { roundKey, roundsOf } from "@/lib/rounds";
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
        "group flex cursor-grab items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-xs transition-[box-shadow,border-color] duration-[var(--dur-hover)] ease-[var(--ease-out)] active:cursor-grabbing hover:shadow-card",
        selected ? "border-clay ring-1 ring-clay/40" : "border-border",
      )}
    >
      <GripVertical className="size-3 text-muted-foreground" />
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

interface DraftTeam {
  id: string;
  name: string;
  playerIds: string[];
}

/**
 * Turn a tee sheet into teams for a Scramble or Better Ball. A group can hold
 * more than one team, so the pairs are cut from the groups in order - the first
 * two players a four-ball, then the next two - and named from their surnames.
 * The club renames as it likes; the teams autosave the way the pairings do.
 */
function TeamsPanel({
  tournamentId,
  round,
  groups,
  byId,
  playersPerTeam,
}: {
  tournamentId: string;
  round: number;
  groups: DraftGroup[];
  byId: Map<string, Player>;
  playersPerTeam: number;
}) {
  const saved = useSim((s) => s.teams[roundKey(tournamentId, round)]);
  const [teams, setTeams] = useState<DraftTeam[]>([]);
  const [loaded, setLoaded] = useState(-1);
  if (loaded !== round) {
    setLoaded(round);
    setTeams((saved ?? []).map((t) => ({ id: t.id, name: t.name, playerIds: [...t.playerIds] })));
  }

  useEffect(() => {
    saveTeams(
      tournamentId,
      teams.map((t) => ({ ...t, tournamentId, round })),
      round,
    );
  }, [teams, tournamentId, round]);

  const surname = (id: string) => byId.get(id)?.name.split(" ").pop() ?? id;

  const autoForm = () => {
    const next: DraftTeam[] = [];
    let n = 0;
    for (const g of groups) {
      for (let k = 0; k < g.playerIds.length; k += playersPerTeam) {
        const playerIds = g.playerIds.slice(k, k + playersPerTeam);
        if (!playerIds.length) continue;
        next.push({
          id: `tm-${round}-${n++}`,
          name: playerIds.map(surname).join(" + "),
          playerIds,
        });
      }
    }
    setTeams(next);
  };

  const assignedToTeams = new Set(teams.flatMap((t) => t.playerIds)).size;
  const inField = new Set(groups.flatMap((g) => g.playerIds)).size;

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="smallcaps text-clay">Teams</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {teams.length
              ? `${teams.length} teams · ${assignedToTeams} of ${inField} players`
              : "No teams yet. Form them from the tee sheet, then rename."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={autoForm} disabled={!inField}>
          <Users className="size-4" />
          {teams.length ? "Re-form from tee sheet" : "Form teams"}
        </Button>
      </div>

      {teams.length > 0 && (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t, i) => (
            <div key={t.id} className="rounded-2xl bg-card p-3.5 shadow-card">
              <Input
                value={t.name}
                onChange={(e) =>
                  setTeams((cur) =>
                    cur.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                className="h-9 font-serif text-[15px]"
              />
              <div className="mt-2 flex flex-col gap-1">
                {t.playerIds.map((pid) => (
                  <span key={pid} className="text-[13px] text-ink-soft">
                    {byId.get(pid)?.name ?? pid}
                    {byId.get(pid) ? (
                      <span className="text-muted-foreground"> · HC {byId.get(pid)!.handicap}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
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
  const t = allTournaments(created).find((x) => x.id === id);
  const rounds = t ? roundsOf(t) : [];

  // pairings are per round: leaders get re-paired for the next one
  const [round, setRound] = useState(1);
  const saved = useSim((s) => s.pairings[roundKey(id, round)]);
  const roundInfo = rounds.find((r) => r.number === round) ?? rounds[0];

  const isCaptains = id === "t-captains-prize";
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [firstTee, setFirstTee] = useState(roundInfo?.firstTee ?? "07:30");

  /*
   * Load the round's saved pairings when the round changes. Adjusting during
   * render rather than after it means the round being opened is the first tee
   * sheet drawn - the previous round's groups are never briefly on screen,
   * and autosave never sees the gap between the two.
   */
  const [loadedRound, setLoadedRound] = useState<number | null>(null);
  if (loadedRound !== round) {
    setLoadedRound(round);
    if (saved?.length) {
      setGroups(saved.map((g) => ({ id: g.id, playerIds: [...g.playerIds] })));
    } else if (isCaptains && round === 1) {
      setGroups(GROUPS.map((g) => ({ id: g.id, playerIds: [...g.playerIds] })));
    } else {
      setGroups(
        Array.from({ length: 6 }, (_, i) => ({ id: `ng${i + 1}`, playerIds: [] })),
      );
    }
    if (roundInfo) setFirstTee(roundInfo.firstTee);
  }
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
  const interval = roundInfo?.teeInterval || t?.teeInterval || 10;
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
      round,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, firstTee, round]);

  /**
   * Fill this round from the previous one's leaderboard: survivors of the cut
   * if there is one, otherwise the same field, ordered so the leaders go out
   * in the last group.
   */
  const repairFromLeaderboard = () => {
    if (!t || round < 2) return;
    const s = simStore.getState();
    const prev = round - 1;
    const cut = cutAfterRound(s, t, prev);
    const carried = cut ? cut.survivors : fieldOfRound(s, id, prev);
    if (!carried.length) return;
    const ordered = orderByStandings(s, t, prev, carried);
    setGroups(
      groupsFromOrder(ordered, firstTee, interval).map((g) => ({
        id: g.id,
        playerIds: g.playerIds,
      })),
    );
  };

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
            {formatDateLong(roundInfo?.date ?? t.date)} · {clubById(t.clubId).name}{" "}
            · {interval}-minute intervals
          </p>
        </div>
        <div className="flex items-center gap-3">
          {round > 1 && (
            <Button variant="outline" onClick={repairFromLeaderboard}>
              <Users className="size-4" />
              Re-pair by leaderboard
            </Button>
          )}
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

      {/* one tee sheet per round */}
      {rounds.length > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {rounds.map((r) => (
            <button
              key={r.id}
              onClick={() => setRound(r.number)}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors cursor-pointer",
                round === r.number
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {r.name}
              {r.cut && (
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-[10px]",
                    round === r.number
                      ? "bg-cream/15 text-primary-foreground"
                      : "bg-clay-wash text-clay-deep",
                  )}
                >
                  cut {r.cut.topN}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
                  "rounded-2xl bg-card p-3.5 shadow-card transition-[box-shadow,background-color] duration-[var(--dur-hover)] ease-[var(--ease-out)]",
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
                    <p className="py-7 text-center text-[11px] text-muted-foreground">
                      Drop players here
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {t && (t.format === "Scramble" || t.format === "Better Ball") && (
            <TeamsPanel
              tournamentId={id}
              round={round}
              groups={groups}
              byId={byId}
              playersPerTeam={t.playersPerTeam ?? 2}
            />
          )}
        </div>
      </div>
    </div>
  );
}
