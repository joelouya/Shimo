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
}

/** Who may enter, beyond handicap and gender. */
export type Membership = "members" | "members-guests" | "open";

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
  entryFee: number; // KES
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
