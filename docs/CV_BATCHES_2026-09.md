# CV batches — September 2026 — send ONE at a time

Written 2026-09-01 on the keeper's ruling ("agreed with all listed").
Each block is self-contained and copy-pasteable, the same shape as
`docs/CV_TEST_SEGMENTS.md`. **Send one, wait for the report, then send
the next.** They are ordered so the batch that makes money soonest
comes first, and so nothing that needs the keeper's press or pen is
asked of CV before that press or pen exists.

What CV has that the repo agents do not: network hands, the declared
field wallet, accounts on the venues where agents gather, and an
outside vantage point. Every batch uses one of those. What CV does
not have, on purpose: a send button (rule 30), a key to this store's
signer (rule 31), or licence to buy from this store (rule 13).

Standing rules, repeated inside every batch so the batch can travel
alone:

- Report what you actually saw, not what you expected to see.
- One batch per reply. Do not run ahead.
- If a batch is blocked, say so and stop. Do not work around it.
- You draft; the keeper presses. You post, send, or publish nothing.
- You never buy from scvd.store. Only the declared field wallet in
  `src/store/house-wallets.json` ever pays anyone, and only under
  a cap the keeper set.

---

## BATCH A — this week's bounties (weekly, Monday)

```
Standing rules: report what you saw, not what you expected. One batch
per reply. If blocked, stop and say so. You draft and the keeper
presses; you post, send, or publish nothing. You never buy from
scvd.store. Only the declared field wallet ever pays anyone.

Task: draft this week's five bounties for the keeper to post.

Sources: the latest ward round (https://scvd.store/registry and
/corpus.json) and research/field-run-2026-08-18/ledger.jsonl in the
store's repository.

Pick five doors that satisfy all of:
  (a) returned a 402 whose body or PAYMENT-REQUIRED header carries
      x402Version and an accepts[] array (spec-shaped),
  (b) price at or under $0.05,
  (c) are not scvd.store and do not pay to any wallet listed in
      src/store/house-wallets.json,
  (d) were not on last week's board (GET https://scvd.store/api/bounties
      shows every record, paid and expired included),
  (e) are on five different domains.

For each candidate, fetch the door ONCE, right now, unpaid, with
  User-Agent: scvd-walkabout/1.0 (+https://scvd.store/what) x402-bounty-scout
and record: HTTP status, whether a PAYMENT-REQUIRED header was present,
the quoted price, the payTo, and the network.

Deliver exactly this and nothing else: a JSON array of
  {"url": "...", "reward_usd": 0.xx, "why": "one sentence"}
where reward_usd is the door's price plus a finder's fee and never
exceeds 0.25. The keeper pastes each row into /admin/market. Do not
post anything yourself.
```

---

## BATCH B — the walkabout run (weekly, after the runner exists)

Do not send until roadmap N6 has shipped a runner that meets
WALKABOUT.md rules 1–8. The August script is not that runner.

```
Standing rules: report what you saw, not what you expected. One batch
per reply. If blocked, stop and say so. You draft and the keeper
presses; you post, send, or publish nothing. You never buy from
scvd.store. Only the declared field wallet ever pays anyone.

Cap for this run, under the keeper's standing weekly approval
(WALKABOUT.md rule 1 as amended 2026-09-01): $10 total, $0.05 per
item, one purchase per domain. Stop at the cap. Anything above these
numbers is not approved.

Read WALKABOUT.md in full before starting. Confirm the field wallet's
public address is in src/store/house-wallets.json ON MAIN and live at
https://scvd.store/house-ledger.json. If it is not, stop.

Run the walkabout runner (roadmap N6) against the target set it
derives: the 2026-08-18 domain set filtered to doors that settled or
returned a spec-shaped 402, plus this week's ward round. Every request
carries the calling-card User-Agent. Every payTo is sanctions-screened
before payment. One attempt per endpoint. Raw JSONL per attempt.

Before writing the report, reconcile: every USDC transfer out of the
field wallet this run, read from the chain, against the ledger. State
the gap in dollars and transfers, even if it is zero.

Deliver: research/field-run-{date}/ledger.jsonl and report.md, on a
branch, as a pull request. Every number in the report must re-derive
from the ledger; say the taxonomy before any percentage. The keeper
merges; merging is the publish.
```

---

## BATCH C — the findability afternoon (once, then quarterly)

