-- Shimo pilot schema, Milestone 6: tiered entry pricing
--
-- Run this in the Supabase SQL editor after schema-m5.sql.
--
-- A club medal has one price. A championship has several: a member rate, a
-- loyalty rate for returning players, an early bird that expires before entries
-- close. The sheet rides on the tournament as jsonb, like rounds and divisions.
--
-- `entry_fee` stays, holding the cheapest rate currently available, so anything
-- reading a single number keeps working. A tournament with no sheet is read as
-- one "Standard entry" at that price.

alter table tournaments
  add column if not exists fee_tiers jsonb;

comment on column tournaments.fee_tiers is
  'FeeTier[] as JSON: id, label, amount (KES), audience (all|members|guests), optional until (ISO datetime for early-bird expiry). Null means a single Standard entry at entry_fee.';
