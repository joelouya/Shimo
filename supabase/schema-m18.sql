/* ------------------------------------------------------------------ *
 * M18 - teams
 *
 * A team is a side that shares a result: a scramble pair playing one ball, a
 * better-ball pair, a match-play side. It is deliberately not a pairing group -
 * a fourball tee time can hold two better-ball teams - so teams are stored on
 * their own, keyed by round the way pairings are, and carry an editable name.
 *
 * A scramble team also owns a scorecard under its own id (the `scores` table
 * already keys on player_id, and a team id is written there like a player's),
 * so nothing new is needed to store team scores.
 *
 * Permissive pilot RLS, matching every other table: anon may read, insert and
 * update, never delete.
 *
 * Run after M2 (which widened the pairings key to include round). Idempotent.
 * ------------------------------------------------------------------ */

create table if not exists teams (
  tournament_id text not null,
  round         int  not null default 1,
  team_id       text not null,
  name          text not null default '',
  player_ids    jsonb not null default '[]'::jsonb,
  division      text,
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, round, team_id)
);

create index if not exists teams_tournament_idx on teams (tournament_id);

do $$
begin
  execute 'alter table teams enable row level security';
  execute 'drop policy if exists "pilot read teams" on teams';
  execute 'drop policy if exists "pilot write teams" on teams';
  execute 'drop policy if exists "pilot update teams" on teams';
  execute 'create policy "pilot read teams"  on teams for select using (true)';
  execute 'create policy "pilot write teams" on teams for insert with check (true)';
  execute 'create policy "pilot update teams" on teams for update using (true)';
end $$;

/* Fold the new table into the simulator purge (M17), so `select
   purge_simulator_data();` clears simulated teams too. Scoped to the sim
   prefixes exactly like the rest of that function. */
create or replace function purge_simulator_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from scores         where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from certifications where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from card_in        where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from disputes       where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from corrections    where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from audit_log      where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from teams          where tournament_id like 'sim-%';
  delete from pairings       where tournament_id like 'sim-%';
  delete from players        where id like 'simp-%';
  delete from tournaments    where id like 'sim-%';
end;
$$;
