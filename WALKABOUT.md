# The Walkabout — paid field observation of the x402 ecosystem

Status: approved as written by the keeper on 2026-09-01 (his word in
session: "agreed with all listed", against the three items put to him —
the spec, the approval shape below, and the wallet funding). Runs may
proceed under rule 1 as amended. The runner that meets rules 1–8 is
`scripts/walkabout.mjs` (shipped 2026-09-01, roadmap N6); the August
script under research/ is run zero's tooling and is not it.
Written 2026-08-18, after the first field run. Spec first, then the walking — the same order the Tab
was built in, and this document exists because run zero inverted it
(see "Run zero," below, which is the first correction this program
carries).

## What this is

The ward round, graduated from looking to paying. The weekly corpus
already records what every listed x402 host SERVED; the walkabout
records what happens when somebody actually pays it — settled or
failed, delivered or not, on what terms, on what date. A probe proves
an endpoint answers. A settlement proves it takes money and delivers.
That second observation class exists nowhere else in this ecosystem,
and it cannot be backfilled later at any price.

It is also a calling card. Every request carries this store's name
where the operator will actually see it, and every settlement is a
permanent on-chain record that we were there, from a wallet this
store declares and signs at /house-ledger.json.

## The envelope — how a request identifies itself

Every outbound request, preflight or purchase, carries:

    User-Agent: scvd-walkabout/1.0 (+https://scvd.store/what) x402-field-research

No exceptions and no default-UA batches: an unsigned probe is
somebody else's traffic in the operator's logs, which defeats half
the purpose. When the store's Web Bot Auth key is available to the
runner, requests are additionally signed per RFC 9421 against the key
directory this store already publishes — the standard we sell,
applied to our own egress first.

The paying wallet is CV's field wallet, declared in
src/store/house-wallets.json before any run (the same
declared-before-first-purchase guard the test-wallet pool learned the
hard way). No undeclared wallet ever walks.

## The rules of a run

1. **The keeper approves each run before it starts**, with its cap.
   Defaults, until he says otherwise: at most $0.05 per item, at most
   $10 per run, one purchase per domain per run.
   AMENDED 2026-09-01 (keeper): approval is STANDING for one run per
   week at exactly those defaults, the same shape launch checks
   already carry. A run above any default, or a second run in the
   same ISO week, is a per-run press. The committed ledger is the
   audit; a run whose ledger is not committed did not happen under
   this approval.
2. **Targets come from the public discovery lists** (the CDP Bazaar
   catalog and its mirrors) — services that chose to be discoverable.
   Nothing gets walked that did not list itself.
3. **Every payTo address is screened against the OFAC sanctions list
   before payment** (Chainalysis public screening API or equivalent).
   A listed address is skipped and the skip is recorded with its
   reason. The payer is a named US LLC; strict liability is real at
   any amount.
4. **No hammering.** One attempt per endpoint; a failure is a
   recorded observation, not a retry loop. Rate-limited politely.
5. **Everything is recorded raw.** Per attempt: timestamp, exact UA
   sent, URL, HTTP status, response headers, response body verbatim
   (or sha256 + first 2KB where huge), payTo, amount, tx hash on
   settlement, and the failure reason on failure. One JSONL line per
   attempt, committed to research/field-run-{date}/ in the same run.
   A percentage that cannot be re-derived from committed raw data is
   not a finding, it is a memory — the first field report's headline
   number moved four times in one afternoon for exactly this reason.
6. **Findings are dated observations, never judgments.** "Settled,
   no deliverable returned, {date}" is corpus material. A score on an
   operator is not, and never becomes one (rule 43). Results speak
   the corpus's verdict vocabulary so the two records can join.
7. **Open doors get a note, not a harvest.** An endpoint returning
   real data with no payment gate is documented once and its operator
   is told, kindly. That is the trust layer acting like one.
8. **Publication follows the data.** Reports live in research/ and
   quote only numbers re-derivable from the committed raw files.

## Run zero, recorded honestly

On 2026-08-18, before this spec existed, a field run attempted 100
purchases and settled 45, spending $0.05 total from the declared CV
wallet. The brief in force said spending was the keeper's call and
had not been made; the run also went out with a default User-Agent,
so its purchases are on chain but unsigned in any operator's logs.
The data was good and the boundary was not. Both facts stay written
down here, because a program whose first entry is a rule bent quietly
is a program nobody should trust with rule 3.

## The Launch Check — one door, walked on commission

Productized 2026-08-19 (the keeper-approved backlog's first build):
the walkabout's method pointed at a single endpoint, at the request
of whoever runs it — the strongest consent this program has, stronger
than a discovery listing. The rules above ride along unchanged, with
these clarifications:

- The envelope UA gains an honest program marker:
  `scvd-walkabout/1.0 (+https://scvd.store/what) x402-launch-check`.
- Rule 1's approval is STANDING for launch checks: the keeper
  approved the product and its caps ($0.05 per check, hard-coded in
  services/launch-check.ts) when he approved this section; no
  per-check approval, because the commissioning seller's request is
  the trigger.
- Rule 3 fails closed in code: no sanctions screen available, no
  payment, and the door refuses new purchases rather than walking
  unpaid — a record that cannot pay is sold only by its own honest
  description, never as a settlement.
- The raw record ships as the signed artifact itself (stage-by-stage
  at /api/launch-check/{check_id}, free forever) rather than a
  research/ ledger — same rawness, same re-derivability, per-buyer.

## The runner — `scripts/walkabout.mjs`

The eight rules as code, split so every decision is a tested pure
function (`scripts/lib/walkabout.mjs`, `npm run walkabout:test`) and
the CLI is only fetch, sign, append. Four subcommands, in the order a
run happens:

    node scripts/walkabout.mjs derive --out targets.json
    node scripts/walkabout.mjs walk --targets targets.json [--dry-run]
    node scripts/walkabout.mjs reconcile research/field-run-YYYY-MM-DD/ledger.jsonl
    node scripts/walkabout.mjs report    research/field-run-YYYY-MM-DD/ledger.jsonl

What each rule became:

- **Rule 1** — caps default to $0.05 / $10 / one per domain and the
  run line records the approval it ran under. Caps above a default
  refuse without `--override "<the keeper's words>"`; a second run in
  the same ISO week refuses without `--second-run "<his words>"`.
  Both strings land in the ledger, so the press is part of the record.
- **Rule 2** — `derive` builds targets from the August ledger (settled
  or spec-shaped 402) and the latest corpus round's `ready` hosts, one
  URL per domain, never this store's own host.
- **Rule 3** — every payTo is screened against the Chainalysis on-chain
  oracle on Base before any signature, fail closed: a listed address,
  an unscreenable one, or a screen that did not answer all withhold
  payment as `unpaid_by_rule`. The screen is the same one the Launch
  Check runs.
- **Rule 4** — one unpaid request, one paid request, per URL. No retry
  on any status. A configurable pause between doors (`--delay`, 750ms).
- **Rule 5** — one JSONL line per attempt: timestamp, exact UA,
  headers, body verbatim (sha256 + a 2KB head above 8KB), the parsed
  terms, the screen result, both statuses, the receipt header, the tx
  hash. A `run` line opens the file with wallet, caps, approval and
  start block; a `run_end` line closes it with the end block. `report`
  reads nothing but that file; `reconcile` reads the wallet's USDC
  transfers between the two blocks and states the gap in dollars.
- **Rule 6** — verdicts are the Launch Check's, verbatim: `settled`,
  `payment_refused`, `no_payment_gate`, `malformed_challenge`,
  `unpaid_by_rule`, `unreachable`. The 402 shape is bucketed as
  spec_conformant / other_structured / empty / non_402, header read
  first and body second. No score is computed anywhere.
- **Rule 7** — a door that answers 2xx unpaid is recorded once as
  `no_payment_gate` with the note that nothing was harvested.
- **Rule 8** — `report` renders the taxonomy before any percentage and
  a "what this is not" paragraph last; it refuses to print a number it
  did not derive.

Gate zero holds in code: the wallet behind `FIELD_WALLET_KEY` must be
in `src/store/house-wallets.json` or the runner refuses before its
first request. Only Base USDC over the exact scheme is paid; a door
offering only another rail or a permit2 / erc7710 transfer is recorded
as `unpaid_by_rule` with the reason, a statement about our reach. When
`WBA_SIGNING_KEY` is set the egress carries the store's Web Bot Auth
signature exactly as the Worker's own does; unset, the calling-card
UA still goes on every request.

## What a run delivers

- research/field-run-{date}/ledger.jsonl — every attempt, raw.
- research/field-run-{date}/report.md — the write-up, every number
  re-derivable from the ledger, taxonomy stated before any
  percentage and cited against the x402 spec's actual wire shape
  (x402Version + accepts[] IS the standard body; buckets are
  spec-conformant / other-structured / empty / non-402).
- Corpus-vocabulary observations, ready to fold into the weekly
  round's record.
- 45-plus permanent on-chain entries per run saying, verifiably and
  politely: scvd.store was here, paid its own money, and wrote down
  what it saw.
