/* ------------------------------------------------------------------ *
 * M15 - photographs from the day
 *
 * A club takes photographs at a corporate day and currently emails them to
 * sponsors separately from the recap, which is the manual step the recap pack
 * exists to remove. Folded into the pack instead, as a page of its own.
 *
 * Public bucket, unlike card evidence. These are the shots a club already
 * puts on their own feed: a prizegiving, a tee shot, a group behind a banner.
 * What makes a scorecard photograph private is the handwriting and the
 * signatures on it, and none of that is here.
 *
 * Shape: [{ id, url, caption? }], ordered as the club arranged them, because
 * the first one leads the page.
 * ------------------------------------------------------------------ */
alter table tournaments
  add column if not exists photos jsonb;
