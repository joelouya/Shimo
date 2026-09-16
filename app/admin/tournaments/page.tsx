"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ClipboardList,
  Copy,
  Flag,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  Plus,
  Printer,
  Radio,
  RotateCcw,
  Trash2,
  Trophy,
  Tv,
  UserCheck,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { ListRow, MasterDetail } from "@/components/admin/master-detail";
import { Segmented } from "@/components/admin/segmented";
import { Badge } from "@/components/ui/badge";
import { QrCode } from "@/components/qr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clubById, findCourse } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import { useSyncStatus } from "@/lib/sim/hooks";
import { roundKey, roundsOf } from "@/lib/rounds";
import {
  adoptTournament,
  allTournaments,
  canReopenTournamentDay,
  deleteTournament,
  dismissTournament,
  duplicateTournament,
  endTournamentDay,
  reopenTournamentDay,
  startTournamentDay,
  useSim,
} from "@/lib/sim/store";
import { printScorecards } from "@/lib/scorecard/print";
import type { Tournament } from "@/lib/types";
import { cn, formatDate, formatKES } from "@/lib/utils";

function StatusBadge({ t }: { t: Tournament }) {
  if (t.status === "live") return <Badge variant="live">● Live</Badge>;
  if (t.status === "completed") return <Badge variant="outline">Completed</Badge>;
  return <Badge variant="secondary">Entries open</Badge>;
}

/**
 * Whether the published event has actually reached the cloud. The desk is
 * told the truth: "visible on phones" only once the tournament row has
 * synced, "publishing" while it is queued, and "will publish when online"
 * when there is no connection to push it over.
 */
function PublishStatus({ id }: { id: string }) {
  const pending = useSim((s) =>
    s.outbox.some(
      (o) =>
        o.status !== "synced" &&
        o.kind === "entity" &&
        o.payload.table === "tournaments" &&
        (o.payload.row as { id?: string } | undefined)?.id === id,
    ),
  );
  const { online } = useSyncStatus();
  if (!IS_PILOT) return <>Published.</>;
  if (!pending) return <>Published and visible on phones.</>;
  return <>{online ? "Publishing to phones…" : "Saved here. It publishes to phones when you are back online."}</>;
}

/** "12 registered · 2 waitlisted", from the synced entries; the seed's
 *  field size when the event has none yet. */
function useEntryCount(t: Tournament) {
  const entries = useSim((s) => s.entries);
  const mine = entries.filter((e) => e.tournamentId === t.id);
  const registered = mine.filter((e) => e.status === "registered").length;
  const waitlisted = mine.filter((e) => e.status === "waitlisted").length;
  return { any: mine.length > 0, registered, waitlisted };
}

function EntryCount({ t }: { t: Tournament }) {
  const c = useEntryCount(t);
  if (!c.any) return <>{t.fieldSize} entered</>;
  return (
    <>
      {c.registered} registered
      {c.waitlisted > 0 && ` · ${c.waitlisted} waitlisted`}
      {t.maxPlayers ? ` of ${t.maxPlayers}` : ""}
    </>
  );
}

