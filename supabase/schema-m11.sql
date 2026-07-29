/* ------------------------------------------------------------------ *
 * M11 — club TV settings
 * ------------------------------------------------------------------ */

/* Short lines the club wants folded into the TV feature rotation:
   "Prizegiving at 6pm in the main bar". Shape: ["...", "..."] */
alter table clubs
  add column if not exists tv_messages jsonb;

/* A tournament that wants the board and nothing else. Member-guest days,
   corporate outings, juniors, or the closing holes of a championship where
   the captain would rather the screen did not influence play. The producer
   panel can also switch this during the round; this is the default it
   starts the day with. */
alter table tournaments
  add column if not exists tv_quiet boolean not null default false;
