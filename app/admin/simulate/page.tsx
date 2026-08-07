"use client";

/**
 * The control room.
 *
 * A full field, built on demand, that the operator steers while watching every
 * other surface react. The value is not an average afternoon playing out on its
 * own; it is being able to reach over and cause the exact moment the product
 * was designed for - an eagle, a lead changing hands, a correction, a card that
 * outruns its handicap, a desk catching a group up - and see what the TV
 * producer, Live Ops and the leaderboard each decide to do about it.
 *
 * This page only arranges causes. It holds no scoring logic of its own; every
 * button calls the simulator, which drives the real store.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bird,
  ClipboardCheck,
  Gauge,
  Pause,
  Play,
  Radio,
  ShieldAlert,
  Sparkles,
  Trophy,
  Tv,
  Users,
  Waypoints,
  X,
} from "lucide-react";

import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { IS_PILOT } from "@/lib/mode";
import { cn } from "@/lib/utils";
import {
  buildField,
  forceAnomaly,
  forceCaddyBurst,
  forceCorrection,
  forceEagle,
  forceLeadChange,
  getSimStatus,
  pause,
  PROFILES,
  type Profile,
  resume,
  setRate,
  subscribeSim,
  teardown,
} from "@/lib/sim/simulator";

const PROFILE_ORDER: Profile[] = ["championship", "medal", "stableford"];

const SIZES = [
  { n: 24, label: "24" },
  { n: 60, label: "60" },
  { n: 120, label: "120" },
  { n: 156, label: "156" },
];

function useSimStatus() {
  const [s, setS] = useState(getSimStatus);
  useEffect(() => subscribeSim(setS), []);
  return s;
}

/* ------------------------------------------------------------------ */

