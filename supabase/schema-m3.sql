-- Shimo pilot schema, Milestone 3: multi-round tournaments
--
-- Run this in the Supabase SQL editor after schema-m2c.sql.
--
-- What changes
-- ------------
-- A tournament can now have several rounds, each with its own date, course,
-- tees, pairings and cut. Everything that was "this tournament's scores" is now
-- "this round's scores", so `round` joins the key of every per-player table.
--
-- Round 1 is the default everywhere, which is what a normal club medal is, so
-- existing rows are backfilled to round 1 and single-round events behave
-- exactly as before.
--
-- The rounds themselves ride on the tournament as jsonb, alongside `divisions`
-- and `prizes`, so no new table and no extra round trip on hydration.

/* ------------------------------------------------------------------ */
/* 1. Tournaments carry their rounds                                   */
/* ------------------------------------------------------------------ */
alter table tournaments
  add column if not exists rounds jsonb;

comment on column tournaments.rounds is
  'Round[] as JSON: id, number, name, date, courseId, tees, firstTee, teeInterval, cut. Null means a single round built from the tournament''s own date and course.';

/* ------------------------------------------------------------------ */
/* 2. Scores are per round                                             */
/* ------------------------------------------------------------------ */
alter table scores
  add column if not exists round smallint not null default 1;

alter table scores drop constraint if exists scores_pkey;
alter table scores
  add constraint scores_pkey
  primary key (tournament_id, round, player_id, hole, source);

create index if not exists scores_round_idx
  on scores (tournament_id, round);

/* ------------------------------------------------------------------ */
/* 3. Pairings are per round                                           */
/* ------------------------------------------------------------------ */
-- Leaders are re-paired for the next round, so a group id is only unique
-- within its round.
alter table pairings
  add column if not exists round smallint not null default 1;

alter table pairings drop constraint if exists pairings_pkey;
alter table pairings
  add constraint pairings_pkey
  primary key (tournament_id, round, group_id);

/* ------------------------------------------------------------------ */
/* 4. Certification is per round                                       */
/* ------------------------------------------------------------------ */
-- Rule 3.3b applies to each round's card independently: a player attests and
-- certifies once per round, and each seal covers that round alone.
alter table certifications
  add column if not exists round smallint not null default 1;

alter table certifications drop constraint if exists certifications_pkey;
alter table certifications
  add constraint certifications_pkey
  primary key (tournament_id, round, player_id);

/* ------------------------------------------------------------------ */
/* 5. Card-in is per round                                             */
/* ------------------------------------------------------------------ */
alter table card_in
  add column if not exists round smallint not null default 1;

alter table card_in drop constraint if exists card_in_pkey;
alter table card_in
  add constraint card_in_pkey
  primary key (tournament_id, round, player_id);

/* ------------------------------------------------------------------ */
/* 6. Disputes, corrections and the audit trail note their round       */
/* ------------------------------------------------------------------ */
-- These keep their own id as primary key; the round is for filtering and for
-- reading the trail one round at a time.
alter table disputes    add column if not exists round smallint not null default 1;
alter table corrections add column if not exists round smallint not null default 1;
alter table audit_log   add column if not exists round smallint not null default 1;

create index if not exists audit_round_idx on audit_log (tournament_id, round);

/* ------------------------------------------------------------------ */
/* 7. The integrity guards follow the round                            */
/* ------------------------------------------------------------------ */
-- schema-m2c.sql locked a returned card against edits from a phone, and
-- pinned a sealed hash. Both looked the certification up by player alone,
-- which would now find the wrong round's card. Re-create them round-aware.

create or replace function shimo_guard_scores()
returns trigger
language plpgsql
as $$
declare
  cert_stage text;
begin
  if new.source not in ('player', 'marker') then
    return new;               -- desk and committee writes always allowed
  end if;
  if new.gross is not distinct from old.gross then
    return new;               -- unchanged: a harmless retry
  end if;

  select stage into cert_stage
    from certifications
   where tournament_id = new.tournament_id
     and round = new.round
     and player_id = new.player_id;

  if cert_stage in ('certified', 'dq') then
    raise exception
      'round % card already returned for player %; corrections go through the Committee',
      new.round, new.player_id;
  end if;

  return new;
end
$$;

create or replace function shimo_guard_certifications()
returns trigger
language plpgsql
as $$
begin
  -- a sealed hash may only change when the Committee approved a correction
  -- for that same round
  if old.locked_hash is not null
     and new.locked_hash is distinct from old.locked_hash
     and not exists (
       select 1
         from corrections
        where tournament_id = new.tournament_id
          and round = new.round
          and player_id = new.player_id
          and status = 'approved'
     )
  then
    raise exception
      'certification hash is sealed for player % in round %; it can only change with an approved Committee correction',
      old.player_id, old.round;
  end if;

  if old.stage in ('certified', 'dq')
     and new.stage not in ('certified', 'dq', 'disputed', 'committee-review')
  then
    raise exception
      'certification cannot regress from % to % (player %, round %)',
      old.stage, new.stage, old.player_id, old.round;
  end if;

  return new;
end
$$;

-- triggers are unchanged in shape; re-attach in case they were dropped
drop trigger if exists guard_scores on scores;
create trigger guard_scores
  before update on scores
  for each row execute function shimo_guard_scores();

drop trigger if exists guard_certifications on certifications;
create trigger guard_certifications
  before update on certifications
  for each row execute function shimo_guard_certifications();
