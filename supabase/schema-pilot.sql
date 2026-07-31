-- Shimo pilot schema - cross-device state (Milestone 1)
--
-- Run this in the Supabase SQL editor AFTER schema.sql. It adds the tables that
-- let a tournament live in the cloud, so any device that joins hydrates the
-- full state and stays in sync: the tournament itself, its pairings, the club
-- roster, and the whole certification / integrity trail.
--
-- RLS here is pilot-pragmatic: permissive anon access, matching schema.sql, so
-- Milestone 1 (sync core) can be tested before auth lands. Milestone 2 replaces
-- these with authenticated policies. The `service_role` key still bypasses all
-- of this for admin cleanup.

/* ------------------------------------------------------------------ */
/* Tournaments                                                         */
/* ------------------------------------------------------------------ */
create table if not exists tournaments (
  id                    text primary key,
  club_id               text not null,
  course_id             text not null,
  name                  text not null,
  date                  text not null,
  format                text not null,
  entry_fee             int  default 0,
  status                text not null default 'upcoming',
  members_only          boolean default false,
  max_handicap          int,
  min_handicap          int,
  ladies_only           boolean default false,
  divisions             jsonb default '[]'::jsonb,
  description           text default '',
  prizes                jsonb default '[]'::jsonb,
  max_players           int default 0,
  reg_closes            text,
  handicap_allowance    int default 95,
  first_tee             text default '07:30',
  tee_interval          int default 10,
  field_size            int default 0,
  correction_window_min int default 15,
  updated_at            timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Pairings - one row per playing group                                */
/* ------------------------------------------------------------------ */
create table if not exists pairings (
  tournament_id text not null,
  group_id      text not null,
  number        int not null,
  tee_time      text,
  player_ids    jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, group_id)
);

/* ------------------------------------------------------------------ */
/* Players - the club roster                                           */
/* ------------------------------------------------------------------ */
create table if not exists players (
  id         text primary key,
  club_id    text not null,
  name       text not null,
  handicap   numeric not null,
  gender     text default 'M',
  email      text,
  member_no  text,
  updated_at timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Certifications - marker attest + player certify state               */
/* ------------------------------------------------------------------ */
create table if not exists certifications (
  tournament_id      text not null,
  player_id          text not null,
  marker_id          text not null,
  stage              text not null,
  marker_attested_at bigint,
  player_certified_at bigint,
  marker_method      text,
  player_method      text,
  locked_hash        text,
  updated_at         timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

/* ------------------------------------------------------------------ */
/* Disputes                                                            */
/* ------------------------------------------------------------------ */
create table if not exists disputes (
  id             text primary key,
  tournament_id  text not null,
  player_id      text not null,
  hole_idx       int not null,
  marker_value   int,
  player_value   int,
  marker_entered_at bigint,
  player_entered_at bigint,
  reason         text,
  raised_by      text,
  status         text default 'open',
  resolution     text,
  ts             bigint,
  updated_at     timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Corrections                                                         */
/* ------------------------------------------------------------------ */
create table if not exists corrections (
  id              text primary key,
  tournament_id   text not null,
  player_id       text not null,
  hole_idx        int not null,
  current_gross   int,
  proposed_gross  int,
  reason          text,
  status          text default 'pending',
  decided_by      text,
  decision_reason text,
  ts              bigint,
  decided_at      bigint,
  updated_at      timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Audit log - append-only integrity trail                             */
/* ------------------------------------------------------------------ */
create table if not exists audit_log (
  id            text primary key,
  tournament_id text not null,
  player_id     text not null,
  kind          text not null,
  actor         text not null,
  ts            bigint not null,
  hash          text,
  device        jsonb,
  gps           jsonb,
  distance_m    int,
  handicaps     jsonb,
  app_version   text,
  detail        text,
  created_at    timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Card-in flags (per player, per tournament)                          */
/* ------------------------------------------------------------------ */
create table if not exists card_in (
  tournament_id text not null,
  player_id     text not null,
  is_in         boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */
do $$
declare t text;
begin
  foreach t in array array[
    'tournaments','pairings','players','certifications',
    'disputes','corrections','audit_log','card_in'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* RLS - pilot-pragmatic (permissive; tightened to authenticated in M2)*/
/* ------------------------------------------------------------------ */
do $$
declare t text;
begin
  foreach t in array array[
    'tournaments','pairings','players','certifications',
    'disputes','corrections','audit_log','card_in'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "pilot read %1$s" on %1$s', t);
    execute format('drop policy if exists "pilot write %1$s" on %1$s', t);
    execute format('drop policy if exists "pilot update %1$s" on %1$s', t);
    execute format('create policy "pilot read %1$s"  on %1$s for select using (true)', t);
    execute format('create policy "pilot write %1$s" on %1$s for insert with check (true)', t);
    execute format('create policy "pilot update %1$s" on %1$s for update using (true)', t);
  end loop;
end $$;
