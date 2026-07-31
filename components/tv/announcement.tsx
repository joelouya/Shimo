"use client";

/**
 * Announcements.
 *
 * The brief was that typography does the drama: a lead change is dramatic
 * because "New leader" appears very large and very quietly, not because
 * anything explodes. So there is one shell here and the templates differ in
 * what they emphasise, not in how they behave. Every one of them rises from
 * below over the same curve, holds, and goes.
 *
 * These read an `Announcement` and nothing else. The producer has already
 * decided this is true, that it is worth saying, and how long it gets; by the
 * time anything reaches this file there are no decisions left, only setting.
 */

import type { Announcement } from "@/lib/tv/types";

/** One line of the cascade. `i` is its place in it. */
function Rise({
  i = 0,
  className,
  children,
}: {
  i?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`tv-rise ${className ?? ""}`}
      style={{ ["--i" as string]: i }}
    >
      {children}
    </div>
  );
}

export function TvAnnouncement({
  item,
  accent,
}: {
  item: Announcement;
  accent: string;
}) {
  const ace = item.kind === "ace";
  const record = item.kind === "course-record";
  // The rare things get more room. Everything else shares one size, because a
  // board where every moment is the biggest moment has no biggest moment.
  const nameSize = ace || record ? "8.4cqw" : "6.6cqw";

  return (
    <div className="tv-veil absolute inset-0 flex flex-col justify-center px-[8cqw]">
      {ace ? <Flecks accent={accent} /> : null}

      {item.kind === "lead-change" && item.outgoing ? (
        <div className="tv-yield mb-[1cqw] font-serif text-[3cqw] leading-none text-cream/50 line-through decoration-cream/30 decoration-[0.12cqw]">
          {item.outgoing}
        </div>
      ) : null}

      <Rise i={0}>
        <p
          className="text-[1.5cqw] font-semibold uppercase tracking-[0.44em]"
          style={{ color: accent }}
        >
          {item.headline}
        </p>
      </Rise>

      <Rise i={1} className="mt-[1.4cqw]">
        <h2
          className="font-serif leading-[0.98] text-[#f7f3ec]"
          style={{ fontSize: nameSize, letterSpacing: "-0.02em" }}
        >
          {item.subject}
        </h2>
      </Rise>

      <div
        className="tv-rule mt-[2cqw] h-[0.22cqw] w-[9cqw]"
        style={{ ["--i" as string]: 2, backgroundColor: accent }}
      />

      {item.line ? (
        <Rise i={3} className="mt-[2cqw]">
          <p className="text-[2cqw] text-cream/60">{item.line}</p>
        </Rise>
      ) : null}

      {item.figure ? (
        <Rise i={3} className="mt-[1.6cqw]">
          <p className="font-serif text-[4cqw] leading-none text-[#f7f3ec] tabular-nums">
            {item.figure}
          </p>
        </Rise>
      ) : null}

      {item.detail ? (
        <Rise i={4} className="mt-[1.2cqw]">
          <p className="text-[1.5cqw] tracking-[0.16em] text-cream/40">
            {item.detail}
          </p>
        </Rise>
      ) : null}

      {item.presentedBy ? (
        <Rise i={5} className="mt-[3cqw]">
          <p className="text-[1.1cqw] uppercase tracking-[0.3em] text-cream/30">
            Presented by {item.presentedBy.name}
          </p>
        </Rise>
      ) : null}
    </div>
  );
}

/**
 * Fourteen strokes, not a shower.
 *
 * Positions and timings are fixed rather than random so the same moment looks
 * the same every time it is shown, and so nothing has to run a generator on a
 * device that is already working hard.
 */
const FLECKS = [
  [6, 0.0, 6.4], [13, 1.7, 7.8], [21, 0.6, 6.9], [29, 2.9, 8.4],
  [36, 1.2, 7.2], [44, 3.4, 6.6], [51, 0.3, 8.1], [58, 2.2, 7.5],
  [66, 1.0, 6.8], [73, 3.1, 8.3], [79, 0.8, 7.0], [86, 2.5, 7.7],
  [92, 1.5, 6.5], [97, 3.8, 8.0],
] as const;

function Flecks({ accent }: { accent: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {FLECKS.map(([left, delay, dur], i) => (
        <span
          key={i}
          className="tv-fleck"
          style={{
            left: `${left}%`,
            backgroundColor: i % 3 === 0 ? "#f7f3ec" : accent,
            opacity: i % 3 === 0 ? 0.5 : 0.85,
            ["--delay" as string]: `${delay}s`,
            ["--d" as string]: `${dur}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * A chime, synthesised rather than shipped.
 *
 * Two partials and an exponential decay is all a chime is, and generating it
 * costs nothing, needs no asset, and licenses nothing. Off unless the club has
 * asked for it, and it fails silently: a clubhouse television that cannot make
 * a sound is not a fault worth reporting to anyone.
 */
export function playChime() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    // a fifth: warm, unremarkable, nothing like a klaxon
    for (const [freq, gain] of [
      [880, 0.16],
      [1320, 0.08],
    ] as const) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      osc.connect(amp).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2);
    }
    setTimeout(() => void ctx.close(), 2400);
  } catch {
    /* a screen that cannot make a sound is not a fault */
  }
}
