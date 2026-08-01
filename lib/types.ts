export type Format =
  | "Stableford"
  | "Stroke Play"
  | "Match Play"
  | "Better Ball"
  | "Scramble";

export type TournamentStatus = "upcoming" | "live" | "completed" | "cancelled";

/**
 * What a club can make its own. Everything is optional: a club with none of
 * it renders in Shimo's own colours, exactly as before.
 */
export interface ClubIdentity {
  clubId: string;
  logoUrl?: string;
  /** one brand colour; light and dark tones are derived from it */
  accent?: string;
  phone?: string;
  phoneAlt?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  /** show the Shimo credit on generated posters */
  posterCredit?: boolean;
  /** hero image behind TV mode, darkened for legibility */
  tvBackgroundUrl?: string;
  /** short lines the club wants folded into the TV feature rotation */
  tvMessages?: string[];
  /**
   * Sponsors the club has worked with before, kept at club level so a
   * recurring corporate calendar does not mean retyping the same eight
   * companies and re-uploading the same eight logos every quarter.
   */
  sponsorBook?: Sponsor[];
  /**
   * The club's course records, held here rather than on a tournament because a
   * record belongs to the course and outlives every event played on it. Kept
   * per tee set: a record off the white tees is not a record off the red.
   */
  courseRecords?: {
    courseId: string;
    tee: string;
    strokes: number;
    holder: string;
    year: number;
  }[];
}

export interface Club {
  id: string;
  name: string;
  short: string;
  town: string;
  /** registered clubhouse location, for sign-off distance evidence */
  lat: number;
  lng: number;
}

export interface Hole {
  hole: number;
  par: number;
  si: number; // stroke index
  yards: number; // yellow tees
}

/** WHS ratings for one tee set. */
export interface TeeRating {
  tee: string; // White | Yellow | Red | Blue
  courseRating: number;
  slope: number;
}

export interface Course {
  id: string;
  clubId: string;
  name: string;
  tees: string;
  par: number;
  holes: Hole[];
  ratings: TeeRating[];
}

export interface Player {
  id: string;
  name: string;
  clubId: string;
  /** Handicap Index (WHS) */
  handicap: number;
  gender: "M" | "F";
  phone?: string;
  email?: string;
  memberNo?: string;
  /** ISO yyyy-mm-dd. Only needed for age-restricted events (juniors, seniors). */
  dob?: string;

  /* ---- membership access, pilot only ------------------------------ *
   *
   * Being on the roster is what makes someone a member. Before this, any
   * email that arrived through a magic link was matched against the roster
   * and, if it missed, produced a blank profile: the difference between a
   * member and a stranger was cosmetic. These fields make it enforceable.
   * ------------------------------------------------------------------ */

  /**
   * The club's invitation to this member. Present once the club has generated
   * one; `activatedAt` is set when the member follows it and claims the row.
   */
  invite?: MemberInvite;

  /**
   * A deactivated member keeps every card they ever returned and stops being
   * able to sign in. Absent means active: a roster imported before this
   * existed is not silently locked out.
   */
  active?: boolean;

  /**
   * Present when this player is a guest rather than a member. Absent on every
   * roster row, and the only thing that distinguishes the two.
   */
  guest?: GuestProfile;
}

/**
 * A guest is a player the club has not vouched for.
 *
 * On a corporate or charity day most of the field is guests, which is the
 * whole reason this exists. They score, they mark for each other, and their
 * certification is worth exactly what a member's is: the integrity chain never
 * asks whether the person signing is a member, only whether they kept the
 * card. What differs is provenance, not standing.
 *
 * Held on Player rather than as a parallel type, because everything
 * downstream of a tee time treats a guest identically and forking Player would
 * mean forking scoring, pairings, cards, attestation and the board with it.
 * The distinguishing fact is that guests never enter `roster`.
 */
export interface GuestProfile {
  /** the organisation they are playing for, which is the unit a corporate
      day is actually organised around */
  company?: string;
  /**
   * True when the handicap on the Player row is the guest's own claim rather
   * than a WHS index. Surfaced wherever it affects a result, so a net placing
   * on a corporate day is never mistaken for a WHS-grade figure.
   */
  selfDeclaredHandicap: boolean;
  /**
   * Dietary and accessibility notes. Operational data for the club and, some
   * of it, health data. Never leaves the club and never reaches a sponsor
   * under any setting. See docs/COMMITMENTS.md.
   */
  notes?: string;
  /**
   * Whether this guest agreed to appear in a sponsor's participant list.
   * Explicit, captured at registration, and false unless they said yes.
   */
  sponsorListConsent: boolean;
  /** first time we saw them, so a repeat guest keeps one profile */
  since: string;
}

