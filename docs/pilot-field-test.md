# Shimo pilot field test

A test you run **at the club, on real phones, on real mobile data**. Everything
in here has been verified on a laptop already; the point of this day is the
things a laptop cannot tell us:

- real cellular handoff and genuine dead spots on the back nine
- animation and tap latency on mid-range Android, in sunlight
- a magic-link email arriving in a real phone mail client
- GPS at the actual clubhouse
- four devices writing genuinely at once, not simulated

Print this, or open it on a fifth device. Tick as you go and write times next
to anything that feels slow.

---

## 1. Before you leave

Do all of this while you still have good wifi and a laptop.

- [ ] **Migrations run** in the Supabase SQL editor, in order:
      `schema.sql`, `schema-pilot.sql`, `schema-m2.sql`, `schema-m2c.sql`
- [ ] **Redirect URL allowed**: Authentication → URL Configuration → Redirect
      URLs contains `https://shimo-xi.vercel.app/**`
      (sign-in by emailed link fails silently without this)
- [ ] **Clean slate**: run in the SQL editor
      ```sql
      truncate table tournaments, pairings, players, scores, card_in,
        certifications, disputes, corrections, audit_log restart identity;
      ```
- [ ] **Roster imported** with the **real email addresses** of the four testers.
      The email a player signs in with must match their roster row exactly, or
      they land on "Almost there" instead of their profile.
- [ ] **Course data is the real card** for the course you are playing. If it is
      still the placeholder, every Stableford point will be wrong. Import with
      `node scripts/import-course.mjs data/courses/<club>.csv` and redeploy.
- [ ] **Clubhouse coordinates** for the club are correct in `lib/data.ts`
      (`lat`/`lng`), because the sign-off distance evidence uses them.
- [ ] **Deployed build is pilot mode**: open the site, and the golfer home
      should show the club's own events only, never the seeded demo field.
- [ ] Each phone: **battery over 80%**, screen timeout raised to 5 minutes,
      Shimo added to the home screen.

> **Email rate limit.** Supabase's built-in mail service allows only a few
> messages an hour. Sign all four devices in **before** you leave, in one
> sitting, and do not sign out at the course.

---

## 2. Devices and roles

| Device | Role | Who they mark |
|---|---|---|
| Laptop or tablet | **Desk** (admin console, Live Ops) | — |
| Phone 1 | Player A | marks B |
| Phone 2 | Player B | marks C |
| Phone 3 | Player C | marks D |
| Phone 4 | Player D | marks A |

Marker assignment is round-robin in **pairings order**, so each player marks the
next one in the group and is marked by the one before. Put all four testers in
**one group** so every card gets both entries.

Optional Phone 5: spectator on the public board, signed in to nothing.

---

## 3. Test A — onboarding and sign-in (each phone)

Do this on all four phones. Expect roughly a minute each.

1. Open Shimo fresh. Onboarding appears: **"Welcome to Shimo"**, seven dots.
2. Tap **Get started** → **"Sign in"**.
3. Enter the player's roster email → **Email me a code**.
4. Open the email on the phone. Either route must work:
   - tap the **link** → returns to Shimo already signed in, and the flow picks
     up at **"Is this you?"**
   - or type the **six-digit code** if the email shows one
5. **"Is this you?"** shows the right name, club and handicap → **Yes, that's me**.
6. **"How you'll sign"** → choose PIN (enter four digits), or finger, or biometric.
7. **"Stay in the loop"** → Allow notifications, Allow location. **Note whether
   the OS prompts actually appear.**
8. **"Keep it one tap away"** → add to home screen.
9. **"You're all set"** → **Enter Shimo**.

**Pass:** each phone ends on the golfer home greeting the right player by name.

**Watch for:**
- transitions between steps: should feel like one flowing story, not a slide
  deck. **Write down anything that stutters** — this is the thing I could not
  measure from a laptop.
- the link opening in a browser tab *outside* the installed app. Note it if so.

---

## 4. Test B — the desk sets up the tournament

On the desk device:

1. Admin → Tournaments → **Create tournament**. Stableford, today's date, the
   real course, divisions on.
2. Publish. It appears under **Upcoming** with **Edit**, a delete bin,
   **Pairings & tee times**, **Start tournament day**.
3. Tap **Edit**, change the name, save. **Pass:** the change sticks and the
   header read **"Edit tournament"** while editing.
