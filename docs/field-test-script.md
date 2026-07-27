# Shimo on-device field test

Run this **at the club, on real phones, on mobile data**, before the pilot.
Everything here has already been verified on a laptop and by the headless
regression (`npm run regression`). This day exists for what neither can prove:

- real cellular handoff and genuine dead spots on the back nine
- tap latency and readability on mid-range Android, in sunlight
- a magic-link email arriving in a real phone mail client
- GPS at the actual clubhouse
- four devices writing at the same moment, not simulated

Print it, or open it on a spare device. Every test has an explicit **PASS** so
a tester who did not build the app can judge it. Write times and comments in
the margins; the numbers matter more than the ticks.

---

## Part 1 — Setup

Do all of this on wifi, the day before.

### 1.1 Database

- [ ] Migrations run in order in the Supabase SQL editor:
      `schema.sql` → `schema-pilot.sql` → `schema-m2.sql` → `schema-m2c.sql` → `schema-m3.sql`
- [ ] Clean slate:
      ```sql
      truncate table tournaments, pairings, players, scores, card_in,
        certifications, disputes, corrections, audit_log restart identity;
      ```
      **PASS:** the app opens on "No round today".

### 1.2 Auth

- [ ] Authentication → URL Configuration → **Site URL** is
      `https://shimo-xi.vercel.app`
- [ ] **Redirect URLs** include `https://shimo-xi.vercel.app/**`
- [ ] If you will also test on a laptop, the redirect list must contain the port
      the dev server actually uses (`http://localhost:3000/**`). A mismatched
      port fails **silently**: the email arrives, the link does nothing.

**PASS:** signing in on one phone lands back in the app already signed in.

### 1.3 Roster and course

- [ ] Roster imported with the **real email addresses** of the testers. The
      sign-in email must match the roster row exactly, or the player lands on
      "Almost there" instead of their profile.
- [ ] The course is the **real card** for the course being played
      (`node scripts/import-course.mjs data/courses/<club>.csv`, paste into
      `lib/data.ts`, redeploy). If it is still the placeholder, **every
      Stableford point and every net figure will be wrong.**
- [ ] The club's clubhouse `lat`/`lng` in `lib/data.ts` are correct; the
      sign-off distance evidence is measured from them.

**PASS:** hole 1 on the phone shows the same par, stroke index and yardage as
the printed card. Check two more holes at random.

### 1.4 Devices

- [ ] 4 phones, battery over 80%, screen timeout raised to 5 minutes
- [ ] Shimo added to the home screen on each
- [ ] All four **signed in before leaving**. Supabase's built-in mail is rate
      limited to a few messages an hour, so do them in one sitting and do not
      sign out at the course.
- [ ] 1 laptop or tablet for the desk

### 1.4a First run: onboarding motion

**Do this on a real Android handset, on at least two of the four phones, and
on the slowest one you have.** This is the one check in this document that
cannot be done anywhere else. The browser used for automated checks reports
itself as hidden and runs no animation frames at all, so every transition in
Shimo measures as frozen there whether it is working or not. A phone is the
only honest test.

Watch the seven onboarding steps go past on first launch. You are not looking
for a list of features, you are looking for whether it feels like one story or
seven screens.

| # | Step | PASS |
|---|---|---|
| O1 | Launch for the first time | Welcome step fades up, the seven progress ticks sit at the top with the first one filled |
| O2 | Tap **Get started** | The outgoing step slides left as the incoming one arrives from the right; they **overlap**, the layout never jumps, and the frame around them never flickers |
| O3 | Watch any single step settle | Icon, then heading, then body, each following the last by a beat. Not all at once, not one visibly late |
| O4 | Go back a step | Travel reverses direction, right to left |
| O5 | Watch the progress ticks | Each fills left to right as you advance. No snapping |
| O6 | The whole run, start to finish | No step ever lands part-faded and stays there |

- [ ] Nothing stutters or drops frames on the slowest handset. Note the model:
      ______________________
- [ ] O6 in particular: a step stuck at partial opacity is a real bug and the
      one failure mode this flow has had before. Record which step and what you
      tapped to reach it.

### 1.5 The tournament

Create it on the desk device:

- [ ] Single round for a normal club day, or several rounds with a cut if you
      are rehearsing a championship
- [ ] All four testers in **one group**, in this order