/**
 * One guest's place in one tournament.
 *
 * The code is how they reach their own scorecard on the day without an
 * account. Scoped to a single tournament on purpose: a code that opened every
 * event a guest ever played would be a password by another name.
 */
export interface GuestEntry {
  tournamentId: string;
  guestId: string;
  /** unguessable, and only ever good for this one tournament */
  code: string;
  registeredAt: string;
}

export interface MemberInvite {
  /**
   * Unguessable and single-use. This is a credential: following it claims a
   * named person's membership, their handicap and their scoring history.
   */
  token: string;
  /** ISO datetime the club last sent or copied it */
  sentAt?: string;
  /** ISO datetime the member claimed the row. Absent means not yet activated. */
  activatedAt?: string;
  /**
   * The email that claimed it, which need not be the roster email: a member
   * who signs in with a different address is linked here rather than being
   * turned away or duplicated.
   */
  claimedBy?: string;
}

/** Who may enter, beyond handicap and gender. */
export type Membership = "members" | "members-guests" | "open";

/** Who an entry price applies to. */
export type FeeAudience = "all" | "members" | "guests";

/**
 * One price on the entry sheet. Championships routinely run several: a member
 * rate, a returning-player loyalty rate, and an early bird that expires before
 * entries close.
 */
export interface FeeTier {
  id: string;
  label: string;
  /** KES */
  amount: number;
  audience: FeeAudience;
  /** ISO datetime this rate stops being available; absent means it runs to the cutoff */
  until?: string;
}

/**
 * Where a sponsor sits in the billing.
 *
 * Four tiers, and the order is the whole point: a corporate day is sold as a
 * set of positions, and a club that promised someone top billing has to be
 * able to deliver it on every surface without remembering to.
 *
 * "prize" and "partner" were the earlier names and still parse, because a
 * tournament created before this shipped should not lose its sponsors.
 */
export type SponsorTier =
  | "title"
  | "presenting"
  | "category"
  | "supporting"
  /** @deprecated read as "category" */
  | "prize"
  /** @deprecated read as "supporting" */
  | "partner";

/**
 * A surface a sponsor can appear on.
 *
 * Held per sponsor rather than derived from the tier alone, because what a
 * club sold is not always what a tier implies: a beverage sponsor may have
 * bought the clubhouse screen and nothing else.
 */
export type SponsorSurface =
  | "poster"
  | "tournament-page"
  | "leaderboard"
  | "tv"
  | "contest"
  | "recap";

/** Who the recap pack goes to. A person, not an inbox. */
export interface SponsorContact {
  name: string;
  email?: string;
  phone?: string;
  /** "Marketing Manager", so the club knows who they are talking to */
  role?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl?: string;
  tier?: SponsorTier;
  /**
   * The sponsor's own colour, used only inside their own moments: their
   * section of a recap pack, their contest marker. It never takes over a
   * Shimo surface, and it never displaces the club's colour.
   */
  accent?: string;
  /** for a category sponsor: what they bought. "Halfway house", "Hole 7". */
  category?: string;
  /** absent means the tier's default placements */
  placements?: SponsorSurface[];
  contact?: SponsorContact;
  /**
   * What they contributed. Private: internal tracking for the club, and it
   * never reaches a poster, a screen, or a recap pack. A sponsor should not
   * learn what another sponsor paid from a document the club sent them.
   */
  contributionKES?: number;
  /** the contest this sponsor backs, when they bought one */
  contestId?: string;
}

/**
 * A contest hole: nearest the pin, longest drive, a hole-in-one prize.
 *
 * Its own concept rather than a prize, because it happens at a place on the
 * course, it is usually what a category sponsor actually bought, and the
 * player standing on that tee should be able to see whose contest it is.
 */
export interface Contest {
  id: string;
  /** "Nearest the pin", "Longest drive", "Hole in one" */
  name: string;
  /** 1 to 18 */
  hole: number;
  /** which round, for a multi-round event. Absent means round 1. */
  round?: number;
  /** what the winner gets, in the club's own words */
  prize?: string;
  /** the sponsor who bought it */
  sponsorId?: string;
  /** filled in after the day: who won and with what */
  result?: {
    playerId: string;
    /** "1.4 m", "312 y", or whatever the club measured */
    detail?: string;
  };
}

export interface Prize {
  place: string;
  prize: string;
}

