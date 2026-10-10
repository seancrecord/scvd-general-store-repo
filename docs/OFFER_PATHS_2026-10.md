# Clear offer paths — October 10, 2026

Local implementation on `codex/clear-offer-paths`, based on main at
`605d1a58`. Committed locally at the keeper’s request; not published or deployed.

## What changed

The inexpensive homepage shelf remains first. A separate section presents the
Aura Walk as an **agent shopping audit**, the existing SCVD Attestation pilot
as an **evidence report for a customer review**, and the existing commission
desk as a way to **scope a platform or agency review**. An early homepage link
makes that section findable without scrolling through the whole store.

`/operators` is the existing discovery room, not a new page tree. It now leads
with the decision, why, deliverable, price, delivery, limits, free first step
and next action for each path. The complete launch-stage inventory is still
available in an expandable section. The full site directory collapses on this
room and item pages so the offer is visible first; the links remain available. The Aura Walk moves into the pre-launch
stage: finding shopping friction is useful before buyers arrive.

Shared editorial definitions live in `src/store/offer-paths.ts`; the Aura Walk
value sentence lives in `src/store/aura-walk.ts`. Request-time terms come from
the current menu, pilot constants and commission rungs. USD invoice terms
remain separate from USDC checkout. No price, SKU, payment, signature scope,
capacity or service promise changed.

## Related paths, not a full catalog at every entry

| Entry | Relevant next question |
|---|---|
| Spot Check / Change Check and their follow-up | If you operate this endpoint, do you need observations over time? |
| Service audit / on-page audit / launch check / Opening Day | Where does an unfamiliar shopping agent still get stuck? |
| Standing / conformance watch / operator statement | Does a customer need the evidence assembled into a review report? |
| Batch Spot Check / Research Comparison / Aura Walk | Does a larger decision need a separately scoped brief? |
| Free preflight / look documentation | Shopping audit / endpoint-watch path, conditional on the operator's need |
| Agent guides and installed skill | One named hop to scope, price and free starting points |

HTML, Markdown and JSON item listings, compact item contracts and the catalog
lookup used by MCP/WebMCP expose the same contextual links. The human-labor
MCP description uses the shared Aura Walk value sentence. Existing UCP and
other item-description consumers inherit its clarified listing. These are
optional discovery pointers, not a change to transport capabilities or
permission to buy. Signed evidence remains unchanged.

The operators' JSON and Markdown include the same full offer paths as HTML.
The page's structured service list uses the same descriptions, terms and limits.
No purchase of another item is required to keep or verify an existing result.

## Validation

The new served-surface tests failed on the unchanged base in all three cases:
missing homepage section, missing operator offer paths and missing related
catalog pointers. They then passed with the implementation. Broader affected
checks cover operator stages, Aura Walk terms, compact catalog parity, reader
budgets, guide content, feature contracts, item limits and installed-skill
freshness. The short guide initially exceeded its budget; duplicated prose
was removed rather than raising the limit.

The final affected run passed 176 tests in 15 files. Typecheck and dry-run
Worker bundling pass. The skill source and generated
ClawHub tree match; nothing was submitted to ClawHub. Desktop visual inspection
used static copies rendered by the local Worker, because its HTTPS certificate
is not trusted by the in-app browser. No authenticated production state was
changed. Full CI remains required before a merge.

## Remaining work from the revenue review

1. Delivery/reporting reconciliation implemented locally; [scope and validation](ADMIN_REVENUE_REVIEW_2026-10.md).
2. Admin receipt attribution and activity-unit corrections implemented locally;
   release and authenticated readback remain.
3. Reproduce the current documentation and recovery friction before changing it.
4. Offer packaging is implemented locally; release and live follow-through remain.
5. The commission discovery path is ready locally, but no customer brief has
   been received or accepted as part of this work. Existing published rungs
   still bound quotes; a larger price needs the keeper's decision. Better
   presentation is not evidence of willingness to pay or revenue lift.
