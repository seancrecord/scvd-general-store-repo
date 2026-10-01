# Protocol reporting and discovery review — September 29

Keeper request: close the superseded UCP experiment and review admin
reporting, public reporting, site AEO/SEO, GitHub and external MCP/protocol
listings for accurate coverage of capabilities already implemented.

This is an ordered review, not authorization to add another protocol or
infer that every protocol has the same checkout, inspection or verification
support. Buyer/model qualification remains deferred. No registry publication,
external submission or message was performed by this roadmap update.

## Preceding roadmap decisions

- PS7 merged in #933 and its deployed guide readback passed. Correct the
  former local-only roadmap status; preserve publication and qualification
  boundaries.
- PS8 remains deferred: the roadmap, keeper decisions, package plan, package
  handoff and signer README identify no concrete new issuer integration
  requiring expansion. Existing issuance examples do not create a new need.
- PS9 is closed by keeper decision. The September 19 UCP implementation and
  retained paid Base purchase superseded the experiment. This does not claim
  a third-party UCP inspection service or universal product/rail qualification.
- PS10 completes with the no-extraction decision below. The existing roadmap
  order is retained before the newly requested reporting review.

## PS10 — no additional extraction now

Reviewed at main `b8a87513`, after PS6 and PS7. The decision is limited to
this phase's proposed primitives; it is not a claim that the repository has
no duplication.

| Candidate | Concrete consumers and existing boundary | Decision |
| --- | --- | --- |
| Probe execution and fetch outcomes | HTTP `src/routes/preflight.ts` and MCP `src/routes/mcp.ts` already call `preflightUrl` in `src/services/preflight.ts`. The packaged client calls the hosted service; it is not a second endpoint probe. | Keep the shared engine. A generic fetch wrapper would conflate the hosted probe's target/refusal policy with client transport failures. |
| Inspection reader and rendering | `x402-preflight/inspection.js` and the separately installable `cli/inspection.js` are byte-identical, held by `x402-preflight/inspection.test.mjs`. The CLI retains its zero-dependency package boundary. | Existing vendored sharing is sufficient; another package or cross-directory runtime import adds release coupling without new behavior. |
| Contract/version metadata | HTTP and MCP import `ENDPOINT_INSPECTION_SCHEMA`; it derives the version and term limit from the reader. WebMCP derives its free tools from `mcpToolCatalog`. | Keep the existing sources of truth. No replacement catalog. |
| Evidence provenance and serialization | Inspection carries unsigned observations and `not_checked` signatures. Certificate serialization retains explicit current/legacy canonical forms in `src/lib/signing.ts`; UCP terms have their own canonical quote and checkout lifecycle. | No pair of matching consumers demonstrated for another generic evidence serializer. Do not unify formats merely because both contain dates, hashes or status strings. |
| Lifecycle state | `src/lib/ucp/checkout/state.ts` distinguishes processing, settlement uncertainty, completion and cancellation. Inspection's reachability and structural states answer different questions. | Keep separate; no common status enum or retry abstraction. |

Validation: `node --test x402-preflight/inspection.test.mjs` passed all 12
existing tests, including malformed/future inputs, MPP-only exit behavior,
retained observations, safe rendering and the exact-copy guard. No runtime
source changed, no new behavior was claimed and no new public core package
is proposed. Reopen only for two demonstrated consumers with matching
semantics and a concrete maintenance benefit.

## Review order and completion gates

One stage at a time. Carry findings into the existing owner's files and
checks; do not create a second protocol catalog or directory program.

| Stage | Surfaces to review | Completion gate |
| --- | --- | --- |
| PR1 — admin reporting | All registered admin reporting pages and their data producers; especially protocols, office, growth, take, MPP sales, purchase inspection, A2A and UCP lifecycle visibility. | Inventory each report and its source. Separate support/configuration from traffic, arrivals from settled purchases, transport from payment protocol, house from organic, zero from unmeasured/unreadable. Identify missing protocol coverage and double-counting with concrete examples. Authenticated production reporting not read must remain unverified. |
| PR2 — public reporting | Rails, pulse/growth/month reports, corpus/brief/passport/history, trust/protocol descriptions and machine-readable twins. | Match each claim and denominator to its producer and source date; preserve historical meaning. Show supported capabilities without turning scoped observations into general guarantees. |
| PR3 — site AEO/SEO | Homepage and existing developer/operator/conformance/A2A/UCP pages; titles, descriptions, canonical links, JSON-LD, sitemap, robots, README, llms/agent/skill guides, OpenAPI, MCP/WebMCP and capability records. | A visitor or machine can discover the appropriate entry for A2A, UCP, MPP, MCP and WebMCP, with exact job, scope and limitations. Reuse the September 28 AEO work and existing feature/surface guards. Site accuracy does not establish search ranking, recrawl or a new engine observation. |
| PR4 — GitHub and external listings | Repository description/topics/README; package, plugin and MCP manifests; every claimed venue in `src/store/trust-signals.ts` and current submissions in `DISTRIBUTION.md`/`KEEPER_LIST.md`. | Date each live read and retain the displayed identity, endpoint, version and capability claims. Presence, accurate content, pending submission and admission are different outcomes. Mark unreadable or login-only venues unverified. Prepare specific corrections through the existing submission process; do not silently update confirmation dates or send outreach. |

