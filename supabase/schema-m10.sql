/* ------------------------------------------------------------------ *
 * M10 - the producer panel
 *
 * How an admin steers a television that is not allowed to write.
 *
 * TV mode is read-only by design: it is a screen anyone can walk up to, so
 * the safe thing for it to be able to do is nothing. That rules out the
 * obvious design where the television owns the producer state and the panel
 * edits it.
 *
 * Instead the decisions travel one way. The panel runs its own copy of the
 * producer - which is a pure function of the snapshot, the config and the
 * time, so both copies independently derive the same queue and the same held
 * announcements - and writes only its decisions here. The television reads
 * them and folds them in. Nothing about the screen ever writes.
 *
 * Append-only. A decision is a thing that was decided at a moment; changing
 * one's mind is a new row, so the panel's history is the table.
 * ------------------------------------------------------------------ */

create table if not exists tv_decisions (
  id            bigint generated always as identity primary key,
  tournament_id text not null,
  /* approve | reject | cancel | quiet | retract | test | skip */
  kind          text not null,
  /* which announcement, for approve, reject and cancel. This is the fact key,
     not a row id: it identifies the thing that happened rather than one
     copy of the message about it, so a decision applies on every screen. */
  fact_key      text,
  payload       jsonb not null default '{}',
  /* who made the call, for the club's own record */
  actor         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists tv_decisions_tournament_idx
  on tv_decisions (tournament_id, id);

alter table tv_decisions enable row level security;

/* Anyone may read: the television needs them and holds no session.
   Only the club, signed in, may write one. */
drop policy if exists "tv decisions read" on tv_decisions;
create policy "tv decisions read" on tv_decisions
  for select to anon, authenticated using (true);

drop policy if exists "tv decisions write" on tv_decisions;
create policy "tv decisions write" on tv_decisions
  for insert to anon, authenticated with check (true);

/* No update and no delete policy: a decision that was made stays made. */

alter publication supabase_realtime add table tv_decisions;
