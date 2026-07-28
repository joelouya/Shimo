/* ------------------------------------------------------------------ *
 * M9 — the desk's publish gate
 *
 * Publishing a desk-entered card is a deliberate second act, not a switch.
 * The card is typed, then published, and only a published card is allowed
 * anywhere near the television.
 * ------------------------------------------------------------------ */

/* Who published it, and when. `is_in` already meant "the desk has returned
   this card"; these say who stood behind that and what evidence they left.

   published_by  — the club member id of the caddymaster or admin who did it,
                   confirmed with their PIN at the moment they did.
   card_photo    — storage path of a photograph of the paper card, if one was
                   attached. Optional, and encouraged: it is the only thing
                   that settles an argument about a card the player never
                   touched. */
alter table card_in
  add column if not exists published_by text,
  add column if not exists published_at timestamptz,
  add column if not exists card_photo text;

/* ------------------------------------------------------------------ *
 * Card photographs live in a private bucket, unlike crests and sponsor
 * marks.
 *
 * A photograph of a scorecard is not the same kind of object as a club
 * logo. It carries a player's handwriting and, more often than not, two
 * signatures, and it exists to be evidence in a dispute. A club's crest is
 * published on purpose; a member's signature is not, and putting it behind
 * a URL that anyone who guesses the path can fetch is the wrong default
 * even though the scores themselves are on a public leaderboard.
 *
 * Reads go through short-lived signed URLs, which the club's own admin
 * screens mint. Nothing about this is visible to the player-facing app.
 * ------------------------------------------------------------------ */
insert into storage.buckets (id, name, public)
values ('card-evidence', 'card-evidence', false)
on conflict (id) do nothing;

drop policy if exists "card evidence insert" on storage.objects;
create policy "card evidence insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'card-evidence');

/* Signing a URL requires being able to select the object. There is no update
   or delete policy: evidence is written once and never quietly altered. */
drop policy if exists "card evidence read" on storage.objects;
create policy "card evidence read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'card-evidence');
