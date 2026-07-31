"use client";

/**
 * Publishing a desk-entered card.
 *
 * The old switch put "this card is returned" one stray tap away from being
 * true, which was fine while the only thing downstream was a leaderboard. It
 * is not fine now that a published card is what the television acts on: the
 * desk types eighteen numbers for someone who is not standing there, and then
 * says, deliberately and in their own name, that the card is in.
 *
 * So the second step asks for three things and refuses on the first: a
 * complete card, the desk's PIN, and optionally a photograph of the paper.
 * The photograph is the only thing that settles an argument about a card the
 * player never touched, so it is offered every time and never insisted on.
 */

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Lock, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { publishCard, unpublishCard, useSim } from "@/lib/sim/store";
import { uploadCardPhoto } from "@/lib/sync/storage";
import type { Player } from "@/lib/types";

export function PublishButton({
  player,
  published,
  thru,
  tournamentId,
  round,
}: {
  player: Player;
  published: boolean;
  thru: number;
  tournamentId: string;
  round: number;
}) {
  /*
   * The mode is captured when the dialog opens rather than read from live
   * state. Publishing flips this card to published, and a dialog that reads
   * that flag would rewrite itself into its own withdraw form at the moment of
   * success - the desk taps "Publish card" and is looking at "Withdraw". What
   * it should do is close.
   */
  const [mode, setMode] = useState<"publish" | "withdraw" | null>(null);
  const complete = thru >= 18;

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setMode(published ? "withdraw" : "publish")}
        aria-label={
          published
            ? `Withdraw ${player.name}'s card`
            : `Publish ${player.name}'s card`
        }
        className={`inline-flex size-7 items-center justify-center rounded-full border transition-colors ${
          published
            ? "border-clay bg-clay text-cream"
            : complete
              ? "border-input text-muted-foreground hover:border-clay hover:text-clay"
              : "border-border/60 text-muted-foreground"
        }`}
      >
        {published ? <Check className="size-3.5" /> : <Lock className="size-3" />}
      </button>

      <Dialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          {mode === "withdraw" ? (
            <Withdraw player={player} onDone={() => setMode(null)} />
          ) : mode === "publish" ? (
            <Publish
              player={player}
              complete={complete}
              thru={thru}
              tournamentId={tournamentId}
              round={round}
              onDone={() => setMode(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Publish({
  player,
  complete,
  thru,
  tournamentId,
  round,
  onDone,
}: {
  player: Player;
  complete: boolean;
  thru: number;
  tournamentId: string;
  round: number;
  onDone: () => void;
}) {
  const adminPin = useSim((s) => s.adminPin);
  const deskName = useSim((s) => s.deskName);
  const [pin, setPin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // set once a photo upload has failed, so the next tap publishes without it
  const [skipPhoto, setSkipPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const needsPin = Boolean(adminPin);
  const who = deskName?.trim() || "the desk";

  const go = async () => {
    if (needsPin && pin !== adminPin) {
      setError("That PIN does not match the one set in Settings.");
      return;
    }
    setBusy(true);
    setError(null);

    let photo: string | undefined;
    if (file && !skipPhoto) {
      try {
        photo = await uploadCardPhoto(tournamentId, round, player.id, file);
      } catch {
        /*
         * The photograph failed to upload. The card is not published silently
         * without it: the desk attached a photo because they wanted the
         * evidence on the record, and quietly dropping it is the version of
         * this that goes wrong in a dispute six weeks later. So say so, and
         * make publishing without it a second, deliberate tap.
         */
        setBusy(false);
        setSkipPhoto(true);
        setError(
          "The photo could not be uploaded. The club's connection may be down. Publish without it, or cancel and try again.",
        );
        return;
      }
    }

    setBusy(false);
    // Close before the store changes. Publishing flips this card to published,
    // which re-renders this same dialog into its withdraw form; closing first
    // means the desk sees it dismiss rather than turn into a different screen.
    onDone();
    publishCard(player.id, { by: who, photo });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Publish {player.name}&apos;s card</DialogTitle>
        <DialogDescription>
          This returns the card. It goes on the leaderboard, and anything on it
          becomes something the clubhouse screen may announce.
        </DialogDescription>
      </DialogHeader>

      {!complete ? (
        <p className="rounded-lg bg-amber-wash px-3 py-2 text-[13px] text-amber-flag">
          Only {thru} of 18 holes are entered. Finish the card before publishing
          it.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-secondary/60 px-3 py-2 text-[13px] text-ink-soft">
            Recorded as{" "}
            <span className="font-medium">
              {`score entered by ${who} on behalf of ${player.name}`}
            </span>
            .
          </div>

          <div>
            <label className="smallcaps text-muted-foreground">
              Photo of the paper card
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="size-4" />
              {file ? file.name.slice(0, 28) : "Attach a photo (optional)"}
            </Button>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Kept privately with the card. It is the only thing that settles an
              argument about a card the player never touched.
            </p>
          </div>

          {needsPin && (
            <div>
              <label className="smallcaps text-muted-foreground">Desk PIN</label>
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void go();
                }}
                className="mt-2 text-center text-lg tracking-[0.4em]"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-[13px] text-red-flag">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="clay"
          disabled={!complete || busy || (needsPin && pin.length === 0)}
          onClick={() => void go()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {skipPhoto ? "Publish without photo" : "Publish card"}
        </Button>
      </div>
    </>
  );
}

function Withdraw({ player, onDone }: { player: Player; onDone: () => void }) {
  const deskName = useSim((s) => s.deskName);
  const [reason, setReason] = useState("");
  const who = deskName?.trim() || "the desk";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Withdraw {player.name}&apos;s card</DialogTitle>
        <DialogDescription>
          The card comes off the leaderboard. Nothing the screen has already
          shown is contradicted; the board simply reflects the change.
        </DialogDescription>
      </DialogHeader>

      <div>
        <label className="smallcaps text-muted-foreground">Why</label>
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Wrong player, hole 7 misread…"
          className="mt-2"
        />
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Recorded against the card. The question afterwards is never that a
          card was withdrawn, it is why.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="outline"
          disabled={reason.trim().length < 3}
          onClick={() => {
            unpublishCard(player.id, { by: who, reason: reason.trim() });
            onDone();
          }}
        >
          <Undo2 className="size-4" />
          Withdraw
        </Button>
      </div>
    </>
  );
}
