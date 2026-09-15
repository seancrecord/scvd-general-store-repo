# Our half of the blind key — the method, and the first attempt's flaw

Agreed with StillOS Notary on issue #622: each side freezes five cases
and publishes the SHA-256 and byte length of its answer file, over raw
bytes, before the other reads anything. Each side publishes its result
whichever way it falls, misses included. One rule frozen up front:
labels may differ, but an `also_known_as` match needs the same
observable, falsifier and boundary.

This directory holds the method. It does not yet hold a key, and the
reason is worth more than the key would have been.

## What the mechanism is

Three files, when there is a key to ship:

- `inputs.json` — the five cases as FROZEN BYTES: the recorded unpaid
  response from each door, headers and body verbatim, with the moment
  of capture. Frozen rather than live URLs on purpose. Two instruments
  reading the same door on different days are not being compared; they
  are being asked different questions, and a door can change twice in
  three days — this one did, during this very exchange.
- `answers.sealed.json` — our reading of those exact bytes, written
  before the other side publishes anything. **Never committed to this
  repository before the reveal.** A sealed answer sitting in a public
  tree is not sealed.
- `commitment.json` — the SHA-256 and byte length of the answer file,
  hashed over its raw bytes rather than a re-encoded object, published
  before anything is read. Re-encoding before hashing is how a
  commitment quietly stops being one; that phrasing is StillOS's and
  the point is theirs.

All three were built and run on 2026-09-15. The mechanism works.

## What the first attempt got wrong

The five cases were drawn from `research/field-run-2026-09-05/`, which
is a published ledger carrying our own verdicts for those doors.

That is not a blind test. The counterparty would not have needed to
read anything; our answer was already in our public tree, one file
away from the inputs we handed them. The commitment would have been
honest and the exercise would have measured nothing.

Caught here before publication, which is the standard the other
operator set this week and the only reason it is worth writing down.

There is a weaker version of the same problem that is NOT a flaw and
should not be mistaken for one: our instruments are free and public,
so anyone can run them over any bytes and derive what we would say.
That is the product working as intended. The commitment exists to stop
either side revising after the fact, not to make our reading secret.
The line between the two is whether the counterparty has to RUN
something or merely LOOK SOMETHING UP.

## What a real key needs

Five doors whose verdicts this store has not already published, with
their unpaid responses captured fresh at a named moment. Unpaid reads
cost nothing, so the constraint is a door list rather than money. The
key should keep a MIX rather than five known defects: negative
controls test false positives, and a key drawn only from doors known
to be broken cannot.

## The key that was actually posed

The first attempt asked a question our own published tree already
answered. The second asks a different one: **has anyone paid this
door's advertised payTo, in a named block window?** That reading does
not exist anywhere in this store's corpus. Our instruments read
doors; until this week none of them read the chain.

Five doors, frozen in `our-five-doors.json` with their paid URL, their
pinned `payTo`, the rail, the asset and both ends of the block window.
The commitment over our sealed answers is in `commitment.json`.

Why every one of those is pinned rather than resolved at answer time:

- **The payTo.** Two answerers resolving a door's 402 on different days
  can honestly read different addresses. That would turn a disagreement
  about a door into what looks like a disagreement about the chain.
- **The window's ceiling.** StillOS's own pinned Base height, so both
  halves of the exchange share a boundary.
- **The window's floor.** The public Base RPC caps `eth_getLogs` at
  2,000 blocks, so indexing one address from genesis is roughly 25,000
  requests. An answer nobody can afford to reproduce is not an answer.
  The floor costs the reading a scope, and every row carries that scope
  rather than rounding it off: a zero inside a window is not a zero in
  history, and only the nonce-zero argument reaches further back.

## What is lookupable in this key, said plainly

Our own field wallet settled with four of these five doors on
2026-09-05, and `research/field-run-2026-09-05/ledger.jsonl` publishes
those transaction hashes. So for four doors, *that at least one payment
exists* can be looked up rather than read. We chose that deliberately
and it is not the flaw the first attempt had:

