"use client";

/**
 * Leaderboard mode: the resting state, and the one the screen is in almost all
 * afternoon.
 *
 * Sized in `cqw` against a container query rather than in pixels, so the whole
 * composition scales from a 720p projector to a 4K panel without a single
 * breakpoint. A clubhouse television is whatever the club already owns, and
 * asking which one it is has never once produced a useful answer.
 *
 * The field scrolls only when it does not fit. A board that creeps when it had
 * no need to is the single most restless thing a screen can do, and this one
 * has to be watchable for four hours.
 */

import { SponsorStrip } from "@/components/sponsor-strip";
import type { CumulativeRow, ViewMode } from "@/lib/scoring";
import { toPar } from "@/lib/utils";
import type { TvSnapshot } from "@/lib/tv/types";

/**
 * How many rows fit before the board has to move to show the rest.
 *
 * Ten is what the frame holds at these sizes. It is also about the most a room
 * can take in at a glance, and the point past which a member scanning for
 * their own name stops scanning and starts waiting.
 */
const VISIBLE_ROWS = 10;
/** Seconds a full cycle of the scroll takes, per row beyond what fits. */
const SECONDS_PER_ROW = 3.2;

function scoreOf(r: CumulativeRow, mode: ViewMode) {
  if (mode === "points") return `${r.points}`;
  return toPar(mode === "net" ? r.netToPar : r.grossToPar);
}

export function TvBoard({
  snapshot,
  rows,
  mode,
  accent,
}: {
  snapshot: TvSnapshot;
  rows: CumulativeRow[];
  mode: ViewMode;
  accent: string;
}) {
  const scrolls = rows.length > VISIBLE_ROWS;
  const duration = (rows.length - VISIBLE_ROWS) * SECONDS_PER_ROW * 2;

  return (
    <div className="flex h-full flex-col">
      <div
        className={`min-h-0 flex-1 overflow-hidden${scrolls ? " tv-scroll-view" : ""}`}
      >
        <div
          className={scrolls ? "tv-scroll" : undefined}
          style={
            scrolls
              ? ({ ["--tv-scroll-seconds" as string]: `${duration}s` } as React.CSSProperties)
              : undefined
          }
        >
          {rows.map((r, i) => (
            <BoardRow
              key={r.player.id}
              row={r}
              mode={mode}
              accent={accent}
              leader={i === 0}
            />
          ))}
          {scrolls &&
            rows.map((r) => (
              <BoardRow
                key={`repeat-${r.player.id}`}
                row={r}
                mode={mode}
                accent={accent}
                leader={false}
              />
            ))}
        </div>
      </div>

      {snapshot.tournament.sponsors?.length ? (
        <div className="shrink-0 pt-[1cqw]">
          <SponsorStrip
            sponsors={snapshot.tournament.sponsors}
            tone="dark"
            showTitleLabel={false}
          />
        </div>
      ) : null}
    </div>
  );
}

function BoardRow({
  row,
  mode,
  accent,
  leader,
}: {
  row: CumulativeRow;
  mode: ViewMode;
  accent: string;
  leader: boolean;
}) {
  return (
    <div
      className="grid items-baseline border-b border-cream/10 py-[0.62cqw]"
      style={{ gridTemplateColumns: "4.4cqw 1fr 7cqw 8.5cqw" }}
    >
      <div
        className="font-serif text-[1.75cqw] tabular-nums"
        style={{ color: leader ? accent : "rgba(247,243,236,0.45)" }}
      >
        {row.tied ? `T${row.position}` : row.position}
      </div>
      <div className="flex items-baseline gap-[1cqw] truncate">
        <span
          className="truncate font-serif text-[2.05cqw] leading-none"
          style={{ color: leader ? accent : "#f7f3ec" }}
        >
          {row.player.name}
        </span>
        <span className="shrink-0 text-[1.02cqw] tracking-[0.14em] text-cream/35">
          {row.madeCut === false ? "MC" : `HC ${row.player.handicap}`}
        </span>
      </div>
      <div className="text-right text-[1.3cqw] tabular-nums text-cream/40">
        {row.thru >= 18 ? "F" : `${row.thru}`}
      </div>
      <div
        className="text-right font-serif text-[2.15cqw] tabular-nums"
        style={{ color: leader ? accent : "#f7f3ec" }}
      >
        {scoreOf(row, mode)}
      </div>
    </div>
  );
}

