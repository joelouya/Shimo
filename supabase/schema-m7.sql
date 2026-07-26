-- Shimo pilot schema, Milestone 7: sponsors
--
-- Run this in the Supabase SQL editor after schema-m6.sql.
--
-- Sponsors ride on the tournament as jsonb, like rounds, divisions and fee
-- tiers. Their marks go in the club-assets bucket created by schema-m5.sql,
-- filed under the club that owns them, so no new storage is needed.

alter table tournaments
  add column if not exists sponsors jsonb;

comment on column tournaments.sponsors is
  'Sponsor[] as JSON: id, name, optional logoUrl, optional tier (title|prize|category|partner). Null means no sponsors.';
