# Reading the settlement response, and the replay read four ways

*Decided 2026-09-12 on the keeper's "go in that order", after a read of
x402-foundation/x402#3325 (the settlement status vocabulary) and the
receiver obligation split out of it (#3437). Three steps were named;
two shipped here. The third waits on the spec.*

## The question, and the store's own line through it

Should the free conformance desk check `SettleResponse` handling and
double-charge behaviour? PROBLEMS.md entry 0 draws the line: offline
math is free, going and looking is paid. A settlement response sits on
both sides of it.

- Whether a settlement response is the SHAPE the merged spec describes,
  and what a reader may CONCLUDE from it, is offline math. That ships
  free, as a reader and a fixture corpus (step one, below).
- Whether a DOOR re-challenges a spent authorization is a fact about a
  door at a moment, learned only by paying it and presenting the same
  payment again. That is the launch check's stage seven, paid, read
  finer (step two).
- A `settlement_response` kind on the free desk is step three, and it
  waits: the desk's v1 contract is frozen, the status vocabulary is
  still moving on a branch, and a check against a draft would be a
  claim the spec could withdraw. When the vocabulary merges, a
  `settlement-response-v2` battery reads it and says so in its name.

## Step one: the reader and the fixtures

`defects/settlement-response.js` (`scvd-defects/settlement-response`
from 0.14.0) is a zero-dependency reader for the bytes a buyer holds in
`PAYMENT-RESPONSE`, or a facilitator's `/settle` body. Battery
`settlement-response-v1`: nine checks against §5.3.2 and §9 of the
merged v2 specification, and one reading — settled, failed or
unresolved.

The reading is the part that costs money. `settlement_pending` is
non-terminal under §9; a reader that maps `success:false` to failed
re-challenges a buyer whose money is on its way. So the reader says
unresolved there, and on every shape it cannot read: an ill-typed
required field, a response that contradicts itself, bytes that are not
JSON. Unresolved is never failed.

`test/fixtures/settlement-responses/` carries twelve shapes, each naming
the checks it fails, the outcome a reader must reach and the outcomes
it must not. They are served at `/fixtures/settlement-responses/` and
mirrored into the package, byte for byte, under a guard in
`test/packages.spec.ts`. The negative control is stated as a
relationship rather than a list: the naive reader is wrong on exactly
the unresolved fixtures and nowhere else
(`test/settlement-response-fixtures.spec.ts`). A battery that cannot
fail cannot pass; this one fails the reader most implementations ship.

What the fixtures are not: recorded from any live door. Every one is
hand-built from the specification's own text and dated so, with no
hostname. The legacy `{success:false, transaction:null}` shape is the
one a facilitator operator described on the thread, rebuilt from that
description.

## Step two: the replay, read four ways

The launch check's stage seven presents the byte-identical settled
payment a second time. Battery v2 read the answer as one bit: a 2xx was
the goods given away, anything else was "refused, correctly". That
credited exactly the door the thread measured in seven of ten money
paths — a 402 with fresh terms on a payment already taken — and it
would have called this store's own till a giveaway for handing the same
purchase back on its paid-retry lane.

Battery v3 signs a `replay` object beside the tri-state `replay_served`:

| outcome | read from | the class it names |
|---|---|---|
| `served_again` | 2xx naming no settlement | replay-accepted |
| `redelivered` | 2xx naming the first response's transaction | none: the same purchase handed back |
| `rechallenged` | a payment challenge (PAYMENT-REQUIRED, or accepts in the body) | re-challenges-spent-authorization, new in v14 |
| `refused` | any other non-2xx; `names_settlement` says whether it named what spent the nonce | nonce-unbound-from-settlement when it did not |
| `unknown` | the replay never completed | nothing claimed |

`replay_served` keeps its v2 meaning — served AGAIN, as a new sale —
so a re-delivery reads false there and `redelivered` here. The buyer
note leads with the re-challenge when it happened, the way it already
led with the giveaway. A v2 record's "refused, correctly" now reads as
"not a 2xx" and nothing finer, and the battery name on the record is
how a reader knows which.

The vocabulary moved with it, and the amendment is self-implicating.
`replay-accepted` asserted since v1 that the replay "is refused". This
store's till does not refuse; it re-delivers, naming the settlement.
By the letter of v1 the registrar exhibited its own class. v14 reads
"not served as a new sale: refused, or answered with the original
purchase naming the settlement that paid for it", which is what the
receiver obligation asks and what a walk can see from outside. The
changelog entry says so in those words rather than smoothing it over.

## What this does not claim

The replay is presented after a SUCCESSFUL settle. The receiver
obligation in #3437 is about an UNRESOLVED one, and this store cannot
make a stranger's facilitator time out. So a `rechallenged` reading is
evidence about re-challenge behaviour on a spent authorization, the
closest observable proxy, and not a direct test of the hold. The stage
detail and the class say which.

Nothing here names the conformance desk in the spec, and nothing
should: the thread's own drafting rule was to name no tool, and the
right answer to "add the desk to the review" is a battery anyone can
run, which is step one.
