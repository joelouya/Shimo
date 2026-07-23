export type Format =
  | "Stableford"
  | "Stroke Play"
  | "Match Play"
  | "Better Ball"
  | "Scramble";

export type TournamentStatus = "upcoming" | "live" | "completed";

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
}

export interface Prize {
  place: string;
  prize: string;
}

export interface Division {
  name: string;
  range: [number, number]; // handicap range inclusive
}

export interface Tournament {
  id: string;
  name: string;
  clubId: string;
  courseId: string;
  date: string; // ISO yyyy-mm-dd
  format: Format;
  entryFee: number; // KES
  status: TournamentStatus;
  membersOnly: boolean;
  maxHandicap?: number;
  minHandicap?: number;
  ladiesOnly?: boolean;
  divisions: Division[];
  description: string;
  prizes: Prize[];
  maxPlayers: number;
  regCloses: string;
  handicapAllowance: number; // %
  firstTee: string; // "07:30"
  teeInterval: number; // minutes
  fieldSize: number;
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
