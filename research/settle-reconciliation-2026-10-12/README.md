# Settlement reconciliation — October 12, 2026

The one-count discrepancy is real in the retained accounting data, but this read did not identify a transaction that justifies a correction. No production data, counter, configuration, or code was changed.

The complete prefix listings returned 536 per-settlement records, 45 payer rows and 327 sale events. A complete metric-key listing supplied 131 relevant counter keys. Reads were sequential rather than an atomic snapshot. The counter sum excluding the separately added founding settlement is 573. Derived payer purchases are 572: 536 per-settlement records plus 36 additional counts retained in higher per-wallet totals. Those counts are not independently established purchases; the receipt follow-up below found a stale casing alias among them. Adding and then subtracting the founding settlement does not change the residual of one.

| Month | Organic + house counters | Per-settlement records | Difference |
| --- | ---: | ---: | ---: |
| July | 33 | 0 | +33 |
| August | 133 | 128 | +5 |
| September | 317 | 318 | -1 |
| October | 90 | 90 | 0 |

Payer rows are all-time, so their additional 36 purchases cannot be assigned to months from the totals alone. The monthly differences cannot each be labelled errors. July predates the oldest retained per-settlement record. August's differences are daily_fortune (+1), settlement_attestation (+3), and small_blessing (+1); September's is spot_check (-1). There are no duplicate transaction identifiers among the per-settlement records read.

The October 2 fix in commit 097673742d9b9b158f244da66b91e8115e72220d prevents new house-by-agent/header settlements from being raised as organic. Its historical duplicate-count hypothesis is not established by this audit. Retained sale events span September 6 through October 12; 103 house events lack a payer field. No house event with a payer outside the origin/main house-wallet register was found. Matching the older payer-less house events to settlement records by item and exact timestamp, and separately within ten seconds, also found no unlisted-wallet candidate. This is a limited cross-check, not proof of absence: additional configured house wallets and receiving addresses were not read, older events are absent, and a timestamp match is not a transaction identity.

Next repair gate: identify transaction-level evidence and the affected counter before changing anything. If historical receipts or adjustment evidence cannot explain the residue, retain it explicitly as unresolved historical accounting rather than decrementing an arbitrary counter or rerunning a raise that only increases counts. This audit did not independently recheck on-chain transfers or customer delivery.

Counts, coverage and hashes of the temporary local evidence are retained in [summary.json](summary.json). Raw records remain local under `/tmp/scvd-settle-investigation`; they are not included in this report. No commit or push was made.


## Historical receipt and adjustment follow-up

All 582 certificates were read without truncation. Of 548 with a payer, 536 match retained settlement transaction identifiers. The other 12 match the number and dates of the native MPP certificates described in the admin reading; this direct KV audit did not independently query the native Durable Object ledger to re-prove their protocol. The remaining certificates are 33 July certificates without payer fields and one September trade-account test certificate. No duplicated transaction identifier was found among the certificates.

The latest raise scanned all 536 records and 582 certificates and changed neither counters nor payer rows. Only the latest raise is retained under `counter_raise:latest`; it cannot establish which historical invocation made a particular lift. Three house-reclassification entries retain 19 moves from organic to house. They change classification at read, not the combined number of payments. `metric:corrections` corrects challenge traffic, not settlement totals. Two rail-seam reversal markers correspond exactly to the two August 5 Solana test receipts and adjust the Solana rail counter only. They do not justify decrementing a product settlement counter.

A concrete older inconsistency remains: the Solana test wallet has both a correctly cased payer row and an older all-lowercase alias, each claiming two purchases. The certificates and the two per-settlement records name the correctly cased wallet; the alias's first/last times are about two seconds earlier. This is consistent with the historical lowercasing defect documented in `src/lib/addresses.ts`. Solana addresses are case-sensitive: treating the strings as the same identity globally would be another defect. The stale alias contributes two to the displayed payer floor, not the one excess counter under investigation. Removing it alone would widen the difference from one to three. Nothing was removed.

**Disposition:** retain the one-count warning as unresolved historical accounting. There is no identified extra charge, undelivered purchase, or transaction-backed single-counter correction in these records. No refund, counter adjustment, payer-row deletion, repair execution, or production change was made. Historical raise history and a complete payment-to-old-row attribution remain unavailable.
