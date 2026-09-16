"use client";

/**
 * Certification & Disputes - the Committee's room.
 *
 * Live certification status for the whole field, dispute resolution under
 * Rule 3.3b (accept a figure, set a Committee score, or DQ), correction
 * decisions, and a one-click audit trail export: the equivalent of a
 * DocuSign Certificate of Completion for the tournament.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Download,
  FileWarning,
  Lock,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { ListRow, MasterDetail } from "@/components/admin/master-detail";
import { Segmented } from "@/components/admin/segmented";
import { PlayerAvatar } from "@/components/player/identity";
import { Badge } from "@/components/ui/badge";
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
import { auditTrailCsv } from "@/lib/integrity";
import { useTournamentView } from "@/lib/sim/hooks";
import { findCourse } from "@/lib/data";
import { roundKey } from "@/lib/rounds";
import {
  decideCorrection,
  deskAttest,
  markCommitteeReview,
  resolveDispute,
  setAdminPin,
  useSim,
  type CertStage,
  type CorrectionRequest,
  type Dispute,
} from "@/lib/sim/store";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */

const STAGE_LABEL: Record<CertStage, string> = {
  "in-progress": "In progress",
  "awaiting-marker": "Awaiting marker cert",
  "awaiting-player": "Awaiting player cert",
  certified: "Certified",
  disputed: "Disputed",
  "committee-review": "Under Committee review",
  dq: "DQ · Rule 3.3b(3)",
};

