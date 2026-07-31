/**
 * What a poster says, separated from how it looks.
 *
 * A poster is rendered on the server, where none of the app's state exists, so
 * the client assembles this spec from what is already on screen and hands the
 * whole thing over. The renderer then does no lookups and no arithmetic: it is
 * given finished strings and turns them into pixels. Two consequences worth
 * keeping: a poster can be produced for a tournament that has never reached
 * the cloud, and the same numbers appear on the poster as on the page the club
 * was just looking at.
 *
 * Templates read this shape and nothing else. Adding a template is a rendering
 * change, not a data change.
 */

import { clubById, courseById } from "@/lib/data";
import { eligibilitySummary, regClosesAt } from "@/lib/eligibility";
import { availableTiers } from "@/lib/pricing";
import { isMultiRound, roundsOf, tournamentDates } from "@/lib/rounds";
import type { CumulativeRow, ViewMode } from "@/lib/scoring";
import type { ClubIdentity, Sponsor, Tournament } from "@/lib/types";
import { formatKES, toPar } from "@/lib/utils";

export type PosterKind = "fixture" | "results";

export interface PosterLine {
  label: string;
  value: string;
}

export interface PosterRow {
  pos: string;
  name: string;
  detail?: string;
  score: string;
  total?: string;
}

export interface PosterSpec {
  kind: PosterKind;
  /** letterspaced line above the title */
  eyebrow: string;
  title: string;
  dateLine: string;
  venueLine: string;
  /**
   * The club's own material. `image` is the course photograph they already
   * uploaded for the clubhouse screen: it is the one thing that makes two
   * clubs' posters look genuinely unalike rather than recoloured.
   */
  club: { name: string; logo?: string; accent?: string; image?: string };
  /** fixture: entry prices, one per available tier */
  fees?: PosterLine[];
  /** fixture: rounds, dates and tee times */
  schedule?: PosterLine[];
  /** fixture: who may enter, in one line */
  eligibility?: string;
  /** fixture: when entries close */
  closes?: string;
  /** either kind: cut wording */
  cut?: string;
  /** fixture: how to enter */
  contacts?: string[];
  /** fixture: what is being played for */
  prizes?: PosterLine[];
  /** results: the leaderboard, already cut to length */
  rows?: PosterRow[];
  /**
   * results: what to call the player at the top, e.g. "Champion". Absent when
   * no one should be singled out, which is the case while play is unfinished
   * or when the lead is shared.
   */
  heroLabel?: string;
  /** results: what the score column means */
  scoreLabel?: string;
  /** small print under the body */
  note?: string;
  sponsors?: Sponsor[];
  /** the shimo.golf line at the foot */
  credit: boolean;
}

/** "Wed 6 Aug" */
function shortDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * One date, or a range. A range inside one month drops the repeated month:
 * "6 to 8 August 2030" rather than "6 August to 8 August 2030".
 */
export function dateSpan(startIso: string, endIso: string) {
  const start = new Date(startIso + "T12:00:00");
  const end = new Date(endIso + "T12:00:00");
  const long: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  if (startIso === endIso) {
    return start.toLocaleDateString("en-KE", { weekday: "long", ...long });
  }
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  const left = sameMonth
    ? String(start.getDate())
    : start.toLocaleDateString("en-KE", { day: "numeric", month: "long" });
  return `${left} to ${end.toLocaleDateString("en-KE", long)}`;
}

/** "Stroke play · 54 holes" */
function formatLine(t: Tournament) {
  const rounds = roundsOf(t);
  const holes = rounds.length * 18;
  const base = t.format.toLowerCase();
  return isMultiRound(t) ? `${base} · ${holes} holes` : base;
}

