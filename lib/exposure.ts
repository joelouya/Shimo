/**
 * What Shimo actually observed.
 *
 * This exists so a recap pack can never state a number nobody measured. A
 * sponsor pack is a document a club hands to a paying backer, and the product's
 * first claim is that its figures hold up; an invented impression count would
 * forfeit that claim in the most expensive place available. So the rule here is
 * absolute and mechanical: a figure is either observed or it is reported as not
 * measured. Nothing is estimated, modelled, extrapolated or rounded up from a
 * neighbouring number. See docs/COMMITMENTS.md.
 *
 * That constraint is what makes the shape below unglamorous on purpose. There
 * is no "reach", no "impressions", no "engagement rate". Those are words for
 * numbers nobody counted. What Shimo can honestly say is: this many devices
 * opened the board, it was on a television for this long, this many players
 * stood on the tee of the hole you sponsored.
 *
 * Privacy: an event row carries a surface, a tournament and a coarse device
 * hash. No names, no addresses, no cross-site anything, and no way back to a
 * person from a row. A guest who declined to be in a sponsor's list is not in
 * one of these either.
 */

export type Surface =
  /** the public leaderboard, on a phone or a laptop */
  | "board"
  /** the tournament's own page */
  | "tournament"
  /** the clubhouse television */
  | "tv";

export interface ExposureEvent {
  tournamentId: string;
  surface: Surface;
  /**
   * A per-device value, stable for one device and one tournament and useless
   * anywhere else. Enough to separate "forty people looked" from "one person
   * refreshed forty times", which is the only thing it is for.
   */
  device: string;
  at: number;
  /**
   * For the television only: seconds this heartbeat accounts for. The screen
   * reports periodically rather than at the end, so an afternoon that ends
   * when someone pulls the plug still counts what it ran.
   */
  seconds?: number;
}

/** What a sponsor may honestly be told about one surface. */
export interface SurfaceExposure {
  surface: Surface;
  /** distinct devices */
  unique: number;
  /** total opens */
  total: number;
  /** television only: seconds it was displaying */
  seconds?: number;
}

/**
 * A figure Shimo does not have.
 *
 * Modelled as a value rather than as `undefined` so a renderer cannot silently
 * skip it. The pack prints "not measured" and says why, which is more useful
 * to a sponsor than a gap and far more honest than a guess.
 */
export interface NotMeasured {
  measured: false;
  why: string;
}

export type Measure<T> = { measured: true; value: T } | NotMeasured;

export function measured<T>(value: T): Measure<T> {
  return { measured: true, value };
}

export function notMeasured(why: string): NotMeasured {
  return { measured: false, why };
}

/* ------------------------------------------------------------------ */

/** Roll raw events up into what each surface can claim. */
export function summarise(
  events: ExposureEvent[],
  tournamentId: string,
): SurfaceExposure[] {
  const surfaces: Surface[] = ["board", "tournament", "tv"];
  return surfaces.map((surface) => {
    const rows = events.filter(
      (e) => e.tournamentId === tournamentId && e.surface === surface,
    );
    const devices = new Set(rows.map((e) => e.device));
    const seconds = rows.reduce((n, e) => n + (e.seconds ?? 0), 0);
    return {
      surface,
      unique: devices.size,
      total: rows.length,
      ...(surface === "tv" ? { seconds } : {}),
    };
  });
}

/**
 * How many players faced a sponsored contest.
 *
 * Counted, not assumed. A field of 120 does not mean 120 people played the
 * 7th: groups get pulled in, cards go unreturned, a shotgun leaves holes
 * unplayed when the horn goes. So this counts players with a score at that
 * hole and nothing else.
 */
export function contestEngagement(
  cards: Record<string, (number | null)[]>,
  hole: number,
): number {
  const idx = hole - 1;
  if (idx < 0 || idx > 17) return 0;
  return Object.values(cards).filter((c) => c?.[idx] != null).length;
}

/**
 * "3h 42m on the clubhouse screen".
 *
 * Seconds are the wrong unit for a sponsor and minutes are the wrong unit for
 * an afternoon, so this reads the way a person would say it.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * The things Shimo cannot see, and the reason, in words a club can repeat to
 * a sponsor without sounding evasive.
 *
 * Kept in one place because the temptation to quietly fill one of these in is
 * exactly what the rule exists to resist. If Shimo ever does measure one, it
 * moves out of this list and into a real figure, and not before.
 */
export const UNMEASURED: Record<string, string> = {
  social:
    "Shimo does not have access to the club's social accounts, so shares and impressions there are not counted here.",
  signage:
    "Physical signage on the course is not something software can observe.",
  attendance:
    "Attendance at prizegiving is not recorded, only cards returned.",
};
