# Payment reach follow-through — September 15, 2026

The keeper ordered historical evidence first and payment reach second, with
MPP still under development. The completed evidence reading is in
[HISTORICAL_EVIDENCE_2026-09-15](HISTORICAL_EVIDENCE_2026-09-15.md).
This note scopes the next work; it enables no payment method.

## What was checked

This checkout starts at `da0341788d03d7cabd3300b35bed0edacaa0974e`.
`src/lib/payment-networks.ts` derives checkout networks from configured
recipients. `PAYMENT_RAILS.md` records Base, Polygon, Arbitrum, World and
Solana checkout; the current runtime quote remains the authority. This pass
has not exercised a paid purchase on any of them.

The separate task **Implement MPP PR 2** owns the MPP observation work.
The closeout read of GitHub on September 15 confirms census/passport
[PR #691](https://github.com/seancrecord/scvd-general-store-repo/pull/691)
merged at 15:39:39 UTC. Discovery comparison
[PR #712](https://github.com/seancrecord/scvd-general-store-repo/pull/712)
and the separately versioned core draft-01 reader
[PR #715](https://github.com/seancrecord/scvd-general-store-repo/pull/715)
remain open; #715 is stacked on #712. These extend observation of other
services' MPP challenges. They do not make the store accept MPP payments.
The September 14 handoff's “not started” status is historical. Do not
duplicate those implementations or infer deployment from a local branch.

The separate **Audit cold-entry buyer journeys** task owns buyer-path work.
Its open [PR #714](https://github.com/seancrecord/scvd-general-store-repo/pull/714)
preserves the existing private recovery header in WebMCP publication results
and documents the payment-client paths. Its reported live quote and mocked
stock-client checks do not establish a paid WebMCP or CDP-managed wallet
purchase; both remain explicitly unverified in the PR. This pass reviewed
the PR record and did not independently rerun its live probes. Reconcile
its release evidence before opening another buyer implementation.

## Ordered next work and completion criteria

1. **Reconcile existing buyer-path evidence.** For each supported entry path,
   distinguish discovery, quote, explicit authorization, confirmed payment,
   delivered goods, lost-response recovery and independent verification.
   Record tested clients and networks, failures and untested combinations.
   A mock or an unpaid quote cannot establish a real settlement. Start with
   the buyer task's evidence; request a new paid exercise only for a named gap.
2. **Finish the existing MPP observation work.** Reconcile its merged commits,
   battery version, census denominators, passport wording and discovery
   comparisons. Preserve historical x402 verdicts and missing observations.
   Completion means the new readings are available and accurately described;
   it does not mean MPP checkout is enabled.
3. **Qualify one concrete MPP payment path.** Name the client, product, method
   and network it can use, then trace it through the existing payment gate,
   generation, settlement, delivery and recovery code. Apply the standing
   intake and eleven-check rail process in `PAYMENT_RAILS.md`; this note does
   not resolve the existing intake ruling. Start with the smallest justified
   method; adopting MPP does not by itself require a new chain or currency.
4. **Expose only the qualified capability.** Update discovery and buyer-facing
   contracts from the same implementation. `paidOp()` and its discovery-shape
   test currently publish x402 only. Change that claim when an integrated
   MPP payment path exists, together with its operational limits and evidence.

For step 3, the acceptance record must include generation failure with zero
settlement, buyer-bound replay and retrieval, changed terms and expiry,
simultaneous attempts across protocols, uncertain settlement, and recovery
after a lost response. Reuse the current idempotency and recovery primitives;
inspect their guarantees before introducing another payment ledger. No silent
switch of paid method. Redact credentials from errors and retained evidence.
A payment receipt and the store's signed observation remain distinct records.

Measure the initial unpaid response, authorized processing, generation,
settlement and recovery separately. Compare the same product, client, region
and warm/cold condition; retain failures and unknowns in the denominator.
Keep optional protocol work off the common unpaid path when it is not needed.
Header size, cache behavior, CORS and routing through both Workers belong in
qualification, not just the successful payment example.

## Packages and surfaces to check when the contract changes

- **Verifier (`verifier/`):** the historical catalog supplement already works
  through the existing evidence-file contract. No release is needed for this
  recovery tool. Revisit only if signed artifact fields or verification rules
  change; preserve verification of older artifacts.
- **Signer (`signer/`):** artifact signing is separate from payment protocol
  negotiation. Change it only if the artifact contract actually changes.
- **CLI (`cli/`):** it already prints MPP battery readings. Report-format and
  payment-client support need separate checks; printing a challenge is not
  the ability to authorize it.
- **Preflight and corpus clients (`x402-preflight/`, `corpus-client/`):** check
  public types, retained fixtures and examples against the merged observation
  fields. Preserve absent historical fields as absent, and keep an unpaid
  observation distinct from payment readiness.
- **Defect vocabulary (`defects/`):** the open MPP PRs include generated
  vocabulary snapshots. Coordinate their eventual publication in dependency
  order with that task; a generated snapshot in a PR is not an npm release.
- **Tab (`tab/`), browser till and WebMCP:** check quote interpretation,
  explicit buyer choice, expiry, cancellation, retries and result recovery
  for any new payment contract. Do not assume a wallet or host can sign it.
- **MCP, A2A, OpenAPI and listings:** derive capability claims from the enabled
  implementation. A registry listing or transport does not add a payer.

Release only packages whose public behavior or contract changed, with their
relevant tests and published-version checks. There is no blanket version bump
or dependency addition in this pass. There is also no added request-path work:
the historical recovery runs offline against saved records.

## Stop conditions and next input

Historical catalog recovery is complete for the new captured cohort. The 28
unresolved report bindings need original bytes or an older archive; repeated
fresh observations cannot fill them. Payment reach now needs the other tasks'
final release evidence and a concrete client/method for checkout qualification.
These are separate inputs, and neither requires reopening production PQ or
the standalone screening/backup experiment.
