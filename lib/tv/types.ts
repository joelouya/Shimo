/**
 * The vocabulary TV mode is built from.
 *
 * The producer never talks to Supabase, React or the clock. It is handed a
 * snapshot and a time, and it returns a decision. Everything below is the
 * shape of that conversation, kept free of the transport so the whole state
 * machine can be driven from a test harness at whatever speed we like.
 */

import type {
  ClubIdentity,
  Course,
  Player,
  Sponsor,
  Tournament,
} from "@/lib/types";

/** Who entered a figure. `desk` is the caddymaster entering a paper card. */
export type ScoreSource = "player" | "marker" | "desk";

/** One entry for one hole, by one party. */
export interface ScoreRow {
  round: number;
  playerId: string;
  /** 0-17 */
  hole: number;
  gross: number | null;
  source: ScoreSource;
  /** epoch ms the entry was last written */
  at: number;
}

/**
 * How a tournament wants to be talked about.
 *
 * A championship field is tight and playing the same course from the same
 * tees, so gross figures mean something in themselves. A club medal is
 * twenty-eight handicaps wide, where gross says only who is the better
 * golfer, and the interesting story is who beat their own handicap. The two
 * want different announcements, not the same announcements at a different
 * threshold.
 */
export type FieldProfile = "championship" | "club" | "stableford" | "team";

/** A club's stored record for one course off one set of tees. */
export interface CourseRecord {
  courseId: string;
  /** the tee set it was set from; a white-tee record is not a red-tee record */
  tee: string;
  strokes: number;
  holder: string;
  year: number;
}

/**
 * A call the club has made, travelling from the panel to the screen.
 *
 * One way only. The television reads these and never writes one, which is
 * what lets it stay a read-only surface while still being steerable.
 */
export interface TvDecision {
  id: number;
  kind: "approve" | "reject" | "cancel" | "quiet" | "retract" | "test" | "skip";
  /** the fact decided about, for approve, reject and cancel */
  factKey?: string;
  payload?: Record<string, string | number | boolean>;
  actor?: string;
  at: number;
}

export interface TvSnapshot {
  /** epoch ms this snapshot describes */
  at: number;
  tournament: Tournament;
  course: Course;
  players: Player[];
  /** the round currently being played */
  round: number;
  rows: ScoreRow[];
  /** round -> playerId -> the desk has published this card */
  published: Record<number, Record<string, boolean>>;
  /** round -> the field of that round, so a cut player is not counted */
  fieldByRound: Record<number, string[]>;
  /** this round's groups, in order, for the group tracker */
  groups: { number: number; teeTime: string; playerIds: string[] }[];
  identity: ClubIdentity;
  records: CourseRecord[];
  /** every decision the club has made about this tournament, oldest first */
  decisions: TvDecision[];
  online: boolean;
}

/* ---------------- announcements ---------------- */

export type AnnouncementKind =
  | "ace"
  | "course-record"
  | "eagle"
  | "net-eagle"
  | "streak"
  | "lead-change"
  | "mover"
  | "finish"
  | "round-in"
  | "cut-line"
  | "tie"
  | "leaderboard-update"
  | "retraction";

/**
 * What an announcement says, already resolved to finished strings. The
 * templates read this and nothing else, exactly as the poster templates read a
 * PosterSpec: it keeps the drama in one place and the layout in another.
 */
export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  /** higher wins when two want the screen at once */
  priority: number;
  /** how long it holds the screen, ms */
  durationMs: number;
  /** the line above, e.g. "EAGLE" */
  headline: string;
  /** the name, set large */
  subject: string;
  /** under the name, e.g. "Muthaiga · HC 8" */
  detail?: string;
  /** the fact, e.g. "The 14th · 372 yards" */
  line?: string;
  /** a figure to set beside it, e.g. "-4" */
  figure?: string;
  /** who is presenting it, if a sponsor is billed for this slot */
  presentedBy?: Sponsor;
  /** the players involved, for a lead change */
  outgoing?: string;
  /** whose moment it is, so the screen can spread itself across the field */
  subjectId?: string;
  /** what produced it, so the same fact is never announced twice */
  factKey: string;
  /** epoch ms it entered the queue */
  queuedAt: number;
  /** held pending admin approval, with the reason shown in the panel */
  holdReason?: string;
}