For each protocol, distinguish **served transport**, **checkout support**,
**inspection of other endpoints**, **artifact verification**, **operational
measurement**, and **external listing status**. A2A card-check support and
A2A endpoint version need separate descriptions. UCP merchant checkout does
not imply UCP profile auditing. MPP checkout and MPP inspection are separate
capabilities. WebMCP registration does not imply a compatible wallet or
universal browser support. MCP tool availability does not imply payment
credentials.

## Initial inventory observations — not completed audit findings

- `/admin/protocols` already exists and composes arrivals, till, HTTP payment
  operations and market census. Reuse it; do not build another dashboard.
- It explicitly excludes MCP/WebMCP from its HTTP outcome counters and names
  unenumerable UCP/A2A state and historical labeling gaps. Review the actual
  producers before treating those gaps as missing capabilities.
- The shared discovery record currently labels MPP `inspection` and sends
  callers elsewhere for checkout availability. Compare that presentation to
  the live capability declarations before deciding whether it undersells
  current support.
- README has a protocol matrix but also an older `/mcp` route description
  calling the paid tools x402-only. Check whether those descriptions need
  reconciliation with the implemented native MPP path.
- Existing listing checks establish liveness/name presence, not description
  accuracy. PR4 needs content review in addition to those checks.

## PR1 source/local review completed

The [admin review and repair order](../research/admin-reporting-2026-09-29/README.md)
and [registered report inventory](../research/admin-reporting-2026-09-29/INVENTORY.md)
record the first stage. Three errors were reproduced locally: monthly totals
omit native MPP sales; the MPP desk ignores later house corrections; and a
failed protocol reading can still display zero sales. A derived capability
summary belongs on the existing protocols desk after those repairs.

Repair in that order, then continue to PR2. Monthly pulse is shared with
public reporting, so carry its coverage issue forward and resolve it once.
The existing focused suite passed 67 tests across eight files; the separate
retained reproducer fails on the expected missing cases. That review-only pass changed no runtime source. PR1 remediation is
recorded below; authenticated production readback remains open;
PR2–PR4 have not been completed. No external listing or search-engine result
was freshly read in this stage.

## PR1 implementation follow-through

The keeper authorized repairs and a shared speed/readability pass.
[Implementation and validation](ADMIN_REPORTING_FIXES_2026-09-29.md) records
the local fixes, shared navigation changes and reduced duplicate reads.
Release completed in #947; authenticated production readback remains outstanding.

## PR2 implementation follow-through — September 30

The [public reporting review](../research/public-reporting-2026-09-30/README.md)
records the source inventory, baseline public responses, reproduced scope
and rendering defects, and local repairs. New monthly records add combined
sales without rewriting old signatures; the public twins name their
populations. PR3 metadata/discovery and PR4 external listings remain next.

## PR3 implementation follow-through — September 30

The [site discovery review](../research/protocol-discovery-2026-09-30/README.md)
records the existing-surface inventory, reproduced description and schema
defects, and local checks. PR4 content/source review is recorded below. Release and public readback
completed in #947 and the October 1 closeout; the earlier AEO study has
not been replaced with a claim about new search visibility.

## PR4 content/source follow-through — September 30

The [listing review](../research/listing-review-2026-09-30/README.md) records
all 82 attempted listing reads, eight npm packages, 26 existing submission
states, canonical capability comparisons and prepared local corrections.
Wrong install instructions, mixed store/Tab tools, false free labels and stale
copy remain external findings. Their exact targets and publication order are
prepared; no remote write or duplicate request was sent. Local source repair
also covers the MCP discovery aliases that still omitted enabled native MPP.

## Release closeout — October 1, 2026

[PR #947](https://github.com/seancrecord/scvd-general-store-repo/pull/947)
merged September 30 after all four test shards and the required gate passed.
Both merged-commit Worker builds passed. The [public readback](../research/protocol-reporting-release-2026-10-01/README.md)
passed all retained checks, including independent verification that the older
monthly signed records are unchanged. Authenticated production admin screens
remain unverified; no package publication, external correction or buyer
qualification was performed.

The separate [guide cleanup](../research/guide-readability-2026-09-30/README.md)
released in #951 after every required CI group passed. The [live guide readback](../research/guide-release-2026-10-01/README.md)
verifies the smaller developer guide, identical configured aliases, all complete
sections and unchanged full-guide bytes against the immediately preceding
deployment. PR3 is complete; authenticated admin review and external follow-through
remain open.
