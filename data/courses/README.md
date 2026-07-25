# Real course & club data

Scoring correctness depends on the course: **par and stroke index drive every
Stableford point and every net figure**, so the course each device uses must be
identical. For the pilot we keep course data **compiled into the app** (in
`lib/data.ts`) — it ships in the bundle to every phone and laptop, so there's
nothing to sync and no way for two devices to disagree.

## Adding a real course (pilot workflow)

1. Get the club's printed **scorecard** (hole, par, stroke index, yards) and
   their **course-rating certificate** (course rating + slope per tee).
2. Copy `_template.csv` to `data/courses/<club>.csv` and fill it in.
3. Run the importer:

   ```bash
   node scripts/import-course.mjs data/courses/<club>.csv
   ```

   It validates the card (18 holes, stroke indexes 1–18 each used once, sane
   pars, at least one tee rating) and prints a ready-to-paste `Course` object.
4. Paste that object into the `COURSES` array in `lib/data.ts`. Make sure the
   `clubId` matches an entry in `CLUBS` (add the club there first if it's new —
   including its clubhouse `lat`/`lng`, which the sign-off distance check uses).
5. Commit and redeploy. The new course is now selectable in the tournament
   wizard and used for live scoring everywhere.

## Adding a club

Clubs live in the `CLUBS` array in `lib/data.ts`: `id`, `name`, `short`,
`town`, and the clubhouse `lat`/`lng`. The coordinates matter — the attestation
trail records how far from the clubhouse a card was signed.

## Why not an in-app editor yet?

An admin "course editor" that saves to the database is the right answer at
scale (many clubs, self-service onboarding). It needs a `courses` table and
realtime sync so every device gets the same card. That's deliberately deferred:
for one or two pilot clubs, compiling the real card into the app is simpler,
impossible to get out of sync, and reviewable in a pull request. When we take on
self-service club onboarding, promote this CSV shape into a `courses` table +
an editor and have `courseById` read from the synced store instead of the
static array.
