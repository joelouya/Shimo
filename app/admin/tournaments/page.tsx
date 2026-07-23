"use client";

import Link from "next/link";
import { ArrowRight, Plus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clubById } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import { allTournaments, startTournamentDay, useSim } from "@/lib/sim/store";
import type { Tournament } from "@/lib/types";
import { formatDate, formatKES } from "@/lib/utils";

function StatusBadge({ t }: { t: Tournament }) {
  if (t.status === "live") return <Badge variant="live">● Live</Badge>;
  if (t.status === "completed") return <Badge variant="outline">Completed</Badge>;
  return <Badge variant="secondary">Entries open</Badge>;
}

function TournamentRow({ t, isNew }: { t: Tournament; isNew?: boolean }) {
  return (
    <div
      className={`flex items-center gap-5 px-5 py-4 ${
        isNew ? "bg-clay-wash/40" : ""
      }`}
    >
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-secondary/70 py-2">
        <span className="smallcaps text-[9px] text-muted-foreground">
          {new Date(t.date + "T12:00:00").toLocaleDateString("en-KE", { month: "short" })}
        </span>
        <span className="font-serif text-xl leading-none text-foreground tnum">
          {new Date(t.date + "T12:00:00").getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="truncate text-[15px] font-medium text-foreground">{t.name}</p>
          <StatusBadge t={t} />
          {isNew && <Badge variant="claySoft">Just published</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {clubById(t.clubId).name} · {t.format} · {formatKES(t.entryFee)} ·{" "}
          {t.fieldSize} entered
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {t.status === "live" ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/scores">Enter scores</Link>
            </Button>
            <Button variant="clay" size="sm" asChild>
              <Link href="/admin/live">
                Live Ops <ArrowRight className="size-3" />
              </Link>
            </Button>
          </>
        ) : t.status === "upcoming" ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/tournaments/${t.id}/pairings`}>
                <Users className="size-3" />
                Pairings & tee times
              </Link>
            </Button>
            {IS_PILOT && (
              <Button
                variant="clay"
                size="sm"
                onClick={() => startTournamentDay(t.id)}
              >
                Start tournament day
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Won by <span className="font-medium text-foreground">{t.result?.winner}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminTournamentsPage() {
  const created = useSim((s) => s.created);
  const all = allTournaments(created);
  const live = all.filter((t) => t.status === "live");
  const upcoming = all
    .filter((t) => t.status === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date));
  const completed = all.filter((t) => t.status === "completed");
  const createdIds = new Set(created.map((t) => t.id));

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <p className="smallcaps text-clay">Tournaments</p>
          <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
            The season, in one place
          </h1>
        </div>
        <Button variant="clay" size="lg" asChild>
          <Link href="/admin/tournaments/new">
            <Plus className="size-4" />
            Create tournament
          </Link>
        </Button>
      </header>

      {[
        { label: "Live now", items: live },
        { label: "Upcoming", items: upcoming },
        { label: "Completed", items: completed },
      ].map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.label} className="mt-8">
              <p className="smallcaps mb-3 text-muted-foreground">{section.label}</p>
              <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-card">
                {section.items.map((t) => (
                  <TournamentRow
                    key={t.id}
                    t={t}
                    isNew={createdIds.has(t.id) && !IS_PILOT}
                  />
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
