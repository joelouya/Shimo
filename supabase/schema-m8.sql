/* ------------------------------------------------------------------ *
 * M8 - TV mode
 *
 * Three additive columns. Nothing is dropped and nothing is rewritten, so
 * this is safe to run against a live pilot database mid-tournament.
 * ------------------------------------------------------------------ */

/* How TV mode should talk about this field.
   'championship' - tight field, one set of tees, gross figures mean something
                    in themselves, and the story is at the top of the board.
   'club'         - a medal twenty-eight handicaps wide, where gross says only
                    who is the better golfer. Net-first, spread across the
                    field, because most of the room is watching for themselves.
   'stableford'   - points already compress the field; net-first.
   'team'         - best-ball and scramble contributions.
   Auto-detected from the spread of handicaps at creation, club-overridable. */
alter table tournaments
  add column if not exists field_profile text;

/* The club's hero image, shown behind TV mode and darkened for legibility.
   This is the single biggest lever a club has over how their screen feels. */
alter table clubs
  add column if not exists tv_background_url text;

/* Course records, held on the club rather than on any tournament: a record
   belongs to the course and outlives every event played on it.
   Kept per tee set - a record off the white tees is not a record off the red,
   and treating them as one is how a club ends up with a record nobody
   recognises. Shape:
     [{ courseId, tee, strokes, holder, year }]
   Always confirmed by an admin before it reaches the screen. */
alter table clubs
  add column if not exists course_records jsonb;
