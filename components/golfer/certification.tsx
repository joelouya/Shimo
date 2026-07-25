"use client";import {
  useRoundScores,
  useRoundMarkerScores,
  useRoundCerts,
} from "@/lib/sim/hooks";


/**
 * The certification ceremony, mirroring paper-card attestation exactly:
 *
 *   Stage A — the MARKER attests the card of the player they marked
 *   Stage B — the PLAYER certifies their own marker-attested card
 *
 * Only after both does the card become "returned" (R&A 3.3b), at which point
 * a tamper-evident integrity record is computed and appended.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Lock,
  MapPin,
  PenLine,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignatureCapture } from "@/components/signature";
import {
  DEMO_USER_ID,
  MARKER_ID,
  PLAYERS,
  clubById,
  playerById,
} from "@/lib/data";
import { getGpsFix } from "@/lib/integrity";
import { handicapSet } from "@/lib/scoring";
import {
  LIVE_COURSE,
  LIVE_TOURNAMENT,
  markerAttest,
  playerCertify,
  raiseDispute,
  requestCorrection,
  resolveDiscrepancy,
  setLocationConsent,
  useSim,
} from "@/lib/sim/store";
import type { Course } from "@/lib/types";
import { cn, toPar } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Location consent — asked early in the round, never at sign-off      */
/* ------------------------------------------------------------------ */

export function LocationConsentCard() {
  const consent = useSim((s) => s.locationConsent);
  if (consent !== "unset") return null;
  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl bg-card p-4 shadow-card">
      <MapPin className="mt-0.5 size-4 shrink-0 text-clay" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-foreground">
          Capture location at sign-off?
        </p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          When you certify your card, Shimo can record where it was signed. It is
          the digital equivalent of returning the card to the scoring area.
          Only used at that moment.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await getGpsFix(6000); // triggers the browser permission prompt
              setLocationConsent("granted");
            }}
          >
            Allow
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocationConsent("declined")}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HI · CH · PH transparency line                                      */
/* ------------------------------------------------------------------ */

