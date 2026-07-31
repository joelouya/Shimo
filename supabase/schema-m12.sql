/* ------------------------------------------------------------------ *
 * M12 - how much the screen says
 *
 * Three settings rather than on and off, because "some" is what most club
 * golf actually wants: 'full', 'reduced', 'quiet'. Null means follow the
 * field profile, which is full for a championship, reduced for a medal or a
 * Stableford, and quiet for team days.
 *
 * tv_quiet from M11 stays, so a tournament set quiet before this existed
 * still means quiet.
 * ------------------------------------------------------------------ */
alter table tournaments
  add column if not exists tv_coverage text;
