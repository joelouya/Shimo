import { DEMO_USER_ID, playerById } from "./data";
import type { Tournament } from "./types";

export type Eligibility =
  | { kind: "eligible"; label: string }
  | { kind: "locked"; label: string }
  | { kind: "limit"; label: string };

/** Eligibility of the demo user (Joe — Muthaiga member, HC 12) for a tournament. */
export function eligibilityFor(t: Tournament): Eligibility {
  const user = playerById(DEMO_USER_ID);
  if (t.ladiesOnly && user.gender === "M")
    return { kind: "locked", label: "Ladies only" };
  if (t.membersOnly && t.clubId !== user.clubId)
    return { kind: "locked", label: "Members only" };
  if (t.maxHandicap != null && user.handicap > t.maxHandicap)
    return { kind: "limit", label: `HC ${t.maxHandicap} and below` };
  if (t.maxHandicap != null)
    return { kind: "eligible", label: `You're eligible · HC ${t.maxHandicap} and below` };
  return { kind: "eligible", label: "You're eligible" };
}
