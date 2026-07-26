-- Shimo pilot schema, Milestone 4: registration cutoff and richer eligibility
--
-- Run this in the Supabase SQL editor after schema-m3.sql.
--
-- Additive only: every column is nullable with a sensible fallback in the app,
-- so existing tournaments and members keep working untouched.

/* ------------------------------------------------------------------ */
/* Registration cutoff                                                 */
/* ------------------------------------------------------------------ */
-- `reg_closes` is a date, which a club reads as "the end of that day" but a
-- computer reads as 00:00. Entries close at a moment, so store one; the app
-- falls back to the end of reg_closes, then to the day before round 1.
alter table tournaments
  add column if not exists reg_closes_at timestamptz;

/* ------------------------------------------------------------------ */
/* Richer eligibility                                                  */
/* ------------------------------------------------------------------ */
-- members | members-guests | open. `members_only` is kept in step for the
-- older reads and is true exactly when membership = 'members'.
alter table tournaments
  add column if not exists membership text;

-- age limits, judged on the day the tournament starts
alter table tournaments add column if not exists min_age smallint;
alter table tournaments add column if not exists max_age smallint;

-- anything the structured rules cannot express, shown verbatim on the card
alter table tournaments add column if not exists eligibility_note text;

comment on column tournaments.eligibility_note is
  'Free text such as "Past champions only". Displayed to players but never used to block an entry, because only the club can judge it.';

/* ------------------------------------------------------------------ */
/* Date of birth, for age-restricted events                            */
/* ------------------------------------------------------------------ */
-- Optional. Only junior and senior events need it, and a member without one
-- is simply never blocked on age.
alter table players
  add column if not exists dob date;

/* ------------------------------------------------------------------ */
/* Backfill                                                            */
/* ------------------------------------------------------------------ */
update tournaments
   set membership = case when members_only then 'members' else 'open' end
 where membership is null;

update tournaments
   set reg_closes_at = (reg_closes || ' 23:59:59')::timestamptz
 where reg_closes_at is null
   and reg_closes is not null
   and reg_closes <> '';
