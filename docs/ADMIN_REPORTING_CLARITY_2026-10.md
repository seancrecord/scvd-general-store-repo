# Admin reporting clarity — October 13

Keeper authorized four reporting fixes after the reconciliation export readback.
Implemented on `codex/admin-reporting-clarity`. The keeper authorized PR and
merge after required CI; production readback remains separate.

1. **Inflow:** headline and sole/shared activity rates require equal windows,
   readable addresses and uncapped coverage. Incomplete readings retain observed
   counts and explain why the rates are withheld. Sample distributions explicitly
   describe observed transfers.
2. **Office:** counter/certificate differences are aggregate comparisons, with
   list-price estimates distinguished from amounts paid. Neither equality nor a
   difference establishes a transaction match, missing payment or failed delivery.
   A capped certificate read makes the comparison inconclusive.
3. **Recount:** the route reports whether the serialized counter ledger is bound,
   the KV fallback is active, or the writer is unknown. Historical lost increments
   remain a possible explanation, not an inferred cause. Retained event rows are
   stored observations, not fresh chain verification or proof of delivery; an
   uncapped scan is not proof of complete historical retention.
4. **Counter:** the quiet headline says no required work is present in this
   reading. Pending tips appear separately as optional review with a direct link;
   they do not inflate the required-work count.

No accounting writes, counter repair, payment behavior, public offers or
moderation actions changed. The historical one-count warning remains unresolved.

Validation: final regressions against the prior source failed in all four
affected specs (17 failures, 12 passes), then the fixes were restored. The final
implementation passed nine focused specs (51 tests), typecheck and all production
bundle dry-runs. Coverage includes the real Inflow and Recount handlers, partial
and equal readings, both counter/certificate difference directions, optional tip
review, admin reachability and existing consolidated reporting behavior. Full
required CI and release verification remain gates for a later PR and merge.
