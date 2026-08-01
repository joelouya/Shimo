"use client";

/**
 * TV mode.
 *
 * A public, read-only, landscape screen for a clubhouse: open the URL on
 * whatever the club has, walk away, and trust it for four hours. No session,
 * no controls, and no write path anywhere behind it.
 *
 * This file is the wiring only. What is true comes from the feed, what is
 * worth saying comes from the producer, and what it looks like comes from the
 * components. Keeping those three apart is what let the hard parts, all of
 * which are about timing, be tested without a browser.
 */

import { use, useEffect, useMemo, useReducer, useState } from "react";

import { TvBoard, TvEmpty, TvFrame } from "@/components/tv/board";
import { TvAnnouncement, playChime } from "@/components/tv/announcement";
import { TvFeature } from "@/components/tv/feature";
import { COURSES } from "@/lib/data";
import { accentOnDark, DEFAULT_ACCENT, normalizeHex } from "@/lib/contrast";
import { roundsOf } from "@/lib/rounds";
import { cumulativeStandings } from "@/lib/scoring";
import { isStale, useTvFeed } from "@/lib/tv/feed";
import { recordExposure } from "@/lib/sim/store";
import { initialState, modeOf, reduce } from "@/lib/tv/producer";
import type { ProducerEvent } from "@/lib/tv/producer";
import type { ProducerState, TvSnapshot } from "@/lib/tv/types";

/** The producer is a pure reducer, so React only has to hand it the time. */
function useProducer(snapshot: TvSnapshot | null) {
  const [state, dispatch] = useReducer(
    (s: ProducerState, e: ProducerEvent & { now: number }) => reduce(s, e, e.now),
    undefined,
    () => initialState(),
  );

  // feed it every snapshot the feed produces
  useEffect(() => {
    if (!snapshot) return;
    dispatch({ type: "snapshot", snapshot, now: Date.now() });
  }, [snapshot]);

  /*
   * Tick four times a second. The producer decides everything from the time it
   * is given, so this is only how often it is asked; it is not a frame loop and
   * does no work when nothing is due. Slower would make an announcement land up
   * to a second late off its slot, which is visible.
   */
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 250);
    return () => clearInterval(id);
  }, []);

  return state;
}

export default function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const feed = useTvFeed(id);
  const snapshot = feed.snapshot;
  const producer = useProducer(snapshot);

  /*
   * The chime, if the club has asked for one. Keyed off which announcement is
   * on screen rather than off the queue, so it sounds when the name appears
   * and not a moment before.
   */
  const soundingId = producer.playing?.type === "announcement" &&
    producer.playing.item.kind === "ace" &&
    producer.config.aceChime
      ? producer.playing.item.id
      : null;
  useEffect(() => {
    if (soundingId) playChime();
  }, [soundingId]);

  /*
   * How long the screen actually ran, reported as it goes rather than at the
   * end. A clubhouse television is switched off by someone pulling a plug or
   * closing a laptop, so an afternoon that never gets a clean shutdown still
   * has to count the four hours it was up. Every beat accounts for the
   * interval just elapsed, so the total can only ever undercount by one beat.
   *
   * Sixty seconds, because the claim is "it was on this screen for three and
   * a half hours" and a finer figure would be precision nobody asked for on a
   * connection that drops.
   */
  useEffect(() => {
    if (!id) return;
    const beat = 60;
    const t = setInterval(() => recordExposure(id, "tv", beat), beat * 1000);
    return () => clearInterval(t);
  }, [id]);

  // only for the staleness note; nothing else on this screen watches a clock
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const accent = useMemo(() => {
    const base = normalizeHex(snapshot?.identity.accent ?? "") ?? DEFAULT_ACCENT;
    // the club's colour has to carry on a dark field, which is rarely the same
    // value they picked for a cream one
    return accentOnDark(base);
  }, [snapshot?.identity.accent]);

  /*
   * The visible board is built from every figure posted, not only the settled
   * ones. A leaderboard showing a number a player has entered is doing its job;
   * it is announcements that must wait for agreement, and the producer keeps
   * its own stricter reading for those.
   */
  const rows = useMemo(() => {
    if (!snapshot) return [];
    const t = snapshot.tournament;
    const cards: Record<number, Record<string, (number | null)[]>> = {};
    for (const r of snapshot.rows ?? []) {
      if (r.source === "marker") continue; // a marker's copy is not published
      ((cards[r.round] ??= {})[r.playerId] ??= Array(18).fill(null))[r.hole] =
        r.gross;
    }
    return cumulativeStandings(
      snapshot.players,
      roundsOf(t).map((r) => ({
        round: r.number,
        scores: cards[r.number] ?? {},
        course: COURSES.find((c) => c.id === r.courseId) ?? snapshot.course,
      })),
      t.handicapAllowance,
      modeOf(snapshot),
      (rnd, pid) => ((snapshot.fieldByRound ?? {})[rnd] ?? []).includes(pid),
    ).filter((r) => r.thru > 0);
  }, [snapshot]);

  if (feed.status === "unconfigured") {
    return <Plain title="TV mode needs a connected club" />;
  }
  if (feed.status === "not-found") {
    return <Plain title="No such tournament" />;
  }
  if (!snapshot) {
    return <Plain title="Loading" />;
  }

  const stale = isStale(feed, now) || feed.status === "reconnecting";
  const playing = producer.playing;

  return (
    <TvFrame snapshot={snapshot} accent={accent} stale={stale}>
      {playing?.type === "announcement" ? (
        /*
         * Keyed by the item, so each announcement mounts fresh and replays its
         * entrance. Without the key, two in a row would have the second inherit
         * the first's finished animation and simply appear.
         */
        <TvAnnouncement
          key={playing.item.id}
          item={playing.item}
          accent={accent}
        />
      ) : playing?.type === "feature" ? (
        <TvFeature key={playing.item.id} item={playing.item} accent={accent} />
      ) : rows.length === 0 ? (
        <TvEmpty snapshot={snapshot} />
      ) : (
        <TvBoard
          snapshot={snapshot}
          rows={rows}
          mode={modeOf(snapshot)}
          accent={accent}
        />
      )}
    </TvFrame>
  );
}

/** The screen's only failure state, and it still looks like Shimo. */
function Plain({ title }: { title: string }) {
  return (
    <div className="tv-root">
      <div className="flex h-full items-center justify-center">
        <p className="font-serif text-[4cqw] text-[#f7f3ec]">{title}</p>
      </div>
    </div>
  );
}
