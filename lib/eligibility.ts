import { DEMO_USER_ID, playerById } from "./data";
import { roundsOf } from "./rounds";
import type { Membership, Player, Tournament } from "./types";

export type Eligibility =
  | { kind: "eligible"; label: string }
  | { kind: "locked"; label: string }
  | { kind: "limit"; label: string };

/* ------------------------------------------------------------------ */
/* Registration window                                                 */
/* ------------------------------------------------------------------ */

/**
 * When entries close. Clubs set a date and a time, because "closes Friday"
 * means the end of Friday to a member and 00:00 to a computer. Falls back to
 * the end of the `regCloses` day, then to the day before the first round.
 */
export function regClosesAt(t: Tournament): Date {
  if (t.regClosesAt) return new Date(t.regClosesAt);
  if (t.regCloses) return new Date(`${t.regCloses}T23:59:59`);
  const first = roundsOf(t)[0];
  const d = new Date(`${first.date}T${first.firstTee || "07:30"}:00`);
  d.setDate(d.getDate() - 1);
  return d;
}

/** The default a club expects: the day before, at close of play. */
export function defaultRegClosesAt(firstRoundDate: string): string {
  const d = new Date(`${firstRoundDate}T18:00:00`);
  d.setDate(d.getDate() - 1);
  // datetime-local wants "YYYY-MM-DDTHH:mm" with no timezone
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function registrationOpen(t: Tournament, now = new Date()): boolean {
  if (t.status !== "upcoming") return false;
  return now < regClosesAt(t);
}

/* ------------------------------------------------------------------ */
/* Who may enter                                                       */
/* ------------------------------------------------------------------ */

/** Age on the day the tournament starts, which is what entry rules mean. */
export function ageAt(dob: string | undefined, onDate: string): number | null {
  if (!dob) return null;
  const b = new Date(dob);
  const d = new Date(onDate);
  if (isNaN(b.getTime()) || isNaN(d.getTime())) return null;
  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
  return age;
}

export function membershipOf(t: Tournament): Membership {
  return t.membership ?? (t.membersOnly ? "members" : "open");
}

export function membershipLabel(m: Membership): string {
  return m === "members"
    ? "Members only"
    : m === "members-guests"
      ? "Members and guests"
      : "Open to all";
}

/**
 * One line describing who may enter, for cards and posters.
 * e.g. "Members and guests · HC 0 to 24 · Under 25"
 */
export function eligibilitySummary(t: Tournament): string {
  const bits: string[] = [membershipLabel(membershipOf(t))];
  if (t.ladiesOnly) bits.push("Ladies only");

  const lo = t.minHandicap;
  const hi = t.maxHandicap;
  if (lo != null && hi != null) bits.push(`HC ${lo} to ${hi}`);
  else if (hi != null) bits.push(`HC ${hi} and below`);
  else if (lo != null) bits.push(`HC ${lo} and above`);

  if (t.minAge != null && t.maxAge != null)
    bits.push(`Ages ${t.minAge} to ${t.maxAge}`);
  else if (t.maxAge != null) bits.push(`Under ${t.maxAge + 1}`);
  else if (t.minAge != null) bits.push(`${t.minAge} and over`);

  if (t.eligibilityNote?.trim()) bits.push(t.eligibilityNote.trim());
  return bits.join(" · ");
}

/**
 * Whether a given player may enter. Checks the structured rules only: a
 * custom note is shown to the player but never blocks them, because only the
 * club can judge something like "past champions only".
 */
export function eligibilityForPlayer(t: Tournament, user: Player): Eligibility {
  if (t.ladiesOnly && user.gender === "M")
    return { kind: "locked", label: "Ladies only" };

  const membership = membershipOf(t);
  if (membership === "members" && t.clubId !== user.clubId)
    return { kind: "locked", label: "Members only" };

  if (t.maxHandicap != null && user.handicap > t.maxHandicap)
    return { kind: "limit", label: `HC ${t.maxHandicap} and below` };
  if (t.minHandicap != null && user.handicap < t.minHandicap)
    return { kind: "limit", label: `HC ${t.minHandicap} and above` };

  const age = ageAt(user.dob, roundsOf(t)[0].date);
  if (age != null) {
    if (t.maxAge != null && age > t.maxAge)
      return { kind: "limit", label: `Under ${t.maxAge + 1}` };
    if (t.minAge != null && age < t.minAge)
      return { kind: "limit", label: `${t.minAge} and over` };
  }

  if (!registrationOpen(t))
    return { kind: "locked", label: "Registration closed" };

  const qualifier =
    t.maxHandicap != null ? ` · HC ${t.maxHandicap} and below` : "";
  return { kind: "eligible", label: `You're eligible${qualifier}` };
}

/** Eligibility of the demo user (Joel, Muthaiga member, HC 12). */
export function eligibilityFor(t: Tournament): Eligibility {
  return eligibilityForPlayer(t, playerById(DEMO_USER_ID));
}
