-- Shimo pilot schema, Milestone 2: real dual entry across devices
--
-- Run this in the Supabase SQL editor after schema.sql and schema-pilot.sql.
--
-- Why this exists
-- ---------------
-- Rule 3.3b dual entry means two people record the same hole independently:
-- the player records their own score, and their marker records what they saw.
-- The comparison between those two figures is the whole point, and it is what
-- the attestation step resolves.
--
-- Until now `scores` was keyed (tournament_id, player_id, hole), with `source`
-- as an ordinary column. On a single device that was fine, because the two
-- views live in separate maps in local state. Across devices it was not: the
-- player's phone and the marker's phone both upserted the same row, so
-- whichever wrote last silently overwrote the other and the discrepancy
-- disappeared before anyone could see it.
--
-- Adding `source` to the primary key lets both entries coexist:
--   source = 'player'  the player's own card
--   source = 'marker'  what their marker recorded for them
--   source = 'desk'    the caddymaster's entry from the paper card, which is
--                      the agreed figure and therefore authoritative for both
--
-- Existing rows are unaffected: there is at most one row per
-- (tournament_id, player_id, hole) today, so widening the key cannot collide.

alter table scores drop constraint if exists scores_pkey;

alter table scores
  add constraint scores_pkey
  primary key (tournament_id, player_id, hole, source);

-- Reading a player's card, and the realtime filter, both go by tournament.
create index if not exists scores_tournament_idx on scores (tournament_id);

-- Replay order matters when the desk overrides what the players entered, so
-- make sure the timestamp is always populated.
alter table scores
  alter column updated_at set default now();