| Device | Player | Marks | Is marked by |
|---|---|---|---|
| Phone 1 | A | B | D |
| Phone 2 | B | C | A |
| Phone 3 | C | D | B |
| Phone 4 | D | A | C |

Marker assignment is round-robin in pairings order, so each player marks the
next and is marked by the previous. One group of four means every card gets
both entries.

- [ ] **Start tournament day**

**PASS:** all four phones show the tournament, the group, the tee time, and the
correct partner under **YOU MARK**, without anyone typing anything. A wrong
partner is a real bug: record the group order the desk saved.

---

## Part 2 — Role flows

### 2.1 Player

Each tester, on their own phone, for the first three holes.

| # | Step | PASS |
|---|---|---|
| P1 | Open **Live** | Own name under **YOUR BALL**, correct **HI · Course HC · Playing HC** |
| P2 | Tap own score | Number appears **instantly**, no spinner, no wait |
| P3 | Check the stroke badge | "1 stroke here" appears only on holes where that player receives a shot, matching the printed stroke index |
| P4 | Watch after the partner enters | Own card reads **"matches &lt;name&gt;"** with a tick |
| P5 | Check running totals | Points / Gross / Net agree with hand arithmetic on at least one hole |
| P6 | Open **Leaderboard** | Own row highlighted, marked "you" |

- [ ] Hand-check one hole against the paper card. Points agree? ______

### 2.2 Marker

The same tester, same holes, second card.

| # | Step | PASS |
|---|---|---|
| M1 | Tap the partner's score under **YOU MARK** | Lands instantly on the partner's card |
| M2 | Confirm separation | The partner's **own** figure is unaffected; you are recording your view, not theirs |
| M3 | Once the partner enters their own | Reads **"matches"** when they agree |
| M4 | At 18 holes | **ROUND COMPLETE / Return your cards** appears |
| M5 | Stage A | Reads **"Attest &lt;partner&gt;'s card"**, subtitle "You are their marker" |
| M6 | Attest with the chosen method | Card moves on; Stage B unlocks only when **your own** marker has attested you |
| M7 | Stage B | Certify. The card locks and shows as returned |

**PASS overall:** every player ends with a certified card, and each was attested
by the correct partner.

### 2.3 Admin (desk)

| # | Step | PASS |
|---|---|---|
| A1 | Live Ops during play | Groups, scores-in count and the leaderboard update as phones enter scores |
| A2 | **Enter scores from cards** | Type a few holes for one player; they appear on that player's phone and on the board |
| A3 | Certification & disputes tab | Shows a count badge when anything needs the Committee |
| A4 | **Share board** | Copies a link that opens with no login on a phone signed in to nothing |
| A5 | **End tournament** | Lands on the prizegiving summary |
| A6 | Summary | Champion and division winners match a hand check; **Print** is readable |

**Multi-round only**

| # | Step | PASS |
|---|---|---|
| A7 | Live Ops header | Reads "Round N of M" |
| A8 | **Close round** | Dialog states the cut, if the round has one |
| A9 | After opening the next round | Field reduced to the cut size **plus ties**; leaders are in the **last** group |
| A10 | Leaderboard | **Cumulative** shows a column per round and a correct total; players who missed the cut show **MC** and keep their scores |

---

## Part 3 — Edge cases to trigger deliberately

These are the ones that break in the field. Do them on purpose.

### 3.1 Offline: airplane mode

1. Phone 1 into airplane mode
2. Score **three** holes, own ball and partner
3. Leave airplane mode

- **PASS:** scores appear instantly while offline; a strip reads
  **"Offline. N changes queued"**; nothing spins; on reconnect the queue drains
  by itself and the other phones and the desk show the scores.
- [ ] Seconds from reconnect to the desk seeing them: ______

### 3.2 Offline: a real dead spot

Radio on but no usable signal behaves differently from airplane mode.

1. Find a genuine no-signal part of the course
2. Score two holes there
3. Walk back into coverage

- **PASS:** same as 3.1, with no manual retry.

### 3.3 Offline: app killed with work queued

1. Airplane mode, score a hole
2. **Force quit** Shimo from the app switcher
3. Reopen, still offline

- **PASS:** the queued change is still there and the score is still on the
  card. The outbox is persisted, so nothing is lost.
- Restore signal. **PASS:** it syncs.

