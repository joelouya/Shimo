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

- `lib/sync/remote.ts` `hydrate()` fetches the whole `players` table on every
  reconcile; filter to the field of the open tournaments plus the club's
  roster once `entries` exists.
- The integrity heuristic only runs on desk-typed scores (`checkIntegrity` in
  `lib/sim/store.ts`), never on scores arriving over the wire. Documented in
  `docs/TESTING.md`; still true.

## Admin desk

- See Pass 3 of the plan for the day-blocking list (wizard step 8, PIN length,
  dispute binding, print failures, zombie live tournament, and so on).

## Landing

- See Pass 5 of the plan (CTA architecture, copy against COMMITMENTS.md,
  images, hero performance, error pages).
