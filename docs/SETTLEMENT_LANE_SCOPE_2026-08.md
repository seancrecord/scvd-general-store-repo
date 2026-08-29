# The settlement-attempt lane — scope

*Ruled 2026-08-29 (KEEPER_LIST NOW-6): **yes, the sampled lane.**
Hard-capped, aggregate-only, private notice to the host on failure.
This is the scoping pass before the build, written because the lane
spends real money at doors that never asked us to.*

## What it is

Twenty doors a week, drawn from the weekly round. Against each: one
real purchase attempt, from the field wallet, recorded stage by stage
and signed. The question is the one nothing else can answer — **does
paying a parseable 402 actually get you goods?**

## What already exists

Almost all of it. `src/services/launch-check.ts` is this engine,
built for ONE door named by the operator who paid us to walk it. The
sampled lane is the same engine pointed at doors that did not ask.

| Piece | State |
|---|---|
| `performLaunchCheck` — the fifteen-stage walk | Built, battery `launch-check-v2` |
| `FIELD_SPEND_CAP_USD = 0.05` per attempt | Built, enforced in code |
| OFAC screen, **fail closed** (`oracleScreen`/`chainalysisScreen`) | Built. No screening, no payment |
| `MAX_AUTHORIZATION_SECONDS = 600` | Built. A door asking for ten years gets ten minutes |
| Redirect refusal on the paid knock | Built. A redirect is a finding, not a detour |
| Signed, re-derivable records | Built |
| Field wallet, separate from the till | Built |

**What is new is the sampling, the aggregation, and the notice.**
Not the money handling — that has been through its own review.

## What has to be decided before code

### 1. How the twenty are chosen

The census taught this the hard way: a cap taken off a sorted list
drops the *same* doors every week — a permanent hole, not a sample.
**Rotate by a stable per-week offset**, so coverage accumulates and
the reading can say which slice it walked. Never a fixed slice.

Doors that failed before payment was even possible (no parseable
challenge, dead host) should be excluded from the twenty and counted
separately — spending a probe to re-learn what the free rungs already
established is waste.

### 2. What a verdict means

Four outcomes, and the lane must keep them apart:

- **paid, delivered** — money moved, goods arrived
- **paid, nothing** — money moved, no goods. The finding
- **refused** — the door rejected our payment
- **never reached payment** — the walk stopped before money

Only the second is a claim about someone's honesty, and it is the
heaviest thing this store would ever publish.

### 3. Publication, and the notice

Aggregate only, by the ruling. Something of the shape *"of twenty
doors walked this week, N delivered, N took payment and delivered
nothing"* — never a named row.

**RULED 2026-08-29: notify where possible, record the gap.** Private
notice wherever a channel exists — security.txt, a contact on the
door's own page, a repository. Where none exists, the reading records
**"no channel found"** and the aggregate publishes anyway.

The alternative — holding a finding until its operator can be reached
— was declined for a reason worth keeping: it would silently exclude
exactly the least-reachable operators from every published number,
which is a coverage hole that then has to be disclosed anyway. This
store's habit is to count its gaps in public rather than let them
quietly bend a denominator. The gap is on the record; the finding
still counts.

### 4. What happens to what we buy

**RULED 2026-08-29: shape only, discard the body.** Record status,
size, content-type and a sha256 of the delivery; throw the content
away.

The finding is *whether* goods arrived, never what they were. Keeping
strangers' paid products — bought under an envelope UA that says who
we are, with no licence to hold or redistribute them — is an exposure
a named LLC does not need, and the hash still proves we received
something specific if a walk is ever disputed. Retaining only on
failure was considered and declined: "this looks wrong" is a
judgement made at capture time, which is exactly when we know least.

### 5. Money discipline

Twenty at $0.05 is $1.00 a week worst case, against a $25/month
funding discipline. The standing wallet law says **ask first above
$1** — so a full run sits exactly on that line, and every run is a
press anyway under rule 30. Suggest the press states the run's
maximum spend before it runs, and refuses if the field wallet is
below it.

## What this lane must never do

- Spend on a clock. It is pressed, and it refuses rather than
  overruns.
- Retry a failure. One attempt; a failure is an observation.
- Publish a named door's failure without its own ruling.
- Continue when the sanctions screen cannot answer.

*Filed 2026-08-29 after the NOW-6 ruling; both open questions ruled
the same day. Nothing in this scope now waits on the keeper — the
build is unblocked.*
