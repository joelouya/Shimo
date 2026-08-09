/**
 * What a printed scorecard says, separated from how it looks.
 *
 * The one output Shimo did not have: a blank card a group carries round the
 * course and writes on by hand. Every corporate shotgun needs them, because not
 * everyone in a four-ball is going to score on a phone, and the paper card is
 * still what gets signed and handed in. The QR is the way back into the app for
 * the groups that do want to score live; the grid is for the ones that do not.
 *
 * Built on the client from the store, then POSTed to /api/scorecard, which
 * renders it the same way the poster and recap are rendered - Satori to PNG,
 * bound into a PDF - so a club prints one file for the whole field.
 */

import type { Course, Team, Tournament } from "@/lib/types";
import type { SavedGroup } from "@/lib/sim/store";
import { courseHandicap } from "@/lib/scoring";

export interface ScorecardHole {
  n: number; // 1-based
  yards: number;
  si: number;
  par: number;
}

export interface ScorecardEntrant {
  name: string;
  /** course handicap off the card's tee, or null when unknown */
  hcp: number | null;
}

export interface ScorecardCard {
  /** "Group 1 · 07:00" or a team name */
  label: string;
  entrants: ScorecardEntrant[];
  /** a QR the group can scan to score live, as a data: URI, and the link under it */
  qr?: string;
  link?: string;
  /** the printed group code, for the phone whose camera will not focus */
  code?: string;
}

export interface ScorecardSpec {
  event: { title: string; date: string; club: string; course: string; tees: string };
  /** exactly 18, in play order */
  holes: ScorecardHole[];
  cards: ScorecardCard[];
  generatedAt: string;
}

const cut = (holes: ScorecardHole[], from: number, to: number) =>
  holes.slice(from, to);

/** OUT / IN / TOT par, so the printed card totals like a real one. */
export function parTotals(holes: ScorecardHole[]) {
  const sum = (a: ScorecardHole[]) => a.reduce((n, h) => n + h.par, 0);
  const out = sum(cut(holes, 0, 9));
  const inn = sum(cut(holes, 9, 18));
  return { out, in: inn, tot: out + inn };
}

/**
 * Build the cards for a round. One card per pairing group by default; when the
 * event is played in named teams, the team names label the cards instead.
 */
export function scorecardSpec(args: {
  tournament: Tournament;
  course: Course;
  round: { number: number; tees: string; firstTee: string; date: string };
  groups: SavedGroup[];
  teams?: Team[];
  nameOf: (playerId: string) => string;
  /** the player's handicap index, so the card can print a course handicap */
  handicapOf: (playerId: string) => number | undefined;
  clubName: string;
  /** a QR data URI + link to put on team cards (the way back into the app) */
  qr?: string;
  link?: string;
  /**
   * Per-group QR data URIs, keyed by group id. A group card carries its own
   * group's QR and code - the same one on the tee sheet - so scanning it lands
   * the player on their group. Team cards fall back to the event-level qr/link.
   */
  qrByGroup?: Record<string, string>;
}): ScorecardSpec {
  const { tournament, course, round, groups, teams, nameOf, handicapOf, clubName, qr, link, qrByGroup } =
    args;
  const holes: ScorecardHole[] = course.holes.map((h) => ({
    n: h.hole,
    yards: h.yards ?? 0,
    si: h.si,
    par: h.par,
  }));

  const entrant = (playerId: string): ScorecardEntrant => {
    const hi = handicapOf(playerId);
    return {
      name: nameOf(playerId),
      hcp: hi == null ? null : courseHandicap(hi, course, round.tees),
    };
  };

  // a team-per-card label reads better for a scramble; otherwise the group
  const byTeam = teams && teams.length > 0;
  const cards: ScorecardCard[] = byTeam
    ? teams!.map((tm) => ({
        label: tm.name,
        entrants: tm.playerIds.map(entrant),
        qr,
        link,
      }))
    : groups.map((g) => ({
        label: `Group ${g.number}${g.teeTime ? ` · ${g.teeTime}` : ""}`,
        entrants: g.playerIds.map(entrant),
        // the group's own QR + code, matching the tee sheet
        qr: (g.code && qrByGroup?.[g.id]) || qr,
        link: g.code ? `/play?c=${g.code}` : link,
        code: g.code,
      }));

  return {
    event: {
      title: tournament.name,
      date: round.date,
      club: clubName,
      course: course.name,
      tees: round.tees,
    },
    holes,
    cards,
    generatedAt: new Date().toISOString(),
  };
}
