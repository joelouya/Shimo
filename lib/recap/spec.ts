/**
 * What a sponsor is told, separated from how it is drawn.
 *
 * Same split as the poster: the client assembles this from what it already
 * knows and the renderer turns finished strings into pages. A recap can
 * therefore be produced for a day that never reached the cloud, and the
 * figures in it are the same figures the club was looking at.
 *
 * The important thing this shape enforces is that every number is a `Measure`.
 * There is no way to put a bare figure on a page: a renderer is handed either
 * something observed or something explicitly not measured, with the reason. A
 * pack is a document a club hands a paying backer, and the product's first
 * claim is that its figures hold up. See docs/COMMITMENTS.md.
 */

import {
  contestEngagement,
  formatDuration,
  measured,
  notMeasured,
  summarise,
  UNMEASURED,
  type ExposureEvent,
  type Measure,
} from "@/lib/exposure";
import { placementsOf } from "@/lib/sponsors";
import type {
  Contest,
  Player,
  Sponsor,
  SponsorSurface,
  Tournament,
} from "@/lib/types";

export interface RecapFigure {
  label: string;
  /** the figure itself, or the reason there is not one */
  value: Measure<string>;
  /** what it counts, in words a sponsor can repeat */
  note?: string;
}

export interface RecapWinner {
  position: string;
  name: string;
  detail?: string;
  score: string;
}

export interface RecapContest {
  name: string;
  hole: number;
  prize?: string;
  /** absent when nobody won it, which happens and is not an error */
  winner?: string;
  winnerDetail?: string;
  /** how many players actually played that hole */
  faced: Measure<string>;
}

export interface RecapSpec {
  /** the sponsor this pack is for */
  sponsor: {
    name: string;
    logo?: string;
    accent?: string;
    tier: string;
    category?: string;
    contact?: string;
  };
  event: {
    title: string;
    /** "NCBA Corporate Golf Day", when the day is branded */
    presentedBy?: string;
    dateLine: string;
    venueLine: string;
    format: string;
    fieldSize: number;
    club: { name: string; logo?: string; accent?: string };
  };
  /** charity days only */
  raised?: {
    beneficiary: string;
    cause?: string;
    /** entered by the club, never derived from entry fees */
    amount: Measure<string>;
    target?: string;
  };
  /** where this sponsor's name actually appeared */
  placements: SponsorSurface[];
  figures: RecapFigure[];
  winners: RecapWinner[];
  contests: RecapContest[];
  /**
   * Only guests who agreed at registration, and only their name and
   * organisation. Empty is a legitimate answer and the pack says so rather
   * than omitting the section.
   */
  participants: { name: string; company?: string }[];
  participantsWithheld: number;
  /** the live page this pack points at */
  url?: string;
  generatedAt: string;
}

/* ------------------------------------------------------------------ */

