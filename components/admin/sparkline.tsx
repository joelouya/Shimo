"use client";

/**
 * A figure's recent shape, drawn small: bars for counts per interval, a line
 * for a running level. Clay on paper, one series, no axes, no labels: the
 * card's figure and delta say what it is, the sparkline only says which way
 * it has been going. Scales to its box, so it never reflows a card.
 */

import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  kind = "bars",
  height = 44,
  className,
}: {
  values: number[];
  kind?: "bars" | "line";
  height?: number;
  className?: string;
}) {
  const n = values.length;
  if (n === 0) return <div style={{ height }} className={className} aria-hidden />;
  const max = Math.max(1, ...values);
  const W = 100;
  const H = 40;

  if (kind === "bars") {
    const gap = 2.2;
    const bw = (W - gap * (n - 1)) / n;
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        className={cn("block w-full", className)}
        aria-hidden
      >
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 2 : 1, (v / max) * H);
          const last = i === n - 1;
          return (
            <rect
              key={i}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={1}
              className={last ? "fill-clay" : "fill-clay/30"}
            />
          );
        })}
      </svg>
    );
  }

  const step = n > 1 ? W / (n - 1) : W;
  const pts = values.map((v, i) => [i * step, H - (v / max) * (H - 4) - 2] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M0,${H} L${line.split(" ").map((p) => `L${p}`).join(" ").slice(1)} L${W},${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      className={cn("block w-full", className)}
      aria-hidden
    >
      <path d={area} className="fill-clay/12" />
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-clay"
      />
    </svg>
  );
}
