/**
 * Feature flags for controls that are built but not yet functional.
 *
 * The rule: a control that does not do its job yet is clutter, and clutter
 * makes every other decision on the screen harder to read. So it is hidden
 * here rather than deleted. The component and its wiring stay in the tree,
 * ready to switch back on when the capability lands, but nothing renders it
 * while the flag is off.
 *
 * Turning one on is a one-line change here, not a rebuild. Keep the reason a
 * flag is off written next to it.
 */
export const FEATURES = {
  /** Scan a paper scorecard with a camera and OCR the grid. Roadmap: pilot
   *  follow-up. The dialog and button exist in app/admin/scores. */
  scanCard: false,

  /** Illustrative payments module in Settings (fees, settlement). Shimo does
   *  not settle money today, so the module only describes a future. */
  payments: false,

  /** The full "moments engine" TV coverage levels (reduced / full) beyond the
   *  two the panel offers (quiet / standard). Wired in lib/tv/producer, not
   *  exposed in the producer panel yet. */
  tvMomentsEngine: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
