/**
 * Environment mode. NEXT_PUBLIC_SHIMO_MODE is inlined at build time.
 *
 * demo  (default) : seeded field, simulated live play, all formats, payment
 *                   UI, anomaly flags surfaced in Live Ops.
 * pilot           : club roster + admin-created tournaments only, no
 *                   simulation, no payment UI, anomalies logged quietly to
 *                   Settings > Integrity, only fully-wired formats offered.
 */
export type ShimoMode = "demo" | "pilot";

export const SHIMO_MODE: ShimoMode =
  process.env.NEXT_PUBLIC_SHIMO_MODE === "pilot" ? "pilot" : "demo";

export const IS_PILOT = SHIMO_MODE === "pilot";
export const IS_DEMO = !IS_PILOT;

/** Formats with fully-wired scoring today. */
export const WIRED_FORMATS = [
  "Stableford",
  "Stroke Play",
  "Scramble",
  "Better Ball",
] as const;