function kes(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

/**
 * Build one sponsor's pack.
 *
 * Everything numeric goes through `summarise` and `contestEngagement`, which
 * only ever return what was observed. Nothing in here computes a figure from
 * another figure, and nothing falls back to a field size when a count is
 * missing.
 */
export function recapSpec(args: {
  sponsor: Sponsor;
  tournament: Tournament;
  club: { name: string; logoUrl?: string; accent?: string };
  events: ExposureEvent[];
  /** every card in the event, for contest engagement */
  cards: Record<string, (number | null)[]>;
  winners: RecapWinner[];
  /** guests who consented, already filtered */
  consented: Player[];
  /** guests who did not, counted so the pack can be honest about the gap */
  withheld: number;
  /** a contest result stores a player id; the caller knows the names */
  nameOf: (playerId: string) => string | undefined;
  dateLine: string;
  venueLine: string;
  url?: string;
  now?: Date;
}): RecapSpec {
  const {
    sponsor,
    tournament: t,
    club,
    events,
    cards,
    winners,
    consented,
    withheld,
    nameOf,
  } = args;

  const surfaces = summarise(events, t.id);
  const board = surfaces.find((s) => s.surface === "board")!;
  const page = surfaces.find((s) => s.surface === "tournament")!;
  const tv = surfaces.find((s) => s.surface === "tv")!;

  const figures: RecapFigure[] = [
    {
      label: "Devices that opened the live board",
      value: measured(String(board.unique)),
      note: `${board.total} opens in total, counted once per device.`,
    },
    {
      label: "Devices that opened the event page",
      value: measured(String(page.unique)),
    },
    {
      label: "Time on the clubhouse screen",
      value:
        (tv.seconds ?? 0) > 0
          ? measured(formatDuration(tv.seconds!))
          : notMeasured(
              "The clubhouse screen was not run for this event, so there is no time to report.",
            ),
      note:
        (tv.seconds ?? 0) > 0
          ? "Measured by the screen itself, in one-minute beats while it was displaying."
          : undefined,
    },
    {
      label: "Players in the field",
      value: measured(String(t.fieldSize)),
    },
    {
      label: "Social shares",
      value: notMeasured(UNMEASURED.social),
    },
  ];

  const contests: RecapContest[] = (t.contests ?? [])
    .filter((c: Contest) => !sponsor.id || c.sponsorId === sponsor.id)
    .map((c: Contest) => ({
      name: c.name,
      hole: c.hole,
      prize: c.prize,
      winner: c.result ? nameOf(c.result.playerId) : undefined,
      winnerDetail: c.result?.detail,
      faced: measured(String(contestEngagement(cards, c.hole))),
    }));

  return {
    sponsor: {
      name: sponsor.name,
      logo: sponsor.logoUrl,
      accent: sponsor.accent,
      tier: sponsor.tier ?? "supporting",
      category: sponsor.category,
      contact: sponsor.contact?.name,
    },
    event: {
      title: t.name,
      presentedBy: t.presentedBy?.name,
      dateLine: args.dateLine,
      venueLine: args.venueLine,
      format: t.format,
      fieldSize: t.fieldSize,
      club: { name: club.name, logo: club.logoUrl, accent: club.accent },
    },
    raised: t.beneficiary
      ? {
          beneficiary: t.beneficiary.name,
          cause: t.beneficiary.cause,
          amount:
            t.beneficiary.raisedKES !== undefined
              ? measured(kes(t.beneficiary.raisedKES))
              : notMeasured(
                  "The club has not entered a final figure yet. What a day raises includes an auction, a raffle and cheques written afterwards, so Shimo does not calculate it.",
                ),
          target: t.beneficiary.targetKES
            ? kes(t.beneficiary.targetKES)
            : undefined,
        }
      : undefined,
    placements: placementsOf(sponsor),
    figures,
    winners,
    contests,
    participants: consented.map((g) => ({
      name: g.name,
      company: g.guest?.company,
    })),
    participantsWithheld: withheld,
    url: args.url,
    generatedAt: (args.now ?? new Date()).toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Publishing
 * ------------------------------------------------------------------ */

/**
 * The token in a sponsor's link.
 *
 * Unguessable, because the first version of this addressed packs as
 * /recap/<tournament>/<sponsor> and two sponsors at the same event could edit
 * one into the other. A corporate day routinely has two banks on it, and a
 * participant list is not something one of them should be able to read by
 * changing a word in a URL.
 *
 * Longer than a guest code and shorter than a member invitation, which is
 * about right for what it opens: a document, not a person's membership, and
 * one that stays live for as long as the sponsor cares to look at it.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newRecapToken(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Where a sponsor's copy lives. Relative, so it works on any host. */
export function recapPath(token: string) {
  return `/recap/${token}`;
}

/** The filename a club will look for in their downloads folder six weeks later. */
export function recapFileName(spec: RecapSpec) {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${slug(spec.event.title)}-${slug(spec.sponsor.name)}-recap.pdf`;
}