4. **Pairings & tee times** → drag the four testers into Group 1 in the order
   above.
5. **Start tournament day**. **Pass:** the row moves to **Live now** and now
   offers **Enter scores**, **Live Ops**, **End tournament**.

---

## 5. Test C — the field hydrates

Without touching the phones, on each one open the **Live** tab.

**Pass:** every phone shows the tournament name, **GROUP 1 · TEE hh:mm**, its
own player's **HI · Course HC · Playing HC** line, **YOUR BALL** with that
player's name, and **YOU MARK** with the correct partner from the table above.

**This is the cross-device test.** Nothing was typed into these phones; they
learned the whole tournament from the cloud.

- [ ] Time from opening the app to the card appearing: ______ seconds
- [ ] Any phone showing the wrong partner under **YOU MARK**? That is a real
      bug — record the group order the desk saved.

---

## 6. Test D — live dual entry (the core of the day)

Play (or walk) the first three holes for real.

On each hole, **every** player does two things:
1. taps their own score under **YOUR BALL**
2. taps what they saw their partner score under **YOU MARK**

**Pass, per hole:**
- the number appears **instantly**, with no spinner and no waiting
- once the partner's phone has also entered that hole, the own-ball card reads
  **"matches <name>"** with a tick
- **"1 stroke here"** appears on holes where that player gets a shot, and the
  stroke index matches the printed card
- running **Points / Gross / Net** update and agree with hand arithmetic

- [ ] Check one hole by hand against the paper card. Points agree? ______

**Deliberate disagreement.** On hole 4, have A enter their own score as **5**
while B (who marks A) enters **6** for A.

**Pass:** A's own-ball card reads **"differs"** in amber. Both figures survive;
neither phone overwrites the other. *(This is exactly what was broken before
the `schema-m2.sql` migration, so it is worth confirming carefully.)*

---

## 7. Test E — offline resilience (the most important test)

Do this **out on the course**, not in the car park.

### E1 — airplane mode
1. Put Phone 1 in airplane mode.
2. Enter scores for **three** holes, own ball and partner.
3. **Pass:** scores appear instantly. A strip reads **"Offline. N changes
   queued"**. Nothing is lost, nothing spins.
4. Turn airplane mode off.
5. **Pass:** the queue drains on its own and the other phones and the desk show
   those scores within a few seconds.

- [ ] Seconds from reconnect to the desk seeing the scores: ______

### E2 — a real dead spot
Find a genuine no-signal part of the course (this behaves differently from
airplane mode, because the radio keeps retrying).
1. Score two holes there.
2. Walk back into coverage.
3. **Pass:** same as above, queue drains by itself.

### E3 — the app is killed while offline
1. Airplane mode, score a hole.
2. **Force quit** Shimo from the app switcher.
3. Reopen it, still offline.
4. **Pass:** the queued change is **still there** (the outbox is persisted), and
   the score is still on the card.
5. Restore signal → it syncs.

### E4 — both phones offline on the same hole
1. Airplane mode on Phones 1 and 2.
2. Both enter a score for the **same** hole of the **same** player, different
   numbers.
3. Bring both back online.
4. **Pass:** no crash, no duplicate row; the later write wins for that view, and
   own-ball versus marker figures remain distinct.

### E5 — forced failure (optional)
Open the app with `?failsync` on the end of the URL to force sync failures.
**Pass:** a failed state appears with **Retry**, and tapping Retry re-queues.
Reload without the flag to recover.

---

## 8. Test F — attestation and certification

Complete all 18 holes for all four players (shortcut: play nine and enter the
back nine at the tee, as long as every cell is filled on every phone).

On each phone, once its own card and its partner's card are complete:

1. **ROUND COMPLETE / "Return your cards"** appears.
2. **Stage A: "Attest <partner>'s card"** — subtitle **"You are their marker"**.
   Open it, compare, and if anything differs agree it with the partner in
   person before attesting. Sign with the chosen method.
3. **Stage B: "Certify your card"** unlocks only once the player's **own**
   marker has attested. Before that it reads **"Unlocks after Stage A"** or
   **"Waiting for <name> to attest your card"**.
4. Certify. **Pass:** the card locks and shows as returned.

