# Buyer guidance review — October 10, 2026

Implementation on `codex/clear-offer-paths`; release and production readback are
tracked in [PR #1002](https://github.com/seancrecord/scvd-general-store-repo/pull/1002).
This follows the revenue review's documentation/recovery item. It does not
reclassify historical study outcomes or claim a new cold-buyer qualification.

## What reproduced

- **MPP discoverability:** the handshake described native MPP, but individual
  purchase-tool descriptions described x402 alone. New served-tool checks failed
  before the repair. Full and compact connections now name the enabled native
  challenge location and credential key beside the tool. Disabled native lanes
  make no such claim; keys come from the existing shared constants.
- **Recovery-handle findability:** the shared instructions did not state the
  different handle locations. They now name JSON `recovery`, MCP
  `result.structuredContent.recovery` and legacy refusal `error.data.recovery`,
  plus the base64-JSON `Purchase-Recovery` header on paid pages. No new top-level
  aliases or payment contracts were added.
- **Status interpretation:** `not_established_by_this_record` means the retained
  journal lacks the goods. It does not prove that a response or signed good never
  reached the buyer. Pending status gives a polling action, not a delivery deadline.
- **Overstated delivery guarantee:** an existing signing-outage test reaches a
  settled purchase with no retained delivery, then recovers without charging again.
  The new public-copy assertion failed at that paid gap. Copy promising that *any*
  delivery failure takes no money was false. Shared wording now distinguishes
  preparation before settlement from failures afterward. Item contracts, buying
  guides, answer copy, the practice page, OpenAPI and the installed skill use the
  narrower scope. A dated corrections-ledger entry preserves the earlier mistake.

The installed purchase reference now starts with the compact catalog, private
recovery handles and a short native-MPP route to the current quote and guide.
The compact route already existed; this makes it easier to find. Generated
ClawHub files match source; no registry submission was made.

## Validation

The two guidance regressions and the signing-outage/copy regression were each
observed failing before their fixes. The affected checks cover both MCP payment
profiles, compact tool connections, native-lane disablement, stock MPP checkout,
retained recovery, x402 recovery across interfaces, signing failures, public-copy
parity and reader budgets. The served MCP catalog with MPP enabled fits the same
existing limit; no budget was raised. The production-sized OpenAPI growth
fixture initially failed when the full ordering explanation was repeated per
operation. A shared short form restores that existing margin; the full recovery
guidance remains available. Paid-page recovery-header checks also pass.
Typecheck and Worker dry-run bundles pass.
The correction index and skill bundle are regenerated and checked.

## What remains unverified

A mocked local purchase is not a live paying customer. Existing tests reproduce
pending status and retained recovery, but do not prove the cause of each historical
study complaint. No wallet credentials were requested and no new live payment was
made. Documentation 403s seen in participant environments, reward-redemption gas
friction and a genuinely cold documented purchase/recovery run remain separate
work. Release, full CI and live readback remain pending. The clearer offers and
commission intake still need an actual customer decision to establish demand.

## PR #1002 release checks

CI exposed an old delivery-wording assertion and two stale complete-guide
fingerprints. Restoring only the earlier guide paragraph, delivery-order
sentence and recovery guidance reproduced both old hashes and passed all
39 positioning/guide checks. The corrected assertions require preparation
before settlement, the possibility of later delivery failure and recovery
without paying again. The byte pins remain fixed, not derived from the output.

The checkout bundle initially measured 1,004,519 bytes against its unchanged
1,000,000-byte limit. Moving shared shelf definitions out of the MCP catalogue
removed unnecessary catalogue initialization from the checkout import graph;
the same locked-dependency build measures 971,825 bytes and passes cold starts.
Tool definitions and shelf membership are unchanged. A compact catalogue page
also exceeded its unchanged 16,000-byte reader budget by six bytes. Seven
items per page replaces eight; continuation still returns every item once,
with the related-offer pointers retained.

A later full-suite run found one more stale admin assertion expecting a count
difference to identify certificate coverage. The updated assertion requires the
bounded certificate-read wording and rejects the old penny-page inference.
All 46 focused admin/reporting checks and typecheck pass.
The delivery-intent test likewise now requires the bounded marker-scan verdict,
not a claim that no buyer was left undelivered; 74 delivery/alert checks pass.
The rationale-pointer test failed on the moved shelf file and passes with its
new location (5 agent-UX checks). These are stale assertions corrected without
changing the production behavior or relaxing any reader/bundle limit.
