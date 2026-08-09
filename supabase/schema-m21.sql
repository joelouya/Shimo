/* ------------------------------------------------------------------ *
 * M21 - a guest entry carries its waitlist standing and its answers
 *
 * The client already registers guests cross-device: the entry, with the code
 * that opens the card, is pushed to guest_entries so a fresh phone can resolve
 * a printed code through resolve_guest_code (M13, throttled in M16). Two fields
 * the C2 registration form now captures had nowhere to land on that row:
 *
 *   - waitlisted: the field was full and the club takes a waitlist, so this
 *     entry is on it. The desk waves them in the moment a place opens without
 *     asking them to register again.
 *   - answers:    replies to the club's own custom questions - shirt size, a
 *     dietary need, a raffle number. Club-facing operational data, the same
 *     class as the free-text guest notes on `players`, and never shared with a
 *     sponsor under any setting. See docs/COMMITMENTS.md.
 *
 * These change nothing about who can read the row. guest_entries stays
 * non-enumerable - no select policy, insert-only writes - and resolve_guest_code
 * still returns only (tournament_id, guest_id). Neither column is ever handed
 * to a client; they exist for a person with database access, which is the same
 * DPA posture guest notes already sit under.
 *
 * Two additive columns. Nothing is dropped or rewritten, so this is safe
 * against a live pilot database mid-tournament. Run after M13. Idempotent.
 * ------------------------------------------------------------------ */

alter table guest_entries
  /* On the waitlist rather than in the field. Default false so entries written
     before this read back as confirmed, which is what they were. */
  add column if not exists waitlisted boolean not null default false,
  /* Answers to the club's custom registration questions, keyed by question id:
     { [questionId]: answer }. Club-facing only, never sponsor-facing. */
  add column if not exists answers jsonb;
