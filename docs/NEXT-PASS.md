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

## Landing

- See Pass 5 of the plan (CTA architecture, copy against COMMITMENTS.md,
  images, hero performance, error pages).
