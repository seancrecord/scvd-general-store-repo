# Admin revenue review — October 10, 2026

Implemented locally on `codex/clear-offer-paths`. No production records were
changed. Release and authenticated production readback remain pending.

## Delivery evidence

A leftover delivery marker now means **review needed**, not proof that goods
were lost. New x402 and native MPP markers retain the purchase ID and payment
network. The read-only audit checks retained settlement, delivery, payer, path,
amount and, when recorded, network. Native MPP also requires matching sale
ledger evidence. Opening a human order is not completion of that work.

Older MPP markers can be joined by transaction through the settlement month
and previous month's native ledger. That lookup is cached per month within the
scan. Ambiguous matches, missing goods and unavailable evidence remain in the
review queue. The existing bounded marker scan retains its truncation flag.
Older records outside this lookup's coverage may need manual inspection.

Matching retained deliveries appear separately, with a private admin purchase
link. The original markers are not deleted, prior alerts are not silently
acknowledged, and no retry, refund or fulfillment is triggered. The change
addresses the contradictory inference; it does not prove why the original
marker survived or establish that a buyer received a network response.

## Revenue at a glance

The take page reuses its certificate scan and groups gross receipts before
refunds into unlinked outside receipts, rewarded-study-linked receipts, house
receipts and unknown payers. Attribution matches a distinct study purchase's
retained transaction, network, payer, item and amount. Sharing a wallet with a
research participant is not enough. Unlinked is not proof of unsubsidized demand.

Study reads are bounded at 300 records and 100 distinct settled purchase IDs.
Incomplete reads are labelled; they cannot establish that an unlinked receipt
was unrewarded. Reward authorizations are shown separately from redemptions.
Non-certificate sales, refunds, other incentives, costs and invoices are not
silently folded into a profit figure. Activity counts remain activity, not
people or sales. The old settlement/certificate count difference is no longer
asserted to be penny-page purchases without evidence.

Buyer signals now calls copied-example counts **field matches**: one purchase
can match several fields. The existing counters are unchanged.

## Validation and remaining work

The stale-marker and study-attribution regressions were observed failing before
their implementations. Focused checks cover retained delivery, mismatch and
unavailable evidence, human-order scope, same-wallet research attribution,
incomplete research reads, activity units, tax rows and both checkout gates.
Typecheck and both Worker dry-run bundles pass. Full CI is still a merge gate.

The [subsequent guidance review](BUYER_GUIDANCE_REVIEW_2026-10.md) reproduces
the current MCP description and recovery-documentation gaps and corrects an
overstated delivery promise. Historical complaints are not automatically current
bugs. No paid customer qualification or live purchase has been performed here.
