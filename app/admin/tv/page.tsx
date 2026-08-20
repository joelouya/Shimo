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
  Check,
  ExternalLink,
  Radio,
  SkipForward,
  TriangleAlert,
  Trophy,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allTournaments, useSim } from "@/lib/sim/store";
import { isStale, useTvFeed } from "@/lib/tv/feed";
import { initialState, reduce } from "@/lib/tv/producer";
import { decide } from "@/lib/tv/decide";
import { COVERAGE_HELP, COVERAGE_LABEL, recordClaims } from "@/lib/tv/profile";
import { settledHoles } from "@/lib/tv/trust";
import { clubIdentityOf, setClubIdentity } from "@/lib/sim/store";
import { roundsOf } from "@/lib/rounds";
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

  /*
   * A settled card that beats the club's stored record. Offered rather than
   * applied: Shimo has one afternoon's view of a course the club has played
   * for eighty years, and a record that looks beaten is more often one nobody
   * updated when the tees moved than it is history being made.
   */
  const claims = useMemo(() => {
    const snap = feed.snapshot;
    if (!snap) return [];
    const round = roundsOf(snap.tournament).find((r) => r.number === snap.round);
    // the panel's own clock, not Date.now(): reading it here would make the
    // memo impure, and settling genuinely does depend on the passage of time
    const settled = settledHoles(
      snap.rows ?? [],
      snap.published ?? {},
      producer.config,
      now,
    );
    const byPlayer = new Map<string, number[]>();
    for (const h of settled) {
      const arr = byPlayer.get(h.playerId) ?? [];
      arr.push(h.gross);
      byPlayer.set(h.playerId, arr);
    }
    return recordClaims({
      cards: [...byPlayer.entries()].map(([playerId, gs]) => ({
        playerId,
        strokes: gs.reduce((a, b) => a + b, 0),
        complete: gs.length === 18,
      })),
      nameOf: (id) => snap.players.find((p) => p.id === id)?.name ?? id,
      courseId: snap.course.id,
      tee: round?.tees ?? snap.course.tees,
      records: snap.records ?? [],
    });
  }, [feed.snapshot, producer.config, now]);

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

  const coverage = producer.config.coverage;
  const quiet = coverage === "quiet";

  return (
    <div>
      <Back />

      <header className="mt-6 flex items-start justify-between">
        <div>
          <p className="smallcaps text-muted-foreground">TV producer</p>
          <h1 className="mt-2 font-serif text-[clamp(30px,3.4vw,40px)] font-medium tracking-[-0.012em] text-foreground">{live.name}</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournament/${live.id}/tv`} target="_blank">
            <ExternalLink className="size-4" />
            Open the screen
          </Link>
        </Button>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        {/* the operator console */}
        <div className="min-w-0">
      {/* what is happening now */}
      <section className="rounded-2xl border border-border bg-card p-5">
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
                  ? "Quiet. The board only"
                  : producer.playing?.type === "announcement"
                    ? `On screen: ${producer.playing.item.headline}`
                    : producer.playing
                      ? `On screen: ${producer.playing.item.title}`
                      : "Leaderboard"}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {isStale(feed, now)
                  ? "The screen may be behind. Reconnecting"
                  : `${COVERAGE_HELP[coverage]} · ${producer.queue.length} waiting · ${producer.pending.length} held`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Two modes: the calm board, or the board with interludes. The
                moments engine (reduced/full) stays wired in the producer but is
                not offered here yet. A stored reduced/full reads as Standard so
                the control never shows nothing selected. */}
            <div className="flex rounded-xl border border-border bg-secondary/40 p-1">
              {(["quiet", "standard"] as const).map((level) => {
                const active =
                  level === "quiet" ? quiet : !quiet;
                return (
                  <button
                    key={level}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void send("coverage", { payload: { level } })}
                    title={COVERAGE_HELP[level]}
                    className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                      active
                        ? "bg-card font-medium text-foreground shadow-card"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {COVERAGE_LABEL[level]}
                  </button>
                );
              })}
            </div>
            {producer.playing && !quiet && (
              <Button variant="ghost" onClick={() => void send("skip")}>
                <SkipForward className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {claims.length > 0 && (
        <section className="mt-5">
          <p className="smallcaps text-muted-foreground">Your books</p>
          <div className="mt-3 space-y-3">
            {claims.map((c) => (
              <RecordClaimCard key={`${c.courseId}-${c.tee}`} claim={c} clubId={live.clubId} />
            ))}
          </div>
        </section>
      )}

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
                        {a.headline} · {a.subject}
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

        {/*
         * The screen itself, at desk scale. Not a thumbnail: the real TV route
         * in an iframe, so the preview is the clubhouse output rather than a
         * drawing of it. The board is sized entirely in container-query units,
         * so it composes to whatever the iframe viewport is, this desk panel
         * included, with no special preview code behind it.
         */}
        <aside className="lg:sticky lg:top-6">
          <p className="smallcaps text-muted-foreground">
            This is what the clubhouse sees now
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-broadcast-ink shadow-card">
            <div className="aspect-video w-full">
              {feed.snapshot ? (
                <iframe
                  title="Clubhouse screen, live"
                  src={`/tournament/${live.id}/tv`}
                  loading="lazy"
                  className="h-full w-full border-0"
                />
              ) : (
                /*
                 * The screen is driven by the connected club's live feed. Until
                 * that is flowing, the desk sees the frame it will fill rather
                 * than a fetch error, so the preview reads as waiting, not broken.
                 */
                <div className="flex h-full flex-col items-center justify-center gap-2.5 px-8 text-center">
                  <span className="size-2 rounded-full bg-clay-lift/70" />
                  <p className="font-serif text-[19px] leading-snug text-cream/85">
                    The clubhouse screen appears here
                  </p>
                  <p className="text-[13px] text-cream/45">
                    Live once the connected club is scoring
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${quiet ? "bg-stone" : "bg-clay"}`}
            />
            {quiet ? "Quiet. The board only" : "Live. The board, with interludes"}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * "Shimo has recorded a lower score than your stored record."
 *
 * A question, never a change. Dismissing it is as legitimate an answer as
 * accepting it, and phrased so that it reads that way.
 */
