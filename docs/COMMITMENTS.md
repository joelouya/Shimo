# Commitments

What Shimo has decided, what it has not, and what it is not allowed to say.

This file governs copy, admin UI, generated documents, and any customer-facing
surface. It is not aspirational and it is not marketing. If a claim is not
supported here, the product does not make it.

Read this before writing a user-facing string. When something on this list
changes, change it here first.

## Positioning

**Shimo is complementary to Kenya's national handicap infrastructure, not a
competitor to it.**

Club Systems International, HowDidiDo's parent, runs Kenya's national WHS
handicap engine under an R&A federation initiative. Shimo runs the tournament
day and submits validated tournament scores that ultimately feed that existing
WHS system. It is a tournament layer on top of the national handicap layer.

Binding consequences:

- Never use "replace", "replaces", "instead of", or any framing that positions
  Shimo against HowDidiDo, Club Systems, or the KGU. Not in the app, not in the
  admin UI, not in generated documents, not in a pitch deck.
- Never imply Shimo maintains handicaps. It does not. It produces a
  certified tournament result; the handicap system consumes it.
- "Works with the handicap system your club already uses" is accurate.
  "Replaces the handicap system" is not, and is also a claim that would lose a
  club its federation standing.

## Decided

- **The pilot is free.** The pilot club pays nothing. The product reflects this
  truthfully: there are no pricing surfaces anywhere in pilot mode. Not a plan
  picker, not an invoice, not a trial countdown, not a "your plan" line in
  settings.
- **M-PESA is a mock.** The settlement UI that exists in demo mode is
  illustrative and is labelled as such on every surface it appears on. No
  surface anywhere claims Shimo settles money today, because it does not.
- **Guest data is opt-in for sponsors.** A guest's details reach a sponsor only
  where that guest explicitly agreed at registration. The default is no. See
  the Data section.
- **A guest code is scoped and short-lived.** It opens one scorecard in one
  tournament and nothing else, it stops resolving once that tournament closes,
  and the codes are never enumerable: there is no surface, client or server,
  that will list them or confirm which exist. A fresh phone can resolve a
  pre-issued code through a throttled server call (per-IP lockout that escalates
  after repeated misses, plus a per-device cap), so guessing costs time. IP is
  best-effort and spoofable at the edge; it is one obstacle among several, not
  proof of identity, and nothing in the product claims otherwise.

## Open

These are genuinely undecided. Future work must not resolve them by
implication, by placeholder, or by shipping a surface that assumes an answer.

- **Pricing model.** Subscription versus per-event is open. No number, no tier,
  no "from KES ..." anywhere.
- **M-PESA settlement path.** Whether it ships at all is open, and if it does,
  whether via a Kenyan entity holding Daraja credentials directly or through an
  aggregator is open.
- **KGU-approved score submission.** Actively pursued, **not yet secured.** The
  product may say it produces scores suitable for submission. It may not say
  they are accepted, approved, recognised, or that results "publish to the KGU
  handicap system", until that is true and signed.
- **The pilot club.** Not chosen. Every club in the codebase is seed data.
- **Accessibility standard.** No formal target set.

## Never fabricate

- Customers, testimonials, case studies, press, partner logos, usage numbers.
- Pricing of any kind.
- Benchmarks or performance claims.
- **Sponsor exposure metrics.** A recap pack states only what Shimo actually
  measured. A number that was not observed is reported as not measured, never
  estimated, modelled, or extrapolated. This matters more than anywhere else in
  the product: a sponsor pack is a document a club hands to a paying backer,
  and Shimo's entire first claim is that its figures hold up. An invented
  impression count would forfeit that claim in the one place it is most
  expensive to lose.

## What the research does and does not establish

Two commissioned reports inform this product. The due-diligence pass found the
factual backbone sound and corrected two things that bind the build.

**Established, and safe to rely on:**

- Kenya Golf Union: 38 affiliated clubs and 2 societies. WHS launched
  28 January 2021. Roughly 8,000 handicapped golfers nationally.
- Corporate and charity days are a deep, well-evidenced market. Fields commonly
  run 120 to 270. Sponsor-heavy days at elite clubs are routine.
- Post-event sponsor fulfilment takes 4 to 12 hours and is, in the report's
  words, the least systematised part of the whole workflow. That is the reason
  the recap pack exists.
- A Committee may require an electronic scorecard it has approved.

**Explicitly not established. Do not present as fact:**

- **"Corporate days have the highest willingness to pay."** This is an untested
  internal assumption. The beachhead is justified by event volume and sponsor
  spend, both evidenced; the willingness-to-pay ranking is not. Pricing must be
  set by observing real pilots, not by asserting this.
- **Any KES market size.** No public source sizes this market. Use the sourced
  anchors above; label any TAM as an internal estimate.
- Competitor user numbers, pricing or traction.

**A rules limit that constrains product behaviour:**

A Committee has **no authority** to impose a Rule 3.3b(2) penalty for failing
to enter scores into a separate system. Shimo must never imply, in copy or in
UI state, that a player risks a penalty or disqualification for not using the
app. Enforcement of an app requirement runs through the Code of Conduct
(Rule 1.2b), not through the scorecard rules. A product that suggests otherwise
would be telling a Committee something untrue about their own authority.

**On other vendors:** Let's Play is the closest local product and competes on
convenience. Jonas Club Software runs club operations at elite clubs and is
complementary. The no-"replace" rule above covers all of them.

**On seed data:** real company names must never appear as sponsors in demo or
seed data. A recognisable brand on a generated poster reads as an endorsement,
and none exists. Invented sponsor names only.

## Data

Kenya's Data Protection Act 2019 applies to everything captured from guests and
members.

- Guest registration captures what the day needs: name, email, phone,
  organisation, optional self-declared handicap, optional dietary and
  accessibility notes.
- Appearing in a sponsor's participant list is a **separate, explicit opt-in**,
  presented at registration and defaulted to off. Dietary and accessibility
  notes are never shared with a sponsor under any setting: they are operational
  data for the club, and some of them are health data.
- A guest is not a member and never silently becomes one.
- Card photographs live in a private bucket, not the public one, because they
  carry handwriting and signatures.

## Handicaps

- Members carry a WHS Handicap Index sourced from the club roster.
- Guests may hold no handicap at all, or a **self-declared** one. Self-declared
  handicaps are labelled as such wherever they affect a result, so a net or
  Stableford placing in a corporate day is never mistaken for a WHS-grade
  figure.
