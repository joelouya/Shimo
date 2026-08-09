/**
 * What a printed tee sheet says, separated from how it looks.
 *
 * This is the tournament-day artifact: the sheet a club prints once and pins by
 * the first tee. One row per group - tee time, who is in it, and the group's own
 * QR and short code. A player finds their name, scans the code beside it, and
 * lands on their group to pick themselves out. The code names the group and
 * nothing more; scoring still asks who they are.
 *
 * Built on the client from the store, then POSTed to /api/teesheet, which
 * renders it the same way the scorecard, poster and recap are rendered - Satori
 * to PNG, bound into a PDF - so it prints on the serverless the app deploys to.
 */

import type { Course, Tournament } from "@/lib/types";
import type { SavedGroup } from "@/lib/sim/store";

export interface TeeSheetRow {
  number: number;
  teeTime: string;
  /** display names, in play order within the group */
  players: string[];
  /** the group's short code, printed for the camera-shy phone */
  code: string;
  /** a QR to land on this group, as a data: URI */
  qr?: string;
}

export interface TeeSheetSpec {
  event: {
    title: string;
    date: string;
    club: string;
    course: string;
    /** "Round 2" etc., omitted for a single-round event */
    round?: string;
  };
  rows: TeeSheetRow[];
  generatedAt: string;
}

/**
 * Build the sheet for one round. Groups in tee-time order, each carrying the
 * QR the print helper already drew for its code.
 */
export function teeSheetSpec(args: {
  tournament: Tournament;
  course: Course;
  round: { number: number; name?: string; date: string };
  groups: SavedGroup[];
  nameOf: (playerId: string) => string;
  clubName: string;
  /** QR data URIs by group id, keyed so the render can place each one */
  qrByGroup: Record<string, string>;
  /** true when the event has more than one round, so the sheet says which */
  multiRound: boolean;
}): TeeSheetSpec {
  const { tournament, course, round, groups, nameOf, clubName, qrByGroup, multiRound } =
    args;

  const rows: TeeSheetRow[] = groups
    .filter((g) => g.playerIds.length > 0)
    .map((g) => ({
      number: g.number,
      teeTime: g.teeTime,
      players: g.playerIds.map(nameOf),
      code: g.code ?? "",
      qr: g.code ? qrByGroup[g.id] : undefined,
    }));

  return {
    event: {
      title: tournament.name,
      date: round.date,
      club: clubName,
      course: course.name,
      round: multiRound ? (round.name ?? `Round ${round.number}`) : undefined,
    },
    rows,
    generatedAt: new Date().toISOString(),
  };
}
