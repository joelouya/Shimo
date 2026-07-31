# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the club desk.** The caddymaster and club administrator running a
tournament day. They are who adopts Shimo, and if their afternoon is harder
than paper the club does not come back. When needs conflict, the desk's
experience is the optimisation target.

**The one exception, and it is absolute:** never at the cost of rules
integrity. If a shortcut would make the desk's day easier by weakening the
certification chain, the certification chain wins. The desk is optimised for
*within* the constraint that Shimo stays rules-grade.

Also served, in service of the day the desk is running:

- **Golfers / members** - phone, on the course. Self-scoring, the board, their
  own card, certification.
- **Markers** - the same people, keeping a second card for a playing partner.
- **The Committee** - attestation status, disputes, corrections, audit export.
- **The clubhouse room** - spectators in front of a television during play and
  through prizegiving. No account, no interaction.

## Product Purpose

Tournament management and live scoring for African golf clubs, launching in
Kenya. It replaces the paper-card-and-whiteboard tournament day: entry,
pairings and tee sheets, live scoring, rules-compliant certification, the
leaderboard, the prizegiving summary, and the clubhouse screen.

Success is a club running a real tournament day on it and choosing to run the
next one on it too.

## Positioning

Three claims, in a committed order. The order is binding: when they conflict,
the earlier one yields last.

1. **Rules-grade certification.** R&A Rule 3.3b dual entry, marker attestation
   then player certification, a SHA-256 tamper-evident seal over the full score
   set and identities, an append-only audit trail, KICA-valid signatures, and
   Committee dispute resolution including DQ under 3.3b(3). A result that holds
   up afterwards. Rare in club software anywhere, not only here.
2. **Works where the golf is.** Offline-first: dead spots on the back nine,
   mid-range Android handsets, patchy cellular, direct sunlight. Nothing fails,
   everything reconciles. Built for these clubs rather than ported to them.
3. **The club looks superb.** Editorial identity, generated fixture and results
   posters, and the clubhouse screen. Shimo makes a club's tournament feel like
   an event, which is a large part of what a captain is actually buying.

## Operating Context

- **The paper card is still real.** Players hand cards to a desk; the
  caddymaster types them in. Shimo has to fit that ritual, not replace it by
  decree. Desk entry and phone self-scoring both exist and coexist in one round.
- **The attestation ritual** mirrors paper exactly: the marker who kept your
  card signs it off, then you certify, then it is returned and locked.
- **WHS handicaps** with Course Rating and Slope per tee set; the HI → Course
  HC → Playing HC chain is shown on the card.
- **Conditions:** four-hour rounds, one-handed use while walking, sunlight,
  battery, and genuine loss of signal on parts of a course.
- **The clubhouse:** a television the club already owns, running unattended for
  four hours and left on through prizegiving.
- **Two build modes:** `demo` for showing prospective clubs and the KGU, and
  `pilot` for running one real tournament day at a club.
- **The Kenya Golf Union (KGU)** is part of the audience for demonstrations.

## Capabilities and Constraints

Confirmed and built:

- Dual-entry scoring with player/marker agreement, discrepancy surfacing, and
  dispute escalation.
- Certification chain: marker attests, player certifies, card seals and locks;
  configurable correction window; Committee override with typed reason and PIN;
  CSV audit export.
- Signatures three ways: 4-digit PIN, finger-drawn SVG, or WebAuthn biometrics.
- Desk entry with a deliberate publish gate: enter the card, then publish it,
  PIN-confirmed, attributed, with an optional photograph of the paper card kept
  privately as evidence.
- Multi-round tournaments with cuts, per-round pairings and certification.
- Registration cutoffs, eligibility rules, tiered entry pricing, sponsors, club
  identity, generated posters.
- Clubhouse TV mode with a producer state machine, trust gates, and an admin
  producer panel.
- Offline-first outbox with leader election and last-write-wins reconciliation.

Technical constraints that future work must respect:

- Supabase Postgres with RLS. The anon key is **public by design** and ships in
  the browser bundle. The service role key is never used client-side.
- There is **no delete policy** on any table. Records are written, never
  removed. This is deliberate.
- TV mode is **read-only** and holds no session; it steers via an append-only
  decisions table written by the admin panel.
- `NEXT_PUBLIC_SHIMO_MODE` is baked in at build time.

Explicitly undecided:

- **Pricing.** The pilot club pays nothing. Everything beyond that is open.
- **Payments.** Whether M-PESA entry-fee settlement ships at all is open (see
  Evidence).
- **Which club is the pilot.** Not recorded. The clubs in the codebase are seed
  data.
- **Accessibility standard.** No formal target set (see below).

## Brand Commitments

- **Name:** Shimo. **Line:** "Tournament golf, beautifully run."
- **Identity:** editorial. Cream `#f7f3ec`, deep navy `#1a2332`, burnt
  terracotta `#b84a2e`. Fraunces for display, Inter for UI and data. The ring-O
  mark. This is established across the app, the generated posters, and the
  clubhouse screen, and is treated as incumbent brand rather than a default.
- **Voice: no em dashes** in user-facing copy. Asked for explicitly.
- **The product never shames a player in public.** No triple bogeys, penalties,
  DQs or worst holes on the clubhouse screen. A correction never says the
  earlier moment was wrong, because the member who was celebrated by mistake is
  in the room.
- Clubs may layer their own crest, colour and hero image over Shimo's system.
  They cannot alter the editorial font stack, motion curves, or layout grid.

## Evidence on Hand

**Real:**

- `docs/field-test-script.md` - an on-device test script for the pilot day.
- `scripts/tv-simulate.mjs` - a full-tournament simulation of the clubhouse
  screen, and `scripts/regression.mjs`, a headless harness over the scoring and
  certification spine.
- A course importer for real scorecard data (`scripts/import-course.mjs`).

**Mock, and must not be presented as real:**

- The nine Kenyan clubs, the 36-player field, the Kenyan player names, the KES
  entry fees and the M-PESA settlement flow in Settings are **seed and demo
  data**, not customers, not transactions, and not a committed integration.

**Absent. Future work must not fabricate these:**

- No customers, testimonials, case studies, press, logos, or usage numbers.
- No pricing, plans, or licensing.
- No benchmark or performance claims.
- No named pilot club.

## Product Principles

1. **The desk's day is the target; the certification chain is the ceiling.**
   Optimise relentlessly for the caddymaster, and never by weakening what makes
   a card defensible.
2. **Rather say nothing than something that has to be taken back.** Applies to
   the clubhouse screen, the leaderboard, and any claim the product makes on a
   club's behalf.
3. **Degrade, never fail.** Offline, stale, disconnected and slow are ordinary
   conditions here, not error states. Hold the last known truth and say so
   quietly.
4. **Measure the golf, let handicap decide the rarity.** When judging whether a
   score is remarkable or implausible, measure strokes against par and let the
   player's handicap decide how rare that is. Never judge against what a
   handicap entitles someone to: that treats an ordinary good hole from a high
   handicapper as suspicious, and most of the field are high handicappers.
5. **Most of the room is looking for themselves, not the leader.** Coverage,
   boards and moments should spread across the field rather than concentrating
   at the top, except where the format genuinely makes the top the story.

## Accessibility & Inclusion

No formal standard has been set; recorded as an open decision rather than
invented.

Known product-specific needs already being designed for:

- Readability in direct sunlight on a phone.
- One-handed operation while walking.
- Mid-range Android as the performance target, not a flagship.
- `prefers-reduced-motion` is honoured globally: motion degrades to opacity and
  colour, and travel is removed.
- The clubhouse screen is read from across a room and is never interacted with.