export interface Division {
  name: string;
  range: [number, number]; // handicap range inclusive
}

/**
 * The cut applied after a round: the field is reduced to the leading `topN`
 * players and everyone tied with the last of them. Ties are always kept, which
 * is why a "top 30" cut routinely returns 33 players.
 */
export interface CutRule {
  topN: number;
}

/**
 * One round of a tournament. A club monthly medal has exactly one; a
 * championship has several, and each may be played on a different course, off
 * different tees, with its own pairings.
 */
export interface Round {
  /** stable within the tournament, e.g. "r1" */
  id: string;
  /** 1-based, and the order rounds are played in */
  number: number;
  /** e.g. "Round 1" or "Round 2 · Final" */
  name: string;
  date: string; // ISO yyyy-mm-dd
  courseId: string;
  tees: string;
  firstTee: string; // "07:30"
  teeInterval: number; // minutes
  /** cut applied AFTER this round; absent means play on with a full field */
  cut?: CutRule | null;
}

export interface Tournament {
  id: string;
  name: string;
  clubId: string;
  /**
   * Round 1's course. Kept in step with `rounds[0]` so tournament cards and
   * lists have something to show without reaching into the rounds; scoring
   * always reads the course from the round being played.
   */
  courseId: string;
  /** the first round's date, i.e. when the tournament starts */
  date: string; // ISO yyyy-mm-dd
  format: Format;
  /**
   * The headline price, mirrored from the cheapest currently-available tier so
   * lists and cards have a single number. `feeTiers` is the real sheet.
   */
  entryFee: number; // KES
  /** every price on offer; absent means a single "Standard entry" at entryFee */
  feeTiers?: FeeTier[];
  /**
   * How TV mode should talk about this field. Auto-detected from the spread of
   * handicaps at creation and overridable by the club, because the same format
   * wants different coverage at a championship and at a Saturday medal.
   */
  fieldProfile?: "championship" | "club" | "stableford" | "team";
  /** who is backing the event; absent means none */
  sponsors?: Sponsor[];
  /** nearest-the-pin, longest drive, hole-in-one. Absent means none. */
  contests?: Contest[];
  status: TournamentStatus;
  /** mirrored from `membership`; true when the event is members-only */
  membersOnly: boolean;
  /** members only, members and their guests, or open to all */
  membership?: Membership;
  maxHandicap?: number;
  minHandicap?: number;
  ladiesOnly?: boolean;
  /** age limits on the day of the first round, e.g. juniors under 25 */
  minAge?: number;
  maxAge?: number;
  /**
   * Anything the structured rules cannot express, shown verbatim on the
   * tournament card: "Past champions only", "Kenya residents".
   */
  eligibilityNote?: string;
  divisions: Division[];
  description: string;
  prizes: Prize[];
  maxPlayers: number;
  /** date part of `regClosesAt`, kept for lists and cards */
  regCloses: string;
  /** ISO datetime entries close; defaults to 24h before the first round */
  regClosesAt?: string;
  handicapAllowance: number; // %
  /** round 1's first tee, mirrored from `rounds[0]` */
  firstTee: string; // "07:30"
  /** round 1's tee interval, mirrored from `rounds[0]` */
  teeInterval: number; // minutes
  fieldSize: number;
  /**
   * Every round, in order. Always at least one. A tournament created before
   * multi-round existed is read as a single round by `roundsOf()`.
   */
  rounds?: Round[];
  /** minutes after certification during which a player may request a
   *  correction (R&A 2024 time-based "returned" guidance); 0 = off */
  correctionWindowMin?: number;
  /**
   * Start the day with the board and nothing else: no announcements, no
   * interludes. For member-guest days, corporate outings, juniors, and the
   * closing holes of anything serious. The producer panel can switch it during
   * the round; this is what it starts as.
   */
  tvQuiet?: boolean;
  /**
   * How much the clubhouse screen says: everything, the big moments only, or
   * the board alone. Defaults from the field profile when unset, and the
   * producer panel can change it during the round.
   */
  tvCoverage?: "full" | "reduced" | "quiet";
  registered?: boolean; // demo user is registered
  result?: { winner: string; score: string; userPosition?: number; userScore?: string };
}

export interface Group {
  id: string;
  number: number;
  teeTime: string;
  playerIds: string[];
  featured?: boolean;
}

export type HoleScores = (number | null)[]; // 18 entries, gross strokes

export interface HistoryEntry {
  tournament: string;
  club: string;
  date: string;
  position: number;
  fieldSize: number;
  score: string;
}
