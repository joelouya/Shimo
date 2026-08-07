# What the suites cover, and what they do not

Five headless harnesses, all driving the real store rather than a mock. They
exist because a golf tournament is not repeatable: you get one Saturday, a
hundred and twenty people are already on the course, and there is no second
attempt at the round.

| Command | What it is for | Rough time |
|---|---|---|
| `npm run regression` | The scoring spine: dual entry, discrepancy resolution, attestation, the correction window, disputes, the audit trail, the cut, sync payload shapes | seconds |
| `npm run day:sim` | One full corporate day end to end, 120 guests, sponsors, contests, pace, recap pack | seconds |
| `npm run stress` | Pilot mode, one device, adversarial input and human error | seconds |
| `npm run tv:sim` | The read-only TV board | seconds |
| `npm run swarm` | A full field on 31 independent devices, scoring simultaneously over a lossy wire | ~7 minutes |
| `npm run sim:check` | The live field simulator's own driver: the five forced events, and a full field to eighteen | seconds |

## The swarm

`scripts/swarm.mjs` is the only one that can find a disagreement between
devices, because it is the only one that has more than one.

Each simulated device gets its own jiti module registry, so its own store, its
own localStorage and its own client id. A write on one cannot reach another
except through the wire.

The wire drains each device's real outbox, upserts it into a stand-in for
Postgres, and broadcasts the stored row back to every device through
`applyRemoteScore` and `applyRemoteEntity` - the same path
`lib/sync/engine.ts` uses in production, through the same mappers. Both legs
are lossy: about 6% dropped, 8% duplicated, delivered out of order. The uplink
retries because the outbox retries; the downlink is backstopped by a
`rehydrate()` that models the periodic snapshot reconcile the engine already
performs.

**The server in the middle is not decoration.** Scores are keyed the way the
table is, so a contested cell resolves to one value that everyone is then told.
An earlier version of this harness routed ops peer to peer and "found" a 3%
divergence across the field; that was the missing arbiter, not a defect - two
devices writing one cell each ended up holding the other's value with nothing
to settle it. A harness that does not model the architecture will invent bugs.

Thirty phones (one per fourball) plus the desk. Eighteen holes, group order
reshuffled every hole, with human error mixed in throughout: the same score
entered twice, a score corrected on the next tee, a score typed onto the wrong
player's line, and the desk keying the paper card for a hole a phone is already
recording.

It is deterministic from `--seed`, so a failure can be replayed rather than
chased:

```bash
npm run swarm -- --seed 99
```

A representative run: 11,117 operations upserted, 679,530 broadcasts delivered,
25,566 dropped, 28,553 duplicated, and **202 cells genuinely contested by two
devices** - after which every device agreed with the desk on all 64,800 figures
compared. The contested count is itself asserted, because a convergence check
passes trivially if nothing ever conflicted.

### What it found

A stale row overwriting a fresh one. The schema says these tables are
last-write-wins by `updated_at`, but `applyRemoteEntity` was applying whatever
arrived most recently instead. An old `upcoming` tournament row landing after
the `live` one stood the board down mid-round, and every score entered on that
phone afterwards was silently discarded. Fixed in `lib/sim/store.ts` by
recording the newest `updated_at` accepted per row and dropping anything older;
guarded in `npm run regression` under "A stale row must not overwrite a fresh
one" so it does not need a ten-minute run to catch again.

Worth recording that the first swarm run came back entirely green. That was not
a result, it was a warning: it only exercised the score path and never touched
`applyRemoteEntity`, where the bug lived. A green run from a harness that has
not yet reached the interesting states means nothing.

### What it does not test

Real network latency, real Postgres concurrency under real RLS, real Realtime
delivery semantics, and how any of this behaves on a mid-range Android in
direct sunlight with 3% battery. Those need a deployment and real handsets on a
real course. **Nobody has yet run a real tournament on this.** The swarm tests
Shimo's own reconciliation logic under concurrency, which is a smaller claim
than it sounds like.

## The live field simulator

`/admin/simulate` (pilot mode only) is not a test - it is a rehearsal
instrument, meant to be watched. It builds a full field on demand, drives real
scores through the caddymaster path, and lets an operator reach in and cause
the exact moment the product was designed for - an eagle, a lead changing
hands, a correction, a card that outruns its handicap, a desk catching a group
up - then watch the TV producer, Live Ops and the leaderboard each decide what
to do about it. The profile (championship, medal, stableford) sets the
handicaps and format, which is what tells every surface whether gross, net or
points is the story.

`npm run sim:check` is the test behind it: it drives the simulator's own
imperative API and asserts each forced event really lands - an eagle is a three
on a par five, a correction becomes an amber, an anomaly reaches the integrity
log the committee reads, a desk burst moves a whole group, a full field plays
to eighteen with a well-formed board and no impossible figure. It runs in pilot
mode so the integrity heuristic is live.

It found two of its own bugs while being written, both worth keeping in mind:
teardown left the previous round's cards behind, so a rebuilt field inherited
stale scores (fixed with a scoped `clearSimulatorData`); and the running state
lives in module memory, not the store, so a page reload stranded a live field
on the build screen (fixed by reattaching from the store, paused). Watching a
120-player medal at scale also surfaced that the existing integrity heuristic
fires for a sizeable slice of a large field - a property of that detector, not
the simulator, but the kind of thing only a full field makes visible.