```
Standing rules: report what you saw, not what you expected. One batch
per reply. If blocked, stop and say so. You draft and the keeper
presses; you post, send, or publish nothing. Create no accounts and
fill no profiles for this batch.

Run each query below in ChatGPT, Perplexity, Claude, Google AI Mode,
and Grok. Use a fresh conversation per query. For each, record: who
appears (named sites or products), whether scvd.store appears and
what the answer calls it, whether the answer understands what the
store does (quote the sentence), and what question the store cannot
yet answer.

Queries:
  1. how do I independently verify what an AI agent did
  2. check whether an x402 endpoint actually accepts payment
  3. where can an agent buy a signed artifact
  4. x402 conformance check
  5. who pays agents to test x402 endpoints
  6. get paid to mystery shop x402 endpoints
  7. scvd.store
  8. SCVD general store

Deliver one table, one row per query per system, with the date. Then
at most three findings: the ones that would cost the most if left
alone. No recommendations for new pages; roadmap says rooms exist.
```

---

## BATCH D — the research trails (weekly)

```
Standing rules: report what you saw, not what you expected. One batch
per reply. If blocked, stop and say so. You draft and the keeper
presses; you post, send, or publish nothing.

Append ONE dated entry to each of these three files in the store's
repository, under a "## YYYY-MM-DD" heading (today's date), following
the contract in research/README.md:

  research/x402-pulse.md — what moved in x402 and agentic commerce
    this week. One source per claim. Every number carries a tier:
    verified (you checked the primary source), self-reported, or
    single-source. Say which.
  research/store-admin-sweep.md — read https://scvd.store/stats,
    /api/bounties, /corrections, and /registry, and write what changed
    since the previous entry in the file. Numbers only from those
    pages, quoted with the computed_at they carry.
  research/solo-ai-founder-scan.md — one pattern in how one person
    plus agents ships, one source, the honest asterisk attached.

Open a pull request with the three appended entries and nothing else.
The keeper merges; merging is the publish. Do not touch any other
file.
```

---

## BATCH E — the test segments, then the cold walk (once)

```
Standing rules: report what you saw, not what you expected. One batch
per reply. If blocked, stop and say so. You draft and the keeper
presses; you post, send, or publish nothing.

Part 1. Run docs/CV_TEST_SEGMENTS.md segment 0, then segment 1, one
per reply, at the commit that file pins. Report in the shape each
segment asks for.

Part 2, only after part 1 is reported. From a machine and a wallet
that have never touched this repository or this store, walk
https://scvd.store/try end to end as a stranger would: preflight a
door, run a conformance check on a receipt, buy the cheapest item on
the shelf, verify the artifact at /api/verify/{id}. Record the
transcript verbatim — every URL, every request, every response, with
timestamps. Note every place you hesitated or guessed.

Deliver the transcript as a single file. It is the script for the
60-second demo the keeper records; do not edit it into prose.
```

---

## BATCH F — warm buyers and treaty candidates (once, then monthly)

```
Standing rules: report what you saw, not what you expected. One batch
per reply. If blocked, stop and say so. You draft and the keeper
presses; you post, send, or publish nothing. Every send in this batch
is the keeper's press; you prepare the list.

Part 1. From the outreach desk queue (the keeper will paste it to
you), fetch each host's door ONCE, now, unpaid, with the calling-card
User-Agent. Mark each host still-broken or healed, with the status
and the reason. For each still-broken host that publishes a
security.txt contact, confirm the draft note quotes only today's
probe and nothing stored.

Part 2. From research/field-run-2026-08-18/ledger.jsonl, list every
operator whose door both settled and returned a deliverable, and who
publishes a signing key, a verify URL, or signed receipts. Those are
receipt-treaty candidates (docs/RECEIPT_TREATY_ASK.md). One row per
operator: domain, what they publish, where you read it, the date.

Deliver two lists. Send nothing.
```

---

## Appendix — the bounty tweet, three drafts (keeper's ink, rule 7)

Post one only after the board carries live, unexpired bounties. None
of these ask for anything (rule 5); none claim a first (rule 3).

```
We pay agents to shop other people's x402 doors. Walk one with your
own wallet, post the settlement tx, and the door's price comes back
plus a finder's fee, as a signed USDC authorization you redeem
yourself. Board: scvd.store/bounties
```

```
Directories list x402 doors by whether they answer. We pay you to
find out whether they take money. Five doors on the board this week,
$10 budget, USDC on Base to any wallet you name. scvd.store/bounties
```

```
Mystery shopping, agent edition. Pay a listed x402 door, keep what it
returns, claim with the tx hash. We verify the settlement on chain
and sign your reward. Your observations go in the corpus under your
name. scvd.store/bounties
```
