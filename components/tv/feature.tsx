"use client";

/**
 * Feature interludes.
 *
 * Quieter than an announcement on purpose. An announcement is one name, very
 * large, because something happened; a feature is a small table, because
 * nothing has and this is the screen having a look around. The two should
 * never be mistaken for each other from across a room, so they do not share a
 * silhouette: announcements are a headline over a name, features are a title
 * over rows.
 */

import type { FeatureCard } from "@/lib/tv/types";

export function TvFeature({
  item,
  accent,
}: {
  item: FeatureCard;
  accent: string;
}) {
  const sponsorOnly = item.kind === "sponsor";

  return (
    <div className="tv-veil absolute inset-0 flex flex-col justify-center px-[8cqw]">
      <div className="tv-rise" style={{ ["--i" as string]: 0 }}>
        <p
          className="text-[1.4cqw] font-semibold uppercase tracking-[0.44em]"
          style={{ color: accent }}
        >
          {item.eyebrow}
        </p>
      </div>

      <div className="tv-rise mt-[1.2cqw]" style={{ ["--i" as string]: 1 }}>
        <h2
          className="font-serif leading-[1.02] text-[#f7f3ec]"
          style={{
            fontSize: sponsorOnly ? "7cqw" : "4.4cqw",
            letterSpacing: "-0.015em",
          }}
        >
          {item.title}
        </h2>
      </div>

      <div
        className="tv-rule mt-[1.8cqw] h-[0.2cqw] w-[7cqw]"
        style={{ ["--i" as string]: 2, backgroundColor: accent }}
      />

      {item.lines.length > 0 && (
        <div className="mt-[2.4cqw] max-w-[62cqw]">
          {item.lines.map((l, i) => (
            <div
              key={l.label}
              className="tv-rise flex items-baseline justify-between border-b border-white/10 py-[0.85cqw]"
              style={{ ["--i" as string]: 3 + i }}
            >
              <span className="text-[1.7cqw] text-white/55">{l.label}</span>
              <span className="font-serif text-[2.1cqw] text-[#f7f3ec] tabular-nums">
                {l.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {item.footnote && (
        <div
          className="tv-rise mt-[1.8cqw]"
          style={{ ["--i" as string]: 3 + item.lines.length }}
        >
          <p className="text-[1.4cqw] tracking-[0.12em] text-white/40">
            {item.footnote}
          </p>
        </div>
      )}
    </div>
  );
}
