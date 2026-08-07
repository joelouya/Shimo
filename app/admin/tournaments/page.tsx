"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ClipboardList,
  Copy,
  Flag,
  Image as ImageIcon,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clubById } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import {
  adoptTournament,
  allTournaments,
  deleteTournament,
  dismissTournament,
  duplicateTournament,
  endTournamentDay,
  startTournamentDay,
  useSim,
} from "@/lib/sim/store";
import type { Tournament } from "@/lib/types";
import { formatKES } from "@/lib/utils";

function StatusBadge({ t }: { t: Tournament }) {
  if (t.status === "live") return <Badge variant="live">● Live</Badge>;
  if (t.status === "completed") return <Badge variant="outline">Completed</Badge>;
  return <Badge variant="secondary">Entries open</Badge>;
}

/**
 * One row of secondary actions, behind a single control.
 *
 * The upcoming row grew to five buttons of equal weight, which reads as five
 * equally likely things to do next. On a tournament day exactly one of them is
 * likely, so that one stays out and the rest go behind the ellipsis. The desk
 * loses nothing: everything is still one click away, it is just no longer
 * competing with the thing they actually came here to do.
 */
function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="More actions"
          className="text-muted-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function TournamentRow({
  t,
  isNew,
  isCreated,
  onEdit,
  onDelete,
  onEnd,
  onCopyRegistration,
  onDuplicate,
}: {
  t: Tournament;
  isNew?: boolean;
  isCreated: boolean;
  onEdit: (t: Tournament) => void;
  onDelete: (t: Tournament) => void;
  onEnd: (t: Tournament) => void;
  onCopyRegistration: (t: Tournament) => void;
  onDuplicate: (t: Tournament) => void;
}) {
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
            <RowMenu>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tournaments/${t.id}/pairings`}>
                  <Users />
                  Pairings & tee times
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tournaments/${t.id}/poster`}>
                  <ImageIcon />
                  Poster
                </Link>
              </DropdownMenuItem>
              {IS_PILOT && isCreated && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onEnd(t)}>
                    <Flag />
                    End tournament
                  </DropdownMenuItem>
                </>
              )}
            </RowMenu>
          </>
        ) : t.status === "upcoming" ? (
          <>
            {/* In pilot the day is the point; otherwise the tee sheet is. */}
            {IS_PILOT ? (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/tournaments/${t.id}/pairings`}>
                    <Users className="size-3" />
                    Pairings & tee times
                  </Link>
                </Button>
                <Button
                  variant="clay"
                  size="sm"
                  onClick={() => startTournamentDay(t.id)}
                >
                  Start tournament day
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/tournaments/${t.id}/pairings`}>
                  <Users className="size-3" />
                  Pairings & tee times
                </Link>
              </Button>
            )}
            <RowMenu>
              <DropdownMenuItem onSelect={() => onEdit(t)}>
                <Pencil />
                Edit details
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tournaments/${t.id}/poster`}>
                  <ImageIcon />
                  Poster
                </Link>
              </DropdownMenuItem>
              {/*
                The link an organiser forwards to a corporate field. Copied
                rather than opened, because the club's job with it is to paste
                it into an email or a WhatsApp group.
              */}
              <DropdownMenuItem onSelect={() => onCopyRegistration(t)}>
                <LinkIcon />
                Copy registration link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDuplicate(t)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(t)}>
                <Trash2 />
                {isCreated ? "Delete tournament" : "Remove from list"}
              </DropdownMenuItem>
            </RowMenu>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Won by{" "}
              <span className="font-medium text-foreground">
                {t.result?.winner ?? "·"}
              </span>
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/tournaments/${t.id}/summary`}>
                <ClipboardList className="size-3" />
                Summary
              </Link>
            </Button>
            <RowMenu>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tournaments/${t.id}/poster`}>
                  <ImageIcon />
                  Results poster
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/tournaments/${t.id}/pairings`}>
                  <Users />
                  Pairings & tee times
                </Link>
              </DropdownMenuItem>
            </RowMenu>
          </>
        )}
      </div>
    </div>
  );
}

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

  const deleteIsRemoval = toDelete ? !createdIds.has(toDelete.id) : false;

  const [registrationFor, setRegistrationFor] = useState<Tournament | null>(null);
  function copyRegistration(t: Tournament) {
    void navigator.clipboard.writeText(
      `${window.location.origin}/register/${t.id}`,
    );
    setRegistrationFor(t);
  }

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
                    isCreated={createdIds.has(t.id)}
                    onEdit={onEdit}
                    onCopyRegistration={copyRegistration}
                    onDelete={setToDelete}
                    onEnd={setToEnd}
                    onDuplicate={onDuplicate}
                  />
                ))}
              </div>
            </section>
          ),
      )}

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteIsRemoval
                ? "Remove this from your list?"
                : "Delete this tournament?"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              <span className="font-medium text-foreground">{toDelete?.name}</span>{" "}
              {deleteIsRemoval
                ? "is one of the example events Shimo ships with. Removing it clears it from your list. Nothing you created is affected."
                : "will be removed for every device. This can't be undone. Only do this before the tournament has started."}
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
      <Dialog
        open={!!registrationFor}
        onOpenChange={(o) => !o && setRegistrationFor(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registration link copied</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Anyone with this link can put themselves on the sheet for{" "}
              <span className="font-medium text-foreground">
                {registrationFor?.name}
              </span>
              . They register as a guest, not as a member, and they never reach
              the club roster. Send it to the field, not to the public.
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
              This freezes the final standings and closes live scoring. You&apos;ll
              go straight to the prizegiving summary. Cards already certified stay
              locked; the board stays viewable.
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
