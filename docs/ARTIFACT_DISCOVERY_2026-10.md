# Artifact pages and discovery — October 6, 2026

Implementation prompted by the keeper's observation of individual Cairn
reports appearing in search. The reported ranking was not independently
reproduced; no traffic or conversion result is claimed.

## Existing coverage and the gaps repaired

The sitemap already derives pages for observed hosts, signed weeks, weekly
ledgers and defect classes. Those rooms remain the organizing structure.

Purchased Once-Over reports already persist at `/api/service-audit/{audit_id}`,
but that route returned JSON to browsers and search crawlers. It now renders
the saved audit as HTML at the same URL: subject and date in the title, original
battery and verdict, check counts with their denominator, unjudged fields,
advisories, the signed scope, verification and correction links, and the complete
audit. Report and WebPage metadata describe the dated record. A free fresh
preflight is the first action; a new paid observation links the existing item
page with price and cadence derived from the menu.

The original JSON remains the default for ordinary API callers and is available
to browsers through `?format=json`. Rendering never probes, purchases, signs or
rewrites the saved audit. Third-party text is escaped and labeled as data.

The published research catalog now feeds both sitemaps and the existing corpus
hub's HTML, JSON and Markdown. Report pages have one h1, dated Report metadata,
an explicit JSON link and links back to the corpus and corrections. Withdrawal
status travels in the title, description, structured data and hub listing, in
addition to the existing notice above the original report. The signed body and
payload remain unchanged. Sitemap dates for these reports account for this page
update and their publication or withdrawal, instead of the unrelated catalog
date. The report's own dates retain its original publication and withdrawal.

## Scope

This change makes existing audit URLs readable and existing public research
findable. It does not create a public directory of all purchases or enumerate
PATRONS on sitemap requests. The provenance product's nonpublication promise
stays in force. Once-Over discovery still depends on links to its delivered URL;
bulk indexing of paid artifacts is not implemented here. Launch Check and other
JSON-only artifact families are not covered by this rendering change.

No additional storage reads are introduced for catalog discovery, and no new
route tree, publication write or background job is added. Search indexing and
rankings remain external outcomes to observe after deployment, not acceptance
claims made by a unit test.

## Validation

The new artifact-page spec ran against the unchanged source first: nine failures
demonstrated the missing HTML, missing discovery links and duplicate report h1;
the existing unknown-id refusal passed. After implementation, the artifact-page,
service-audit, report-artifact, report-withdrawal, sitemap-renders and evidence-pages
suites passed (48 tests). These include stored-byte preservation, legacy battery
rendering, empty/refused observations, hostile retained text, crawler negotiation,
browser JSON links, withdrawal prominence and signature verification.

Release preparation uses an isolated branch based on main at `28b2cd0f`, with
its locked dependencies installed afresh. All nine focused suites pass there
(121 tests), including feature registration and shared document discovery;
`npm run typecheck` and `npm run build:check` pass.

The initial shared-worktree run exposed two unregistered checkout recovery
paths in unrelated, uncommitted OpenAPI work. They are not part of this PR;
the clean-main feature-registration check passes. Full CI remains required
before merge. CI caught the older blanket exclusion of `/api/` URLs from
the sitemap; its replacement permits exactly the published report catalog and
continues to exclude every other API door.

Primary-source read: [October 6 entry in SPEC_READS](SPEC_READS.md#2026-10-06--durable-artifact-pages-and-discovery).
Prepared for release through a focused pull request. Search-engine indexing and
ranking are not established by the local checks.