function NotPilot() {
  return (
    <div className="max-w-xl">
      <p className="smallcaps text-clay">Field simulator</p>
      <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
        Run it in pilot mode
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        The simulator needs an empty course to itself. In demo mode the built-in
        field is already playing its own story, and the two would fight over the
        board. Pilot mode is still entirely local, with no live data behind it.
      </p>
      <div className="mt-6 rounded-2xl bg-card p-5 shadow-card">
        <p className="smallcaps text-muted-foreground">Start it there</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-primary/95 px-4 py-3 font-mono text-[13px] text-primary-foreground">
          npm run dev:pilot
        </pre>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Then open <span className="font-mono">/admin/simulate</span> on that
          server.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Setup() {
  const [profile, setProfile] = useState<Profile>("medal");
  const [size, setSize] = useState(120);

  return (
    <div className="max-w-2xl">
      <p className="smallcaps text-clay">Field simulator</p>
      <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
        Build a field
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        Choose the kind of afternoon. The profile decides the handicaps and the
        format, which is what tells every surface whether gross, net or points
        is the story worth telling.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {PROFILE_ORDER.map((p) => {
          const spec = PROFILES[p];
          const on = profile === p;
          return (
            <button
              key={p}
              onClick={() => setProfile(p)}
              className={cn(
                "rounded-2xl border p-5 text-left transition-[border-color,background-color] duration-[var(--dur-hover)]",
                on
                  ? "border-clay bg-clay-wash"
                  : "border-border bg-card hover:border-clay/40",
              )}
            >
              <p
                className={cn(
                  "font-serif text-[19px] leading-tight",
                  on ? "text-clay-deep" : "text-foreground",
                )}
              >
                {spec.label}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {spec.blurb}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <p className="smallcaps text-muted-foreground">Field size</p>
        <div className="mt-3 flex gap-2">
          {SIZES.map((s) => (
            <button
              key={s.n}
              onClick={() => setSize(s.n)}
              className={cn(
                "h-11 w-16 rounded-xl border font-serif text-[17px] tnum transition-colors duration-[var(--dur-hover)]",
                size === s.n
                  ? "border-clay bg-clay text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-clay/40",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {Math.round(size / 4)} groups of four, off the first tee.
        </p>
      </div>

      <Button
        variant="clay"
        size="lg"
        className="mt-9"
        onClick={() => {
          buildField(profile, size);
          resume();
        }}
      >
        Build field and go live
        <ArrowUpRight className="size-4" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-serif text-[22px] leading-none text-foreground tnum">
        {value}
      </p>
      <p className="smallcaps mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

const EVENTS = [
  {
    key: "eagle",
    label: "Eagle",
    hint: "A three on a par five. Watch the producer decide it is worth the screen.",
    icon: Bird,
    run: forceEagle,
  },
  {
    key: "lead",
    label: "Lead change",
    hint: "Give second place a run good enough to pass first. The board reorders for real.",
    icon: Trophy,
    run: forceLeadChange,
  },
  {
    key: "correction",
    label: "Correction",
    hint: "A player and marker revise a hole already played. It lands in Live Ops as an amber.",
    icon: ClipboardCheck,
    run: forceCorrection,
  },
  {
    key: "anomaly",
    label: "Anomaly",
    hint: "A high handicap scoring beyond expectation. The integrity heuristic finds it, quietly.",
    icon: ShieldAlert,
    run: forceAnomaly,
  },
  {
    key: "burst",
    label: "Desk burst",
    hint: "The caddymaster keys five holes of a paper card at once. The board jumps, not creeps.",
    icon: Waypoints,
    run: forceCaddyBurst,
  },
] as const;

const WATCH = [
  { href: "/admin/tv", label: "TV producer", icon: Tv },
  { href: "/admin/live", label: "Live Ops", icon: Radio },
  { href: "/app/leaderboard", label: "Leaderboard", icon: Users },
] as const;

function Running({ s }: { s: ReturnType<typeof getSimStatus> }) {
  const pct = s.holesTotal ? Math.round((s.holesIn / s.holesTotal) * 100) : 0;
  const spec = s.profile ? PROFILES[s.profile] : null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex size-2 rounded-full",
                s.running ? "animate-pulse bg-red-flag" : "bg-muted-foreground/40",
              )}
            />
            <p className="smallcaps text-muted-foreground">
              {spec?.label} · {s.running ? "playing" : "paused"}
            </p>
          </div>
          <h1 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
            {s.leader ?? "First tee, cards empty"}
          </h1>
        </div>
        <div className="flex items-end gap-7 pb-1 text-right">
          <Stat label="Players" value={s.fieldSize} />
          <Stat label="Groups" value={s.groups} />
          <Stat label="Holes in" value={s.holesIn} />
          <Stat label="Complete" value={`${pct}%`} />
        </div>
      </div>

      {/* progress across the whole field */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-clay transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* transport */}
      <div className="mt-8 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-4">
          <Button
            variant={s.running ? "outline" : "clay"}
            size="lg"
            onClick={() => (s.running ? pause() : resume())}
          >
            {s.running ? (
              <>
                <Pause className="size-4" /> Pause
              </>
            ) : (
              <>
                <Play className="size-4" /> Resume
              </>
            )}
          </Button>

          <div className="flex flex-1 items-center gap-3">
            <Gauge className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={200}
              max={4000}
              step={100}
              // the slider reads left-to-right as slow-to-fast, so it drives the
              // inverse of the interval
              value={4200 - s.intervalMs}
              onChange={(e) => setRate(4200 - Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-clay"
              aria-label="Scoring pace"
            />
            <span className="w-24 shrink-0 text-right text-[13px] text-muted-foreground">
              {rateLabel(s.intervalMs)}
            </span>
          </div>
        </div>
      </div>

      {/* forced events */}
      <div className="mt-8">
        <p className="smallcaps text-muted-foreground">Provoke a moment</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EVENTS.map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.key}
                onClick={() => e.run()}
                className="group rounded-2xl border border-border bg-card p-4 text-left transition-[border-color] duration-[var(--dur-hover)] hover:border-clay/50"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex size-8 items-center justify-center rounded-lg bg-clay-wash text-clay-deep">
                    <Icon className="size-4" />
                  </span>
                  <p className="font-serif text-[17px] text-foreground">
                    {e.label}
                  </p>
                </div>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {e.hint}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* the last thing the simulator did */}
      {s.lastEvent && (
        <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-clay-wash/60 px-4 py-3">
          <Sparkles className="size-4 shrink-0 text-clay-deep" />
          <p className="text-[13.5px] text-clay-deep">{s.lastEvent}</p>
        </div>
      )}

      {/* watch it happen */}
      <div className="mt-9 border-t border-border pt-6">
        <p className="smallcaps text-muted-foreground">Watch it react</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {WATCH.map((w) => {
            const Icon = w.icon;
            return (
              <Link
                key={w.href}
                href={w.href}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13.5px] text-foreground transition-[border-color] duration-[var(--dur-hover)] hover:border-clay/50"
              >
                <Icon className="size-4 text-muted-foreground" />
                {w.label}
                <ArrowUpRight className="size-3.5 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Each opens in its own tab, so you can leave one on a second screen and
          keep steering from here.
        </p>
      </div>

      <button
        onClick={() => teardown()}
        className="mt-9 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-red-flag hover:underline"
      >
        <X className="size-3.5" />
        End and clear the field
      </button>
    </div>
  );
}

function rateLabel(ms: number): string {
  if (ms >= 3200) return "Unhurried";
  if (ms >= 2200) return "Steady";
  if (ms >= 1200) return "Brisk";
  if (ms >= 600) return "Quick";
  return "Frantic";
}

/* ------------------------------------------------------------------ */

function Simulate() {
  const s = useSimStatus();
  if (!IS_PILOT) return <NotPilot />;
  if (!s.active) return <Setup />;
  return <Running s={s} />;
}

export default function SimulatePage() {
  return (
    <SimGate>
      <Simulate />
    </SimGate>
  );
}
