# Agent catalog readability — 2026-09-15

Zodiac is archived. The previous review's reachable-URL total included
archived writing and was not an active catalog count. Missing archived
pages are not a reason to enlarge the default paid inventory.

The second pass also found active weekly-Zodiac promotion in the guide,
served skill and both distributed skill files, plus unmarked OpenAPI
readers. Those are now explicitly archived. The short free-shelf pitch
no longer advertises Zodiac; the menu points to its archive; retained
JSON readers carry `status: archived`; and the three OpenAPI readers
are deprecated. The old deterministic calendar and purchased pages
remain usable. No invented retirement date or rewritten page content.

The changes distinguish current menu search from publication indexes,
and label Gazette and Zodiac as archives. Current Almanac entries are
available through a standard OpenAPI path parameter enum, refreshed
from the same reader as the free index. Concrete seed URLs remain for
existing readers. The unpaid validator expands only finite, safe enum
values, deduplicates URLs, and skips explicitly archived publications.
It refuses unresolved templates instead of guessing.

The input contract now expresses the host, wallet, address and
transaction syntax already checked by the runtime, and OpenAPI query
parameters carry the shared worked examples. The catalog points to
product input schemas instead of mistaking the payment signing template
for one. The manual distinguishes signed menu goods, queued fulfillment,
and publication markdown with settlement/recovery headers.

Instant purchases and publication pages no longer advertise a queue
polling workflow. MCP selection descriptions use concise existing task
copy, with full output details still linked per item. The short llms
index keeps its door list and feature entry points; the long introduction
moves intact to the shelf guide and remains in the complete guide.

The size guards use uncompressed UTF-8 bytes for JSON and characters
for the llms index. They are engineering budgets, not a claim that all
agent hosts have the same context limit. Existing scanner limits are
not raised. Regression checks also preserve all payment tiers and
resolve the existing OpenAPI references.

Measured in the local Worker test configuration, before compression:

- llms index: 29,913 → 24,476 characters; existing budget 30,000.
  The regression target is below 25,000, leaving room below that budget.
- OpenAPI: 595,324 UTF-8 bytes; existing alarm 700,000 and observed
  scanner cap 1,000,000. A new regression target holds it below 620,000.
- MCP catalog: 148,200 → 139,515 UTF-8 bytes; existing guard 152,000.
  The largest description shrinks from 13,632 to 6,350 characters,
  with a new per-description ceiling of 8,000.

All 13 catalog regressions and the new MCP trim regression were shown
to fail on the original source, then the edits were restored. The final
focused run passed 70 tests, including the greeting and free-evaluation
copy checks found by the initial full run. The MCP/catalog run passed
19 tests. Nine published regex patterns compile with Go regexp; all 10
validator-script tests pass. Typecheck and both Worker bundle checks
run separately from the tests.

The live self-preflight again refuses its own hostname (400,
`own_host_refused`), so it supplies no pass. The outside
[x402-list witness](https://x402-list.com/services/sean-claude-van-damme-s-general-store)
currently covers 32 endpoints and reports 14/14 conformance checks on
the unpaid handshake. Those are pre-release production observations.
The final archive-focused run passed 61 tests; all three new Zodiac
archive-discovery checks were first demonstrated failing before their
fixes. The typecheck, both Worker bundles, nine Go regex compilations
and ten validator-script tests pass on the completed change.
The complete `npm test` run passed all 715 test files: 14,064 tests
passed and one existing test was skipped. This report describes the
PR change; it does not claim the changes are deployed.
These tests do not establish Forge's probing algorithm or marketplace
acceptance, and no purchase is needed for this work.
