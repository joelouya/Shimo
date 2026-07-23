-- Shimo pilot schema
-- Run this in the Supabase SQL editor (or `supabase db push`) for the project
-- whose URL/anon key you put in .env.local.
--
-- Notes for the pilot:
-- * RLS is enabled with permissive anon policies so the pilot works without
--   auth. Lock this down before anything beyond a single-club pilot.
-- * `scores` is the hot table: one row per (tournament, player, hole),
--   last-write-wins by updated_at. Realtime is enabled on it so every open
--   device converges within a second.

create table if not exists scores (
  tournament_id text not null,
  player_id     text not null,
  hole          smallint not null check (hole between 0 and 17),
  gross         smallint,
  source        text not null default 'app',      -- player | marker | desk
  client_id     text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, player_id, hole)
);

create table if not exists events_log (
  id            bigint generated always as identity primary key,
  tournament_id text not null,
  kind          text not null,                    -- attest | card-in
  payload       jsonb not null default '{}',
  client_id     text not null default '',
  created_at    timestamptz not null default now()
);

-- realtime on the hot table
alter publication supabase_realtime add table scores;

-- permissive pilot policies (single club, anon key)
alter table scores enable row level security;
alter table events_log enable row level security;

create policy "pilot read scores"  on scores     for select using (true);
create policy "pilot write scores" on scores     for insert with check (true);
create policy "pilot update scores" on scores    for update using (true);
create policy "pilot read events"  on events_log for select using (true);
create policy "pilot write events" on events_log for insert with check (true);
