# Walkabout report — 2026-09-12

Response counts re-derive from `research/field-run-2026-09-12/ledger.jsonl`; settlement counts require its matching `reconciliation.json` and saved transfer evidence. Run `node scripts/walkabout.mjs report` to reproduce this report.

## Taxonomy, stated first

A 402 is **spec_conformant** when its challenge carries `x402Version` and an `accepts[]` array (header or body); **other_structured** when a 402 carried JSON of another shape; **empty** when a 402 carried nothing readable; **non_402** when the door answered anything else unpaid. Verdicts are the Launch Check's: **settled** (historical label for a 2xx after presenting payment; not settlement evidence), **payment_refused** (historical label for a non-2xx after presenting payment; not proof of non-settlement), **no_payment_gate** (answered without asking), **malformed_challenge** (402 without payable terms), **unpaid_by_rule** (terms read, this store withheld by its own rules — a statement about us), **unreachable**.

## The run

| Field | Value |
|---|---|
| started | 2026-09-12T01:49:40.761Z |
| ended | 2026-09-12T01:49:42.122Z |
| wallet | 0x404018C829a4e5AC5F703D1eB0B942Ae7852017F |
| caps | $0.1 per item, $10 per run, 1 per domain |
| approval | per-run press: maybe not regularly but the one time |
| attempts | 1 |
| domains | 1 |
| payments presented | 1 |
| unique doors | 1 |
| repeat attempts | 0 |
| successful responses with a body | 0 |
| client failures | 0 |
| transport failures | 0 |
| submission unknown | 0 |
| quoted on presented attempts (not spend) | $0.100000; 0 missing amounts |

Door identity: HTTP method + origin + pathname; query parameters are inputs. A response body is reported delivery evidence; its content has not been verified as the requested resource. Repeat attempts are repeated doors, not necessarily repeated authorizations.

## 402 shapes

| Shape | Count | Share of attempts |
|---|---|---|
| spec_conformant | 1 | 100.0% |
| other_structured | 0 | 0.0% |
| empty | 0 | 0.0% |
| non_402 | 0 | 0.0% |

## Verdicts

| Verdict | Count |
|---|---|
| settled | 0 |
| payment_refused | 1 |
| no_payment_gate | 0 |
| malformed_challenge | 0 |
| unpaid_by_rule | 0 |
| unreachable | 0 |

### payment_refused, by status the door returned to a signed payment

- 402 × 1

## Reconciliation

Observed transfers: 0 for $0.000000. Exact transaction-and-terms matches: 0 for $0.000000. Matched settlements with reported delivery: 0; without: 0. Free-delivery responses (seller claim and no transfer in this window): 0. Unresolved attempts: 0. Unmatched transfers: 0 for $0.000000.
Scan: eip155:8453, asset 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913, wallet 0x404018C829a4e5AC5F703D1eB0B942Ae7852017F, blocks 51194216–51194217; completed: true. Absence applies only to this completed scan window; it does not prove a payment can never settle later. Terms-only matches remain candidates, not confirmed purchases.

**What that gap establishes, and what it does not.** Exact matches associate a recorded transaction and its terms with a transfer in the declared scan. Unmatched rows and transfers remain gaps; equal totals alone do not establish agreement. It does not establish independence: the ledger and the reconciliation are one party's tooling reading one declared wallet in one run, so a defect common to both would survive a gap of zero unchanged. The stronger claim is a second instrument re-deriving these rows from the chain on its own, and this is not that. Transaction hashes and recorded authorization nonces let another instrument investigate unresolved associations without assuming that a successful response moved money.

## What this is not

Dated observations of what each door did with one real payment at one moment, from one declared wallet. Not a score on any operator, not a ranking, not a statement about any other moment or any other buyer (rule 43).
