"use client";

/**
 * The producer panel.
 *
 * This is what someone from the club watches during a tournament, so it is
 * built to be read at a glance and acted on in one tap. What is on screen now,
 * what is waiting, what is being held back and why.
 *
 * It runs its own copy of the producer rather than reading the television's.
 * The producer is a pure function of the snapshot, the config and the time, so
 * two copies fed the same data independently reach the same conclusions: the
 * panel derives the same held announcements the screen is holding, without the
 * screen ever having to write anything down. Decisions go the other way, as
 * rows in tv_decisions that the television reads and folds in.
 *
 * The one thing this cannot mirror exactly is the moment-to-moment playback
 * clock, which is why the current-state line is phrased as what the panel
 * believes rather than as a live readout of the screen.
 */

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BellOff,
  BellRing,
  Check,
  ExternalLink,
  Radio,
  SkipForward,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allTournaments, useSim } from "@/lib/sim/store";
import { isStale, useTvFeed } from "@/lib/tv/feed";
import { initialState, reduce } from "@/lib/tv/producer";
import { decide } from "@/lib/tv/decide";
import type { ProducerEvent } from "@/lib/tv/producer";
import type {
  Announcement,
  ProducerState,
  TvSnapshot,
} from "@/lib/tv/types";

function useProducer(snapshot: TvSnapshot | null) {
  const [state, dispatch] = useReducer(
    (s: ProducerState, e: ProducerEvent & { now: number }) => reduce(s, e, e.now),
    undefined,
    () => initialState(),
  );
  useEffect(() => {
    if (snapshot) dispatch({ type: "snapshot", snapshot, now: Date.now() });
  }, [snapshot]);
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 500);
    return () => clearInterval(id);
  }, []);
  return state;
}

