/**
 * Who is allowed to be a member.
 *
 * Before this, signing in with any email matched it against the roster and, if
 * it missed, produced a blank profile. So "member" and "stranger" were the
 * same state wearing different labels, which is fine until guests exist and
 * then is not: the whole guest design rests on the club knowing which of the
 * two someone is.
 *
 * The rule is deliberately one pure function over the roster. It has no clock,
 * no storage and no React, so every branch below is checkable in the harness
 * rather than by signing in and out of a phone.
 *
 * Enforced in pilot only. Demo mode is a thing you show people, and asking a
 * prospective club to activate an invitation before they can look at the app
 * would be absurd.
 */

import { IS_PILOT } from "./mode";
import type { Player } from "./types";

export type MemberAccess =
  /** on the roster, invitation claimed: this is a member */
  | { kind: "member"; player: Player }
  /**
   * On the roster and invited, but the invitation was never followed. The club
   * knows who they are; they have simply not claimed the row yet.
   */
  | { kind: "not-activated"; player: Player }
  /** on the roster and switched off by the club */
  | { kind: "deactivated"; player: Player }
  /** not on the roster at all. They may still play as a guest. */
  | { kind: "not-a-member" }
  /** nobody is signed in */
  | { kind: "signed-out" };

function normalise(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

/** The roster row this email belongs to, by roster email or by claim. */
export function rosterRowFor(
  roster: Player[],
  email: string | null | undefined,
): Player | undefined {
  const e = normalise(email);
  if (!e) return undefined;
  return roster.find(
    (p) => normalise(p.email) === e || normalise(p.invite?.claimedBy) === e,
  );
}

/**
 * What this signed-in email is entitled to.
 *
 * In demo the answer is always "member" for anyone the roster recognises and
 * "signed-out" otherwise, because demo has no invitations to honour.
 */
export function memberAccess(
  roster: Player[],
  email: string | null | undefined,
): MemberAccess {
  if (!normalise(email)) return { kind: "signed-out" };
  const player = rosterRowFor(roster, email);
  if (!player) return { kind: "not-a-member" };

  if (!IS_PILOT) return { kind: "member", player };

  if (player.active === false) return { kind: "deactivated", player };
  if (!player.invite?.activatedAt) return { kind: "not-activated", player };
  return { kind: "member", player };
}

/**
 * What the golfer app should say. Kept beside the rule rather than in a
 * component so the wording is reviewed with the logic it belongs to, and so a
 * new branch cannot ship without someone deciding what it tells a person.
 *
 * None of these blame the reader. Someone who cannot get in is standing in a
 * clubhouse wanting to play golf, and the club, not the app, is the thing that
 * can actually resolve it.
 */
export function accessMessage(access: MemberAccess): {
  title: string;
  body: string;
} | null {
  switch (access.kind) {
    case "member":
    case "signed-out":
      return null;
    case "not-a-member":
      return {
        title: "We could not find your membership",
        body: "This email is not on the club's roster. If you are a member, the club can add you or send your invitation. If you are here for a corporate or charity day, your organiser will send you a registration link instead.",
      };
    case "not-activated":
      return {
        title: "Your invitation is waiting",
        body: "The club has a place for you on the roster, but the invitation has not been used yet. Ask the club to resend it and open the link they send you.",
      };
    case "deactivated":
      return {
        title: "This membership is not active",
        body: "The club has this membership switched off. Your cards and results are all still kept. The club can switch it back on.",
      };
  }
}

/* ------------------------------------------------------------------ *
 * Invitation tokens
 * ------------------------------------------------------------------ */

/**
 * A token is a credential: following it claims a named person's membership,
 * their handicap and their scoring history. 160 bits from the platform CSPRNG,
 * in an alphabet with no look-alike characters, because these get read off a
 * WhatsApp message and typed by hand often enough to matter.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newInviteToken(): string {
  const bytes = new Uint8Array(20);
  // Node and every browser Shimo targets both expose this on globalThis.
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** The link a club sends. Relative so it works on any deployment host. */
export function invitePath(token: string) {
  return `/join/${token}`;
}
