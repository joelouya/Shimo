# SHIMO — Tournament golf, beautifully run

Shimo: tournament management and live scoring for African golf clubs,
launching in Kenya. One codebase, two modes: a **demo** for showing
prospective clubs and the KGU, and a **pilot** mode capable of running one
real tournament day at a club.

## Run it

```bash
npm install
npm run dev                                # demo mode (default)
NEXT_PUBLIC_SHIMO_MODE=pilot npm run dev   # pilot mode
```

Open **http://localhost:3000** (or whatever port Next prints).

- `/` — landing page with entry points to both sides
- `/app` — **the golfer app** (mobile-first; best in a phone-sized window or
  device emulation; installable as a PWA)
- `/admin` — **the club admin desk** (desktop-first)

## Modes

| | demo (default) | pilot |
| --- | --- | --- |
| Data | Seeded Captain's Prize, simulated field | Club roster + the club's own tournaments only |
| Formats offered | All five | Stableford & Stroke Play (fully wired) |
| Payments UI | Visible (M-PESA story) | Hidden entirely |
| Pace/anomaly flags | Surfaced in Live Ops | Logged quietly to Settings → Integrity |
| Golfer Live tab | Phone self-scoring with marker swap | Desk-scored; phone follows the board |

The mode is baked in at build time via `NEXT_PUBLIC_SHIMO_MODE`
(see `.env.example`). Each mode keeps its own local data.

## The pilot workflow (tier 1: nobody has to install anything)

1. **Create a tournament** (`/admin` → Create tournament) — Stableford or
   Stroke Play.
2. **Set pairings** (tournament row → Pairings & tee times) — drag or
   tap-to-assign from the roster; tee times autosave at the club's interval.
3. **Start tournament day** (button on the tournament row).
4. **Enter scores from cards** — the caddymaster desk, reachable from the
   dashboard and Live Ops. A keyboard grid of the whole field, grouped by
   playing group: **Tab** moves across holes, **Enter** drops to the next
   player, two digits hop automatically, every cell saves on blur. Running
   gross/net/points sit frozen at the right edge; "Mark card in" tracks the
   paper stack; **Scan card** shows the photo-OCR roadmap.
5. The **leaderboard** (`/app` → Leaderboard) updates live as cards go in.

## Rules-compliant certification (R&A 3.3b)

The end-of-round flow mirrors paper-card attestation exactly, and exceeds it
on auditability:

1. **Stage A — marker attests.** The marker reviews the card they kept for
   their player; any difference against the player's own record is highlighted
   in amber and must be agreed (or escalated as a dispute) before attesting.
2. **Stage B — player certifies.** Unlocked only after the marker's
   attestation. On certification the card is *returned* and locks.
3. **Tamper evidence.** At that moment Shimo seals a record: SHA-256 hash of
   the full score set + identities, UTC timestamp, device fingerprint (no
   PII), optional sign-off GPS with distance to the registered clubhouse, app
   version, and the player's HI / Course HC / Playing HC (Rule 3.3b(4)).
   The audit trail is append-only; Committee actions add records, never
   overwrite.
4. **Signatures, three ways:** a 4-digit PIN (default), a finger-drawn
   signature stored as SVG, or on-device biometrics via WebAuthn. All valid
   under Kenya's KICA. Preference lives in profile settings.
5. **Committee room** (Live Ops → Certification & disputes): live cert status
   for the field, dispute resolution (accept a figure, Committee score, or DQ
   under 3.3b(3)) gated by a typed reason + Committee PIN, correction
   decisions, and one-click audit trail export (CSV).
6. **Correction window:** configurable per tournament (off / 5–60 min,
   default 15). Players request corrections in-app during the countdown; the
   Committee decides; everything is logged and the card is re-sealed.

Handicaps follow the WHS chain (Course Rating and Slope per tee are on every
course profile), with a "how this was calculated" explainer on the scorecard.

## Offline + sync

Every write (scores, card-in, attestations) lands in local storage instantly,
then drains through an outbox:

