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
- ~~**`WARD_CAP` stays 200.**~~ **RULED 2026-08-19: 750.** The feed
  healed the same day this plan shipped (the first hand-run round
  read 6,000 declared resources and the old cap bound for the first
  time), and the keeper ruled the raise. 750 is the one-invocation
  ceiling — the Workers subrequest budget (1,000/invocation, hard)
  minus discovery pages, census reads and headroom — not a taste.
  Past it lies THE LONG WALK — **BUILT 2026-08-19, the same day it
  was greenlit** (`src/services/long-walk.ts`): the hourly cron walks
  the roster in 100-host batches on a cursor all week
  (indexer-gentle, ~16,800 host-slots per week against today's
  ~6,000), Sunday ASSEMBLES what the week already walked instead of
  probing again. **THE FEED'S PAGE CAP, RAISED 2026-09-04:** the
  walk's start firing had been reading the feed under the one-shot
  cap (60 pages = 6,000 rows), and W35 and W36 stopped at exactly
  6,000 with `coverage_suspect: true` and no reason recorded — which
  the tier index turned into "indeterminate" for every host those
  rounds did not reach. The start firing does nothing but read the
  feeds, so it now runs under `LONG_WALK_DISCOVERY_PAGE_CAP` (300
  pages, offset pages fetched four at a time, one retry per page, a
  10 s ceiling per page and a 90 s budget for the read), and every
  round carries `discovery_read` — why the read stopped, how many
  pages, and the total the feed declared. The one-shot cap stays 60:
  that path spends the same invocation on the probes — one GET per host per week, unchanged — and the
  snapshot lands in R2 (`corpus/{seq}.json`, full record) with a slim
  pointer in KV. Pre-graduation entries stay in KV untouched and
  verify as they always did. The keeper created the bucket
  (`scvd-corpus`, free tier) before the binding landed, in that
  order, on purpose. At 750 hosts the weekly
  snapshot runs ~150–200 KB — past the ~128 KB watch line below, so
  the R2 graduation is no longer a trigger to watch; it is the next
  build's first brick, exactly as this plan priced it. Keeper-side
  prerequisite: create the R2 bucket in the Cloudflare dashboard
  before any wrangler binding lands — a binding naming a bucket that
  does not exist fails the build and takes auto-deploy down with it.

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
