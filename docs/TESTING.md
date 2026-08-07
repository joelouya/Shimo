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
| `npm run sim:live` | A full field played into the real Supabase, steered from a terminal, watched in the real app | interactive |

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

`npm run sim:live` is not a test - it is a rehearsal instrument, meant to be
watched. It builds a full field and plays it **into the real Supabase**, the
way a phone does: the same tables, the same row shapes, the same anon key. Then
you open the real app - leaderboard, TV, Live Ops - and watch it react to input
it has no idea is simulated. That is the whole point, and it is the correction
of an earlier mistake.

The first version of this was an in-app control room (`/admin/simulate`) that
drove one browser tab's memory. It looked like it worked, and it did not: the
public TV screen reads from Supabase, the player leaderboard reads from the
store, and an in-tab puppet only lines them up by accident. The lesson is the
same one the swarm taught - **a rehearsal has to run through the architecture it
is rehearsing.** So the simulator became an external process that writes where
real devices write, and the in-app version was removed.

Steer it from the terminal while it runs:

```
go / pause      start or stop the field advancing
rate <ms>       how fast holes come in
eagle           a three on the next par five
lead            give second place a run that changes the lead
correction      a revision, into the corrections table (Live Ops picks it up)
burst           the desk keying a whole group at once
status          leader and progress
end             cancel the tournament and purge every simulated row
```

The profile (`--profile championship|medal|stableford`) sets the handicaps and
format, which is what tells every surface whether gross, net or points is the
story.

Everything it writes is prefixed - `sim-` tournaments, `simp-` players - and
`purge_simulator_data()` (schema-m17) removes exactly those rows and nothing
else. `end` calls it on the way out; `npm run sim:live -- --purge` calls it and
writes nothing. The permissive pilot RLS grants insert and update to anon but
never delete, so the purge is a scoped `security definer` function rather than
a service-role key, which this project never uses.

### What it found

The player leaderboard crashed on any real field. Its live ticker resolved
names through the static demo roster (`playerById`), so a member or guest - or
a simulated player - who was not a hard-coded seed produced `undefined`, and
reading `.name` off it took the whole board down. In pilot the ticker is always
shown, so this would have crashed a real tournament's leaderboard the moment a
score arrived. Fixed to resolve names from the live field. It is exactly the
class of bug the simulator exists to surface: only a real field, read through
the real surface, shows it.

### What it does not simulate

The integrity heuristic. That runs only on scores typed at the desk on one
device, never on scores arriving over the wire, so an anomaly played from here
shows on the board but not in the committee log. That is a true property of the
app - integrity detection today is per-device on the entry path - surfaced by
testing honestly rather than papered over.
