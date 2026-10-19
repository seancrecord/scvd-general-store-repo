# x402 recovery accounting — October 19, 2026

A confirmed purchase could recover its goods without recovering its settlement record. The purchase journal now retains the missing record and keeps retrying failed writes. It preserves an existing record and the request's original house classification. The hourly raise derives eligible counter floors from the retained evidence; recovery never replays all counter increments, because some may already have succeeded.

## The observed incident

The books-invariant alarm named `cert_9xdgjs3j6r`, a Base `batch_spot_check` purchase for 0.01 USDC. Its retained purchase began at 10:09:51 UTC. The request hit a CPU limit at 10:09:54; its certificate was retained at 10:10:54 and delivery at 10:10:55. The successful chain receipt and purchase inspection agreed on the payer, transaction and amount. That timing supports recovery after interruption, but the exact instruction at which execution stopped was not retained.

The authorized certificate backfill around 13:29 wrote one settlement record, corrected one existing payer row and rebooked no counters. The 13:30 hourly raise then restored the missing 0.01 USDC revenue and the batch-sale, daily and Base counters. The repaired wallet had six records and a matching purchase total. The certificate alarm did not repeat on that round; its previous three sightings remain history.

## The older one-count difference

There are two different facts in the older notes:

- The [July 27 reading](archive/LEDGER_READINGS.md) explains the founding fifty cents: one hand-entered settlement predates the payer instrument. Reconciliation already subtracts that allowance.
- A separate October 12 investigation found one unexplained count **after** subtracting the founding allowance. It read 536 settlement records and 45 payer rows; raw counter settlements were 573 and derived payer purchases 572. No transaction established a justified counter correction. The house reclassification entries affect classification, the rail reversals affect rail counts, and challenge-traffic corrections do not adjust product settlement totals.

The October 19 post-repair snapshot reads 607 counter settlements, 605 derived payer purchases, one founding allowance and zero unattributed settlements: **one remains unexplained**. October agrees by item and in total at 123 counters and 123 records. The July–September differences match the October 12 investigation; they are historical, not a new missing October certificate record. Older per-wallet totals cover purchases without retained settlement records, so their differences cannot all be treated as errors.

The temporary zero immediately after the backfill was not the finished result: the hourly raise had not yet restored the missing sale counter. Record and counter reads are sequential and KV is eventually consistent. No additional production repair was performed, and no arbitrary counter adjustment is justified by this evidence.

## Surfaces and limits

The admin reconciliation describes the founding subtraction and the separate record/counter repair stages. Public count provenance names both the normal till writer and the hourly raise; the correction is published through the existing `/corrections` ledger. Public counts remain derived from their existing records, with their existing exclusions and coverage. Prices, menu items, checkout protocols, signed certificates, purchase rights and API contracts are unchanged.

The surface review covered README, agent buying guidance, catalog/OpenAPI, discovery documents, the A2A card, trust metadata and storefront count provenance. Only accounting explanations needed changes. The purchase-inspection endpoint continues to say that legacy accounting is not inspected there; delivery and a recovery acknowledgement are not a fresh audit of all counters.

Historical journals may lack the request's house header/user-agent classification; recovery can only fall back to surviving wallet classification. The patch does not enumerate old purchase objects whose alarms already retired. The known historical certificate was repaired explicitly. A settled journal requiring manual delivery can restore accounting without pretending its goods were delivered. Native MPP and Arc gateway accounting keep their existing paths.

## Validation

Regression tests reproduce the exact batch purchase and alarm path, already-delivered and manual-delivery purchases, failed-write retry, house attribution, identity mismatch and existing-record preservation. The core regression was shown to fail with the original recovery source: a certificate existed but the settlement record was null. A successful recovered record is also checked through the hourly raise, including revenue and a second idempotent pass. Focused tests, typechecking and real bundle checks precede the PR; every CI shard and the required `check` gate must pass before merge.
