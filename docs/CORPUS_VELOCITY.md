# Corpus velocity — the plan, and what shipped with it

Written 2026-08-18 against the live 2026-W33 snapshot. Task #22's
question: the strategy says **issue at volume** (the namespace
land-grab window is closing; being precisely documented and prolific
is the play), and the corpus grows at ~1,800 host-observations a year.
Nothing actuarial, nothing citable at volume, comes off 1,800 rows.
What sets the rate, and which parts of it move?

## The arithmetic that frames everything

One round, 2026-W33, read straight off the signed chain:

| Number | Value | Meaning |
|---|---|---|
| `listed_resources` | 100 | The discovery feed answered exactly one page |
| `coverage_suspect` | true | …and the round knows that page was a cap, not the world |
| Probe list | 60 hosts | 35 discovery + 7 both + 18 leaderboard (not probed) |
| `WARD_CAP` | 200 | 140 slots bought and unused |
| `population_known` | 5,809 | Hosts the register can name |
| Coverage | 0.7% | Walked over known |
| Outside denominator | 13,760 endpoints / 420 domains | arXiv 2607.19545, April 2026 |

The rate is not set by the cap, the cron, or the Worker. It is set by
**how many probe-able doors the round can name**. Everything below is
ordered by that.

## Lever 1 — the broken feed (largest unknown upside)

The discovery feed's pagination shape moved on 2026-08-05: reads fell
from several hundred resources to exactly 100, and every cursor
spelling we know has failed to match since. If the registry really
holds anything like its April figure, repairing this read is a
5–20× breadth recovery on its own — bigger than every other lever
combined.

**Shipped with this plan:** the round now records `pagination_shape`
whenever coverage is suspect — the key names the feed's last page
actually carried, top level and one level under the usual containers.
The 2026-08-05 collapse took weeks to diagnose because the shape that
broke us was never written down; the next fix is one read of the
corpus, then one line added to the cursor spellings.

## Lever 2 — the door bank (shipped, the immediate 3–4×)

Past rounds, when pagination worked, recorded host + **resource URL**
for every door the directory declared — several hundred of them, now
sitting in the signed chain while the broken feed names 42. Those
declarations don't expire just because our read of the feed broke.

**Shipped:** `src/services/door-bank.ts` + the fill in
`runWardRound`. Every round's discovery-declared doors merge into one
KV value (`ward_door_bank`, capped at 2,000 hosts, oldest-unlisted
evicted first, evictions counted on the round). Spare cap slots —
140 of them this week — are spent re-probing banked doors on a
rotating cursor, marked `source: "revisit"`.

The lines it does not cross:

- **No homepage-knocking.** The bank holds only URLs the discovery
  directory itself declared. The 2026-08-04 lesson (a leaderboard
  homepage probed for a 402 manufactured ~160 false not_readys)
  stands untouched.
- **A revisit is not a listing.** Revisit rows carry real verdicts but
  sit out the listed/gone delta — otherwise the rotation's own cursor
  motion would read as the ecosystem churning.
- **Consent posture unchanged**: one GET per host per week, indexer
  cadence, Web-Bot-Auth-signed. The pool (10 probes in flight) bounds
  wall time, not per-host contact.

Effect: the walk goes from ~42 hosts/week to cap-bound (~200/week ≈
10,400 observations/year) as the bank fills from history and future
good reads.

## Lever 3 — the paid directories (unblocked; keeper's move)

402index.io (~90k rows, L402-gated CSV) and x402scan.com (paid
resource enumeration) have been on the unread roster since the
widening, with "unblocks when the wallet law is ruled" as their exit.
**The wallet law was ruled 2026-08-18**: $25/calendar-month funding
discipline, balance is the cap, ask-first above $1/action.

Remaining, in order: the keeper funds the wallet; one hand-run paid
read per directory captures the response shape (the same discipline
every feed reader here started with); then the readers get built
against captured shapes, not guesses. Both sources are enumeration
(denominator) first — whether their rows carry probe-able resource
URLs decides whether they also feed the door bank.

## What deliberately does NOT move

- **Cadence stays weekly.** The week key is the chain's idempotency
  identity, "one GET per declared host per week" is the published
  consent posture, and velocity was never cadence-bound — the cap ran
  70% empty. Doubling cadence doubles contact with strangers for a 2×
  a rotation already beats.
- **`WARD_CAP` stays 200.** It binds only when named doors exceed it;
  today the problem is the opposite. The day the feed heals AND the
  bank is full, raising it is a one-line decision that should be made
  together with the R2 question below, because cap × cadence is
  exactly what the storage premise is priced on.

## KV→R2 graduation — the trigger, made checkable

The corpus's own comment (`src/services/corpus.ts`) names the
trigger: snapshots stop being weekly-and-small. Numbers on it:

- A 200-host round is ~40–60 KB per snapshot — inside "tens of
  kilobytes"; the door-bank fill alone does **not** trip the trigger.
- **Watch lines:** any snapshot over ~128 KB, or `population_register`
  / `ward_door_bank` values approaching ~1 MB. Cross either line and
  the graduation is due, on schedule, not as a surprise.
- The move, when it comes: an R2 bucket holding one object per
  snapshot (immutable, hash-chained, ideal object-store shape), KV
  keeping the head pointer + latest round for hot reads;
  `corpus/{seq}.json` served from R2 with KV fallback for the
  pre-graduation entries. Greenfield in this repo — there is no R2
  binding today — and it needs a bucket created Cloudflare-side plus
  a `wrangler.jsonc` binding, so it lands as its own PR when a watch
  line is crossed, not before. Full-universe enumeration (lever 3 at
  ~90k rows) trips it by definition; that pairing is one decision,
  as the desk sheets have said since 2026-08-08.

## Also shipped with this plan

- **Hand-run rounds mint now.** `POST /admin/ward/run` used to walk
  and not snapshot — labor with no signed observation. It now calls
  `takeCorpusSnapshot` too (idempotent per week, so it can never
  double-mint a week the cron already took).
- **Probe pooling.** Sequential probing at an 8s timeout put a full
  200-door round past the cron budget's edge; ten in flight puts the
  worst case under three minutes.

## The scoreboard

Velocity today ≈ 42 obs/week. With the bank filling the cap: ~200.
With pagination repaired: feed-bound, cap becomes the binding
constraint for the first time. With paid enumeration: denominator
honest at ecosystem scale, and the R2 graduation arrives on schedule.
Each round's `door_bank` and `pagination_shape` fields are the
instruments to watch it happen — in the corpus itself, where a
coverage claim belongs.
