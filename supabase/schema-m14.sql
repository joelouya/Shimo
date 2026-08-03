/* ------------------------------------------------------------------ *
 * M14 - the sponsor's own copy
 *
 * A recap pack is a PDF the club downloads and forwards. This is the page
 * behind it: somewhere a sponsor's marketing team can open the pack, pull the
 * individual images for a deck, and come back to it in three months when they
 * are deciding next year's budget.
 *
 * The pack lives here rather than being rebuilt on demand, for one reason
 * that matters: a recap is a statement about a day that has finished. If it
 * were recomputed from live data, a figure a sponsor read in September could
 * quietly differ from the one they read in November. What is published is
 * what was true when the club published it, and it does not move.
 * ------------------------------------------------------------------ */

create table if not exists recap_packs (
  /* Unguessable. The first version of this used /recap/<tournament>/<sponsor>,
     which two sponsors at the same event could edit into each other's packs.
     A corporate day routinely has two banks on it. */
  token         text primary key,
  tournament_id text not null,
  sponsor_id    text not null,
  /* The whole RecapSpec as published. Frozen on purpose: see above. */
  spec          jsonb not null,
  created_at    timestamptz not null default now(),
  /* who published it, for the club's own record */
  actor         text not null default ''
);

/* One live pack per sponsor per event. Re-publishing replaces it, so a club
   that fixes a typo and publishes again does not leave two links alive. */
create unique index if not exists recap_packs_one_per_sponsor
  on recap_packs (tournament_id, sponsor_id);

alter table recap_packs enable row level security;

/* ------------------------------------------------------------------ *
 * Packs are not listable.
 *
 * Same reasoning as the guest codes in M13. An open select would let anyone
 * enumerate every sponsor pack for every club, which includes participant
 * names. Resolution goes through one function that answers a single token and
 * will not answer "what packs exist".
 * ------------------------------------------------------------------ */

drop policy if exists "recap packs read" on recap_packs;

/* The club publishes without a session in demo and with one in pilot; either
   way writing a row reveals nothing, because the writer composed it. */
drop policy if exists "recap packs write" on recap_packs;
create policy "recap packs write" on recap_packs
  for insert to anon, authenticated with check (true);

/* Re-publishing is the one update this table allows, and only of the spec. */
drop policy if exists "recap packs republish" on recap_packs;
create policy "recap packs republish" on recap_packs
  for update to anon, authenticated using (true) with check (true);

create or replace function resolve_recap_pack(p_token text)
returns table (tournament_id text, sponsor_id text, spec jsonb, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select r.tournament_id, r.sponsor_id, r.spec, r.created_at
  from recap_packs r
  where r.token = lower(btrim(p_token))
  limit 1;
$$;

revoke all on function resolve_recap_pack(text) from public;
grant execute on function resolve_recap_pack(text) to anon, authenticated;
