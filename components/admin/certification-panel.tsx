"use client";

/**
 * Certification & Disputes — the Committee's room.
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
import { useActiveTournament,
  useRoundScores,
  useRoundMarkerScores,
  useRoundCerts
} from "@/lib/sim/hooks";
import {
  decideCorrection,
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
            markCommitteeReview(d.playerId);
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

export function CertificationPanel() {
  const active = useActiveTournament();
  const certs = useRoundCerts();
  const scores = useRoundScores();
  const cardIn = useSim((s) => s.cardIn);
  const disputes = useSim((s) => s.disputes);
  const corrections = useSim((s) => s.corrections);
  const auditLog = useSim((s) => s.auditLog);
  const roster = useSim((s) => s.roster);

  const byId = useMemo(
    () => new Map(roster.map((p) => [p.id, p] as const)),
    [roster],
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-muted-foreground">
          {rows.filter((r) => r.stage === "certified").length} of {rows.length}{" "}
          cards certified
          {openDisputes.length > 0 &&
            ` · ${openDisputes.length} dispute${openDisputes.length > 1 ? "s" : ""} open`}
        </p>
        <Button variant="outline" onClick={exportAudit}>
          <Download className="size-4" />
          Export audit trail ({tournamentAudit.length} records)
        </Button>
      </div>

      {(openDisputes.length > 0 || pendingCorrections.length > 0) && (
        <div className="mt-5 flex flex-col gap-3">
          {openDisputes.map((d) => (
            <DisputeCard key={d.id} d={d} name={nameOf(d.playerId)} />
          ))}
          {pendingCorrections.map((c) => (
            <CorrectionCard key={c.id} c={c} name={nameOf(c.playerId)} />
          ))}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="grid grid-cols-[1.6fr_5rem_5rem_1.4fr_1fr] items-center gap-3 border-b border-border bg-secondary/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Player</span>
          <span className="text-center">Group</span>
          <span className="text-center">Thru</span>
          <span>Status</span>
          <span className="text-right">Certified at</span>
        </div>
        {rows.map(({ p, g, thru, cert, stage }) => (
          <div
            key={p.id}
            className="grid grid-cols-[1.6fr_5rem_5rem_1.4fr_1fr] items-center gap-3 border-b border-border/50 px-5 py-2.5 last:border-b-0"
          >
            <p className="truncate text-[14px] font-medium text-foreground">
              {p.name}
            </p>
            <p className="text-center text-[13px] text-muted-foreground tnum">
              {g.number}
            </p>
            <p className="text-center text-[13px] text-muted-foreground tnum">
              {thru >= 18 ? "F" : thru || "·"}
            </p>
            <div>
              <StageChip stage={stage} />
            </div>
            <p className="text-right text-[12px] text-muted-foreground tnum">
              {cert?.playerCertifiedAt
                ? new Date(cert.playerCertifiedAt).toLocaleTimeString("en-KE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "·"}
            </p>
          </div>
        ))}
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
