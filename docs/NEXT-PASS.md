# Next pass

Things noticed while working that were out of scope for the pass in hand, or
too large to fold in safely. Each line says where and what. Remove a line
when it is done.

## Golfer app

- `app/app/page.tsx` greeting: "the course / is calling" reads as one line to
  assistive tech ("courseis"); consider a space before the `<br />` or an
  `aria-label` on the heading.
- `app/app/profile/page.tsx` footer still says "pilot build" / "demo build";
  decide what a member should see there once the pilot has a name.
- `components/golfer/identity-pick.tsx` lists the whole roster when no round
  is on; a 500-member club will want the search box focused and a "recent"
  group at the top.
- Demo-only Profile stats ("Rounds '26", "Best finish") are still fiction in
  demo mode; fine for a demo, but keep them out of any pilot surface.

## Needs the desk to sign in (the auth pass)

- `card-evidence`: minting a signed link needs `select` on the object, so anon
  keeps `select` on the private bucket. Close it once admin screens carry a
  session, or move signing behind an edge function with the service key.
- `club-assets`: the update policy checks only the bucket, so a crest can be
  replaced by anyone; and `clubs` rows are anon-updatable regardless.
- `players` exposes email addresses and member numbers to anon reads; a
  public view without them is the fix once the desk reads through a session.
- `entries` lets anon list who registered for an open event (player ids).
- The sealed-card guard trusts the `source` label: 'committee' writes pass.
  A real gate needs the writer to be authenticated as the Committee.

## Sync

- Until `schema-m22.sql` is applied, the pilot cloud answers 404 for
  `entries`; the per-table push keeps that from holding up scores, but the
  outbox will show those ops as failed after 30s. Apply m22 before deploying
  the registration loop.
- `scripts/sim-live.mjs` and `purge_simulator_data()` do not know about
  `entries` yet; extend the purge function in m24.

- `lib/sync/remote.ts` `hydrate()` fetches the whole `players` table on every
  reconcile; filter to the field of the open tournaments plus the club's
  roster once `entries` exists.
- The integrity heuristic only runs on desk-typed scores (`checkIntegrity` in
  `lib/sim/store.ts`), never on scores arriving over the wire. Documented in
  `docs/TESTING.md`; still true.

## Admin desk

- `app/admin/scores/page.tsx` has no round switcher: once a round is closed
  the desk cannot enter or correct the previous round's cards. Needs the
  round threaded through `useRoundScores`/`setBulkScore`/`publishCard`.
- The "Public leaderboards" and "Certification reminders" toggles were
  removed from Settings rather than faked; the public board is public by
  design and reminders have no delivery channel yet.
- `correctionWindowMin` is saved but nothing re-checks it when a correction
  arrives at the desk; the phone hides the button after the window, which is
  the only gate today.
- `clubDefaults` (tees, interval, allowance, anomaly flags) are per device,
  not synced; two desks can differ until the clubs row learns them.
- Members page has no pagination or virtualisation for a 400-row roster, and
  search matches names only.

## Admin desk visual (after the Pass 4 refresh)

- `components/admin/ledger.tsx` exists as the pattern; Members, the Committee
  room and the results table use its rules inline. Move them onto the
  component in the next visual pass.
- The wizard's step cards vary in width; the Review step should read like a
  printed fixture card (rules, tabular figures, a crest).
- Form labels: `htmlFor`/`id` are wired on the desk card and Settings; the
  wizard's generic `Field` wrapper and the club identity card still pass
  labels as siblings.
- The scoring grid at 1024px still scrolls to reach holes 14 to 18; a
  collapsible totals column would let 18 holes fit on a 13-inch laptop.
- Photographic club hero in the rail, a course map on Live Ops, and the
  printed-fixture treatment on the tournaments list remain for the deeper
  visual round.

## Landing

- See Pass 5 of the plan (CTA architecture, copy against COMMITMENTS.md,
  images, hero performance, error pages).

## Desk layout (from the top-bar pass)

- The wizard, Settings, Pairings, Poster, Summary, the check-in desk and the
  TV producer body kept their own layouts under the new band. The wizard's
  review step still reads as a form rather than a printed fixture card.
- Live Ops on a tablet stacks list, watched group, then the board; a sheet
  that opens the watched group over the list would read better under 1024px.
- The tournaments detail pane opens sub-pages in place of tabs; when the
  registrations, tee sheet and results pages settle, they could become tabs
  inside the pane so the desk never leaves the season view.
- Stat-card sparklines draw from the last three hours of the score feed
  (capped at 24 events in the store) and from certification times; a proper
  per-hole timeline would need the score rows' own timestamps.

## Landing (from the rebuild)

- The hero's Live Ops screenshot (`public/shots/live-ops.jpg`) shows the desk
  before the top-bar refresh. Re-capture it from the new dashboard in demo
  mode at 1760x1100 once the desk settles, and refresh `setup.jpg` and
  `scoring.jpg` the same way if they return to the page.
- The "how it works" cards could carry a fragment of the product per step
  (tee sheet row, score cell, seal, board row) as their art; drawn versions
  are in `components/landing/step-art.tsx` and may want polishing.