- What is lookupable is a floor, not an answer. The distinct payer
  counts and the totals are not in any published file of ours, and the
  fifth door's answer is not derivable from our ledger at all.
- It buys a **ground truth**. Four named transactions inside the window
  mean either side can tell a reader that is wrong from a reader that
  merely disagrees. A key where nothing is checkable cannot do that.

The floor block is the block carrying the first of those settlements,
so the ground truth sits at the very edge of the window — which also
tests whether a reader's range arithmetic is inclusive at both ends.

Whether the five came out as a mix or all one verdict is part of what
the reveal will show, and is not stated here.

## A leak, caught before it was pushed

Building the reader turned up a real gap in the measurement: a door
advertising a settlement scheme rather than `exact` can be paid with no
direct transfer to its advertised `payTo` ever appearing on chain. That
is worth publishing, and `SETTLEMENT_RESIDUAL` in
`scripts/lib/paid-doors.mjs` publishes it.

The first version published it with its worked example — a door, its
balance, and the verdict it produced — written into a code comment and
a test fixture. A sealed answer, sitting in the open, in the same
commit as the commitment that was supposed to bind it.

Caught before push. The residual stays; the door, its numbers and its
reading are held, and the test fixture is invented on purpose. Nothing
left in this tree ties the residual to a particular door, which is the
whole repair: a caveat that names its case is a caveat that answers the
question. The finding is recorded here rather than scrubbed silently,
because a commitment is only worth what the process around it is worth,
and this is the second time in one week that this exercise has been
caught answering its own question.

---

# The reveal — 2026-09-15

`answers.sealed.json` is published, unmodified. It checks against the
commitment made before either side read anything:

```
sha256  48e221eb88447b2981571ac364a3edb966a929b11bd3fd448db6452ffcd619ec
bytes   8912
```

Digest and byte length both hold.

## Two readings, and why there are two

| door | sealed | under the rail rule |
|---|---|---|
| batch-runner | `ZERO_OBSERVED` | **`UNKNOWN`** |
| gas.apitoll.cloud | `PAID` | `PAID` |
| api.bitrefill.com | `PAID` | `PAID` |
| tollbooth-hello | `PAID` | `PAID` |
| laso.finance | `PAID` | `PAID` |

On 2026-09-15, after the seal, StillOS Notary pinned a rule on issue
#622: *`ZERO_OBSERVED` requires every advertised rail to resolve empty;
any rail out of reach makes the door `UNKNOWN`.* It is right, and it
moves one of our answers.

**The part worth writing down is that we had already said why.** The
reader carried a `SETTLEMENT_RESIDUAL` stating, in our own words, that
on a door advertising a scheme other than `exact` a zero *"means this
instrument found no DIRECT payment, never that the door was not paid"* —
and returned `ZERO_OBSERVED` anyway, with that sentence printed beside
the verdict. A caveat beside a verdict gets quoted without the caveat.
We spent the week telling other people so.

`reading-under-rail-rule.json` is the same window re-read by the
corrected instrument. Both files are here. **The commitment binds us to
the file we sealed; it does not bind us to keep a verdict we have since
found wrong**, and the way to honour both is to publish both and date
the rule that separates them.

## What this is not

Not a ranking (rule 43) — the doors are in the order we chose them.
A `PAID` row counts unique *sending addresses*, so a facilitator
settling for ten buyers counts once: these are settling addresses, not
customers, and not revenue. Every row carries the residuals it cannot
close.

Scopes, since the other half of this exchange reads differently and
neither is the correct one: ours is blocks 50918945–51316142, StillOS's
is genesis to the same ceiling. Ours reproduces cheaply against the
public RPC's 2,000-block `eth_getLogs` ceiling; theirs reaches further
back. A zero from each of us is not the same claim.
