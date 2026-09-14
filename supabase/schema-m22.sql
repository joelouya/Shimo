-- Shimo pilot schema, Milestone 22: entries, who is in the field, synced
--
-- Before the day, a member taps Register on their phone, a guest registers
-- through the public form, or the desk adds a walk-up. Each of those is one
-- row here, so every device (and the desk building the tee sheet) sees the
-- same field. A row carries no code and no contact data: guest_entries keeps
-- the guest's one-time code and stays non-enumerable exactly as Milestone 13
-- left it. Names resolve through players, which anon already reads.
--
-- With the pilot's anonymous policies this means anyone holding the public
-- key can list which player ids registered for an open event, the same way
-- they can already read the pairings once drawn. Recorded in COMMITMENTS.md;
-- closed by the authenticated policies when the admin console signs in.

create table if not exists entries (
  tournament_id text not null,
  player_id     text not null,
  kind          text not null default 'member',      -- member | guest
  status        text not null default 'registered',  -- registered | waitlisted | withdrawn
  via           text not null default 'phone',       -- phone | desk
  registered_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create index if not exists entries_tournament_status_idx
  on entries (tournament_id, status);

alter table entries enable row level security;

drop policy if exists "pilot read entries"   on entries;
drop policy if exists "pilot write entries"  on entries;
drop policy if exists "pilot update entries" on entries;
create policy "pilot read entries"   on entries for select to anon, authenticated using (true);
create policy "pilot write entries"  on entries for insert to anon, authenticated with check (true);
create policy "pilot update entries" on entries for update to anon, authenticated using (true) with check (true);
-- no delete: a withdrawal is a status, like everything else here

do $$ begin
  execute 'alter publication supabase_realtime add table entries';
exception when duplicate_object then null; end $$;