/**
 * The frame the board and every announcement sit inside: the club's picture,
 * darkened, with the event named above and the club and the time below.
 */
export function TvFrame({
  snapshot,
  accent,
  stale,
  children,
}: {
  snapshot: TvSnapshot;
  accent: string;
  stale: boolean;
  children: React.ReactNode;
}) {
  const bg = snapshot.identity.tvBackgroundUrl;
  return (
    <div className="tv-root" style={{ ["--tv-accent" as string]: accent }}>
      {bg ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bg})` }}
        />
      ) : null}
      {/*
        Two layers rather than one. A flat scrim over a photograph leaves the
        top of the screen, where the title sits, as washed out as the bottom;
        weighting it downward keeps the picture legible as a picture while the
        text stays on a field dark enough to read against.
      */}
      <div aria-hidden className="absolute inset-0 bg-broadcast-ink/82" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(16,23,34,0.55), rgba(16,23,34,0.9) 55%, rgba(16,23,34,0.97))",
        }}
      />

      <div className="relative flex h-full flex-col px-[4cqw] py-[2.4cqw]">
        <header className="flex shrink-0 items-start justify-between">
          <div className="w-[22cqw]" />
          <div className="text-center">
            <p
              className="text-[1.1cqw] font-semibold uppercase tracking-[0.42em]"
              style={{ color: accent }}
            >
              {snapshot.tournament.format}
              {snapshot.round > 1 ? ` · Round ${snapshot.round}` : ""}
            </p>
            <h1 className="mt-[0.55cqw] font-serif text-[2.7cqw] leading-none text-[#f7f3ec]">
              {snapshot.tournament.name}
            </h1>
            <p className="mt-[0.45cqw] text-[1.1cqw] text-cream/45">
              {snapshot.course.name}
            </p>
          </div>
          <div className="flex w-[22cqw] justify-end">
            {stale ? <Reconnecting /> : null}
          </div>
        </header>

        <main className="min-h-0 flex-1 pt-[1.8cqw]">{children}</main>

        <footer className="flex shrink-0 items-end justify-between pt-[1.1cqw]">
          <div className="flex items-center gap-[1.2cqw]">
            {snapshot.identity.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={snapshot.identity.logoUrl}
                alt=""
                className="h-[3cqw] w-[3cqw] object-contain"
              />
            ) : null}
            <span className="text-[1.05cqw] font-semibold uppercase tracking-[0.3em] text-cream/40">
              {snapshot.tournament.clubId}
            </span>
          </div>
          <span className="text-[1.05cqw] tracking-[0.2em] text-cream/25">
            shimo.golf
          </span>
        </footer>
      </div>
    </div>
  );
}

/**
 * The one thing on screen that admits to a problem, and it is deliberately the
 * quietest thing on it. The room should be able to notice it and carry on.
 */
function Reconnecting() {
  return (
    <div className="flex items-center gap-[0.7cqw] text-[1.05cqw] tracking-[0.18em] text-cream/40">
      <span className="tv-pulse block h-[0.6cqw] w-[0.6cqw] rounded-full bg-cream/50" />
      RECONNECTING
    </div>
  );
}

/** Before anyone has posted a figure. */
export function TvEmpty({ snapshot }: { snapshot: TvSnapshot }) {
  const first = snapshot.tournament.firstTee;
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-[1.2cqw] font-semibold uppercase tracking-[0.4em] text-cream/35">
        Tee off
      </p>
      <p className="mt-[1.2cqw] font-serif text-[7cqw] leading-none text-[#f7f3ec]">
        {first}
      </p>
      <p className="mt-[1.6cqw] text-[1.6cqw] text-cream/45">
        {snapshot.players.length} players · {snapshot.course.name} · par{" "}
        {snapshot.course.par}
      </p>
    </div>
  );
}
