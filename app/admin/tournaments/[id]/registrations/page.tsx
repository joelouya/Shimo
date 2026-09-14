"use client";

/**
 * Who is in the field before the day.
 *
 * Members tap Register on their phone, guests come through the public form,
 * and the desk adds anyone who rang up or walked in. All of it lands here as
 * one list, so the club can see the field fill, admit from the waitlist, and
 * take someone off who has cried off. Nothing on this page shows a guest's
 * code: that stays with the guest and is verified at the desk on the day.
 */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Plus, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TournamentNav } from "@/components/admin/tournament-nav";
import { findClub } from "@/lib/data";
import { registrationOpen } from "@/lib/eligibility";
import {
  allTournaments,
  capacityFromEntries,
  checkInsFor,
  promoteEntry,
  registerPlayer,
  useSim,
  withdrawEntry,
} from "@/lib/sim/store";
import type { Player, TournamentEntry } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

function when(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const roster = useSim((s) => s.roster);
  const guests = useSim((s) => s.guests);
  const entries = useSim((s) => s.entries);
  const checkIns = useSim((s) => checkInsFor(s, id));
  const t = allTournaments(created, dismissed).find((x) => x.id === id);

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const byId = useMemo(
    () => new Map([...roster, ...guests].map((p) => [p.id, p] as const)),
    [roster, guests],
  );
  const rows = useMemo(
    () =>
      entries
        .filter((e) => e.tournamentId === id)
        .map((e) => ({ e, player: byId.get(e.playerId) }))
        .filter((x): x is { e: TournamentEntry; player: Player } => Boolean(x.player))
        .sort((a, b) => a.e.registeredAt.localeCompare(b.e.registeredAt)),
    [entries, id, byId],
  );
  const registered = rows.filter((r) => r.e.status === "registered");
  const waitlisted = rows.filter((r) => r.e.status === "waitlisted");
  const withdrawn = rows.filter((r) => r.e.status === "withdrawn");
  const inField = new Set(rows.filter((r) => r.e.status !== "withdrawn").map((r) => r.player.id));
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!adding) return [];
    return roster
      .filter((p) => p.active !== false && !inField.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 10);
    // inField derives from rows, which derives from entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, query, roster, entries]);

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

  const capacity = capacityFromEntries(entries, t);
  const open = registrationOpen(t);
  const clubName = findClub(t.clubId)?.name ?? "Your club";

  const Row = ({ e, player }: { e: TournamentEntry; player: Player }) => {
    const checked = Boolean(checkIns[player.id]);
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-[13px]",
              checked ? "bg-clay-wash text-clay-deep" : "bg-secondary text-ink-soft",
            )}
          >
            {checked ? <Check className="size-4" /> : <UserRound className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-foreground">{player.name}</p>
            <p className="text-[12px] text-muted-foreground">
              {e.kind === "guest" ? "Guest" : "Member"}
              {player.handicap ? ` · HC ${player.handicap}` : ""}
              {" · "}
              {e.via === "desk" ? "added at the desk" : "from their phone"}
              {when(e.registeredAt) ? ` · ${when(e.registeredAt)}` : ""}
              {checked ? " · checked in" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {e.status === "waitlisted" && (
            <Button size="sm" variant="clay" onClick={() => promoteEntry(t.id, player.id)}>
              Admit
            </Button>
          )}
          {e.status !== "withdrawn" ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => withdrawEntry(t.id, player.id)}
            >
              Withdraw
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => registerPlayer(t.id, player.id, { via: "desk", force: true })}
            >
              Reinstate
            </Button>
          )}
        </div>
      </div>
    );
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
      <header className="mt-4 flex items-end justify-between gap-6">
        <div>
          <p className="smallcaps text-muted-foreground">Registrations</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,4vw,42px)] font-medium leading-[1.04] tracking-[-0.014em] text-foreground">
            {t.name}
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {clubName} · {formatDate(t.date)} ·{" "}
            {open ? "entries open" : "entries closed"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-[34px] leading-none text-foreground tnum">
            {registered.length}
            {t.maxPlayers ? (
              <span className="text-[17px] text-muted-foreground"> / {t.maxPlayers}</span>
            ) : null}
          </p>
          <p className="smallcaps mt-1 text-muted-foreground">
            registered{waitlisted.length ? ` · ${waitlisted.length} waiting` : ""}
          </p>
        </div>
      </header>
      <TournamentNav id={t.id} />

      {/* add someone the desk took by phone or in person */}
      <section className="mt-6 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-medium text-foreground">Add a member</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              For anyone who rang the desk or asked in person. Guests register through the public link.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-3.5" />
            {adding ? "Done" : "Add"}
          </Button>
        </div>
        {adding && (
          <div className="mt-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the roster"
              className="h-10 text-[14px]"
            />
            <div className="mt-2 flex flex-col gap-1">
              {candidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => registerPlayer(t.id, p.id, { via: "desk", force: true })}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] text-foreground hover:bg-accent/60 cursor-pointer"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">HC {p.handicap}</span>
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-muted-foreground">
                  {query ? "Nobody on the roster matches." : "Type a name to search."}
                </p>
              )}
            </div>
          </div>
        )}
        {capacity.full && (
          <p className="mt-3 text-[12px] text-amber-flag">
            The field is at its cap of {t.maxPlayers}. New entries go on the waitlist
            {t.waitlist ? "" : ", which this event does not run"}.
          </p>
        )}
      </section>

      {/* the field */}
      <section className="mt-8">
        <p className="smallcaps mb-3 text-muted-foreground">In the field ({registered.length})</p>
        {registered.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-8 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-stone">
              <UserRound className="size-5" strokeWidth={1.75} />
            </span>
            <p className="mt-4 font-serif text-[17px] text-foreground">Nobody in yet</p>
            <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              Members see this event on their phones and enter with a tap. Guests use the
              registration link. Anyone who rings the desk can be added above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-card">
            {registered.map((r) => (
              <Row key={r.player.id} e={r.e} player={r.player} />
            ))}
          </div>
        )}
      </section>

      {waitlisted.length > 0 && (
        <section className="mt-8">
          <p className="smallcaps mb-3 flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3" />
            Waitlist ({waitlisted.length})
          </p>
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-card">
            {waitlisted.map((r) => (
              <Row key={r.player.id} e={r.e} player={r.player} />
            ))}
          </div>
        </section>
      )}

      {withdrawn.length > 0 && (
        <section className="mt-8">
          <p className="smallcaps mb-3 text-muted-foreground">Withdrawn ({withdrawn.length})</p>
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card opacity-70 shadow-card">
            {withdrawn.map((r) => (
              <Row key={r.player.id} e={r.e} player={r.player} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
