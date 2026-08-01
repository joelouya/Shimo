/* ------------------------------------------------------------------ *
 * M13 - membership is something the club grants
 *
 * Until now, being a member meant a magic-link email happening to match a
 * roster row. An email that missed produced a blank profile rather than a
 * refusal, so "member" and "stranger" were the same state wearing different
 * labels. That is tolerable while everyone in the app is a member and stops
 * being tolerable the moment guests exist, because the whole guest design
 * rests on the club knowing which of the two someone is.
 *
 * Five additive columns. Nothing is dropped and nothing is rewritten, so this
 * is safe against a live pilot database mid-tournament.
 * ------------------------------------------------------------------ */

alter table players
  /* Unguessable, single-use. This is a credential: following it claims a named
     person's membership, their handicap and their scoring history. */
  add column if not exists invite_token text,
  add column if not exists invite_sent_at timestamptz,
  /* null means invited but never claimed */
  add column if not exists invite_activated_at timestamptz,
  /* The email that claimed the row, which need not be the roster email. A
     member who signs in with a different address is linked here rather than
     being turned away or quietly duplicated. */
  add column if not exists invite_claimed_by text,
  /* A deactivated member keeps every card they ever returned and stops being
     able to sign in. Default true so a roster imported before this existed is
     not silently locked out. */
  add column if not exists active boolean not null default true;

/* One row per token. A collision would hand one member's membership to
   another, so let the database refuse it rather than trusting the generator. */
create unique index if not exists players_invite_token_key
  on players (invite_token)
  where invite_token is not null;

/* The lookup the activation page makes, once, by token. */
create index if not exists players_invite_lookup_idx
  on players (invite_token)
  where invite_token is not null and invite_activated_at is null;
