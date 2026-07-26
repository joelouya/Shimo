-- Shimo pilot schema, Milestone 5: club identity
--
-- Run this in the Supabase SQL editor after schema-m4.sql.
--
-- Clubs have only ever existed as constants compiled into the app. A club that
-- can upload a logo, choose an accent and publish its contact details needs a
-- row it owns, so this adds one. The compiled list stays as the fallback: a
-- club with no row renders exactly as it does today, in Shimo's own colours.

/* ------------------------------------------------------------------ */
/* Club identity                                                       */
/* ------------------------------------------------------------------ */
create table if not exists clubs (
  id           text primary key,          -- matches CLUBS[].id in lib/data.ts
  logo_url     text,
  /* one brand colour. Shimo derives a light-surface and a dark-surface tone
     from it; see lib/contrast.ts for why one value cannot serve both. */
  accent       text,
  phone        text,
  phone_alt    text,
  whatsapp     text,
  email        text,
  website      text,
  /* clubs may hide the Shimo credit on their generated posters */
  poster_credit boolean not null default true,
  updated_at   timestamptz not null default now()
);

alter table clubs enable row level security;

drop policy if exists "pilot read clubs"   on clubs;
drop policy if exists "pilot write clubs"  on clubs;
drop policy if exists "pilot update clubs" on clubs;

-- read is open: the public leaderboard and posters carry club branding and
-- must render for someone with no account
create policy "pilot read clubs"   on clubs for select using (true);
create policy "pilot write clubs"  on clubs for insert with check (true);
create policy "pilot update clubs" on clubs for update using (true);

-- no delete policy, matching every other table

alter publication supabase_realtime add table clubs;

/* ------------------------------------------------------------------ */
/* Logo storage                                                        */
/* ------------------------------------------------------------------ */
-- A public bucket, because the logo appears on the public leaderboard and is
-- baked into generated posters. Posters are rendered server-side, which needs
-- a URL it can fetch, not a data URI held in a browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-assets', 'club-assets', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

drop policy if exists "club assets readable"   on storage.objects;
drop policy if exists "club assets uploadable" on storage.objects;
drop policy if exists "club assets updatable"  on storage.objects;

create policy "club assets readable" on storage.objects
  for select using (bucket_id = 'club-assets');

create policy "club assets uploadable" on storage.objects
  for insert with check (bucket_id = 'club-assets');

create policy "club assets updatable" on storage.objects
  for update using (bucket_id = 'club-assets');
