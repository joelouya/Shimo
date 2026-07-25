-- Shimo pilot schema, Milestone 2c: integrity hardening at the database level
--
-- Run this in the Supabase SQL editor after schema-m2.sql.
--
-- Why this shape, and not "writes require authenticated"
-- ------------------------------------------------------
-- The obvious move would be to require an authenticated JWT for every write.
-- That would break the pilot today, for two reasons:
--
--   1. The club's admin console (tournament desk, bulk score entry, Committee
--      dispute view) has no sign-in of its own. It writes with the anon key.
--      Gating writes on auth would lock the caddymaster out mid-round.
--   2. A player who has not signed in still needs the follow-only path, and
--      sign-in itself depends on the club's email template.
--
-- So instead of a blanket auth gate that would take the desk offline, this
-- migration closes the holes that are actually exploitable with the public
-- anon key, none of which need auth to fix:
--
--   * the audit log was updatable, which defeats the point of an append-only
--     tamper-evident trail
--   * a sealed certification hash could be overwritten
--   * a certification stage could be walked backwards, un-returning a card
--   * a returned card's scores could still be edited from a phone
--
-- The authenticated policies are written out at the bottom, commented, ready
-- for when the admin console gets its own sign-in. Do not enable them before
-- then. `service_role` bypasses all of this for admin cleanup.

/* ------------------------------------------------------------------ */
/* 1. The audit log is append-only                                     */
/* ------------------------------------------------------------------ */
-- Insert and read, never modify. schema-pilot.sql granted UPDATE to everything
-- in a loop, which included this table; that is the one place it must not
-- apply, because the whole value of the trail is that entries cannot be
-- rewritten after the fact. There is no delete policy on any table, so
-- removal was already impossible.

drop policy if exists "pilot update audit_log" on audit_log;

/* ------------------------------------------------------------------ */
/* 2. A sealed certification cannot be altered                         */
/* ------------------------------------------------------------------ */
-- RLS alone cannot express this: a policy's USING clause sees the old row and
-- WITH CHECK sees the new one, but comparing the two needs a trigger.

create or replace function shimo_guard_certifications()
returns trigger
language plpgsql
as $$
begin
  -- Once a card is sealed its hash is the evidence, so it cannot simply be
  -- overwritten. There is one legitimate reason for it to change: the
  -- Committee approved a correction, which re-seals the card over the new
  -- figures. So a re-seal is allowed only when such a decision exists for
  -- this player, and is refused otherwise.
  if old.locked_hash is not null
     and new.locked_hash is distinct from old.locked_hash
     and not exists (
       select 1
         from corrections
        where tournament_id = new.tournament_id
          and player_id = new.player_id
          and status = 'approved'
     )
  then
    raise exception
      'certification hash is sealed for player %; it can only change with an approved Committee correction',
      old.player_id;
  end if;

  -- a returned card may go on to be disputed or reviewed by the Committee,
  -- but it can never quietly drop back to an earlier stage
  if old.stage in ('certified', 'dq')
     and new.stage not in ('certified', 'dq', 'disputed', 'committee-review')
  then
    raise exception
      'certification cannot regress from % to % (player %)',
      old.stage, new.stage, old.player_id;
  end if;

  return new;
end
$$;

drop trigger if exists guard_certifications on certifications;
create trigger guard_certifications
  before update on certifications
  for each row execute function shimo_guard_certifications();

/* ------------------------------------------------------------------ */
/* 3. A returned card cannot be re-scored from a phone                 */
/* ------------------------------------------------------------------ */
-- After certification the card is closed. Corrections are legitimate, but they
-- go through the Committee, which writes from the desk. So a change whose
-- source is a player or their marker is refused once the card is returned,
-- while desk and committee writes still land.
--
-- Deliberately scoped to UPDATE, and only when the figure actually changes:
--   * a late insert from a phone that was offline is still accepted, so
--     offline resilience is preserved
--   * an idempotent replay of the same value is accepted, so a retrying
--     outbox never wedges

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
     and player_id = new.player_id;

  if cert_stage in ('certified', 'dq') then
    raise exception
      'card already returned for player %; corrections go through the Committee',
      new.player_id;
  end if;

  return new;
end
$$;

drop trigger if exists guard_scores on scores;
create trigger guard_scores
  before update on scores
  for each row execute function shimo_guard_scores();

/* ------------------------------------------------------------------ */
/* 4. Reject obviously bad figures                                     */
/* ------------------------------------------------------------------ */
-- Cheap sanity bounds. A hole is already constrained to 0..17; this stops a
-- malformed client writing a nonsense stroke count.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scores_gross_sane'
  ) then
    alter table scores
      add constraint scores_gross_sane
      check (gross is null or (gross >= 1 and gross <= 20));
  end if;
end $$;

/* ------------------------------------------------------------------ */
/* 5. Ready for later: authenticated writes                            */
/* ------------------------------------------------------------------ */
-- Enable these only once the admin console signs in too, otherwise the
-- tournament desk loses write access. Reading stays open to anon so the
-- public leaderboard at /live/[id] keeps working without an account.
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'tournaments','pairings','players','scores','card_in',
--     'certifications','disputes','corrections'
--   ]
--   loop
--     execute format('drop policy if exists "pilot write %1$s" on %1$s', t);
--     execute format('drop policy if exists "pilot update %1$s" on %1$s', t);
--     execute format(
--       'create policy "auth write %1$s" on %1$s for insert to authenticated with check (true)', t);
--     execute format(
--       'create policy "auth update %1$s" on %1$s for update to authenticated using (true)', t);
--   end loop;
--   drop policy if exists "pilot write audit_log" on audit_log;
--   create policy "auth write audit_log" on audit_log
--     for insert to authenticated with check (true);
-- end $$;
