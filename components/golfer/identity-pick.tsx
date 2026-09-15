"use client";

/**
 * Lightweight "who are you" for pilot devices: a golfer's phone identifies
 * itself by picking their name from the field, or from the club roster when
 * no round is on. Stored device-locally; a member who signs in from Profile
 * is matched by email instead. Personalises the home greeting and the "you"
 * row on the leaderboard, and is what lets the phone register for an event.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findClub } from "@/lib/data";
import { useActiveTournament } from "@/lib/sim/hooks";
import { setDeviceIdentity, useSim } from "@/lib/sim/store";
import { initials } from "@/lib/utils";

export function useDeviceIdentity() {
  return useSim((s) => s.deviceIdentity);
}

function PickList({ onDone }: { onDone: () => void }) {
  const active = useActiveTournament();
  const roster = useSim((s) => s.roster);
  const [q, setQ] = useState("");
  const players = useMemo(() => {
    // today's field when a round is on, otherwise the whole roster
    const list = active?.players ?? roster.filter((p) => p.active !== false);
    const needle = q.trim().toLowerCase();
    return (needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [active, roster, q]);

  return (
    <div>
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your name…"
        className="h-12 text-[16px]"
      />
      <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-border">
        {players.length === 0 && (
          <p className="px-4 py-6 text-center text-[14px] text-muted-foreground">
            No match. Ask the desk to check you&apos;re in the field.
          </p>
        )}
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setDeviceIdentity(p.id);
              onDone();
            }}
            className="flex min-h-[52px] w-full items-center gap-3 border-b border-border/50 px-4 py-2.5 text-left last:border-b-0 transition-colors hover:bg-accent/50 cursor-pointer"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-serif text-[13px] text-ink-soft">
              {initials(p.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-foreground">
                {p.name}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {[findClub(p.clubId)?.short, `HC ${p.handicap}`].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The prompt shown on the golfer home when no identity is set yet. */
export function IdentityGate() {
  const active = useActiveTournament();
  const identity = useDeviceIdentity();
  const rosterSize = useSim((s) => s.roster.length);
  const [open, setOpen] = useState(false);

  // nothing to pick from yet: the roster arrives with the first cloud answer
  if (identity || (!active && rosterSize === 0)) return null;
  const clubShort = findClub(active?.tournament.clubId)?.short ?? "the club";

  return (
    <div className="mt-6 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift">
      {open ? (
        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="smallcaps text-primary-foreground/60">Who are you?</p>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-primary-foreground/60 hover:text-primary-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 rounded-xl bg-background p-3 text-foreground">
            <PickList onDone={() => setOpen(false)} />
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-cream/10">
            <UserRound className="size-5 text-clay-wash" />
          </div>
          <p className="mt-3 font-serif text-[19px] leading-tight">
            {active ? "Follow your round" : "Tell us who you are"}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-primary-foreground/65">
            {active
              ? `Tell ${clubShort} who you are and your place on the live board is highlighted just for you.`
              : "Pick your name off the roster and this phone can register you for events and open your card on the day."}
          </p>
          <Button
            variant="clay"
            size="lg"
            className="mt-4 w-full"
            onClick={() => setOpen(true)}
          >
            {active ? "I'm in this tournament" : "That's me"}
          </Button>
          {/*
            A guest has no roster row to pick from, so the list above is empty
            for them. Their way in is a code: the group code off the tee sheet
            or the personal code on their registration. One screen takes either,
            offered here rather than hidden behind a menu, because on a corporate
            day most of the field arrives this way.
          */}
          <Link
            href="/play"
            className="mt-3 block text-center text-[13px] text-clay-wash underline-offset-4 transition-colors duration-[var(--dur-hover)] hover:underline"
          >
            Have a code? Enter it
          </Link>
        </div>
      )}
    </div>
  );
}
