# Public distribution follow-through — October 7

R1's release and public discovery closeout is retained in the
[October 5 record](../research-comparison-2026-10-05/README.md). This is the
next eligible TR-D slice. Buyer/host qualification, private admin checks and
paid acquisition remain deferred. No external write or message was sent.

## What changed

| Reading | Result | Evidence |
| --- | --- | --- |
| Public discovery signals | All 39 present; this is availability, not external placement or buyer acceptance. | [Findability output](findability.txt) |
| Existing GitHub requests | 26 read: 22 open, four closed. The newly changed result is the official MPP submission, closed without merge October 2 because intake moved to MPPScan. No new acceptance or implementation rejection is inferred. | [Metadata](admissions.json), [closure comment](mpp-directory-closure.json) |
| MPPScan | Existing page answers 200 and names SCVD. Its rendered list carries 35 purchase paths; current OpenAPI carries 38. Research Comparison, Change Check and Batch Spot Check are absent from that HTML list. Its description repeats the current OpenAPI blanket claim that every artifact is signed; free inspection is unsigned. The upstream copy needs correction before a refresh. | [Page projection](mppscan.json), [route comparison](mppscan-coverage.json) |
| npm | Seven of eight current source versions equal public latest. Defects source is 0.22.0; npm still exposes 0.21.0. | [Direct metadata reads](packages.json) |
| MCP Registry | Store 0.2.4 and its description agree; Tab 0.11.2 agrees. | [Listing reading](listings.json) |
| Other listing gaps | x402-list reports 35 offers against 38 shelf items; agentic.market's service-detail response reports 36 endpoints. Eligibility and full-index coverage remain unverified. ClawHub's version is unparsed, not a failed publication. | [Listing reading](listings.json) |
| Public roster | 87 attempted: 74 visibly name SCVD, nine unreachable, three silent, one login-walled. Four previously readable records were unreachable in this reading. These are gaps in observation, not confirmed delistings. | [Listing reading](listings.json) |

The MPP closure's [public comment](https://github.com/tempoxyz/mpp/pull/991#issuecomment-5948763437)
points to the route already used on September 19. Do not create a duplicate
registration. The existing MCPpedia and mcp.so correction issues are still open;
Agent Finder still has the same submitted head, so the prepared owning-account
patch remains outstanding. Other comments, PR review threads, private portals
and inboxes were not reviewed in this pass.

## Later same-day publication

The [defects 0.22.0 release](../defects-release-2026-10-07/README.md) is complete:
public latest, source-matched tarball, fresh consumers and npm signature/
provenance checks pass. The earlier package capture above retains its reading.
Only the second action below remains; do not repeat the first publication.

## Concrete next actions (original sequence)

1. **Publish the already-reviewed defects package.** Source and regression
   shipped in [#976](https://github.com/seancrecord/scvd-general-store-repo/pull/976).
   Use the existing [npm publication workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/workflows/publish-npm.yml)
   on main with package `scvd-defects` and version `0.22.0`; check the source
   version again at the press. Its default is a dry run; publishing requires
   explicitly disabling `dry_run` after validation. Validate the public tarball and latest tag after
   processing before marking publication complete. This delivers the v3
   discovery/offer repair mappings to package consumers. The version read here
   does not verify tarball contents or provenance.
2. **Release the canonical signature-scope correction, then refresh MPPScan.**
   The [live OpenAPI description](openapi-description.json) repeats the same
   overclaim; a refresh alone would reproduce it. The shared proposition,
   repository introduction and reusable HF cards are corrected together in
   this branch. After that release is live, target the
   [existing SCVD page](https://www.mppscan.com/server/d58b4c8d9dc872c8308b594e4b4117bff2255f83b47f054e492b2a2fbc0ddb7b)
   and source `https://scvd.store/openapi.json`. Verify that the three missing
   routes appear, that the current scoped description replaces the old blanket
   signature claim, and that prior parser warnings are still disclosed. The
   refresh control itself was not exercised or qualified here. This makes the
   already-built products findable through this listing; it does not establish
   complete indexing or paid checkout.

No duplicate publication of the starter, preflight SDK, CLI or skill is needed.
Their stale roadmap publication notes now point to the retained October 1/2
release receipts. Native qualification remains open. R1 moves from NOW to DONE
for its released build/discovery scope, with paid qualification explicitly
unmeasured. Other build dependencies retain their order.

## Validation and limits

The existing 38 listing/findability regressions and eight defects package
tests pass. The defects package dry-run packs only its declared payload; it
does not publish. The signature-scope regression is exercised against the
served OpenAPI document, with the existing first-screen sweep checking every
consumer of the shared proposition. All 68 focused Worker tests pass after
reviewing the two changed guide fingerprints; typecheck, all three bundles,
claims and documentation checks pass. [Validation record](validation.json).
Full CI remains the merge gate; the copy
repair is not live merely because its source is prepared.

The broad listing command exits 1 for the reported version/count drift and
unreachable regressions; that is its expected reporting behavior, not a unit
test failure. Its 90 mirror reads are a separate population from the 87 trust
roster records. No weekly baseline or confirmation date was advanced.

Captures are unsigned public-response projections. Hashes identify the bytes
read, not third-party truth. Missing paths are scoped to the rendered HTML;
neither search placement nor the full MPPScan index was inspected. Historical
records stay unchanged. The manifest detects later file changes; it is not an
independent signature.
