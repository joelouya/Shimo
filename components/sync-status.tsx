"use client";

import { CloudOff, RefreshCw } from "lucide-react";

import { useSyncStatus } from "@/lib/sim/hooks";
import { retryFailedOps, useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

/**
 * Quiet connectivity strip: shows only when something needs saying.
 * Offline -> "scores saved locally". Failed sync -> Retry, never a raw error.
 */
export function SyncStrip({ className }: { className?: string }) {
  const { online, pending, failed } = useSyncStatus();
  if (online && failed === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl bg-amber-wash px-4 py-2.5",
        className,
      )}
    >
      {!online ? (
        <>
          <CloudOff className="size-4 shrink-0 text-amber-flag" />
          <p className="flex-1 text-[13px] font-medium text-amber-flag">
            {pending > 0
              ? `Offline. ${pending} change${pending > 1 ? "s" : ""} queued`
              : "Offline. Changes saved locally"}
          </p>
          <span className="text-[11.5px] text-amber-flag/70">
            They&apos;ll sync when you&apos;re back
          </span>
        </>
      ) : (
        <>
          <RefreshCw className="size-4 shrink-0 text-amber-flag" />
          <p className="flex-1 text-[13px] font-medium text-amber-flag">
            {failed} update{failed > 1 ? "s" : ""} waiting to sync
          </p>
          <button
            onClick={retryFailedOps}
            className="rounded-lg border border-amber-flag/30 px-3 py-1 text-[12.5px] font-medium text-amber-flag transition-colors hover:bg-amber-flag/10 cursor-pointer"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}

function ago(ts: number) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m} min${m > 1 ? "s" : ""} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h > 1 ? "s" : ""} ago`;
}

/**
 * For the leaderboard: when offline, show the cached board with a gentle
 * freshness note instead of an error.
 */
export function LastUpdatedNote() {
  const { online, lastSyncedAt } = useSyncStatus();
  const lastEventTs = useSim((s) => s.events[0]?.ts ?? null);
  if (online) return null;
  const ts = lastSyncedAt ?? lastEventTs;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <CloudOff className="size-3.5" />
      Offline · showing the board as of {ts ? ago(ts) : "your last connection"}
    </p>
  );
}

/**
 * Attest resilience: if the attestation is stuck after retries, don't block
 * the golfer - suggest the screenshot fallback and let the club reconcile.
 */
export function AttestSyncNote() {
  const { online } = useSyncStatus();
  const attestOp = useSim((s) => {
    for (let i = s.outbox.length - 1; i >= 0; i--) {
      const o = s.outbox[i];
      if (o.kind === "entity" && o.payload.table === "certifications") return o;
    }
    return undefined;
  });
  if (!attestOp || attestOp.status === "synced") return null;
  return (
    <div className="mt-3 rounded-xl bg-amber-wash px-4 py-3 text-left">
      {attestOp.status === "pending" && !online ? (
        <p className="text-[12.5px] leading-relaxed text-amber-flag">
          You&apos;re offline. Your certification is saved and will sync when
          connection returns. Your round is done, enjoy the 19th.
        </p>
      ) : attestOp.status === "failed" ? (
        <div className="flex items-start gap-2.5">
          <p className="flex-1 text-[12.5px] leading-relaxed text-amber-flag">
            Your certification hasn&apos;t synced yet. Screenshot your card as a
            backup and carry on. The club can reconcile it at the desk.
          </p>
          <button
            onClick={retryFailedOps}
            className="shrink-0 rounded-lg border border-amber-flag/30 px-3 py-1 text-[12.5px] font-medium text-amber-flag hover:bg-amber-flag/10 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