export function HandicapChain({
  playerId,
  course: courseProp,
  allowance,
}: {
  playerId: string;
  /** the course being played; defaults to the demo course */
  course?: Course;
  /** handicap allowance in percent; defaults to the demo tournament's */
  allowance?: number;
}) {
  const [open, setOpen] = useState(false);
  const roster = useSim((s) => s.roster);
  // roster first, so a member imported from the club CSV resolves too
  const player =
    roster.find((p) => p.id === playerId) ??
    PLAYERS.find((p) => p.id === playerId);
  const course = courseProp ?? LIVE_COURSE;
  const pct = allowance ?? LIVE_TOURNAMENT.handicapAllowance;
  const rating =
    course.ratings.find((r) => r.tee === course.tees) ?? course.ratings[0];
  const { hi, ch, ph } = handicapSet(player?.handicap ?? 0, course, pct);
  if (!player) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex min-h-10 items-center gap-1.5 text-[13px] text-muted-foreground cursor-pointer"
      >
        <span className="tnum">
          HI {hi.toFixed(1)} · Course HC {ch} · Playing HC {ph}
        </span>
        <Info className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>How your Playing Handicap was calculated</DialogTitle>
            <DialogDescription>
              World Handicap System, off the {course.tees.toLowerCase()} tees.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2.5 text-[14px] text-ink-soft">
            <div className="rounded-xl bg-secondary/60 px-4 py-3 tnum">
              <p className="smallcaps text-[10px] text-muted-foreground">
                Course Handicap
              </p>
              <p className="mt-1">
                {hi.toFixed(1)} × ({rating.slope} ÷ 113) + ({rating.courseRating}{" "}
                − {course.par}) = <span className="font-medium">{ch}</span>
              </p>
            </div>
            <div className="rounded-xl bg-secondary/60 px-4 py-3 tnum">
              <p className="smallcaps text-[10px] text-muted-foreground">
                Playing Handicap
              </p>
              <p className="mt-1">
                {ch} × {pct}% ={" "}
                <span className="font-medium">{ph}</span>
              </p>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              All three figures are captured on your certified card, which
              satisfies Rule 3.3b(4).
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Review grid used by both stages                                     */
/* ------------------------------------------------------------------ */

function ReviewGrid({
  ownScores,
  markerScores,
  ownLabel,
  markerLabel,
  discrepancies,
  onAgree,
  onDispute,
  course = LIVE_COURSE,
}: {
  ownScores: (number | null)[];
  markerScores: (number | null)[];
  ownLabel: string;
  markerLabel: string;
  discrepancies: number[];
  onAgree: (holeIdx: number, value: number) => void;
  onDispute: (holeIdx: number) => void;
  course?: Course;
}) {
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border/70">
      <table className="w-full">
        <thead className="sticky top-0 bg-secondary/90 backdrop-blur">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pl-3 text-left font-medium">Hole</th>
            <th className="text-center font-medium">Par</th>
            <th className="text-center font-medium">{markerLabel}</th>
            <th className="pr-3 text-center font-medium">{ownLabel}</th>
          </tr>
        </thead>
        <tbody>
          {course.holes.map((h, i) => {
            const isDisc = discrepancies.includes(i);
            return (
              <tr
                key={h.hole}
                className={cn(
                  "border-t border-border/50 text-[14px] tnum",
                  isDisc && "bg-amber-wash/70",
                )}
              >
                <td className="py-1 pl-3 font-medium">{h.hole}</td>
                <td className="text-center text-muted-foreground">{h.par}</td>
                <td className="text-center">{markerScores[i] ?? "·"}</td>
                <td className="pr-3 text-center">
                  {isDisc ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-amber-flag">{ownScores[i] ?? "·"}</span>
                      <button
                        onClick={() => onAgree(i, markerScores[i]!)}
                        className="rounded border border-amber-flag/40 px-1.5 py-0.5 text-[11px] text-amber-flag cursor-pointer"
                        title={`Agree ${markerLabel}'s figure`}
                      >
                        agree {markerScores[i]}
                      </button>
                      <button
                        onClick={() => onDispute(i)}
                        className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground cursor-pointer"
                      >
                        dispute
                      </button>
                    </span>
                  ) : (
                    (ownScores[i] ?? "·")
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dispute form                                                        */
/* ------------------------------------------------------------------ */

function DisputeDialog({
  playerId,
  holeIdx,
  onClose,
  raisedBy = DEMO_USER_ID,
}: {
  playerId: string;
  holeIdx: number | null;
  onClose: () => void;
  raisedBy?: string;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [holeIdx]);
  return (
    <Dialog open={holeIdx != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Scale className="size-4 text-amber-flag" />
              Dispute · needs Committee
            </span>
          </DialogTitle>
          <DialogDescription>
            If you and your marker can&apos;t agree hole{" "}
            {holeIdx != null ? holeIdx + 1 : ""}, the card is held uncertified
            and the Committee decides. This is the right thing to do when
            discussion fails.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label>What happened, in your words</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We disagree whether the drop was one or two strokes"
          />
        </div>
        <Button
          variant="clay"
          disabled={reason.trim().length < 8}
          onClick={() => {
            if (holeIdx != null) {
              raiseDispute(playerId, holeIdx, reason.trim(), raisedBy);
            }
            onClose();
          }}
        >
          Hold this card for the Committee
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* The ceremony                                                        */
/* ------------------------------------------------------------------ */

export function CertificationCeremony({
  me = DEMO_USER_ID,
  marks = MARKER_ID,
  markedBy = MARKER_ID,
  course = LIVE_COURSE,
}: {
  /** the player using this device */
  me?: string;
  /** the player this device's user marks (whose card they attest) */
  marks?: string;
  /** the player who marks this device's user (who attests their card) */
  markedBy?: string;
  /** the course being played */
  course?: Course;
} = {}) {
  const scores = useRoundScores();
  const markerScores = useRoundMarkerScores();
  const certs = useRoundCerts();
  const roster = useSim((s) => s.roster);
  // resolve names from the roster first so pilot players work, falling back to
  // the seeded field for demo mode
  const nameOf = (id: string) =>
    roster.find((p) => p.id === id)?.name ??
    PLAYERS.find((p) => p.id === id)?.name ??
    "your partner";
  const marksName = nameOf(marks);
  const markedByName = nameOf(markedBy);
  const marksFirst = marksName.split(" ")[0];
  const markedByFirst = markedByName.split(" ")[0];
  const [sheet, setSheet] = useState<null | "A" | "B">(null);
  const [dispute, setDispute] = useState<{ pid: string; hole: number } | null>(
    null,
  );
  const [certifying, setCertifying] = useState(false);

  const davidCert = certs[marks];
  const joeCert = certs[me];

  const stageADone = Boolean(davidCert?.markerAttestedAt);
  const stageBReady = joeCert?.stage === "awaiting-player";

  // discrepancies on David's card (Joel's record vs David's own)
  const davidDisc = useMemo(
    () =>
      (scores[marks] ?? [])
        .map((own, i) =>
          own != null &&
          markerScores[marks]?.[i] != null &&
          markerScores[marks][i] !== own
            ? i
            : -1,
        )
        .filter((i) => i >= 0),
    [scores, markerScores, marks],
  );
  // discrepancies on Joel's own card
  const joeDisc = useMemo(
    () =>
      (scores[me] ?? [])
        .map((own, i) =>
          own != null &&
          markerScores[me]?.[i] != null &&
          markerScores[me][i] !== own
            ? i
            : -1,
        )
        .filter((i) => i >= 0),
    [scores, markerScores, me],
  );

  if (joeCert?.stage === "disputed" || joeCert?.stage === "committee-review") {
    return (
      <div className="mt-6 rounded-2xl border border-amber-flag/30 bg-amber-wash p-6 text-center">
        <Scale className="mx-auto size-5 text-amber-flag" />
        <p className="mt-3 font-serif text-xl text-foreground">
          Card held for the Committee
        </p>
        <p className="mx-auto mt-2 max-w-[280px] text-[14px] leading-relaxed text-amber-flag">
          {joeCert.stage === "committee-review"
            ? "The Committee is reviewing your card now."
            : "Your dispute has been sent to the tournament desk. You'll be told the moment it's decided."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl bg-card shadow-lift">
      <div className="bg-primary p-5 text-primary-foreground">
        <p className="smallcaps text-primary-foreground/50">Round complete</p>
        <p className="mt-1 font-serif text-[22px] leading-tight">
          Return your cards
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-primary-foreground/60">
          Same as the paper ritual: the marker attests, the player certifies,
          the card is returned.
        </p>
      </div>

      {/* Stage A */}
      <button
        onClick={() => !stageADone && setSheet("A")}
        disabled={stageADone}
        className={cn(
          "flex w-full items-center gap-3.5 border-b border-border/60 px-5 py-4 text-left",
          !stageADone && "cursor-pointer transition-colors hover:bg-accent/40",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border text-[14px] font-medium",
            stageADone
              ? "border-clay/40 bg-clay-wash text-clay-deep"
              : "border-clay bg-clay text-white",
          )}
        >
          {stageADone ? <Check className="size-4" /> : "A"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">
            Attest {marksFirst}&apos;s card
          </span>
          <span className="block text-[13px] text-muted-foreground">
            You are their marker
            {davidDisc.length > 0 && !stageADone && (
              <span className="ml-1.5 text-amber-flag">
                · {davidDisc.length} hole{davidDisc.length > 1 ? "s" : ""} to
                agree
              </span>
            )}
          </span>
        </span>
        {!stageADone && <ChevronRight className="size-4 text-muted-foreground" />}
      </button>

      {/* Stage B */}
      <button
        onClick={() => stageBReady && setSheet("B")}
        disabled={!stageBReady}
        className={cn(
          "flex w-full items-center gap-3.5 px-5 py-4 text-left",
          stageBReady && "cursor-pointer transition-colors hover:bg-accent/40",
          !stageADone && "opacity-45",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border text-[14px] font-medium",
            stageBReady
              ? "border-clay bg-clay text-white"
              : "border-border text-muted-foreground",
          )}
        >
          B
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">
            Certify your card
          </span>
          <span className="block text-[13px] text-muted-foreground">
            {stageBReady ? (
              `${markedByFirst} has attested your scores`
            ) : stageADone ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Waiting for {markedByFirst} to attest your card…
              </span>
            ) : (
              "Unlocks after Stage A"
            )}
          </span>
        </span>
        {stageBReady && <ChevronRight className="size-4 text-muted-foreground" />}
      </button>

      {/* Stage A sheet */}
      <Dialog open={sheet === "A"} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {marksName}&apos;s card, as you marked it
            </DialogTitle>
            <DialogDescription>
              Check the figures you recorded against {marksFirst}&apos;s own.
              Any difference must be agreed between you before you attest.
            </DialogDescription>
          </DialogHeader>
          <ReviewGrid
            ownScores={scores[marks] ?? []}
            markerScores={markerScores[marks] ?? []}
            ownLabel="His entry"
            markerLabel="Your record"
            discrepancies={davidDisc}
            onAgree={(i, v) => resolveDiscrepancy(marks, i, v)}
            onDispute={(i) => {
              setSheet(null);
              setDispute({ pid: marks, hole: i });
            }}
            course={course}
          />
          {davidDisc.length === 0 ? (
            <SignatureCapture
              actionLabel="attest as marker"
              onSign={(artifact) => {
                markerAttest(marks, me, artifact);
                setSheet(null);
              }}
            />
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-amber-wash px-4 py-3 text-[13px] text-amber-flag">
              <AlertTriangle className="size-4 shrink-0" />
              Agree the highlighted hole{davidDisc.length > 1 ? "s" : ""} with{" "}
              {marksFirst} before attesting.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Stage B sheet */}
      <Dialog open={sheet === "B"} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Your card, attested by your marker</DialogTitle>
            <DialogDescription>
              {markedByName} has attested these scores. Check every hole, then
              certify. Certifying returns the card and locks it.
            </DialogDescription>
          </DialogHeader>
          <ReviewGrid
            ownScores={scores[me] ?? []}
            markerScores={markerScores[me] ?? []}
            ownLabel="Your entry"
            markerLabel="Marker"
            discrepancies={joeDisc}
            onAgree={(i, v) => resolveDiscrepancy(me, i, v)}
            onDispute={(i) => {
              setSheet(null);
              setDispute({ pid: me, hole: i });
            }}
            course={course}
          />
          {joeDisc.length === 0 ? (
            certifying ? (
              <p className="flex items-center justify-center gap-2 py-4 text-[14px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Sealing the record…
              </p>
            ) : (
              <SignatureCapture
                actionLabel="certify your card"
                onSign={async (artifact) => {
                  setCertifying(true);
                  await playerCertify(me, artifact);
                  setCertifying(false);
                  setSheet(null);
                }}
              />
            )
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-amber-wash px-4 py-3 text-[13px] text-amber-flag">
              <AlertTriangle className="size-4 shrink-0" />
              Agree the highlighted hole{joeDisc.length > 1 ? "s" : ""} with
              your marker before certifying.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <DisputeDialog
        playerId={dispute?.pid ?? me}
        holeIdx={dispute?.hole ?? null}
        onClose={() => setDispute(null)}
        raisedBy={me}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* After: the returned, locked card                                    */
/* ------------------------------------------------------------------ */

function useNow(tickMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}

export function CardReturnedView({
  points,
  gross,
  netToPar,
  position,
  hidden,
  me = DEMO_USER_ID,
  correctionWindowMin = LIVE_TOURNAMENT.correctionWindowMin,
  clubShort = clubById(LIVE_TOURNAMENT.clubId).short,
  course = LIVE_COURSE,
}: {
  points: number;
  gross: number;
  netToPar: number;
  position: string;
  hidden: boolean;
  /** whose returned card this is; defaults to the demo user */
  me?: string;
  /** minutes a player may request a correction for, from this event's setup */
  correctionWindowMin?: number;
  /** short name of the club whose clubhouse the distance is measured from */
  clubShort?: string;
  /** the course being played, for the correction dialog's hole list */
  course?: Course;
}) {
  const cert = useRoundCerts()[me];
  const record = useSim((s) => {
    for (let i = s.auditLog.length - 1; i >= 0; i--) {
      const r = s.auditLog[i];
      if (r.kind === "card-returned" && r.playerId === me) return r;
    }
    return undefined;
  });
  const allCorrections = useSim((s) => s.corrections);
  const corrections = allCorrections.filter((c) => c.playerId === me);
  const now = useNow(1000);
  const [corrOpen, setCorrOpen] = useState(false);

  if (cert?.stage === "dq") {
    return (
      <div className="mt-6 rounded-2xl border border-red-flag/25 bg-red-wash p-6 text-center">
        <p className="font-serif text-xl text-red-flag">
          Disqualified · Rule 3.3b(3)
        </p>
        <p className="mx-auto mt-2 max-w-[280px] text-[14px] text-ink-soft">
          The Committee has ruled on your card. Speak to the tournament desk
          for the full reasoning.
        </p>
      </div>
    );
  }

  const certifiedAt = cert?.playerCertifiedAt ?? Date.now();
  // the window the club actually configured for this event, not the demo one
  const windowMin = correctionWindowMin ?? 15;
  const deadline = certifiedAt + windowMin * 60_000;
  const remaining = Math.max(0, deadline - now);
  const windowOpen = windowMin > 0 && remaining > 0;
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift"
    >
      <div className="p-6 text-center">
        <p className="smallcaps flex items-center justify-center gap-1.5 text-primary-foreground/50">
          <Lock className="size-3" />
          Card returned · locked
        </p>
        <p className="mt-3 font-serif text-5xl tnum">{points}</p>
        <p className="smallcaps mt-1 text-primary-foreground/50">points</p>
        <p className="mt-3 text-sm text-primary-foreground/70 tnum">
          {gross} gross · {toPar(netToPar)} net ·{" "}
          {hidden ? "position on the board" : position}
        </p>

        {/* integrity confirmation */}
        <div className="mx-auto mt-5 max-w-[300px] rounded-xl bg-white/5 px-4 py-3 text-left">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-clay-wash">
            <ShieldCheck className="size-4" />
            Integrity verified
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-primary-foreground/55 tnum">
            {record ? (
              <>
                Sealed {new Date(record.ts).toUTCString().replace("GMT", "UTC")}
                <br />
                SHA-256 {record.hash?.slice(0, 18)}…
                {record.distanceFromClubhouseM != null && (
                  <>
                    <br />
                    Signed {record.distanceFromClubhouseM.toLocaleString()} m
                    from the {clubShort} clubhouse
                  </>
                )}
              </>
            ) : (
              "Record written to the audit trail."
            )}
          </p>
        </div>

        {/* correction window */}
        {corrections.length > 0 && (
          <div className="mx-auto mt-3 max-w-[300px] text-left">
            {corrections.map((c) => (
              <p
                key={c.id}
                className="mt-1 flex items-center gap-1.5 text-[12px] text-primary-foreground/60"
              >
                {c.status === "pending" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Hole {c.holeIdx + 1} correction{" "}
                {c.status === "pending" ? "with the Committee" : c.status}
              </p>
            ))}
          </div>
        )}
        <AnimatePresence>
          {windowOpen && (
            <motion.div exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <button
                onClick={() => setCorrOpen(true)}
                className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-[13px] text-primary-foreground/75 transition-colors hover:bg-white/5 cursor-pointer"
              >
                <Clock className="size-3.5" />
                Request correction ·{" "}
                <span className="tnum">
                  {mm}:{String(ss).padStart(2, "0")}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <a
        href="/app/leaderboard"
        className="block border-t border-white/10 bg-clay py-3.5 text-center text-[15px] font-medium text-white transition-colors hover:bg-clay-deep"
      >
        See where you finish
      </a>

      <CorrectionDialog
        open={corrOpen}
        onOpenChange={setCorrOpen}
        me={me}
        course={course}
      />
    </motion.div>
  );
}

function CorrectionDialog({
  open,
  onOpenChange,
  me = DEMO_USER_ID,
  course = LIVE_COURSE,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  me?: string;
  course?: Course;
}) {
  const scores = useRoundScores()[me];
  const [hole, setHole] = useState("1");
  const [score, setScore] = useState("");
  const [why, setWhy] = useState("");
  const holeIdx = parseInt(hole, 10) - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request a correction</DialogTitle>
          <DialogDescription>
            Goes straight to the Committee. Your card stays locked until they
            decide.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Hole</Label>
            <Select value={hole} onValueChange={setHole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {course.holes.map((h) => (
                  <SelectItem key={h.hole} value={String(h.hole)}>
                    Hole {h.hole} · currently {scores?.[h.hole - 1] ?? "·"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Correct score</Label>
            <Input
              inputMode="numeric"
              value={score}
              onChange={(e) =>
                setScore(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
              }
              placeholder="e.g. 5"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Why</Label>
          <Input
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="e.g. We wrote the 12th in the 13th's box"
          />
        </div>
        <Button
          variant="clay"
          disabled={!score || why.trim().length < 8}
          onClick={() => {
            requestCorrection(
              me,
              holeIdx,
              parseInt(score, 10),
              why.trim(),
            );
            onOpenChange(false);
          }}
        >
          <PenLine className="size-4" />
          Send to the Committee
        </Button>
      </DialogContent>
    </Dialog>
  );
}
