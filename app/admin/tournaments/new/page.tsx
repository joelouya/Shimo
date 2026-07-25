"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trophy, X } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { COURSES, clubById, courseById } from "@/lib/data";
import { IS_PILOT, WIRED_FORMATS } from "@/lib/mode";
import { createTournament, updateTournament, useSim } from "@/lib/sim/store";
import { makeRound, roundsOf, withRoundsSynced } from "@/lib/rounds";
import type { Format, Round, Tournament } from "@/lib/types";
import { cn, formatDateLong, formatKES } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Basics" },
  { n: 2, label: "Rounds" },
  { n: 3, label: "Eligibility" },
  { n: 4, label: "Entry" },
  { n: 5, label: "Format details" },
  { n: 6, label: "Prizes" },
  { n: 7, label: "Review & publish" },
];
const LAST_STEP = 7;

const ALL_FORMATS: Format[] = [
  "Stableford",
  "Stroke Play",
  "Match Play",
  "Better Ball",
  "Scramble",
];

// pilot offers only the formats with fully-wired scoring
const FORMATS: Format[] = IS_PILOT
  ? ALL_FORMATS.filter((f) => (WIRED_FORMATS as readonly string[]).includes(f))
  : ALL_FORMATS;

interface Draft {
  name: string;
  date: string;
  rounds: Round[];
  courseId: string;
  format: Format;
  tees: string;
  membersOnly: boolean;
  hcMin: number;
  hcMax: number;
  gender: "open" | "men" | "ladies";
  splitDivisions: boolean;
  fee: number;
  maxPlayers: number;
  regOpens: string;
  regCloses: string;
  allowance: number;
  countback: string;
  correctionWindowMin: number;
  prizes: { place: string; prize: string }[];
}

const INITIAL: Draft = {
  name: "",
  date: "2026-08-22",
  rounds: [makeRound(1, { date: "2026-08-22", courseId: "muthaiga-main", tees: "Yellow" })],
  courseId: "muthaiga-main",
  format: "Stableford",
  tees: "Yellow",
  membersOnly: false,
  hcMin: 0,
  hcMax: 28,
  gender: "open",
  splitDivisions: true,
  fee: 2500,
  maxPlayers: 120,
  regOpens: "2026-07-20",
  regCloses: "2026-08-20",
  allowance: 95,
  countback: "Back 9, then back 6, then back 3",
  correctionWindowMin: 15,
  prizes: [
    { place: "Overall winner", prize: "KES 15,000 pro shop credit" },
    { place: "Runner-up", prize: "KES 7,500 pro shop credit" },
    { place: "Nearest the pin, 16th", prize: "A dozen premium balls" },
  ],
};

