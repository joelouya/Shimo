-- Shimo pilot schema, Milestone 23: who marks whom, saved on the group
--
-- { "<playerId>": "<markerId>", ... } for every player in the group, written
-- by the desk with the tee sheet and read by every phone, so two devices in
-- one group can never disagree about who keeps whose card. Null on rows
-- written before this existed: every device then derives the same default
-- pairing (A<->B, C<->D; a three ends in a triangle) from the same player
-- order. See lib/markers.ts.

alter table pairings add column if not exists markers jsonb;