/* ---------------- features ---------------- */

export type FeatureKind =
  | "spotlight"
  | "group"
  | "hole-of-the-day"
  | "head-to-head"
  | "stats"
  | "sponsor"
  | "message";

export interface FeatureCard {
  id: string;
  kind: FeatureKind;
  durationMs: number;
  eyebrow: string;
  title: string;
  lines: { label: string; value: string }[];
  footnote?: string;
  sponsor?: Sponsor;
}

/* ---------------- producer ---------------- */

export type TvMode = "leaderboard" | "announcement" | "feature";

export interface ProducerConfig {
  /** ms a live figure must sit unchanged before it may be announced */
  cooldownMs: number;
  /** gap between consecutive announcements, so nothing cascades */
  spacingMs: number;
  /** ms between feature interludes */
  featureEveryMs: number;
  /** an ace above this handicap waits for admin approval */
  aceApprovalHandicap: number;
  /** sound a soft chime on a hole-in-one, through the television */
  chime: boolean;
  /** no announcements, no features: the board alone */
  quiet: boolean;
  profile: FieldProfile;
  /** club-written lines to fold into the feature rotation */
  messages: string[];
}

export const DEFAULT_CONFIG: ProducerConfig = {
  cooldownMs: 120_000,
  spacingMs: 15_000,
  featureEveryMs: 90_000,
  aceApprovalHandicap: 20,
  chime: false,
  quiet: false,
  profile: "club",
  messages: [],
};

export interface HistoryEntry {
  at: number;
  kind: AnnouncementKind | FeatureKind | "quiet-on" | "quiet-off";
  text: string;
}

export interface ProducerState {
  mode: TvMode;
  /** what is on screen now, and when it must come off */
  playing:
    | { type: "announcement"; item: Announcement; until: number }
    | { type: "feature"; item: FeatureCard; until: number }
    | null;
  /** waiting to play, highest priority first */
  queue: Announcement[];
  /** waiting for an admin to approve or reject */
  pending: Announcement[];
  /** every fact already announced, so nothing repeats */
  announced: string[];
  /**
   * Who has been on screen lately, most recent first. Used at a club medal to
   * spread the afternoon across the field rather than letting one good round
   * take every slot.
   */
  recentSubjects: string[];
  /** earliest the next announcement may start */
  nextSlotAt: number;
  /** when the next feature interlude is due */
  nextFeatureAt: number;
  /** how many features have been shown, so the rotation advances */
  featureTurn: number;
  history: HistoryEntry[];
  config: ProducerConfig;
  /** the last snapshot seen, so detection can diff against it */
  lastAt: number;
  /**
   * The snapshot itself, kept so a feature can be built on a tick without one
   * having just arrived. Features are shown in the quiet stretches, which are
   * exactly the stretches where no new snapshot is bringing anything.
   */
  lastSnapshot?: TvSnapshot;
  /** the highest decision id already folded in, so none is applied twice */
  appliedDecision: number;
  /**
   * Facts that were both material and actually shown. Kept so that if one of
   * them stops being true — a corrected card, a marker who now disagrees — the
   * screen can acknowledge that the board has moved without ever saying what
   * changed or who it belonged to.
   */
  materialShown: string[];
  /**
   * The settled board as of the previous snapshot, so a lead change is a
   * comparison rather than a guess. Absent on the first snapshot, which is why
   * the day's first leader is not announced as having taken the lead.
   */
  boardBefore?: { playerId: string; position: number }[];
}