/** Rebuild the wizard draft from an existing tournament, for editing. */
function draftFromTournament(t: Tournament): Draft {
  const course = courseById(t.courseId);
  return {
    name: t.name,
    date: t.date,
    rounds: roundsOf(t),
    courseId: t.courseId,
    format: t.format,
    tees: course.tees,
    membersOnly: t.membersOnly,
    hcMin: t.minHandicap ?? 0,
    hcMax: t.maxHandicap ?? 28,
    gender: t.ladiesOnly ? "ladies" : "open",
    splitDivisions: t.divisions.length > 1,
    fee: t.entryFee,
    maxPlayers: t.maxPlayers,
    regOpens: INITIAL.regOpens,
    regCloses: t.regCloses,
    allowance: t.handicapAllowance,
    countback: INITIAL.countback,
    correctionWindowMin: t.correctionWindowMin ?? 15,
    prizes: t.prizes.map((p) => ({ place: p.place, prize: p.prize })),
  };
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CreateTournamentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const created = useSim((s) => s.created);
  const editing = useMemo(
    () => (editId ? created.find((t) => t.id === editId) : undefined),
    [editId, created],
  );

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [publishing, setPublishing] = useState(false);
  const [loadedEdit, setLoadedEdit] = useState(false);

  // prefill once the tournament being edited is available from the store
  useEffect(() => {
    if (editing && !loadedEdit) {
      setDraft(draftFromTournament(editing));
      setLoadedEdit(true);
    }
  }, [editing, loadedEdit]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  /** Basics edits round 1 directly, which is all a single-round event has. */
  const setBasics = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      const [first, ...rest] = next.rounds.length
        ? next.rounds
        : [makeRound(1, { date: next.date, courseId: next.courseId, tees: next.tees })];
      next.rounds = [
        {
          ...first,
          date: next.date,
          courseId: next.courseId,
          tees: next.tees,
        },
        ...rest,
      ];
      return next;
    });

  const updateRound = (i: number, patch: Partial<Round>) =>
    setDraft((d) => {
      const rounds = d.rounds.map((r, j) => (j === i ? { ...r, ...patch } : r));
      // round 1 is mirrored on the tournament itself
      return i === 0
        ? { ...d, rounds, date: rounds[0].date, courseId: rounds[0].courseId }
        : { ...d, rounds };
    });

  const addRound = () =>
    setDraft((d) => {
      const last = d.rounds[d.rounds.length - 1];
      const nextDay = new Date(last.date + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      return {
        ...d,
        rounds: [
          ...d.rounds,
          makeRound(d.rounds.length + 1, {
            date: nextDay.toISOString().slice(0, 10),
            courseId: last.courseId,
            tees: last.tees,
            firstTee: last.firstTee,
            teeInterval: last.teeInterval,
          }),
        ],
      };
    });

  const removeRound = (i: number) =>
    setDraft((d) => {
      if (d.rounds.length <= 1) return d;
      const rounds = d.rounds
        .filter((_, j) => j !== i)
        .map((r, j) => ({ ...r, id: `r${j + 1}`, number: j + 1 }));
      return { ...d, rounds, date: rounds[0].date, courseId: rounds[0].courseId };
    });

  const course = courseById(draft.courseId);
  const club = clubById(course.clubId);

  const canContinue = useMemo(() => {
    if (step === 1) return draft.name.trim().length >= 3 && !!draft.date;
    if (step === 4) return draft.fee >= 0 && draft.maxPlayers > 0;
    return true;
  }, [step, draft]);

  const publish = () => {
    setPublishing(true);
    const t: Tournament = {
      id: editing ? editing.id : `t-custom-${Date.now()}`,
      name: draft.name.trim(),
      clubId: club.id,
      courseId: draft.courseId,
      date: draft.date,
      format: draft.format,
      entryFee: draft.fee,
      status: editing ? editing.status : "upcoming",
      membersOnly: draft.membersOnly,
      maxHandicap: draft.hcMax < 28 ? draft.hcMax : undefined,
      minHandicap: draft.hcMin > 0 ? draft.hcMin : undefined,
      ladiesOnly: draft.gender === "ladies",
      divisions: draft.splitDivisions
        ? [
            { name: "Division A", range: [0, 9] },
            { name: "Division B", range: [10, 18] },
            { name: "Division C", range: [19, 28] },
          ]
        : [{ name: "Overall", range: [draft.hcMin, draft.hcMax] }],
      description: `${draft.format} at ${club.name}, off ${draft.tees.toLowerCase()} tees. Published from the Shimo tournament desk: entries, tee times, live scoring and results handled in one place.`,
      prizes: (() => {
        const cleaned = draft.prizes.filter(
          (p) => p.place.trim() && p.prize.trim(),
        );
        return cleaned.length
          ? cleaned
          : [{ place: "Winner", prize: "Pro shop credit + club honours" }];
      })(),
      maxPlayers: draft.maxPlayers,
      regCloses: draft.regCloses,
      handicapAllowance: draft.allowance,
      firstTee: editing?.firstTee ?? "07:30",
      teeInterval: editing?.teeInterval ?? 10,
      fieldSize: editing?.fieldSize ?? 0,
      rounds: draft.rounds,
      correctionWindowMin: draft.correctionWindowMin,
      registered: editing?.registered,
      result: editing?.result,
    };
    // round 1's date, course and tee times are mirrored onto the tournament so
    // lists and cards never drift from the rounds
    const synced = withRoundsSynced(t);
    setTimeout(() => {
      if (editing) updateTournament(synced);
      else createTournament(synced);
      router.push("/admin/tournaments");
    }, 700);
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
      <header className="mt-3">
        <p className="smallcaps text-clay">
          {editing ? "Edit tournament" : "New tournament"}
        </p>
        <h1 className="mt-1 font-serif text-[32px] leading-tight text-foreground">
          {draft.name.trim() || "Untitled tournament"}
        </h1>
      </header>

      <div className="mt-8 grid grid-cols-[220px_1fr] gap-10">
        {/* step rail */}
        <ol className="flex flex-col gap-1">
          {STEPS.map((s) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li key={s.n}>
                <button
                  onClick={() => done && setStep(s.n)}
                  disabled={!done && !active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors",
                    active && "bg-card font-medium text-foreground shadow-card",
                    done && "cursor-pointer text-ink-soft hover:bg-accent/60",
                    !done && !active && "text-muted-foreground/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] tnum",
                      active && "border-clay bg-clay text-white",
                      done && "border-clay/40 bg-clay-wash text-clay-deep",
                      !done && !active && "border-border",
                    )}
                  >
                    {done ? <Check className="size-3" /> : s.n}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {/* step content */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl"
        >
          <div className="rounded-2xl bg-card p-7 shadow-card">
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <Field label="Tournament name">
                  <Input
                    autoFocus
                    placeholder="e.g. Muthaiga August Monthly Mug"
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Date"
                    hint={
                      draft.rounds.length > 1
                        ? "Round 1. The rest are set on the next step."
                        : undefined
                    }
                  >
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(e) => setBasics({ date: e.target.value })}
                    />
                  </Field>
                  <Field label="Tee selection">
                    <Select
                      value={draft.tees}
                      onValueChange={(v) => setBasics({ tees: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Yellow", "White", "Blue", "Red"].map((t) => (
                          <SelectItem key={t} value={t}>
                            {t} tees
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Course">
                  <Select
                    value={draft.courseId}
                    onValueChange={(v) => setBasics({ courseId: v })}
                  >
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
                </Field>
                <Field
                  label="Format"
                  hint={
                    draft.format === "Stableford" || draft.format === "Stroke Play"
                      ? undefined
                      : "Live scoring for this format arrives later this season. Entries and tee times work today."
                  }
                >
                  <Select
                    value={draft.format}
                    onValueChange={(v) => set("format", v as Format)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                          {f === "Stableford" || f === "Stroke Play" ? "" : " (beta)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-secondary/50 px-4 py-3.5">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Most club events are a single round, which is already set up
                    below. A championship adds a round for each day, and can cut
                    the field after any of them.
                  </p>
                </div>

                {draft.rounds.map((r, i) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border bg-card/60 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="smallcaps text-clay">Round {r.number}</p>
                      {draft.rounds.length > 1 && (
                        <button
                          onClick={() => removeRound(i)}
                          aria-label={`Remove round ${r.number}`}
                          className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      <Field label="Name">
                        <Input
                          value={r.name}
                          onChange={(e) => updateRound(i, { name: e.target.value })}
                          placeholder={`Round ${r.number}`}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Date">
                          <Input
                            type="date"
                            value={r.date}
                            onChange={(e) => updateRound(i, { date: e.target.value })}
                          />
                        </Field>
                        <Field label="First tee">
                          <Input
                            type="time"
                            value={r.firstTee}
                            onChange={(e) => updateRound(i, { firstTee: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Field label="Course" hint="A championship can move courses between rounds.">
                        <Select
                          value={r.courseId}
                          onValueChange={(v) => updateRound(i, { courseId: v })}
                        >
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
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tees">
                          <Select
                            value={r.tees || "Yellow"}
                            onValueChange={(v) => updateRound(i, { tees: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(courseById(r.courseId).ratings ?? []).map((t) => (
                                <SelectItem key={t.tee} value={t.tee}>
                                  {t.tee} tees
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Tee interval" hint="Minutes between groups.">
                          <Input
                            type="number"
                            min={5}
                            max={20}
                            value={r.teeInterval}
                            onChange={(e) =>
                              updateRound(i, {
                                teeInterval: parseInt(e.target.value, 10) || 10,
                              })
                            }
                          />
                        </Field>
                      </div>

                      {/* a cut only makes sense when another round follows */}
                      {i < draft.rounds.length - 1 && (
                        <div className="rounded-lg bg-secondary/50 px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <Label className="text-foreground">
                                Cut after this round
                              </Label>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Ties are always kept, so a top 30 usually returns
                                a few more.
                              </p>
                            </div>
                            <Switch
                              checked={!!r.cut}
                              onCheckedChange={(on) =>
                                updateRound(i, { cut: on ? { topN: 30 } : null })
                              }
                            />
                          </div>
                          {r.cut && (
                            <div className="mt-3">
                              <Field label="Players who play on">
                                <Input
                                  type="number"
                                  min={1}
                                  value={r.cut.topN}
                                  onChange={(e) =>
                                    updateRound(i, {
                                      cut: {
                                        topN: parseInt(e.target.value, 10) || 1,
                                      },
                                    })
                                  }
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <Button variant="outline" className="w-fit" onClick={addRound}>
                  <Plus className="size-4" />
                  Add a round
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
                  <div>
                    <Label className="text-foreground">Members only</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Restrict entries to {club.short} members
                    </p>
                  </div>
                  <Switch
                    checked={draft.membersOnly}
                    onCheckedChange={(v) => set("membersOnly", v)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Handicap minimum">
                    <Input
                      type="number"
                      min={0}
                      max={54}
                      value={draft.hcMin}
                      onChange={(e) => set("hcMin", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Handicap maximum">
                    <Input
                      type="number"
                      min={0}
                      max={54}
                      value={draft.hcMax}
                      onChange={(e) => set("hcMax", Number(e.target.value))}
                    />
                  </Field>
                </div>
                <Field label="Entry restriction">
                  <Select
                    value={draft.gender}
                    onValueChange={(v) => set("gender", v as Draft["gender"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open to everyone</SelectItem>
                      <SelectItem value="men">Men only</SelectItem>
                      <SelectItem value="ladies">Ladies only</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
                  <div>
                    <Label className="text-foreground">Split into divisions</Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      A (0–9) · B (10–18) · C (19–28), prizes per division
                    </p>
                  </div>
                  <Switch
                    checked={draft.splitDivisions}
                    onCheckedChange={(v) => set("splitDivisions", v)}
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Entry fee (KES)">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={draft.fee}
                      onChange={(e) => set("fee", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Maximum players">
                    <Input
                      type="number"
                      min={1}
                      value={draft.maxPlayers}
                      onChange={(e) => set("maxPlayers", Number(e.target.value))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Registration opens">
                    <Input
                      type="date"
                      value={draft.regOpens}
                      onChange={(e) => set("regOpens", e.target.value)}
                    />
                  </Field>
                  <Field label="Registration closes">
                    <Input
                      type="date"
                      value={draft.regCloses}
                      onChange={(e) => set("regCloses", e.target.value)}
                    />
                  </Field>
                </div>
                {!IS_PILOT && (
                  <div className="rounded-xl border border-clay/20 bg-clay-wash/50 px-4 py-3.5">
                    <p className="text-[12.5px] leading-relaxed text-ink-soft">
                      Players pay on registration by M-PESA or card, and Shimo
                      settles to the club account weekly. Withdrawals before the
                      close date refund automatically.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-col gap-5">
                <Field
                  label="Handicap allowance"
                  hint="WHS recommends 95% for individual stroke play and Stableford."
                >
                  <Select
                    value={String(draft.allowance)}
                    onValueChange={(v) => set("allowance", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[100, 95, 90, 85].map((a) => (
                        <SelectItem key={a} value={String(a)}>
                          {a}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Count-back rule (ties)">
                  <Select
                    value={draft.countback}
                    onValueChange={(v) => set("countback", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "Back 9, then back 6, then back 3",
                        "Back 9 only",
                        "Card playoff from hole 18 backwards",
                        "Shared prize",
                      ].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Correction window after certification"
                  hint="R&A 2024 guidance permits a time-based definition of a returned card. Players can request a correction during this window; the Committee decides."
                >
                  <Select
                    value={String(draft.correctionWindowMin)}
                    onValueChange={(v) => set("correctionWindowMin", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 15, 30, 60].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m === 0 ? "Off · cards lock immediately" : `${m} minutes`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="rounded-xl bg-secondary/50 px-4 py-3.5">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Shimo applies the allowance and count-back automatically.
                    The leaderboard settles itself the moment the last card is
                    attested. No committee arithmetic at 6pm.
                  </p>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="flex flex-col gap-4">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  What&apos;s on the table? These publish with the tournament
                  and show on every golfer&apos;s entry page.
                </p>
                <div className="flex flex-col gap-2.5">
                  {draft.prizes.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-xl bg-secondary/50 p-3"
                    >
                      <Trophy className="mt-2.5 size-4 shrink-0 text-gold" />
                      <div className="grid flex-1 grid-cols-[1fr_1.4fr] gap-2">
                        <Input
                          placeholder="Place, e.g. Overall winner"
                          value={p.place}
                          onChange={(e) =>
                            set(
                              "prizes",
                              draft.prizes.map((x, j) =>
                                j === i ? { ...x, place: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="Prize, e.g. KES 15,000 pro shop credit"
                          value={p.prize}
                          onChange={(e) =>
                            set(
                              "prizes",
                              draft.prizes.map((x, j) =>
                                j === i ? { ...x, prize: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <button
                        onClick={() =>
                          set(
                            "prizes",
                            draft.prizes.filter((_, j) => j !== i),
                          )
                        }
                        className="mt-2.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-red-flag cursor-pointer"
                        title="Remove prize"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  {draft.prizes.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                      No prizes yet. Even a mug is worth playing for.
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() =>
                    set("prizes", [...draft.prizes, { place: "", prize: "" }])
                  }
                >
                  <Plus className="size-4" />
                  Add a prize
                </Button>
                <div className="rounded-xl bg-secondary/50 px-4 py-3.5">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Divisional prizes are drawn automatically from the division
                    split. List anything extra here: nearest the pin, longest
                    drive, best gross, the lot.
                  </p>
                </div>
              </div>
            )}

            {step === 7 && (
              <div>
                <div className="flex flex-col divide-y divide-border/60">
                  {[
                    ["Name", draft.name.trim() || "·"],
                    [
                      "Rounds",
                      draft.rounds.length === 1
                        ? `One round · ${formatDateLong(draft.date)}`
                        : draft.rounds
                            .map(
                              (r) =>
                                `${r.name}, ${formatDateLong(r.date)}${
                                  r.cut ? ` (cut to ${r.cut.topN})` : ""
                                }`,
                            )
                            .join(" · "),
                    ],
                    ["Course", `${course.name} · ${draft.tees} tees`],
                    ["Format", `${draft.format} · ${draft.allowance}% allowance`],
                    [
                      "Eligibility",
                      [
                        draft.membersOnly ? "Members only" : "Open entry",
                        draft.gender === "ladies"
                          ? "Ladies only"
                          : draft.gender === "men"
                            ? "Men only"
                            : null,
                        `HC ${draft.hcMin}–${draft.hcMax}`,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    ],
                    [
                      "Divisions",
                      draft.splitDivisions ? "A (0–9) · B (10–18) · C (19–28)" : "Single division",
                    ],
                    [
                      "Entry",
                      `${formatKES(draft.fee)} · max ${draft.maxPlayers} players · closes ${formatDateLong(draft.regCloses)}`,
                    ],
                    ["Ties", draft.countback],
                    [
                      "Corrections",
                      draft.correctionWindowMin === 0
                        ? "Off"
                        : `${draft.correctionWindowMin} minute window after certification`,
                    ],
                    [
                      "Prizes",
                      draft.prizes.filter((p) => p.place.trim() && p.prize.trim())
                        .length
                        ? draft.prizes
                            .filter((p) => p.place.trim() && p.prize.trim())
                            .map((p) => p.place)
                            .join(" · ")
                        : "Winner (default)",
                    ],
                  ].map(([k, v]) => (
                    <div key={k as string} className="grid grid-cols-[130px_1fr] gap-4 py-3">
                      <p className="smallcaps pt-0.5 text-muted-foreground">{k}</p>
                      <p className="text-[14px] text-foreground">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-clay/20 bg-clay-wash/50 px-4 py-3.5">
                  <p className="flex items-center gap-2 text-[12.5px] text-clay-deep">
                    <Sparkles className="size-3.5" />
                    {editing
                      ? "Saving updates every device that has this tournament, instantly."
                      : "Publishing lists this instantly in the Shimo app for every golfer in Kenya."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {step < LAST_STEP ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canContinue}
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                variant="clay"
                size="lg"
                onClick={publish}
                disabled={publishing || draft.name.trim().length < 3}
              >
                {publishing
                  ? editing
                    ? "Saving…"
                    : "Publishing…"
                  : editing
                    ? "Save changes"
                    : "Publish tournament"}
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function CreateTournamentPage() {
  return (
    <Suspense fallback={null}>
      <CreateTournamentInner />
    </Suspense>
  );
}