function StageChip({ stage }: { stage: CertStage | "card-in-paper" }) {
  if (stage === "card-in-paper")
    return (
      <Badge variant="claySoft">
        <Check className="size-3" /> Card in · paper
      </Badge>
    );
  if (stage === "certified")
    return (
      <Badge variant="claySoft">
        <Lock className="size-3" /> Certified
      </Badge>
    );
  if (stage === "disputed" || stage === "committee-review")
    return <Badge variant="amber">{STAGE_LABEL[stage]}</Badge>;
  if (stage === "dq") return <Badge variant="red">{STAGE_LABEL[stage]}</Badge>;
  return <Badge variant="outline">{STAGE_LABEL[stage]}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Admin PIN + reason gate, shared by dispute + correction decisions   */
/* ------------------------------------------------------------------ */

function CommitteeGate({
  onConfirm,
  confirmLabel,
  destructive,
  disabled,
}: {
  onConfirm: (reason: string) => void;
  confirmLabel: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const adminPin = useSim((s) => s.adminPin);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const settingUp = !adminPin;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Committee reason, recorded in the audit trail</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Both players re-walked the hole with the starter"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>
          {settingUp ? "Set the Committee PIN (first use)" : "Committee PIN"}
        </Label>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPinError(false);
            setPin(e.target.value.replace(/[^0-9]/g, ""));
          }}
          placeholder="••••"
          className="w-28 text-center tracking-[0.4em]"
        />
        {pinError && (
          <p className="text-[12.5px] text-red-flag">Wrong PIN.</p>
        )}
      </div>
      <Button
        variant={destructive ? "destructive" : "clay"}
        disabled={disabled || reason.trim().length < 8 || pin.length !== 4}
        onClick={() => {
          if (settingUp) setAdminPin(pin);
          else if (pin !== adminPin) {
            setPinError(true);
            return;
          }
          onConfirm(reason.trim());
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dispute resolution                                                  */
/* ------------------------------------------------------------------ */

function DisputeCard({ d, name }: { d: Dispute; name: string }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"marker" | "player" | "committee" | "dq">(
    "marker",
  );
  const [committeeScore, setCommitteeScore] = useState("");

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-2xl border border-amber-flag/25 bg-amber-wash/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium text-foreground">
            <Scale className="size-4 text-amber-flag" />
            {name} · hole {d.holeIdx + 1}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            &ldquo;{d.reason}&rdquo;
          </p>
          <div className="mt-2.5 flex gap-2">
            <span className="rounded-lg bg-card px-3 py-1.5 text-[13px] tnum">
              Marker&apos;s record: <strong>{d.markerValue ?? "·"}</strong>
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                {fmtTime(d.markerEnteredAt)}
              </span>
            </span>
            <span className="rounded-lg bg-card px-3 py-1.5 text-[13px] tnum">
              Player&apos;s entry: <strong>{d.playerValue ?? "·"}</strong>
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                {fmtTime(d.playerEnteredAt)}
              </span>
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            markCommitteeReview(d.id);
            setOpen(true);
          }}
        >
          Resolve
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve dispute · {name}, hole {d.holeIdx + 1}</DialogTitle>
            <DialogDescription>
              The Committee&apos;s decision is final and appends to the audit
              trail. The original entries are never overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {(
              [
                { k: "marker", label: `Accept the marker's ${d.markerValue}` },
                { k: "player", label: `Accept the player's ${d.playerValue}` },
                { k: "committee", label: "Enter a Committee-approved score" },
                { k: "dq", label: "Disqualify under Rule 3.3b(3)" },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                onClick={() => setChoice(o.k)}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-xl border px-4 text-left text-[14px] transition-colors cursor-pointer",
                  choice === o.k
                    ? o.k === "dq"
                      ? "border-red-flag/50 bg-red-wash text-red-flag"
                      : "border-clay bg-clay-wash/60 text-foreground"
                    : "border-border text-ink-soft hover:border-stone/50",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full border-2",
                    choice === o.k
                      ? o.k === "dq"
                        ? "border-red-flag bg-red-flag"
                        : "border-clay bg-clay"
                      : "border-border",
                  )}
                />
                {o.label}
              </button>
            ))}
            {choice === "committee" && (
              <Input
                inputMode="numeric"
                value={committeeScore}
                onChange={(e) =>
                  setCommitteeScore(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
                }
                placeholder="Committee score for the hole"
                className="w-56"
              />
            )}
          </div>
          <CommitteeGate
            confirmLabel={
              choice === "dq" ? "Disqualify and record" : "Apply and re-certify"
            }
            destructive={choice === "dq"}
            disabled={choice === "committee" && !committeeScore}
            onConfirm={async (reason) => {
              await resolveDispute(d.id, {
                kind: choice,
                score: committeeScore ? parseInt(committeeScore, 10) : undefined,
                reason,
              });
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Correction decisions                                                */
/* ------------------------------------------------------------------ */

function CorrectionCard({ c, name }: { c: CorrectionRequest; name: string }) {
  const [open, setOpen] = useState(false);
  const [approve, setApprove] = useState(true);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium text-foreground">
            <FileWarning className="size-4 text-stone" />
            {name} · correction, hole {c.holeIdx + 1}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {c.currentGross} → <strong>{c.proposedGross}</strong> ·
            &ldquo;{c.reason}&rdquo;
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Decide
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Correction · {name}, hole {c.holeIdx + 1}
            </DialogTitle>
            <DialogDescription>
              Requested inside the correction window. Approving changes the
              score and appends a fresh integrity record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <button
              onClick={() => setApprove(true)}
              className={cn(
                "min-h-11 flex-1 rounded-xl border text-[14px] cursor-pointer",
                approve
                  ? "border-clay bg-clay-wash/60"
                  : "border-border text-muted-foreground",
              )}
            >
              Approve {c.currentGross} → {c.proposedGross}
            </button>
            <button
              onClick={() => setApprove(false)}
              className={cn(
                "min-h-11 flex-1 rounded-xl border text-[14px] cursor-pointer",
                !approve
                  ? "border-clay bg-clay-wash/60"
                  : "border-border text-muted-foreground",
              )}
            >
              Reject
            </button>
          </div>
          <CommitteeGate
            confirmLabel={approve ? "Approve correction" : "Reject correction"}
            onConfirm={async (reason) => {
              await decideCorrection(c.id, approve, reason);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The card as the Committee reads it: the player's own figures over the
 * marker's, nine and nine, a difference marked in amber. The pars sit above
 * so a figure can be judged without the printed card in hand.
 */
function HoleGrid({
  own,
  marker,
  pars,
}: {
  own: (number | null)[];
  marker: (number | null)[];
  pars: number[];
}) {
  const nine = (from: number) => (
    <div className="grid grid-cols-[4rem_repeat(9,minmax(0,1fr))] gap-y-1 text-center">
      <span className="smallcaps self-center pl-1 text-left text-[9px] text-muted-foreground">
        {from === 0 ? "Out" : "In"}
      </span>
      {pars.slice(from, from + 9).map((par, i) => (
        <span key={`h${i}`} className="text-[10px] text-muted-foreground tnum">
          {from + i + 1}
          <span className="ml-0.5 text-[9px]">({par})</span>
        </span>
      ))}
      <span className="smallcaps self-center pl-1 text-left text-[9px] text-foreground">Player</span>
      {Array.from({ length: 9 }, (_, i) => {
        const o = own[from + i];
        const m = marker[from + i];
        const differs = o != null && m != null && o !== m;
        return (
          <span
            key={`o${i}`}
            className={cn(
              "mx-auto flex size-7 items-center justify-center rounded-md text-[13px] font-medium tnum",
              differs ? "bg-amber-wash text-amber-flag" : o == null ? "text-muted-foreground" : "bg-secondary text-foreground",
            )}
          >
            {o ?? "·"}
          </span>
        );
      })}
      <span className="smallcaps self-center pl-1 text-left text-[9px] text-muted-foreground">Marker</span>
      {Array.from({ length: 9 }, (_, i) => {
        const o = own[from + i];
        const m = marker[from + i];
        const differs = o != null && m != null && o !== m;
        return (
          <span
            key={`m${i}`}
            className={cn(
              "mx-auto flex size-7 items-center justify-center rounded-md text-[13px] tnum",
              differs ? "bg-amber-wash text-amber-flag" : m == null ? "text-muted-foreground" : "text-ink-soft",
            )}
          >
            {m ?? "·"}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="space-y-3 rounded-xl bg-card p-3 shadow-card">
      {nine(0)}
      <div className="h-px bg-border/70" />
      {nine(9)}
    </div>
  );
}

const EMPTY_MAP = {} as const;

export function CertificationPanel({
  tournamentId,
  round,
}: {
  /** which event; the live one when absent */
  tournamentId?: string;
  /** which round; the live round when absent */
  round?: number;
} = {}) {
  const liveId = useSim((s) => s.liveTournamentId);
  const liveRound = useSim((s) => s.liveRound);
  const viewId = tournamentId ?? liveId;
  const viewRound = round ?? liveRound ?? 1;
  const active = useTournamentView(viewId, viewRound);
  const key = viewId ? roundKey(viewId, viewRound) : "";
  const certs = useSim((s) => (key ? (s.certifications[key] ?? EMPTY_MAP) : EMPTY_MAP)) as Record<string, { stage: CertStage; markerAttestedAt?: number; playerCertifiedAt?: number; lockedHash?: string }>;
  const scores = useSim((s) => (key ? (s.scores[key] ?? EMPTY_MAP) : EMPTY_MAP)) as Record<string, (number | null)[]>;
  // keyed by round: a whole-map read here used to index the wrong level and
  // never showed a paper card as in
  const cardIn = useSim((s) => (key ? (s.cardIn[key] ?? EMPTY_MAP) : EMPTY_MAP)) as Record<string, boolean>;
  const markerScores = useSim((s) => (key ? (s.markerScores[key] ?? EMPTY_MAP) : EMPTY_MAP)) as Record<string, (number | null)[]>;
  const [seg, setSeg] = useState<"all" | "open" | "held" | "certified">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allDisputes = useSim((s) => s.disputes);
  const allCorrections = useSim((s) => s.corrections);
  // this event's items only: a dispute from last month must not appear in
  // today's room, or be resolved into today's card
  const disputes = useMemo(
    () => allDisputes.filter((d) => d.tournamentId === viewId),
    [allDisputes, viewId],
  );
  const corrections = useMemo(
    () => allCorrections.filter((c) => c.tournamentId === viewId),
    [allCorrections, viewId],
  );
  const auditLog = useSim((s) => s.auditLog);
  const roster = useSim((s) => s.roster);
  const guests = useSim((s) => s.guests);

  /*
   * Guests as well as members. An audit record stores an id, which is right,
   * because an id is stable and a name is not. What has to resolve is the
   * export, and this was building its lookup from the roster alone: on a
   * corporate day that meant the CSV a Committee opens during a dispute
   * printed g-mse9cro8-mzteeg for half the field.
   */
  const byId = useMemo(
    () => new Map([...roster, ...guests].map((p) => [p.id, p] as const)),
    [roster, guests],
  );
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  const rows = useMemo(() => {
    if (!active) return [];
    return active.groups.flatMap((g) =>
      g.playerIds
        .map((pid) => byId.get(pid))
        .filter((p): p is Player => Boolean(p))
        .map((p) => {
          const thru = (scores[p.id] ?? []).filter((x) => x != null).length;
          const cert = certs[p.id];
          const stage: CertStage | "card-in-paper" = cert
            ? cert.stage
            : cardIn[p.id]
              ? "card-in-paper"
              : thru >= 18
                ? "awaiting-marker"
                : "in-progress";
          return { p, g, thru, cert, stage };
        }),
    );
  }, [active, byId, scores, certs, cardIn]);

  if (!active) return null;

  const openDisputes = disputes.filter((d) => d.status === "open");
  const pendingCorrections = corrections.filter((c) => c.status === "pending");
  const tournamentAudit = auditLog.filter(
    (r) => r.tournamentId === active.tournament.id,
  );

  const exportAudit = () => {
    const csv = auditTrailCsv(tournamentAudit, nameOf);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shimo-audit-${active.tournament.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const heldIds = new Set([
    ...openDisputes.map((d) => d.playerId),
    ...pendingCorrections.map((c) => c.playerId),
  ]);
  const isHeld = (r: (typeof rows)[number]) =>
    heldIds.has(r.p.id) || r.stage === "disputed" || r.stage === "committee-review";
  const isOpen = (r: (typeof rows)[number]) =>
    r.stage === "in-progress" || r.stage === "awaiting-marker" || r.stage === "awaiting-player" || r.stage === "card-in-paper";
  const shown = rows.filter((r) =>
    seg === "all" ? true : seg === "held" ? isHeld(r) : seg === "certified" ? r.stage === "certified" : isOpen(r) && !isHeld(r),
  );
  // the card the Committee is reading: the chosen one, else the first held,
  // else the first still open
  const chosen =
    rows.find((r) => r.p.id === selectedId) ?? rows.find(isHeld) ?? rows.find(isOpen) ?? rows[0] ?? null;
  const pars = (findCourse(active.roundInfo.courseId) ?? findCourse(active.tournament.courseId))?.holes.map((h) => h.par) ?? Array(18).fill(4);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Which cards"
          size="sm"
          value={seg}
          onChange={setSeg}
          items={[
            { value: "all", label: "All", count: rows.length },
            { value: "open", label: "Open", count: rows.filter((r) => isOpen(r) && !isHeld(r)).length },
            { value: "held", label: "Held", count: rows.filter(isHeld).length, attention: rows.some(isHeld) },
            { value: "certified", label: "Certified", count: rows.filter((r) => r.stage === "certified").length },
          ]}
        />
        <Button variant="outline" size="sm" onClick={exportAudit}>
          <Download className="size-4" />
          Export audit trail ({tournamentAudit.length})
        </Button>
      </div>

      <div className="mt-4">
        <MasterDetail
          listWidth={340}
          list={
            <div className="overflow-hidden rounded-2xl bg-card shadow-card">
              {shown.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">Nothing here.</p>
              )}
              {shown.map(({ p, g, thru, stage }) => {
                const sel = chosen?.p.id === p.id;
                const held = heldIds.has(p.id) || stage === "disputed" || stage === "committee-review";
                return (
                  <ListRow key={p.id} selected={sel} onSelect={() => setSelectedId(p.id)}>
                    <PlayerAvatar player={p} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{p.name}</span>
                      <span className={cn("block truncate text-[11px]", sel ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        Group {g.number} · {thru >= 18 ? "F" : thru ? `thru ${thru}` : "not started"}
                        {" · "}
                        {stage === "card-in-paper" ? "card in" : STAGE_LABEL[stage as CertStage] ?? stage}
                      </span>
                    </span>
                    {held ? (
                      <Scale className="size-3.5 shrink-0 text-amber-flag" />
                    ) : stage === "certified" ? (
                      <Lock className={cn("size-3.5 shrink-0", sel ? "text-cream/70" : "text-clay-deep")} />
                    ) : null}
                  </ListRow>
                );
              })}
            </div>
          }
          detail={
            chosen ? (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                  <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar player={chosen.p} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate font-serif text-[22px] leading-tight text-foreground">{chosen.p.name}</p>
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          Group {chosen.g.number} · HC {chosen.p.handicap} ·{" "}
                          {chosen.thru >= 18 ? "Finished" : chosen.thru ? `thru ${chosen.thru}` : "Not started"}
                        </p>
                        <div className="mt-2">
                          <StageChip stage={chosen.stage} />
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                      {chosen.stage === "awaiting-marker" && chosen.thru >= 18 && (
                        /*
                          The marker's phone died, or they left: the desk keeps
                          the paper card and attests in their place, recorded
                          as the desk.
                        */
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deskAttest(chosen.p.id)}
                          title="Attest this card at the desk, in place of the marker"
                        >
                          Attest at desk
                        </Button>
                      )}
                      {chosen.cert?.markerAttestedAt && (
                        <p className="text-[11.5px] text-muted-foreground tnum">
                          Attested {new Date(chosen.cert.markerAttestedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      {chosen.cert?.playerCertifiedAt && (
                        <p className="text-[11.5px] text-muted-foreground tnum">
                          Certified {new Date(chosen.cert.playerCertifiedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      {/*
                        The seal made visible. A certified card carries a
                        SHA-256 lock; its head, in the monospaced form the
                        returned-card hero uses, is the desk's proof the card
                        is sealed and closed.
                      */}
                      {chosen.stage === "certified" && chosen.cert?.lockedHash && (
                        <p className="font-mono text-[10px] leading-none text-stone tnum" title={`Sealed · ${chosen.cert.lockedHash}`}>
                          seal {chosen.cert.lockedHash.slice(0, 16)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-border/60 bg-secondary/30 p-4">
                    <HoleGrid
                      own={scores[chosen.p.id] ?? []}
                      marker={markerScores[chosen.p.id] ?? []}
                      pars={pars}
                    />
                  </div>
                </div>
                {openDisputes.filter((d) => d.playerId === chosen.p.id).map((d) => (
                  <DisputeCard key={d.id} d={d} name={nameOf(d.playerId)} />
                ))}
                {pendingCorrections.filter((c) => c.playerId === chosen.p.id).map((c) => (
                  <CorrectionCard key={c.id} c={c} name={nameOf(c.playerId)} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
                No cards in this round yet.
              </div>
            )
          }
        />
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Every certification is sealed with a SHA-256 hash, UTC timestamp,
        device fingerprint, and sign-off location. Committee actions only ever
        append, so the originals are never overwritten.
      </p>
    </div>
  );
}
