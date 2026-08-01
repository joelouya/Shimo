/**
 * Guests.
 *
 * On a club medal the field is members. On a corporate or charity day most of
 * the field has never been to the club before, will not come back, and has no
 * handicap on file anywhere. That is the normal case for the events this
 * product is being pointed at, not an edge case, so a guest is a first-class
 * player rather than a member record with holes in it.
 *
 * What is the same: they score, they mark for a playing partner, and their
 * certification is worth exactly what a member's is. The integrity chain never
 * asks whether the person signing is a member, only whether they kept the
 * card, and R&A 3.3b does not either.
 *
 * What differs is provenance. A member's handicap comes from the club roster.
 * A guest's is their own claim or absent altogether, and every surface that
 * turns it into a result has to say so.
 */

import type { GuestEntry, Player } from "./types";

/* ------------------------------------------------------------------ *
 * Access codes
 * ------------------------------------------------------------------ */

/**
 * Read aloud across a first tee, typed with one thumb, and printed on a
 * confirmation email. Six characters in an alphabet with no look-alikes,
 * grouped as three and three.
 *
 * Shorter than a member invitation on purpose, and safe to be: an invitation
 * claims a person's membership and handicap history for good, while a code
 * opens one scorecard in one tournament on one day. Different blast radius,
 * different length. Still from the CSPRNG, never from Math.random.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newGuestCode(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

/** People type codes without the dash, in capitals, with stray spaces. */
export function normaliseCode(input: string): string {
  const bare = input.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return bare.length === 6 ? `${bare.slice(0, 3)}-${bare.slice(3)}` : bare;
}

/**
 * The entry a code opens, if any.
 *
 * Scoped to one tournament by construction: the entry carries its own
 * tournament id, so a code can never reach a different event.
 */
export function entryForCode(
  entries: GuestEntry[],
  input: string,
): GuestEntry | undefined {
  const code = normaliseCode(input);
  if (code.length !== 7) return undefined;
  return entries.find((e) => e.code === code);
}

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

export interface GuestRegistration {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  /** their own claim, or absent when they do not have one */
  handicap?: number;
  /** dietary and accessibility notes. Never reaches a sponsor. */
  notes?: string;
  /** explicit, and false unless they said yes */
  sponsorListConsent: boolean;
}

export interface RegistrationProblem {
  field: keyof GuestRegistration;
  message: string;
}

/**
 * What must be true before someone is on the sheet.
 *
 * Deliberately short. Every extra required field on a public registration form
 * is a person who gives up and emails the organiser instead, which is the
 * manual work this is here to remove. A name is genuinely needed because it
 * goes on a scorecard someone else has to attest. Everything else is optional,
 * including the handicap: plenty of corporate-day players have never had one,
 * and demanding a number invites them to invent one.
 */
export function validateRegistration(r: GuestRegistration): RegistrationProblem[] {
  const out: RegistrationProblem[] = [];
  if (r.name.trim().length < 2)
    out.push({ field: "name", message: "We need a name for the scorecard." });
  if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim()))
    out.push({ field: "email", message: "That email does not look right." });
  if (
    r.handicap !== undefined &&
    (!Number.isFinite(r.handicap) || r.handicap < -10 || r.handicap > 54)
  )
    out.push({
      field: "handicap",
      message: "A handicap is between -10 and 54, or leave it blank.",
    });
  return out;
}

/**
 * Someone who has played before, matched on email.
 *
 * A repeat guest keeps one profile rather than accumulating a row per event,
 * so their handicap and organisation are already filled in the second time.
 * Matched on email only: names collide, and two people called James Mwangi
 * being merged into one player would corrupt a scorecard.
 */
export function existingGuest(
  guests: Player[],
  email: string | undefined,
): Player | undefined {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return undefined;
  return guests.find((g) => (g.email ?? "").toLowerCase() === e);
}

/**
 * How a guest's handicap should be described wherever it affects a result.
 *
 * Never silently equivalent to a member's index. A club running a corporate
 * day needs to be able to say, out loud at prizegiving, which figures were
 * WHS and which were declared on a form that morning.
 */
export function handicapProvenance(p: Player): "whs" | "self-declared" | "none" {
  if (!p.guest) return "whs";
  if (!p.guest.selfDeclaredHandicap) return "none";
  return "self-declared";
}

/** Who may appear in a sponsor's participant list. Consent only, never inferred. */
export function sponsorListable(guests: Player[]): Player[] {
  return guests.filter((g) => g.guest?.sponsorListConsent === true);
}
