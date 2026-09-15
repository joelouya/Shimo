-- Shimo pilot schema, Milestone 24: the settings the wizard showed but never
-- saved, and the club's own name
--
-- The Review step printed "Ties: Back 9, then back 6" and "Registration
-- opens" and "Men only", and none of the three left the browser. They do
-- now. The clubs row gains the name the desk typed at first run, so every
-- surface stops assuming which club this is.

alter table tournaments add column if not exists men_only boolean not null default false;
alter table tournaments add column if not exists countback text;
alter table tournaments add column if not exists reg_opens text;

alter table clubs add column if not exists name text;
