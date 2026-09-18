# September 16 catalog and verifier review

Status: merged and deployed September 16 in [PR #751](https://github.com/seancrecord/scvd-general-store-repo/pull/751),
merge `a0dd8922`. The keeper's unfinished checkout remains untouched.
Post-deployment results belong in the dated [release record](https://github.com/seancrecord/scvd-general-store-repo/releases/tag/2026-09-16-catalog-verifier);
the observations below are the retained pre-deployment baseline.

At 19:21–19:22 UTC, the deployed catalog walk passed for all 35 items and
five offered rails; all 49 verifier cases passed, including the three
annotation comparisons. Mobile Chrome confirmed all four first actions,
generated pricing/checklists and the 14-tool WebMCP inventory. The release
assets retain results, timestamps, deployment identifiers and limitations.
The PR's full four-shard gate passed 14,527 tests across 749 files, with one
skip. After intervening main merges, the exact merged revision passed
typecheck and 81 focused tests; its later full main run was superseded in
the queue, so it is not claimed as a second full-suite pass.

The release note and smoke assets published successfully. Its archive
signer failed on deprecated Cosign flags; [the signing repair](RELEASE_PROVENANCE.md)
keeps the original tag and its failed run visible. Archive provenance is
separate from the production observations.

## Production baseline

Follow-through at 20:11 UTC: the stricter [verifier reading](review-consistency-2026-09-16/verifier-strict-live.json)
passes all 49 cases. The smoke now requires the specific expected refusal,
validates schemas on readiness refusals, and rejects uncorrelated or malformed
JSON-RPC responses. Previously any error could count as a refusal; the released
observations were also checked manually, but that manual step did not protect
future runs. Eight mutated-response tests now exercise the real CLI and fail
without the repair; the unchanged happy path passes. These detector tests run
in CI. The retained reading does not add a paid or unknown-host exercise.

The alleged $19 Hosted Profile price and 24-item menu did not reproduce.
Fresh unsigned requests found 35 active items. Catalog, individual item
JSON, unsigned 402 quotes and the markdown price list agree, including
optional tip tiers. Hosted Profile is $21 across those surfaces. All 35
items appear in the HTML menu, OpenAPI and sitemap; the compact catalog
and agent guide report the same count. Every quoted rail/amount pair was
compared, not just separate sets of networks and amounts. Catalog terms
were unchanged at the beginning and end of the repeatable walk.

Every item offered USDC on Base, Polygon, Arbitrum, World and Solana.
These are observed offers, not proof of settlement on those networks.
Required-input eligibility, signing, settlement and fulfillment were not
exercised. The active shelf remains MENU_ITEMS; retired IDs remain in
RETIRED_ITEMS with historical certificates preserved. No IDs or prices
were changed to reconcile a discrepancy that did not reproduce.

The MCP discrepancy is live on three shared handlers: preflight,
conformance and artifact verification. The general door declares them
read-only and idempotent; the verifier declares both hints false.
The deployed matrix exercised 46 successful branch/contract cases and
retains the three failing annotation comparisons. It covered all 31
registered defect definitions, their index, the unknown-defect error,
missing/invalid inputs, positive and negative receipt conformance on both
doors, and stored readiness evidence. Readiness and vocabulary are only
registered on the verifier door, so there is no invented second copy of
those tools to test.

Unknown-host production lookup is explicitly unmeasured: it can add a
synthetic host to the public demand queue. The existing isolated
`test/verifier-output-schemas.spec.ts` covers that branch, missing hosts,
stored evidence and every local vocabulary entry. A schema-only pass is
not described as a deployed pass. No fresh external endpoint probe or
paid transaction was run in this matrix.

Evidence, timestamps and per-case results:

- [Catalog observation](review-consistency-2026-09-16/catalog-live.json)
- [Verifier observation](review-consistency-2026-09-16/verifier-live.json)

## Release changes

- Shared verification annotations have one source. Persistent counters
  are treated as additive state changes: readOnlyHint=false,
  idempotentHint=false, destructiveHint=false. Each renamed verifier tool
  inherits all behavioral fields; only its display title differs.
- The generated OASF directory record is recut from those same annotations.
- Metered verification remains available through WebMCP and function
  calling. Annotation changes no longer silently hide these instruments.
  Other tools' annotation policies are outside this bounded repair.
- Browser `/pricing` and its JSON response now include the generated
  price list that `/pricing.md` already served. No price is reset or copied
  into a second catalog.
- One purchase-checklist derivation supplies per-item checkout networks,
  price tiers, required inputs, fulfillment and the installed client's
  spending-cap reading to item HTML/JSON, compact contracts, catalog JSON,
  catalog lookup and the pricing matrix. The x402 quote remains the final
  terms source. The cap reading is explicitly limited to the spending
  ceiling; it is not a promise about wallet support, eligibility or stock.
  Compact checkout instructions preserve their fields and actions in fewer
  words; every item stays inside its existing byte budget with all rails on.
- Higher-priced items show `client.setSpendControls` with that item's
  minimum price. Spending controls are not disabled or worked around.
- The homepage begins its navigation with catalog, free preflight, the
  current cheapest item and the MCP connection guide. The cheapest item
  and amount are derived. The MCP action opens `/mcp.md`; browser GET of
  the transport endpoint `/mcp` correctly returns 405.
- The full catalog publishes its generated active-item count beside its
  existing freshness fields. Pricing JSON has active and priced counts.

## Validation and release boundary

The four original regression checks failed against unchanged source
before the repair and passed afterward. A separate journey test caught
the MCP navigation's 405 before it was changed to the connection guide.
Additional tests cover disabled, enabled and invalid rail configurations,
optional tiers, actual served annotations and all active item checklists.

Type checking and the store/quote Worker dry-run bundle checks passed.
Focused suites passed: 131 tests across 16 files, followed by 122 across
10 files (these runs overlap; do not add them as unique coverage).
The final navigation/documentation run passed 58 tests across 8 files.
Two Node detector tests pass, including a mutation that keeps the separate
rail and amount sets unchanged while corrupting their pairing.
The full local run completed: 749 files, 14,523 passing tests, one skip,
and four failures across three files. It exposed the compact-contract byte
limit and the generated OASF snapshot; the in-flight run retained earlier
source after those repairs (including the newly added all-rails byte guard).
This is not a clean full-run claim. A fresh final-source run passes all 56
tests across the five affected files, including every failing case; final
typecheck and bundle checks pass. The complete four-shard CI gate must pass
on the submitted commit before merge. The catalog detector's offline
regressions now run in CI too.

Local Chrome inspection confirmed four visible actions with 44px targets
at 390x844 and no horizontal overflow; the browser pricing page contains
all 35 items and the Hosted Profile cap example. Preview data is local,
not production activity. Browser layout inspection is not a live WebMCP
host-registration or wallet acceptance test.

Reproduce the unsigned production checks after deployment:

```sh
node scripts/catalog-review-smoke.mjs > catalog-live.json
node scripts/verifier-review-smoke.mjs > verifier-live.json
```

The retained baseline verifier smoke exits 1 because of its recorded
annotation mismatches. Post-deploy results are separate release assets.
`MPP_CHECKOUT_ENABLED` remains false in both Worker configurations. Native
MPP activation, signing/settlement qualification and directory submission
are outside this release. The dated release record will distinguish successful production checks from these baseline observations.