- offline → a quiet "Offline. Scores saved locally" strip; nothing fails
- a write that keeps failing for 30s while online → a **Retry** button,
  never a raw error (append `?failsync` to any URL to demo this)
- the leaderboard shows "Offline · showing the board as of X mins ago"
  instead of erroring
- attestation is never blocking: it queues offline, and if it truly fails the
  golfer is told to screenshot the card and the club reconciles at the desk

**Real multi-device sync:** add a Supabase project (run
`supabase/schema.sql`, paste the URL + anon key into `.env.local` per
`.env.example`) and the same outbox pushes to Postgres with realtime fan-out
to every open device. Without keys, sync is simulated locally and everything
still behaves.

## PWA

Installable with Shimo branding (terracotta theme, cream background, ring-O
icon). The service worker keeps golfer screens opening offline; launching
from the home screen restores the last-viewed golfer screen. An "Install
Shimo" card appears on the golfer home for eligible devices (with an
add-to-home-screen hint on iOS).

## The demo, in 5 minutes

The Muthaiga Captain's Prize is live today. Joel Ouya (HC 12) is three holes
into his round; the field of 36 is out on the course and scores tick in every
few seconds.

1. **Golfer — live scoring** (`/app` → Live): enter Joel's score on hole 4 with
   the big score pad. A moment later his marker's phone disagrees — the amber
   "Check with your marker: hole 4 differs" banner appears. Tap it, agree the
   score, watch it clear. Note the marker-swap card below: Joel keeps David's
   card, David keeps his.
2. **Leaderboard** (`/app` → Leaderboard): broadcast-style board with featured
   groups, Points/Net/Gross views, division filters, streak flames, expandable
   scorecards, and live position shifts. The eye icon on the Live tab toggles
   **scoreboard blindness** — the board hides until the card is signed.
3. **Admin — Live Ops** (`/admin` → Live Ops): the same tournament from the
   club's side. Joel's hole-4 discrepancy appears here as an amber "Marker
   discrepancy" flag; Dennis Mutua (HC 24, playing far too well) raises a
   quiet "Pace flag" with a Review workflow.
4. **Create a tournament** (`/admin` → Create tournament): the five-step
   Stableford wizard. Publish it, then check the golfer app's Tournaments tab —
   it's listed for every golfer in Kenya, instantly.
5. **Pairings** (`/admin` → Tournaments → Pairings & tee times): drag players
   between groups (or click a player, then a group), retime the first tee,
   export the tee sheet.

### ✦ Demo mode

The sparkle button in the corner of either app auto-plays Joel's round —
scores enter themselves, the discrepancy appears and resolves, push
notifications fire ("🏆 You've moved into 2nd place…"), the marker attests,
the player certifies, the card returns and locks, and the board settles. **Reset demo data** in the same popover restarts the
day.

### Two screens, one truth

Open the golfer app and the admin app in two windows side by side. State is
shared through localStorage + a BroadcastChannel with leader election — a
score entered on the phone lands in Live Ops within a second, no server
involved.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (vendored) ·
Framer Motion · zustand. Fonts: Fraunces (display) + Inter (UI/data).

Everything is mock data: nine real Kenyan clubs, a 36-player field with
Kenyan names, WHS-style Stableford maths (95% allowance, stroke-index
allocation), KES entry fees, and an M-PESA settlement story in Settings.

## Where things live

| Path | What |
| --- | --- |
| `lib/data.ts` | Clubs, courses, players, tournaments, groups |
| `lib/scoring.ts` | Handicap/Stableford maths, standings, score generator |
| `lib/sim/store.ts` | The live simulation: state, sync, echoes, flags, demo mode |
| `app/app/*` | Golfer app (home, discovery, live scoring, leaderboard, profile) |
| `app/admin/*` | Admin desk (dashboard, wizard, pairings, live ops, members, settings) |
| `components/ui/*` | shadcn/ui primitives themed to the Shimo palette |