function RecordClaimCard({
  claim,
  clubId,
}: {
  claim: ReturnType<typeof recordClaims>[number];
  clubId: string;
}) {
  const identity = useSim((s) => clubIdentityOf(s, clubId));
  const [done, setDone] = useState<"kept" | "updated" | null>(null);

  if (done) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        {done === "updated"
          ? `Course record updated to ${claim.strokes}, ${claim.holder}.`
          : "Left as it was."}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-gold/40 bg-amber-wash/30 p-4">
      <div className="flex items-start gap-3">
        <Trophy className="mt-0.5 size-4 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-foreground">
            {`Shimo has recorded a ${claim.strokes} off the ${claim.tee} tees`}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {claim.previous
              ? `${claim.holder} today, against ${claim.previous.strokes} by ${claim.previous.holder} in ${claim.previous.year} on your books.`
              : `${claim.holder} today.`}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Nothing changes unless you say so, and nothing about this has been
            on the screen.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDone("kept")}>
          Leave it
        </Button>
        <Button
          variant="clay"
          size="sm"
          onClick={() => {
            const others = (identity.courseRecords ?? []).filter(
              (r) => !(r.courseId === claim.courseId && r.tee === claim.tee),
            );
            setClubIdentity(clubId, {
              courseRecords: [
                ...others,
                {
                  courseId: claim.courseId,
                  tee: claim.tee,
                  strokes: claim.strokes,
                  holder: claim.holder,
                  year: new Date().getFullYear(),
                },
              ],
            });
            setDone("updated");
          }}
        >
          <Check className="size-3.5" />
          Update the record
        </Button>
      </div>
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
            {item.headline} · {item.subject}
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