function DateBlock({ date, inverse }: { date: string; inverse?: boolean }) {
  const d = new Date(date + "T12:00:00");
  return (
    <div
      className={cn(
        "flex w-12 shrink-0 flex-col items-center rounded-xl py-2",
        inverse ? "bg-cream/10" : "bg-secondary/70",
      )}
    >
      <span className={cn("smallcaps text-[9px]", inverse ? "text-cream/70" : "text-muted-foreground")}>
        {d.toLocaleDateString("en-KE", { month: "short" })}
      </span>
      <span className={cn("font-serif text-xl leading-none tnum", inverse ? "text-cream" : "text-foreground")}>
        {d.getDate()}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Handlers = {
  onEdit: (t: Tournament) => void;
  onDelete: (t: Tournament) => void;
  onEnd: (t: Tournament) => void;
  onCopyRegistration: (t: Tournament) => void;
  onDuplicate: (t: Tournament) => void;
  onPrintScorecards: (t: Tournament) => void;
  onStart: (t: Tournament) => void;
};

function Tile({
  href,
  icon,
  label,
  sub,
  emphasis,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
        emphasis
          ? "border-clay/30 bg-clay-wash/40 hover:bg-clay-wash/70"
          : "border-border bg-card hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          emphasis ? "bg-clay text-cream" : "bg-secondary text-ink-soft",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-foreground">{label}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted-foreground">{sub}</span>}
      </span>
    </Link>
  );
}

/**
 * The chosen event, opened beside the list: what it is, how the field
 * stands, every door into it, and the one action the day is waiting on.
 * The secondary things (edit, duplicate, print, delete) are here as plain
 * buttons rather than behind an ellipsis; there is room for them now.
 */
function TournamentDetail({
  t,
  isCreated,
  handlers,
}: {
  t: Tournament;
  isCreated: boolean;
  handlers: Handlers;
}) {
  const canReopen = useSim((s) => canReopenTournamentDay(s, t.id));
  const groups = useSim((s) => s.pairings[roundKey(t.id, 1)]);
  const count = useEntryCount(t);
  const drawn = (groups ?? []).filter((g) => g.playerIds.length > 0);
  const seated = drawn.reduce((a, g) => a + g.playerIds.length, 0);
  const rounds = roundsOf(t);
  const course = findCourse(t.courseId);
  const upcoming = t.status === "upcoming";
  const live = t.status === "live";
  const completed = t.status === "completed";

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      {/* the event, on a navy sheet like the panel it lives beside */}
      <div className="bg-primary p-6 text-primary-foreground">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <DateBlock date={t.date} inverse />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge t={t} />
                {rounds.length > 1 && (
                  <span className="text-[11px] text-primary-foreground/60">{rounds.length} rounds</span>
                )}
              </div>
              <h2 className="mt-2 font-serif text-[30px] leading-tight text-cream">{t.name}</h2>
              <p className="mt-1 text-[13px] text-primary-foreground/60">
                {clubById(t.clubId).name} · {course?.name ?? t.courseId} · {t.format}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {live && (
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
            )}
            {upcoming && IS_PILOT && (
              <Button variant="clay" size="sm" onClick={() => handlers.onStart(t)}>
                Start tournament day
              </Button>
            )}
            {upcoming && !IS_PILOT && (
              <Button variant="clay" size="sm" asChild>
                <Link href={`/admin/tournaments/${t.id}/pairings`}>
                  <Users className="size-3" />
                  Pairings & tee times
                </Link>
              </Button>
            )}
            {completed && (
              <Button variant="clay" size="sm" asChild>
                <Link href={`/admin/tournaments/${t.id}/summary`}>
                  <ClipboardList className="size-3" />
                  Results
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* the field, as a ruled line */}
      <div className="grid grid-cols-2 divide-border/60 border-b border-border/60 sm:grid-cols-4 sm:divide-x">
        {[
          {
            l: "Entries",
            v: count.any ? count.registered : t.fieldSize,
            s: count.any
              ? `${count.waitlisted ? `${count.waitlisted} waiting · ` : ""}${t.maxPlayers ? `cap ${t.maxPlayers}` : "no cap"}`
              : "entered",
          },
          { l: "Tee sheet", v: drawn.length ? drawn.length : "·", s: drawn.length ? `${drawn.length} groups · ${seated} seated` : "not drawn yet" },
          { l: "Entry fee", v: formatKES(t.entryFee), s: t.feeTiers?.length ? `${t.feeTiers.length} rates` : "one rate" },
          { l: "First tee", v: t.firstTee, s: `${t.teeInterval || 10}-minute intervals` },
        ].map((f) => (
          <div key={f.l} className="px-5 py-4">
            <p className="smallcaps text-muted-foreground">{f.l}</p>
            <p className="mt-1.5 font-serif text-[22px] leading-none text-foreground tnum">{f.v}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">{f.s}</p>
          </div>
        ))}
      </div>

      {/* every door into the event */}
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {!completed && (
          <Tile
            href={`/admin/tournaments/${t.id}/registrations`}
            icon={<ClipboardList className="size-4" />}
            label="Registrations"
            sub={<EntryCount t={t} />}
            emphasis={upcoming}
          />
        )}
        <Tile
          href={`/admin/tournaments/${t.id}/pairings`}
          icon={<Users className="size-4" />}
          label="Pairings & tee times"
          sub={drawn.length ? `${drawn.length} groups drawn` : "Draw the sheet"}
        />
        {IS_PILOT && !completed && (
          <Tile
            href={`/admin/tournaments/${t.id}/desk`}
            icon={<UserCheck className="size-4" />}
            label="Check-in desk"
            sub="Codes and walk-ups on the day"
          />
        )}
        {live && (
          <Tile href="/admin/scores" icon={<ClipboardList className="size-4" />} label="Scoring desk" sub="Enter scores from cards" />
        )}
        {live && (
          <Tile href="/admin/tv" icon={<Tv className="size-4" />} label="Clubhouse screen" sub="Producer panel" emphasis={false} />
        )}
        {(live || completed) && (
          <Tile
            href={`/admin/tournaments/${t.id}/summary`}
            icon={<Trophy className="size-4" />}
            label={completed ? "Results and Committee" : "Results so far"}
            sub={completed ? (t.result?.winner ? `Won by ${t.result.winner}` : "No cards recorded") : "Standings and the Committee room"}
          />
        )}
        <Tile
          href={`/admin/tournaments/${t.id}/poster`}
          icon={<ImageIcon className="size-4" />}
          label={completed ? "Results poster" : "Poster"}
          sub="Fixture and results artwork"
        />
      </div>

      {/* the rest, plainly */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-secondary/30 px-5 py-3">
        {upcoming && (
          <Button variant="ghost" size="sm" onClick={() => handlers.onEdit(t)}>
            <Pencil className="size-3.5" />
            Edit details
          </Button>
        )}
        {upcoming && (
          <Button variant="ghost" size="sm" onClick={() => handlers.onCopyRegistration(t)}>
            <LinkIcon className="size-3.5" />
            Copy registration link
          </Button>
        )}
        {!completed && (
          <Button variant="ghost" size="sm" onClick={() => handlers.onPrintScorecards(t)}>
            <Printer className="size-3.5" />
            Print scorecards
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => handlers.onDuplicate(t)}>
          <Copy className="size-3.5" />
          Duplicate
        </Button>
        {live && IS_PILOT && isCreated && canReopen && (
          <Button variant="ghost" size="sm" onClick={() => reopenTournamentDay(t.id)}>
            <RotateCcw className="size-3.5" />
            Undo start
          </Button>
        )}
        {live && IS_PILOT && isCreated && (
          <Button variant="ghost" size="sm" onClick={() => handlers.onEnd(t)}>
            <Flag className="size-3.5" />
            End tournament
          </Button>
        )}
        {!live && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-red-flag hover:text-red-flag"
            onClick={() => handlers.onDelete(t)}
          >
            <Trash2 className="size-3.5" />
            {isCreated ? "Delete" : "Remove from list"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Filter = "all" | "live" | "upcoming" | "completed";

export default function AdminTournamentsPage() {
  const router = useRouter();
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const all = allTournaments(created, dismissed);
  const live = all.filter((t) => t.status === "live");
  const upcoming = all
    .filter((t) => t.status === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date));
  const completed = all.filter((t) => t.status === "completed");
  const createdIds = new Set(created.map((t) => t.id));

  const [filter, setFilter] = useState<Filter>("all");
  const ordered =
    filter === "all"
      ? [...live, ...upcoming, ...completed]
      : filter === "live"
        ? live
        : filter === "upcoming"
          ? upcoming
          : completed;

  // the one the desk is reading: the day on the course first, else the next
  // event, else whatever is first in the list
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    ordered.find((t) => t.id === selectedId) ??
    all.find((t) => t.id === selectedId) ??
    live[0] ??
    upcoming[0] ??
    all[0] ??
    null;

  const [toDelete, setToDelete] = useState<Tournament | null>(null);
  const [toEnd, setToEnd] = useState<Tournament | null>(null);

  /**
   * A seeded tournament has to become the club's own before it can be edited,
   * because the wizard edits from `created`. Done silently on the way into the
   * editor: a club that clicked Edit wants to edit, not to be told about the
   * difference between an example and their own record.
   */
  function onEdit(t: Tournament) {
    if (!createdIds.has(t.id)) adoptTournament(t.id);
    router.push(`/admin/tournaments/new?edit=${t.id}`);
  }

  function onDuplicate(t: Tournament) {
    // straight into the editor on the fresh copy, which is where a club wants
    // to be: change the date and the name, publish
    const id = duplicateTournament(t.id);
    if (id) router.push(`/admin/tournaments/new?edit=${id}`);
  }

  async function onPrintScorecards(t: Tournament) {
    const result = await printScorecards(t.id);
    // cards only mean anything once the field is drawn, so a club with no tee
    // sheet is sent to make one
    if (result === "no-pairings") router.push(`/admin/tournaments/${t.id}/pairings`);
  }

  const deleteIsRemoval = toDelete ? !createdIds.has(toDelete.id) : false;

  const [registrationFor, setRegistrationFor] = useState<Tournament | null>(null);
  function copyRegistration(t: Tournament) {
    const url = `${window.location.origin}/register/${t.id}`;
    // an insecure origin has no clipboard; the dialog shows the link either way
    navigator.clipboard?.writeText(url).catch(() => {});
    setRegistrationFor(t);
  }

  /*
   * Starting is the one irreversible-feeling step of the day, so it asks:
   * how big the field on the sheet is, and whether another day is still on
   * the course (one at a time, or the desk splits between them).
   */
  const [toStart, setToStart] = useState<Tournament | null>(null);
  // selectors return stable references (a map, an id, a row) and the shapes
  // are derived outside them: a selector that builds a fresh object every
  // call re-renders forever
  const pairingsMap = useSim((s) => s.pairings);
  const liveId = useSim((s) => s.liveTournamentId);
  const liveRow = useSim((s) => s.created.find((t) => t.id === s.liveTournamentId));
  const startState =
    toStart && liveId && liveId !== toStart.id && liveRow?.status === "live"
      ? { ok: false as const, liveName: liveRow.name }
      : { ok: true as const };
  const startField = useMemo(() => {
    if (!toStart) return { groups: 0, players: 0 };
    const gs = (pairingsMap[roundKey(toStart.id, 1)] ?? []).filter((g) => g.playerIds.length > 0);
    return { groups: gs.length, players: gs.reduce((a, g) => a + g.playerIds.length, 0) };
  }, [toStart, pairingsMap]);
  const confirmStart = () => {
    if (!toStart) return;
    startTournamentDay(toStart.id);
    setToStart(null);
    setJustCreatedId(null);
  };

  // A tournament just published from the wizard arrives with ?created=<id>. Flag
  // it so the go-live step is unmissable: publishing only opens registration,
  // and nothing reaches players' phones until the day is started.
  const [justCreatedId, setJustCreatedId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("created"),
  );
  useEffect(() => {
    if (justCreatedId) window.history.replaceState(null, "", "/admin/tournaments");
  }, [justCreatedId]);
  const justCreated =
    justCreatedId && IS_PILOT
      ? all.find((t) => t.id === justCreatedId && t.status === "upcoming")
      : null;

  const handlers: Handlers = {
    onEdit,
    onDelete: setToDelete,
    onEnd: setToEnd,
    onCopyRegistration: copyRegistration,
    onDuplicate,
    onPrintScorecards,
    onStart: (t) => setToStart(t),
  };

  return (
    <div>
      <Dialog open={Boolean(toStart)} onOpenChange={(o) => !o && setToStart(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start {toStart?.name}?</DialogTitle>
            <DialogDescription>
              {!startState.ok
                ? `${startState.liveName} is still on the course. End it before starting another day.`
                : startField.groups > 0
                  ? `${startField.players} players in ${startField.groups} groups are on the tee sheet. Starting opens live scoring on every phone in the field and puts the event on the clubhouse screen.`
                  : "There is no tee sheet yet. You can start anyway and seat players from the desk as they arrive, but a drawn sheet is the better morning."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setToStart(null)}>
              Not yet
            </Button>
            <Button variant="clay" disabled={!startState.ok} onClick={confirmStart}>
              Start the day
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PageHeader
        eyebrow="Tournaments"
        title="The season, in one place"
        meta={`${live.length} on the course · ${upcoming.length} upcoming · ${completed.length} completed`}
        actions={
          <>
            <Button variant="outline" size="lg" asChild>
              <Link href="/admin/tournaments/ryder">
                <Trophy className="size-4" />
                Ryder Cup
              </Link>
            </Button>
            <Button variant="clay" size="lg" asChild>
              <Link href="/admin/tournaments/new">
                <Plus className="size-4" />
                Create tournament
              </Link>
            </Button>
          </>
        }
      />

      {justCreated && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-clay/30 bg-clay-wash/40 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-[14px] font-medium text-foreground">
              &ldquo;{justCreated.name}&rdquo; is published and open for registration.
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              <PublishStatus id={justCreated.id} /> Members can enter from their phones now.
              When play begins, start the day to open live scoring and put it on every
              golfer&apos;s screen.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="clay" size="sm" onClick={() => setToStart(justCreated)}>
              Start tournament day
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setJustCreatedId(null)}>
              Later
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <MasterDetail
          list={
            <div>
              <Segmented<Filter>
                aria-label="Which tournaments"
                size="sm"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: "all", label: "All" },
                  { value: "live", label: "Live", count: live.length, attention: live.length > 0 },
                  { value: "upcoming", label: "Upcoming", count: upcoming.length },
                  { value: "completed", label: "Completed", count: completed.length },
                ]}
              />
              <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
                {ordered.length === 0 && (
                  <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                    Nothing here yet.
                  </p>
                )}
                {ordered.map((t) => {
                  const isSel = selected?.id === t.id;
                  return (
                    <ListRow key={t.id} selected={isSel} onSelect={() => setSelectedId(t.id)}>
                      <DateBlock date={t.date} inverse={isSel} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium">{t.name}</span>
                          {t.status === "live" && (
                            <span className="size-1.5 shrink-0 rounded-full bg-clay animate-live-pulse" />
                          )}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-[11.5px]",
                            isSel ? "text-primary-foreground/60" : "text-muted-foreground",
                          )}
                        >
                          {t.format} · <EntryCount t={t} />
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px]",
                          isSel ? "text-primary-foreground/60" : "text-muted-foreground",
                        )}
                      >
                        {t.status === "completed" ? "Done" : t.status === "live" ? "Live" : formatDate(t.date).split(" ").slice(0, 2).join(" ")}
                      </span>
                    </ListRow>
                  );
                })}
              </div>
            </div>
          }
          detail={
            selected ? (
              <TournamentDetail
                key={selected.id}
                t={selected}
                isCreated={createdIds.has(selected.id)}
                handlers={handlers}
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-8 text-center">
                <Radio className="size-5 text-stone" />
                <p className="mt-3 font-serif text-[19px] text-foreground">No tournaments yet</p>
                <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                  Create one and it opens here, with everything the day needs a click away.
                </p>
                <Button variant="clay" size="sm" className="mt-5" asChild>
                  <Link href="/admin/tournaments/new">
                    <Plus className="size-3.5" />
                    Create tournament
                  </Link>
                </Button>
              </div>
            )
          }
        />
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteIsRemoval ? "Remove this from your list?" : "Delete this tournament?"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              <span className="font-medium text-foreground">{toDelete?.name}</span>{" "}
              {deleteIsRemoval
                ? "is one of the example events Shimo ships with. Removing it clears it from your list. Nothing you created is affected."
                : toDelete?.status === "completed"
                  ? "and its results will be removed for every device. This can't be undone."
                  : "will be removed for every device. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (toDelete) {
                  if (deleteIsRemoval) dismissTournament(toDelete.id);
                  else deleteTournament(toDelete.id);
                }
                setToDelete(null);
              }}
            >
              <Trash2 className="size-4" />
              {deleteIsRemoval ? "Remove it" : "Delete tournament"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The registration link, and what it means to hand it out. */}
      <Dialog open={!!registrationFor} onOpenChange={(o) => !o && setRegistrationFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registration link copied</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Anyone with this link can put themselves on the sheet for{" "}
              <span className="font-medium text-foreground">{registrationFor?.name}</span>. They
              register as a guest, not as a member, and they never reach the club roster. Send
              it to the field, not to the public.
            </DialogDescription>
          </DialogHeader>
          {/* Printed at A4 and propped on the registration desk is how a
              corporate organiser will actually use this. */}
          {registrationFor && (
            <div className="flex justify-center py-2">
              <QrCode
                value={`${window.location.origin}/register/${registrationFor.id}`}
                size={200}
                label={`Scan to register for ${registrationFor.name}`}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="clay" onClick={() => setRegistrationFor(null)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End tournament confirmation */}
      <Dialog open={!!toEnd} onOpenChange={(o) => !o && setToEnd(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>End {toEnd?.name}?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              This freezes the final standings and closes live scoring. You&apos;ll go straight
              to the prizegiving summary. Cards already certified stay locked; the board stays
              viewable.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToEnd(null)}>
              Not yet
            </Button>
            <Button
              variant="clay"
              onClick={() => {
                if (toEnd) {
                  const id = toEnd.id;
                  endTournamentDay(id);
                  setToEnd(null);
                  router.push(`/admin/tournaments/${id}/summary`);
                }
              }}
            >
              <Trophy className="size-4" />
              End & see results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
