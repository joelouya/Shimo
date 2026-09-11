"use client";

/**
 * The registration desk.
 *
 * On the day, a registered player arrives holding the one-time code from their
 * confirmation. The desk types (or reads) it in, Shimo verifies it against the
 * event, and once the club has taken payment and done whatever else it checks,
 * the player is admitted to the field: seated in a group so their scorecard
 * opens the moment the day is started.
 *
 * Payment is not processed here - it is taken at the desk, by whatever means the
 * club already uses - so check-in records that it happened rather than moving
 * money. The code is the whole credential: there is no list of registrations to
 * browse, by design, so nothing here can leak who else is playing.
 */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clubById } from "@/lib/data";
import { normaliseCode } from "@/lib/guests";
import { resolveGuestForDesk } from "@/lib/guests-remote";
import {
  allTournaments,
  checkInGuest,
  checkInsFor,
  useSim,
} from "@/lib/sim/store";
import type { Player } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Found = { player: Player; alreadyIn: boolean };
type Problem =
  | { kind: "wrong-event" }
  | { kind: "not-found" }
  | { kind: "rate-limited" }
  | { kind: "unavailable" };

export default function DeskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const created = useSim((s) => s.created);
  const roster = useSim((s) => s.roster);
  const guests = useSim((s) => s.guests);
  const checkIns = useSim((s) => checkInsFor(s, id));
  const t = allTournaments(created).find((x) => x.id === id);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const nameOf = (pid: string) =>
    roster.find((p) => p.id === pid)?.name ??
    guests.find((p) => p.id === pid)?.name ??
    pid;

  const checkedIn = useMemo(
    () =>
      Object.entries(checkIns)
        .map(([pid, rec]) => ({ pid, name: nameOf(pid), ...rec }))
        .sort((a, b) => b.at - a.at),
    // nameOf reads roster/guests, which are the reactive inputs here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkIns, roster, guests],
  );

  if (!t) {
    return (
      <div>
        <p className="font-serif text-xl">Tournament not found</p>
        <Link href="/admin/tournaments" className="text-sm text-clay underline">
          Back to tournaments
        </Link>
      </div>
    );
  }

  const club = clubById(t.clubId);
  const ready = normaliseCode(code).length === 7 && !busy;

  const verify = async () => {
    setProblem(null);
    setFound(null);
    setBusy(true);
    const res = await resolveGuestForDesk(code);
    setBusy(false);
    if (res.status !== "ok") {
      setProblem(
        res.status === "rate-limited"
          ? { kind: "rate-limited" }
          : res.status === "unavailable"
            ? { kind: "unavailable" }
            : { kind: "not-found" },
      );
      return;
    }
    if (res.tournamentId !== id) {
      setProblem({ kind: "wrong-event" });
      return;
    }
    setFound({
      player: res.player,
      alreadyIn: Boolean(checkIns[res.player.id]),
    });
  };

  const admit = () => {
    if (!found) return;
    checkInGuest(id, found.player, { paid: true });
    setFound(null);
    setCode("");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/tournaments"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Tournaments
      </Link>
      <header className="mt-4">
        <p className="smallcaps text-muted-foreground">Registration desk</p>
        <h1 className="mt-2 font-serif text-[clamp(30px,4vw,42px)] font-medium leading-[1.04] tracking-[-0.014em] text-foreground">
          {t.name}
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {club.name} · {formatDate(t.date)}
        </p>
      </header>

      {/* the code box */}
      <section className="mt-8 rounded-2xl bg-card p-6 shadow-card">
        <Label htmlFor="desk-code">Player&apos;s registration code</Label>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          The six-character code from their confirmation. Read it off their phone
          or type it in.
        </p>
        <div className="mt-3 flex gap-3">
          <Input
            id="desk-code"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            placeholder="abc-123"
            onChange={(e) => {
              setCode(e.target.value);
              setProblem(null);
              setFound(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && ready && verify()}
            className="h-12 flex-1 text-center font-serif text-[24px] tracking-[0.18em] tnum"
          />
          <Button variant="clay" size="lg" disabled={!ready} onClick={verify}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
          </Button>
        </div>

        {problem && (
          <p className="mt-3 text-[13px] leading-relaxed text-red-flag">
            {problem.kind === "wrong-event" &&
              "That code is for a different event. Check they are at the right desk."}
            {problem.kind === "not-found" &&
              "No registration matches that code. Check it against their confirmation."}
            {problem.kind === "rate-limited" &&
              "Too many tries just now. Wait a moment and try again."}
            {problem.kind === "unavailable" &&
              "Could not reach the registration service. Check the connection and try again."}
          </p>
        )}

        {found && (
          <div className="mt-4 rounded-xl border border-clay/25 bg-clay-wash/40 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-clay text-cream">
                <UserRound className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-medium text-foreground">
                  {found.player.name}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {found.player.guest?.company
                    ? `${found.player.guest.company} · `
                    : ""}
                  {found.player.handicap
                    ? `HC ${found.player.handicap}`
                    : "No handicap on file"}
                </p>
              </div>
            </div>
            {found.alreadyIn ? (
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-clay-deep">
                <Check className="size-4" />
                Already checked in. Nothing more to do.
              </p>
            ) : (
              <>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                  Take payment and run any club checks, then admit them. They go
                  into the field and their scorecard opens when the day starts.
                </p>
                <Button variant="clay" className="mt-3" onClick={admit}>
                  <Check className="size-4" />
                  Check in · payment taken
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {/* who is in so far */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="smallcaps text-muted-foreground">Checked in</p>
          <span className="text-[13px] text-muted-foreground tnum">
            {checkedIn.length}
          </span>
        </div>
        {checkedIn.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
            <p className="text-[14px] text-muted-foreground">
              No one checked in yet. Verify a code above to admit the first
              player.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-card">
            {checkedIn.map((c) => (
              <div
                key={c.pid}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-serif text-[13px] text-ink-soft">
                    <Check className="size-4 text-clay" />
                  </span>
                  <p className="text-[14px] font-medium text-foreground">
                    {c.name}
                  </p>
                </div>
                <span className="rounded-full bg-clay-wash px-2.5 py-0.5 text-[11px] font-medium text-clay-deep">
                  {c.paid ? "Paid at desk" : "Checked in"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
