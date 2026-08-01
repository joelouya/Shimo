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

/* ------------------------------------------------------------------ *
 * Guests
 *
 * On a corporate or charity day most of the field has never been to the club
 * and has no handicap on file anywhere. They score, they mark for a partner,
 * and their certification is worth exactly what a member's is: R&A 3.3b asks
 * who kept the card, not who holds a membership.
 *
 * Guests live on `players` alongside members rather than in a table of their
 * own, because everything downstream of a tee time treats them identically
 * and forking the player row would mean forking scoring, pairings, cards and
 * attestation with it. What separates them is `is_guest` and the fact that no
 * club roster query ever returns them.
 * ------------------------------------------------------------------ */

alter table players
  add column if not exists is_guest boolean not null default false,
  /* the organisation they are playing for, which is the unit a corporate day
     is actually organised around */
  add column if not exists company text,
  /* true when `handicap` is the guest's own claim rather than a WHS index.
     Surfaced wherever it affects a result, so a net placing on a corporate
     day is never mistaken for a WHS-grade figure. */
  add column if not exists handicap_self_declared boolean not null default false,
  /* Dietary and accessibility notes. Operational data for the club and, some
     of it, health data. Never reaches a sponsor under any setting.
     See docs/COMMITMENTS.md. */
  add column if not exists guest_notes text,
  /* Explicit opt-in to appearing in a sponsor's participant list, captured at
     registration. False unless the guest said yes. */
  add column if not exists sponsor_list_consent boolean not null default false;

/* One guest's place in one tournament, carrying the code that opens their own
   scorecard on the day. Scoped to a single tournament on purpose: a code good
   for every event a guest ever played would be a password by another name. */
create table if not exists guest_entries (
  tournament_id text not null,
  guest_id      text not null,
  /* unguessable, and only ever good for this one tournament */
  code          text not null,
  registered_at timestamptz not null default now(),
  primary key (tournament_id, guest_id)
);

/* Globally unique, not unique per tournament: a guest types a code with no
   idea which event it belongs to, so the code alone has to identify one. */
create unique index if not exists guest_entries_code_key
  on guest_entries (code);

alter table guest_entries enable row level security;

/* ------------------------------------------------------------------ *
 * The codes are never readable.
 *
 * A guest resolves their code without a session, so the obvious thing is to
 * open `select` to anon and let the client search. That would hand every code
 * for every event to anyone who asked, and a credential anyone can enumerate
 * is not a credential. Six characters is only safe because it cannot be
 * listed and cannot be guessed at speed.
 *
 * So there is no read policy at all. Resolution happens through one function
 * that takes a code and gives back the single row it matches, and nothing
 * else. There is no way to ask this schema "what codes exist".
 * ------------------------------------------------------------------ */

drop policy if exists "guest entries read" on guest_entries;

/* Registering has no session either, so the insert stays open. A row written
   here reveals nothing: the code is generated client-side and the writer
   already knows it. */
drop policy if exists "guest entries write" on guest_entries;
create policy "guest entries write" on guest_entries
  for insert to anon, authenticated with check (true);

/* No update and no delete: an entry that was made stays made, like every
   other record in this schema. */

create or replace function resolve_guest_code(p_code text)
returns table (tournament_id text, guest_id text)
language sql
security definer
set search_path = public
as $$
  select e.tournament_id, e.guest_id
  from guest_entries e
  where e.code = lower(btrim(p_code))
  limit 1;
$$;

revoke all on function resolve_guest_code(text) from public;
grant execute on function resolve_guest_code(text) to anon, authenticated;

/* ------------------------------------------------------------------ *
 * Contest holes
 *
 * Nearest the pin, longest drive, the hole-in-one car. Their own column
 * rather than a shape inside `sponsors`, because a contest happens at a place
 * on the course, it is usually the thing a category sponsor actually bought,
 * and the player standing on that tee should be able to see whose contest it
 * is. Shape:
 *   [{ id, name, hole, round?, prize?, sponsorId?, result? }]
 * ------------------------------------------------------------------ */
alter table tournaments
  add column if not exists contests jsonb;

/* Sponsors the club has worked with before, so a recurring corporate calendar
   does not mean retyping the same eight companies and re-uploading the same
   eight logos every quarter. Same Sponsor shape as tournaments.sponsors. */
alter table clubs
  add column if not exists sponsor_book jsonb;

/* ------------------------------------------------------------------ *
 * Corporate and charity days
 *
 * Same scoring, same attestation, same integrity record as a club medal.
 * What differs is who is in the field, whose name is on the day, and what
 * happens the week afterwards.
 * ------------------------------------------------------------------ */
alter table tournaments
  /* 'standard' | 'corporate' | 'charity'. Null reads as standard, so nothing
     created before this changes. */
  add column if not exists event_kind text,
  /* The brand the day belongs to: { name, logoUrl?, accent? }. On these days
     the host club is the venue rather than the owner, and the running order
     of those two names is something a sponsor notices. */
  add column if not exists presented_by jsonb,
  /* Charity days: { name, cause?, targetKES?, raisedKES? }. raisedKES is
     entered by the club, never derived from entry fees: what a day raises
     includes an auction, a raffle and cheques written in the car park, and a
     figure computed from entries alone would be wrong in a document the
     beneficiary reads. */
  add column if not exists beneficiary jsonb;
