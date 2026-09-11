# Human-capacity reservations

New paid human work reserves capacity after the buyer's inputs and payment identity are checked, and before the store submits settlement. One Durable Object coordinates the keeper's shared bench across HTTP purchases, both MCP payment profiles and Commission Desk purchases. Instant machine goods do not visit this coordinator. Existing keeper-set house, per-item and weekly limits remain the limits.

A storage transaction counts outstanding reservations together with retained legacy orders, checks all applicable limits, and records the new hold. The hold is keyed by the authenticated purchase journal identity; duplicate requests do not claim another slot. Payment and fulfillment happen after the transaction, with the hold still durable. Losing a reservation acknowledgement never authorizes settlement.

A reservation refusal after the purchase journal is created returns that attempt's private status link. The retained attempt is never resubmitted. Once its status confirms `not_settled`, a buyer may start a new purchase with a fresh payment and a new idempotency key when capacity is available. An unknown status is not permission to replace the payment.

A hold has no timeout. An unknown settlement continues to occupy capacity across week boundaries and process restarts. A definitive `not_settled` journal entry permits release; that entry is committed first. A failed release over-refuses until the next reservation reads the journal and repairs it. A malformed facilitator response is not evidence of non-payment.

The original fulfillment checkpoint retains the reservation identity and admission time. A settlement crossing midnight uses that same admission time for the human order and weekly sale marker. Publishing or recovering an order links that hold to the exact original order. A paid order-write failure keeps its hold. Completion releases the unfinished-work slot while retaining the sale against its original week. A missed completion update is repaired by reading the authoritative managed order on the next reservation. Old paid obligations remain owed and may be fulfilled even when new admissions are closed.

At initialization the coordinator imports the existing order ledger only after a complete bounded scan and successful reads of every listed row. An incomplete scan, unreadable row or unavailable coordinator refuses new labor without submitting settlement. Later reconciliation reads retained open legacy work, rather than rescanning lifetime sales. Existing weekly sale markers are counted together with reservations and deduplicated by order identity; a marker disappearing from a later read does not erase a sale already observed.

The migration depends on the completeness of the existing KV ledger projection. It does not establish that no undiscoverable historical obligation or older deployment's in-flight work exists. Its concurrency guarantee covers requests using the new reservation path. The optimistic public availability check can still precede another buyer taking the last slot; reservation refusal is the final decision before payment.

Validation uses local signed fixture payments and deliberately simultaneous admission checks. No live buyer payment, completion callback or human order is created by the tests.