### 3.4 Sync race: two phones, same cell

1. Airplane mode on Phones 1 and 2
2. Both enter a score for the **same hole of the same player**, different numbers
3. Bring both back online

- **PASS:** no crash, no duplicate row. The later write wins for that view, and
  the player's own figure and the marker's figure stay **distinct**.

### 3.5 Sync race: simultaneous, online

All four phones enter their hole 5 scores at the same moment, on cue.

- **PASS:** every score lands; the desk shows four new entries; nothing
  overwrites anything else.

### 3.6 Deliberate disagreement

On hole 4, A records their own score as **5** while B (who marks A) records
**6** for A.

- **PASS:** A's own card reads **"differs"** in amber. Both figures survive.
  Neither phone silently wins.
- Agree it in person and resolve. **PASS:** both views settle on the agreed
  figure.

### 3.7 Dispute to the Committee

On another pair, do **not** agree a differing hole. Raise a dispute instead.

- **PASS:** the card is held **uncertified**; the phone says it has gone to the
  Committee; it appears on the desk under **Certification & disputes** with a
  badge. Resolve it there with a reason.
- **PASS:** the resolution appears on the player's phone.

### 3.8 Correction after certification

On a phone whose card is already certified, request a correction inside the
window.

- **PASS:** it reaches the desk; the Committee can approve or reject with a
  reason; on approval the score changes and the card is **re-sealed**.
- Then try to change a score on that certified card **from the phone**.
- **PASS:** it is **refused**. Corrections only go through the Committee. If a
  phone can still edit a returned card, `schema-m2c.sql` / `schema-m3.sql` did
  not run.

### 3.9 Public board under load

1. Open the shared board on a spare phone
2. Have all four phones score

- **PASS:** the board moves **by itself** within about 30 seconds, no reload,
  and shows **"Updated Ns ago"**.
- Turn that phone's data off. **PASS:** it says offline and shows the last
  board rather than going blank.

### 3.10 Desk fallback

The safety net if a phone dies mid-round.

1. Put one phone in airplane mode and leave it there
2. Enter that player's remaining holes at the desk from the paper card

- **PASS:** the desk figure appears for everyone and is treated as the agreed
  one. The dead phone catches up when it returns.

---

## Part 4 — Ergonomics

Note these as you go. They matter more than any feature.

- [ ] Readable in **direct sunlight**?
- [ ] Score pad tappable **one-handed**, walking?
- [ ] Any mis-taps between adjacent score buttons?
- [ ] Onboarding transitions: smooth, or stuttering? ______
- [ ] Battery used across 18 holes, per phone: ______ %
- [ ] Did any phone lose its session and ask someone to sign in again
      mid-round? **That would be serious.**
- [ ] Slowest thing all day: ______________________

---

## Part 5 — Not bugs

Do not chase these.

- **Nothing can be deleted from the cloud by the app.** There is no delete
  policy, deliberately. Removing a tournament marks it cancelled and every
  device drops it. Real deletion is a `truncate` in the SQL editor.
- **The built-in email service is rate limited** to a few messages an hour.
- **Marker assignment follows pairings order**, round-robin. Reorder the group
  on the desk to change who marks whom.
- **A desk entry overrides both card views.** The paper card is the agreed
  figure, so this is correct.
- **A player alone in a group has no card to mark** and is told the desk will
  attest theirs.
- **"Almost there"** on sign-in means the email is not on the roster. Fix the
  roster, not the app.
- **A previous round's certified card cannot be reopened on the phone.** The
  data is kept and the desk can see it; the player-facing screen is not built
  yet.

---

## Part 6 — Recording a problem

For anything that fails:

1. **Which phone** (make, model, Android version)
2. **Which test** (e.g. 3.4)
3. **What you expected**, one line
4. **What happened**, one line
5. **A screenshot**
6. **Online or offline**, and roughly where on the course
7. **Once, or every time**

For anything deeper, an Android phone can be inspected from a laptop over USB
via `chrome://inspect` in desktop Chrome, which gives the console and lets you
read the queued outbox.

---

## Part 7 — After

- [ ] Screenshot or print the prizegiving summary **before** clearing anything.
- [ ] `truncate` the tables again if this was a rehearsal.
- [ ] Write the three worst moments of the day, in plain words, at the top of
      the results. Those are the next iteration.