function contactLines(identity: ClubIdentity): string[] {
  const out: string[] = [];
  const phones = [identity.phone, identity.phoneAlt].filter(Boolean);
  if (phones.length) out.push(phones.join("  ·  "));
  if (identity.whatsapp && identity.whatsapp !== identity.phone)
    out.push(`WhatsApp ${identity.whatsapp}`);
  if (identity.email) out.push(identity.email);
  if (identity.website) out.push(identity.website.replace(/^https?:\/\//, ""));
  return out;
}

/** The announcement poster: everything a player needs in order to enter. */
export function fixtureSpec(
  t: Tournament,
  identity: ClubIdentity,
  now = new Date(),
): PosterSpec {
  const club = clubById(t.clubId);
  const rounds = roundsOf(t);
  const { start, end } = tournamentDates(t);
  const first = courseById(rounds[0].courseId);

  const tiers = availableTiers(t, now);
  const fees: PosterLine[] = tiers.length
    ? tiers.map((tier) => ({ label: tier.label, value: formatKES(tier.amount) }))
    : [{ label: "Entry", value: formatKES(t.entryFee) }];

  // The header already carries the date, so a single-round event only needs
  // the time; several rounds need saying which day each is played.
  const schedule: PosterLine[] = isMultiRound(t)
    ? rounds.map((r) => ({
        label: r.name,
        value: `${shortDate(r.date)} · first tee ${r.firstTee}`,
      }))
    : [{ label: "First tee", value: t.firstTee }];

  const cutRound = rounds.find((r) => r.cut);
  const cut = cutRound?.cut
    ? `Cut after ${cutRound.name.toLowerCase()} to the top ${cutRound.cut.topN} and ties`
    : undefined;

  const closesAt = regClosesAt(t);
  const closes = `${closesAt.toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} at ${closesAt.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;

  const tees = rounds[0].tees ? ` · ${rounds[0].tees} tees` : "";
  const venues = [...new Set(rounds.map((r) => courseById(r.courseId).name))];
  const courseLine = venues.length > 1 ? venues.join(" · ") : first.name;

  return {
    kind: "fixture",
    eyebrow: formatLine(t),
    title: t.name,
    dateLine: dateSpan(start, end),
    venueLine: `${club.name} · ${courseLine}${tees}`,
    club: {
      name: club.name,
      logo: identity.logoUrl,
      accent: identity.accent,
      image: identity.tvBackgroundUrl,
    },
    fees,
    schedule,
    eligibility: eligibilitySummary(t),
    closes,
    cut,
    contacts: contactLines(identity),
    // Four is what fits and what a club actually bills: the win, the divisions
    // and a couple of side prizes.
    prizes: t.prizes
      .slice(0, 4)
      .map((p) => ({ label: p.place, value: p.prize })),
    note: `Field of ${t.maxPlayers} · ${t.handicapAllowance}% handicap allowance`,
    sponsors: t.sponsors,
    credit: identity.posterCredit !== false,
  };
}

function scoreOf(r: CumulativeRow, mode: ViewMode) {
  if (mode === "points") return `${r.points}`;
  if (mode === "net") return toPar(r.netToPar);
  return toPar(r.grossToPar);
}

/** The results poster, drawn from the standings already on the summary page. */
export function resultsSpec(
  t: Tournament,
  identity: ClubIdentity,
  standings: CumulativeRow[],
  mode: ViewMode,
  opts: { top?: number; provisional?: boolean } = {},
): PosterSpec {
  const club = clubById(t.clubId);
  const rounds = roundsOf(t);
  const { start, end } = tournamentDates(t);
  const top = opts.top ?? 10;
  const shown = standings.slice(0, top);

  const rows: PosterRow[] = shown.map((r) => ({
    pos: r.tied ? `T${r.position}` : `${r.position}`,
    name: r.player.name,
    detail: clubById(r.player.clubId).short,
    score: scoreOf(r, mode),
    total: mode === "points" ? undefined : `${r.grossTotal}`,
  }));

  const cutRound = rounds.find((r) => r.cut);
  const cut = cutRound?.cut
    ? `Cut after ${cutRound.name.toLowerCase()} to the top ${cutRound.cut.topN} and ties`
    : undefined;

  const venues = [...new Set(rounds.map((r) => courseById(r.courseId).name))];

  /*
   * Only single out a player when there is a single player to single out. A
   * shared lead, or a board that is still moving, gets a flat list: a poster
   * that names a champion who has not won yet is the one mistake a club cannot
   * take back once it is posted.
   */
  const heroLabel =
    shown.length && !shown[0].tied && !opts.provisional ? "Champion" : undefined;

  return {
    kind: "results",
    heroLabel,
    eyebrow: opts.provisional ? "Provisional standings" : "Final result",
    title: t.name,
    dateLine: dateSpan(start, end),
    venueLine: `${club.name} · ${venues.join(" · ")}`,
    club: { name: club.name, logo: identity.logoUrl, accent: identity.accent },
    rows,
    scoreLabel: mode === "points" ? "Points" : mode === "net" ? "Net" : "Gross",
    cut,
    note: `${standings.length} played · ${t.format} · ${t.handicapAllowance}% allowance`,
    sponsors: t.sponsors,
    credit: identity.posterCredit !== false,
  };
}

/** A stable, human file name: shimo-kenya-amateur-results.png */
export function posterFileName(spec: PosterSpec) {
  const slug = spec.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `shimo-${slug}-${spec.kind}.png`;
}
