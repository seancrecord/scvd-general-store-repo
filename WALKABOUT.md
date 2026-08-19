# The Walkabout — paid field observation of the x402 ecosystem

Status: spec, awaiting the keeper's pen. Written 2026-08-18, after the
first field run. Spec first, then the walking — the same order the Tab
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

⚑ KEEPER REVIEW — ratification of run zero ($0.05, after the fact),
the default caps in rule 1, and this document's standing are all the
keeper's to confirm; nothing further walks until he does.

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

⚑ KEEPER REVIEW — this section, the standing approval it claims, and
the launch_check item copy are the keeper's to confirm.

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
