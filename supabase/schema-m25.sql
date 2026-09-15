-- Shimo pilot schema, Milestone 25: containment before there is a login
--
-- The pilot's policies let the public key read and write nearly everything,
-- by design (the desk has no sign-in of its own; see schema-m2c.sql). Three
-- holes can be closed without one, and they are closed here:
--
--   1. Invitation tokens were stored in plaintext on a world-readable table.
--      Anyone could list every unclaimed membership and walk in through
--      /join/<token>. The database now keeps only a SHA-256 of the token:
--      the plaintext exists on the desk that minted it and in the link the
--      club sends, and nowhere else. Looking one up and claiming it go
--      through two functions that answer a single token.
--   2. The sealed-card guard (schema-m2c) let any write whose source was not
--      'player' or 'marker' through, so a client that wrote source='desk'
--      could re-score a returned card. Desk writes are now refused too;
--      only 'committee' writes (a decided correction or dispute) still land.
--   3. Recap packs could be rewritten by anyone with the public key. The
--      update policy goes; re-publishing needs the pack's own token, which
--      only the club holds.
--
-- Two holes remain open until the desk signs in, and are recorded in
-- docs/NEXT-PASS.md: card photographs need select on the private bucket
-- to mint a signed link, and the crest bucket has no owner to check.

/* SHA-256 from Postgres itself (pg_catalog.sha256, since 11), so this does
   not depend on where a host installs pgcrypto: Supabase keeps it in the
   `extensions` schema, out of reach of a function pinned to `public`. */
create or replace function shimo_sha256(p_text text)
returns text
language sql
immutable
strict
as $$
  select encode(sha256(convert_to(p_text, 'UTF8')), 'hex');
$$;

/* ------------------------------------------------------------------ */
/* 1. Invitations: hashed at rest                                      */
/* ------------------------------------------------------------------ */

alter table players add column if not exists invite_token_hash text;

create unique index if not exists players_invite_token_hash_key
  on players (invite_token_hash)
  where invite_token_hash is not null;

/* Every write that carries a plaintext token stores its hash and drops the
   plaintext. A write that carries neither (a device that only ever saw the
   hash re-saving the row) keeps the hash it had. */
create or replace function shimo_hash_invite()
returns trigger
language plpgsql
as $$
begin
  if new.invite_token is not null then
    new.invite_token_hash := shimo_sha256(new.invite_token);
    new.invite_token := null;
  elsif tg_op = 'UPDATE' and new.invite_token_hash is null then
    new.invite_token_hash := old.invite_token_hash;
  end if;
  return new;
end
$$;

drop trigger if exists hash_invite on players;
create trigger hash_invite
  before insert or update on players
  for each row execute function shimo_hash_invite();

/* Tokens already at rest are hashed once and the plaintext cleared. A club
   that sent links before this ran keeps them working: the hash matches. */
update players
   set invite_token_hash = shimo_sha256(invite_token),
       invite_token = null
 where invite_token is not null;

/* Who an invitation is for, without claiming it. Returns nothing for an
   unknown, used, or switched-off invitation, and does not say which. */
create or replace function lookup_invite(p_token text)
returns table (
  id text, name text, club_id text, handicap numeric, member_no text,
  activated boolean, active boolean
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name, p.club_id, p.handicap, p.member_no,
         p.invite_activated_at is not null, p.active
    from players p
   where p.invite_token_hash = shimo_sha256(btrim(p_token))
   limit 1;
$$;

revoke all on function lookup_invite(text) from public;
grant execute on function lookup_invite(text) to anon, authenticated;

/* Claim it: one time, only while the membership is on. Returns the row it
   claimed, or nothing. */
create or replace function claim_invite(p_token text, p_email text default null)
returns table (
  id text, name text, club_id text, handicap numeric, member_no text,
  activated_at timestamptz, claimed_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := shimo_sha256(btrim(p_token));
  v_row  players%rowtype;
begin
  select * into v_row from players p
   where p.invite_token_hash = v_hash
     and p.invite_activated_at is null
     and p.active
   for update;
  if not found then
    return;
  end if;
  update players
     set invite_activated_at = now(),
         invite_claimed_by = coalesce(lower(btrim(p_email)), invite_claimed_by),
         updated_at = now()
   where players.id = v_row.id;
  return query
    select p.id, p.name, p.club_id, p.handicap, p.member_no,
           p.invite_activated_at, p.invite_claimed_by
      from players p where p.id = v_row.id;
end
$$;

revoke all on function claim_invite(text, text) from public;
grant execute on function claim_invite(text, text) to anon, authenticated;

/* ------------------------------------------------------------------ */
/* 2. A returned card is closed to the desk as well                    */
/* ------------------------------------------------------------------ */

create or replace function shimo_guard_scores()
returns trigger
language plpgsql
as $$
declare
  cert_stage text;
begin
  if new.source = 'committee' then
    return new;               -- a decided correction or dispute
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
      'card already returned for player %; corrections go through the Committee',
      new.player_id;
  end if;

  return new;
end
$$;

/* ------------------------------------------------------------------ */
/* 3. Recap packs: re-publishing needs the pack's own token            */
/* ------------------------------------------------------------------ */

drop policy if exists "recap packs republish" on recap_packs;

create or replace function republish_recap_pack(p_token text, p_spec jsonb, p_actor text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update recap_packs
     set spec = p_spec, actor = coalesce(p_actor, actor)
   where token = lower(btrim(p_token));
  get diagnostics v_count = row_count;
  return v_count > 0;
end
$$;

revoke all on function republish_recap_pack(text, jsonb, text) from public;
grant execute on function republish_recap_pack(text, jsonb, text) to anon, authenticated;

/* ------------------------------------------------------------------ */
/* 4. The simulator purge knows every table that exists now            */
/* ------------------------------------------------------------------ */

create or replace function purge_simulator_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from scores          where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from certifications  where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from card_in         where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from disputes        where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from corrections     where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from audit_log       where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from entries         where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from guest_entries   where tournament_id like 'sim-%' or guest_id like 'simp-%';
  delete from exposure_events where tournament_id like 'sim-%';
  delete from tv_decisions    where tournament_id like 'sim-%';
  delete from recap_packs     where tournament_id like 'sim-%';
  delete from teams           where tournament_id like 'sim-%';
  delete from pairings        where tournament_id like 'sim-%';
  delete from players         where id like 'simp-%';
  delete from tournaments     where id like 'sim-%';
end;
$$;

revoke all on function purge_simulator_data() from public;
grant execute on function purge_simulator_data() to anon, authenticated;
