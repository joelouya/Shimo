"use client";

/**
 * Build a Ryder Cup.
 *
 * Two sides, a roster split between them, and the standard three sessions -
 * fourballs, foursomes, singles - generated from the split. A captain picks who
 * is on which side; the pairings and matches follow. Manual lineups per session
 * are a refinement; this gets a club from nothing to a live team match.
 *
 * Saving writes the ryderCup config, one round per session carrying its match
 * format, and pairings per round from the matches, so the desk can enter cards
 * and the board draws itself.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSES, clubById } from "@/lib/data";
import { createTournament, savePairings, useSim } from "@/lib/sim/store";
import { foursomesCardId } from "@/lib/ryder";
import type {
  RyderCupConfig,
  RyderMatch,
  RyderSessionFormat,
  Round,
  Tournament,
} from "@/lib/types";

const SESSIONS: { format: RyderSessionFormat; label: string; time: string }[] = [
  { format: "fourball", label: "Fourballs", time: "07:00" },
  { format: "foursomes", label: "Foursomes", time: "12:00" },
  { format: "singles", label: "Singles", time: "08:00" },
];

export default function RyderBuilderPage() {
  const router = useRouter();
  const roster = useSim((s) => s.roster);

  const [name, setName] = useState("Club Ryder Cup");
  const [courseId, setCourseId] = useState(COURSES[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [aName, setAName] = useState("Home");
  const [bName, setBName] = useState("Away");
  const [aIds, setAIds] = useState<string[]>([]);
  const [bIds, setBIds] = useState<string[]>([]);

  const course = COURSES.find((c) => c.id === courseId) ?? COURSES[0];
  const assigned = useMemo(() => new Set([...aIds, ...bIds]), [aIds, bIds]);
  const pool = roster.filter((p) => !assigned.has(p.id));

  const nameOf = (id: string) => roster.find((p) => p.id === id)?.name ?? id;

  const assign = (id: string, side: "a" | "b") => {
    setAIds((cur) => cur.filter((x) => x !== id));
    setBIds((cur) => cur.filter((x) => x !== id));
    if (side === "a") setAIds((cur) => [...cur, id]);
    else setBIds((cur) => [...cur, id]);
  };
  const unassign = (id: string) => {
    setAIds((cur) => cur.filter((x) => x !== id));
    setBIds((cur) => cur.filter((x) => x !== id));
  };

  const perSide = Math.min(aIds.length, bIds.length);
  const evenSides = aIds.length === bIds.length && aIds.length >= 2 && aIds.length % 2 === 0;

  const publish = () => {
    if (!evenSides || !course) return;
    const tid = `t-ryder-${Date.now().toString(36)}`;

    // matches: pairs for fourball & foursomes, one-to-one for singles
    const matches: RyderMatch[] = [];
    let n = 0;
    SESSIONS.forEach(({ format }, si) => {
      const round = si + 1;
      if (format === "singles") {
        for (let i = 0; i < perSide; i++) {
          matches.push({ id: `rm${n++}`, round, sideA: [aIds[i]], sideB: [bIds[i]] });
        }
      } else {
        for (let i = 0; i < perSide; i += 2) {
          matches.push({
            id: `rm${n++}`, round,
            sideA: [aIds[i], aIds[i + 1]],
            sideB: [bIds[i], bIds[i + 1]],
          });
        }
      }
    });

    const totalMatches = matches.length;
    const config: RyderCupConfig = {
      sides: [
        { id: "side-a", name: aName.trim() || "Home", playerIds: aIds },
        { id: "side-b", name: bName.trim() || "Away", playerIds: bIds },
      ],
      pointsToWin: totalMatches / 2 + 0.5,
      winPoints: 1,
      halfPoints: 0.5,
      matches,
    };

    const rounds: Round[] = SESSIONS.map((s, i) => ({
      id: `rs${i + 1}`,
      number: i + 1,
      name: s.label,
      date,
      courseId: course.id,
      tees: "White",
      firstTee: s.time,
      teeInterval: 10,
      cut: null,
      sessionFormat: s.format,
    }));

    const tournament: Tournament = {
      id: tid,
      name: name.trim() || "Club Ryder Cup",
      clubId: course.clubId,
      courseId: course.id,
      date,
      format: "Match Play",
      entryFee: 0,
      status: "upcoming",
      membersOnly: false,
      divisions: [{ name: "Overall", range: [0, 36] }],
      description: `A Ryder Cup at ${clubById(course.clubId).name}: ${aName} versus ${bName} over fourballs, foursomes and singles.`,
      prizes: [],
      maxPlayers: aIds.length + bIds.length,
      regCloses: date,
      handicapAllowance: 100,
      firstTee: SESSIONS[0].time,
      teeInterval: 10,
      fieldSize: aIds.length + bIds.length,
      fieldProfile: "team",
      ryderCup: config,
      rounds,
    };

    createTournament(tournament);

    // pairings per round from the matches, so the desk shows the right groups.
    // A foursomes match is one shared ball, stored under the match's side ids.
    rounds.forEach((r, ri) => {
      const roundMatches = matches.filter((m) => m.round === r.number);
      const groups = roundMatches.map((m, gi) => ({
        id: m.id,
        number: gi + 1,
        teeTime: r.firstTee,
        playerIds:
          r.sessionFormat === "foursomes"
            ? [foursomesCardId(m.id, "A"), foursomesCardId(m.id, "B")]
            : [...m.sideA, ...m.sideB],
      }));
      savePairings(tid, groups, ri + 1);
    });

    router.push("/admin/tournaments");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-clay-wash text-clay-deep">
          <Trophy className="size-5" />
        </span>
        <div>
          <p className="smallcaps text-muted-foreground">New event</p>
          <h1 className="font-serif text-[30px] leading-tight text-foreground">Ryder Cup</h1>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Course</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COURSES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* the two sides */}
        <div className="grid gap-4 sm:grid-cols-2">
          {(["a", "b"] as const).map((side) => {
            const ids = side === "a" ? aIds : bIds;
            const val = side === "a" ? aName : bName;
            const setVal = side === "a" ? setAName : setBName;
            return (
              <div key={side} className="rounded-2xl bg-card p-4 shadow-card">
                <Input
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  className="h-9 font-serif text-[17px]"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {ids.length} player{ids.length === 1 ? "" : "s"}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {ids.map((id) => (
                    <div key={id} className="flex items-center justify-between rounded-lg bg-secondary/60 px-2.5 py-1.5">
                      <span className="truncate text-[13.5px] text-foreground">{nameOf(id)}</span>
                      <button
                        onClick={() => unassign(id)}
                        className="text-muted-foreground hover:text-red-flag"
                        aria-label="Remove"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {!ids.length && (
                    <p className="py-4 text-center text-[11px] text-muted-foreground">
                      Assign players below
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* the pool */}
        <div>
          <p className="smallcaps text-muted-foreground">Roster</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pool.map((p) => (
              <div key={p.id} className="flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1">
                <span className="text-[13px] text-foreground">{p.name}</span>
                <button
                  onClick={() => assign(p.id, "a")}
                  className="ml-1 rounded-full bg-clay-wash px-2 py-0.5 text-[11px] font-medium text-clay-deep hover:bg-clay hover:text-cream"
                >
                  {aName.slice(0, 1) || "A"}
                </button>
                <button
                  onClick={() => assign(p.id, "b")}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-ink-soft hover:bg-primary hover:text-cream"
                >
                  {bName.slice(0, 1) || "B"}
                </button>
              </div>
            ))}
            {!pool.length && (
              <p className="text-[13px] text-muted-foreground">
                Every player is assigned. Import a roster in Members to add more.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-5">
          <p className="text-[13px] text-muted-foreground">
            {evenSides
              ? `${aIds.length} a side · fourballs, foursomes and singles`
              : "Give each side the same, even number of players (at least two)."}
          </p>
          <Button variant="clay" size="lg" disabled={!evenSides} onClick={publish}>
            Create Ryder Cup
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