export default function ProducerPanel() {
  const created = useSim((s) => s.created);
  const deskName = useSim((s) => s.deskName);
  const live = allTournaments(created).find((t) => t.status === "live");
  const feed = useTvFeed(live?.id ?? "");
  const producer = useProducer(feed.snapshot);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const actor = deskName?.trim() || "the desk";
  const send = async (
    kind: Parameters<typeof decide>[1],
    opts?: { factKey?: string; payload?: Record<string, string | boolean> },
  ) => {
    if (!live) return;
    setBusy(kind + (opts?.factKey ?? ""));
    try {
      await decide(live.id, kind, { ...opts, actor });
    } finally {
      setBusy(null);
    }
  };

  const recent = useMemo(
    () => producer.history.filter((h) => h.at > now - 20 * 60_000).slice(0, 12),
    [producer.history, now],
  );

  if (!live) {
    return (
      <div>
        <Back />
        <p className="mt-8 font-serif text-2xl text-foreground">
          No tournament is live
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The producer panel follows the tournament in play. Start a tournament
          day and it will appear here.
        </p>
      </div>
    );
  }

  const quiet = producer.config.quiet;

  return (
    <div>
      <Back />

      <header className="mt-6 flex items-start justify-between">
        <div>
          <p className="smallcaps text-clay">TV producer</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">{live.name}</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournament/${live.id}/tv`} target="_blank">
            <ExternalLink className="size-4" />
            Open the screen
          </Link>
        </Button>
      </header>

      {/* what is happening now */}
      <section className="mt-7 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`size-2.5 rounded-full ${
                quiet ? "bg-stone" : "bg-clay"
              } ${quiet ? "" : "animate-pulse"}`}
            />
            <div>
              <p className="font-serif text-lg text-foreground">
                {quiet
                  ? "Quiet — the board only"
                  : producer.playing?.type === "announcement"
                    ? `On screen: ${producer.playing.item.headline}`
                    : producer.playing
                      ? `On screen: ${producer.playing.item.title}`
                      : "Leaderboard"}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {isStale(feed, now)
                  ? "The screen may be behind — reconnecting"
                  : `${producer.queue.length} waiting · ${producer.pending.length} held`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={quiet ? "clay" : "outline"}
              onClick={() => void send("quiet", { payload: { on: !quiet } })}
              disabled={busy !== null}
            >
              {quiet ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
              {quiet ? "Resume announcements" : "Go quiet"}
            </Button>
            {producer.playing && !quiet && (
              <Button variant="ghost" onClick={() => void send("skip")}>
                <SkipForward className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* held for a human */}
      {producer.pending.length > 0 && (
        <section className="mt-5">
          <p className="smallcaps text-amber-flag">
            Waiting for you · {producer.pending.length}
          </p>
          <div className="mt-3 space-y-3">
            {producer.pending.map((a) => (
              <PendingCard
                key={a.id}
                item={a}
                busy={busy}
                onApprove={() => void send("approve", { factKey: a.factKey })}
                onReject={() => void send("reject", { factKey: a.factKey })}
              />
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* the queue */}
        <section>
          <p className="smallcaps text-muted-foreground">Coming up</p>
          <div className="mt-3 space-y-2">
            {producer.queue.length === 0 ? (
              <Empty>Nothing waiting. The board is on.</Empty>
            ) : (
              [...producer.queue]
                .sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt)
                .map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-foreground">
                        {a.headline} — {a.subject}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {a.line ?? a.detail ?? ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void send("cancel", { factKey: a.factKey })}
                      disabled={busy !== null}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))
            )}
          </div>
        </section>

        {/* what has been on */}
        <section>
          <p className="smallcaps text-muted-foreground">Last twenty minutes</p>
          <div className="mt-3 space-y-1.5">
            {recent.length === 0 ? (
              <Empty>Nothing has been on screen yet.</Empty>
            ) : (
              recent.map((h, i) => (
                <div
                  key={`${h.at}-${i}`}
                  className="flex items-baseline justify-between px-1 text-[13px]"
                >
                  <span className="text-ink-soft">{h.text}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(h.at).toLocaleTimeString("en-KE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <Tools onSend={send} busy={busy} />
    </div>
  );
}

function PendingCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: Announcement;
  busy: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-flag/40 bg-amber-wash/40 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-flag" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-foreground">
            {item.headline} — {item.subject}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-soft">{item.holdReason}</p>
          {item.line && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{item.line}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onReject} disabled={busy !== null}>
          <X className="size-3.5" />
          Don&apos;t show it
        </Button>
        <Button variant="clay" size="sm" onClick={onApprove} disabled={busy !== null}>
          <Check className="size-3.5" />
          Put it on
        </Button>
      </div>
    </div>
  );
}

/** The two things that are needed rarely and must work first time. */
function Tools({
  onSend,
  busy,
}: {
  onSend: (
    kind: Parameters<typeof decide>[1],
    opts?: { factKey?: string; payload?: Record<string, string | boolean> },
  ) => void;
  busy: string | null;
}) {
  const [player, setPlayer] = useState("");
  return (
    <section className="mt-8 rounded-2xl border border-border bg-secondary/30 p-5">
      <p className="smallcaps text-muted-foreground">Rarely needed</p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <Button
            variant="outline"
            onClick={() => onSend("test")}
            disabled={busy !== null}
          >
            <Radio className="size-4" />
            Test the screen
          </Button>
          <p className="mt-1.5 max-w-[220px] text-[12px] text-muted-foreground">
            Puts a card up for four seconds, so you can check the television
            before anyone is watching.
          </p>
        </div>

        <div className="min-w-[280px] flex-1">
          <div className="flex gap-2">
            <Input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="Name of the player who should be congratulated"
            />
            <Button
              variant="outline"
              disabled={player.trim().length < 2 || busy !== null}
              onClick={() => {
                onSend("retract", { payload: { player: player.trim() } });
                setPlayer("");
              }}
            >
              Correct it
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            For the rare case where something already shown turns out to be
            wrong. The screen congratulates the right player a minute later. It
            never says the earlier moment was false, because the member who was
            congratulated by mistake is in the room.
          </p>
        </div>
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}

function Back() {
  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Dashboard
    </Link>
  );
}