**Watch for:**
- the location capture at sign-off. Does it get a GPS fix at the clubhouse, and
  is the recorded distance sensible? ______ metres
- biometric or PIN prompt behaving on each specific handset

**Deliberate dispute.** On one pair, do **not** agree a differing hole. Raise a
dispute instead.
**Pass:** the card is held **uncertified**, the phone says it has gone to the
Committee, and it appears on the desk under **Live Ops → Certification &
disputes** with a count badge. Resolve it there, with a reason.

---

## 9. Test G — correction after certification

On a phone whose card is already certified, request a correction within the
correction window.

**Pass:** it reaches the desk, the Committee can approve or reject with a
reason, and on approval the score changes and the card is re-sealed.

Then try to **change a score on that certified card from the phone**.
**Pass:** it is refused. Corrections only go through the Committee. *(This is
the `schema-m2c.sql` guard; if a phone can still silently edit a returned card,
that migration did not run.)*

---

## 10. Test H — the public board

1. Desk → Live Ops → **Share board**, which copies a link.
2. Send it to WhatsApp and open on Phone 5 (and on a phone signed in to nothing).
3. **Pass:** the board renders with no login, shows **"Updated Ns ago"**, and
   moves **by itself** within about 30 seconds of a new score, with no reload.
4. Turn Phone 5's data off. **Pass:** it says it is offline and shows the last
   board rather than going blank.

- [ ] Does the board update without a manual refresh? ______

---

## 11. Test I — the desk fallback still works

This must keep working, because it is the safety net if a phone dies.

1. Desk → **Enter scores from cards**.
2. Type a few holes for a player from the paper card.
3. **Pass:** the desk entry appears on that player's phone and on the
   leaderboard. A desk figure is the agreed one and settles both card views.

---

## 12. Test J — ending the day

1. Desk → **End tournament** → **End & see results**.
2. **Pass:** it lands on the prizegiving summary:
   **FINAL RESULTS · PRIZEGIVING**, **CHAMPION**, **DIVISION WINNERS**,
   **PRIZES** matched to the finishers, **FULL FIELD** ranked.
3. Check the champion and division winners **by hand** against the cards.
4. **Print**. **Pass:** it prints cleanly enough to read at a prizegiving.
5. **Pass:** on the phones, the live board stands down; the tournament shows as
   completed with a **Summary** button on the desk.

- [ ] Champion correct by hand? ______
- [ ] Division winners correct? ______

---

## 13. Ergonomics, in the real world

Note these as you go. They matter more than any feature.

- [ ] Readable in **direct sunlight**?
- [ ] Score pad tappable **one-handed**, walking?
- [ ] Any mis-taps between adjacent score buttons?
- [ ] Battery used across 18 holes, per phone: ______ %
- [ ] Did any phone drop the session and ask anyone to sign in again mid-round?
      **That would be serious.**
- [ ] Slowest thing all day: ______________________

---

## 14. Behaviours that are **not** bugs

Do not chase these:

- **Nothing can be deleted from the cloud by the app.** There is no delete
  policy, deliberately. Removing a tournament marks it cancelled and every
  device drops it. Real deletion is a `truncate` in the SQL editor.
- **The built-in email service is rate limited** to a few messages an hour.
- **Marker assignment follows pairings order**, round-robin. Reorder the group
  on the desk if you want different pairs.
- **A desk entry overrides both card views.** The paper card is the agreed
  figure, so this is correct.
- **A player alone in a group has no card to mark** and is told the desk will
  attest theirs.
- **"Almost there"** on sign-in means the email is not on the roster. Fix the
  roster, do not fight the app.

---

## 15. Recording a problem

For anything that fails, capture:

1. **Which phone** (make, model, Android version)
2. **Which test** (e.g. E3)
3. **What you expected**, one line
4. **What happened**, one line
5. **A screenshot**
6. **Was it online or offline**, and roughly where on the course
7. Whether it happened **once** or **every time**

For anything deeper, Android phones can be inspected from a laptop over USB via
`chrome://inspect` in desktop Chrome, which gives the console and lets you read
the queued outbox.

---

## 16. After the test

- [ ] Export or screenshot the prizegiving summary before clearing anything.
- [ ] `truncate` the tables again if this was a rehearsal rather than a real event.
- [ ] Write the three worst moments of the day at the top of the results, in
      plain words. Those are the next iteration.
