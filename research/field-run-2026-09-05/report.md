# Walkabout report — 2026-09-05

Every number below re-derives from `research/field-run-2026-09-05/ledger.jsonl` with `node scripts/walkabout.mjs report`. Nothing here is typed.

## Taxonomy, stated first

A 402 is **spec_conformant** when its challenge carries `x402Version` and an `accepts[]` array (header or body); **other_structured** when a 402 carried JSON of another shape; **empty** when a 402 carried nothing readable; **non_402** when the door answered anything else unpaid. Verdicts are the Launch Check's: **settled** (money moved, 2xx), **payment_refused** (signed payment presented, door refused), **no_payment_gate** (answered without asking), **malformed_challenge** (402 without payable terms), **unpaid_by_rule** (terms read, this store withheld by its own rules — a statement about us), **unreachable**.

## The run

| Field | Value |
|---|---|
| started | 2026-09-05T16:53:21.221Z |
| ended | 2026-09-05T16:55:05.602Z |
| wallet | 0x404018C829a4e5AC5F703D1eB0B942Ae7852017F |
| caps | $0.05 per item, $10 per run, 1 per domain |
| approval | standing weekly approval — WALKABOUT.md rule 1 as amended 2026-09-01, at the defaults · second run this week: second walk this week, keeper's press |
| attempts | 40 |
| domains | 40 |
| payments presented | 34 |
| settled | 34 (100.0% of presented) |
| settled with a body | 34 |
| spent (ledger) | $0.0350 |

## 402 shapes

| Shape | Count | Share of attempts |
|---|---|---|
| spec_conformant | 35 | 87.5% |
| other_structured | 0 | 0.0% |
| empty | 0 | 0.0% |
| non_402 | 5 | 12.5% |

## Verdicts

| Verdict | Count |
|---|---|
| settled | 34 |
| payment_refused | 0 |
| no_payment_gate | 0 |
| malformed_challenge | 0 |
| unpaid_by_rule | 1 |
| unreachable | 5 |

### unpaid_by_rule, by reason (about this store's rules, not the doors)

- `no_base_usdc_exact_accept` × 1

## Reconciliation

Chain transfers from the wallet between blocks 50918927 and 50918979: 34 for $0.0350. Ledger settled: 34 for $0.0350. Matched: 34. On chain only: 0. Ledger only: 0. Gap: $0.0000.

## What this is not

Dated observations of what each door did with one real payment at one moment, from one declared wallet. Not a score on any operator, not a ranking, not a statement about any other moment or any other buyer (rule 43).
