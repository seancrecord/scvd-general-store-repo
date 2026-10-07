# Google brand-search diagnosis — October 6, 2026

Observed October 7, 00:44–00:46 UTC (October 6 in the keeper's timezone).
The October 6 investigation below was read-only. The keeper subsequently
authorized a broader fix; local implementation and verification are recorded
at the end. No indexing request or deployment has been made.

## What was observed

- Google's first results page for `scvd general store` returned the repository,
  Crunchbase, LinkedIn, APIs.io, OpenSea and other listings, with no ordinary
  scvd.store result. Its AI Overview named and linked the domain in prose but
  used GitHub, MCP Servers and OpenSea as visible supporting sources.
- Google's first results page for `scvd store` also returned outside listings
  without an ordinary scvd.store result. Both searches included unrelated local
  stores. Google displayed “Results are not personalized”; location was retained.
- Google's `site:scvd.store` returned the homepage first, followed by `/try`,
  `/what` and other store pages. This establishes indexed pages, not a complete
  inventory or a position for unrestricted queries.
- The homepage snippet in that site-restricted search selected the commit-log
  line, bell count and keeper-support prose instead of the service explanation.
- The signed-in Search Console account had no accessible scvd.store domain
  property and its property picker offered no existing property. Verification
  under another account remains unknown. Lack of access is not a ranking cause.

## Live technical checks

- Homepage: HTTP 200 HTML, canonical `https://scvd.store/` in both HTML and
  response Link header; no homepage robots meta or X-Robots-Tag exclusion.
- Title: SCVD General Store — x402 verification for AI agents. Description,
  Organization and WebSite structured data already exist.
- robots.txt permits crawling and declares the sitemap. The fetched XML parsed,
  contained 7,297 URLs at this observation, and included `/` and `/what`.
- `https://www.scvd.store/` and `http://scvd.store/` each returned 301 to the
  HTTPS apex. This resolves the old desk's root-host uncertainty; path/query
  preservation was not tested.
- A Googlebot-labelled public request also returned 200 HTML. It was not a
  verified Google crawler and establishes neither historical nor universal WAF
  access. Genuine Googlebot access and historical errors need owner telemetry.

## Interpretation and next action

The reproduced symptom is brand-query ranking/source selection, not total
deindexing. The precise ranking cause is unestablished. Outside listings have
clear brand/service summaries; the homepage leads with its full-name sign,
rotating line, counters and support prose. The service summary in the h1 is
screen-reader-only, and the visible explanation comes later. A clearer visible
brand/service introduction and selective `data-nosnippet` on decorative material
are justified presentation candidates, not guaranteed ranking fixes. Preserve
the store's voice; no copy change was authorized or made in this diagnostic.

Use the owner's Search Console property to inspect `/` and `/what`: last crawl,
Google-selected canonical, live fetch, query/page impressions and positions,
and any manual-action/security notices. Submission or reindexing alone is not
evidence of improved ranking. Do not infer a penalty, a crawl-budget problem or
the need for more schemas from this read.

## Primary guidance read

- [Google AI features](https://developers.google.com/search/docs/appearance/ai-features):
  ordinary SEO requirements apply; special AI files or markup are not required.
- [URL Inspection](https://support.google.com/webmasters/answer/9012289): indexed
  state and live indexability are different reports; owner access is needed.
- [Canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls):
  preferred URLs are signals, not proof of Google's selected canonical.
- [Snippets](https://developers.google.com/search/docs/appearance/snippet): Google
  primarily selects page text, sometimes descriptions; `data-nosnippet` can
  exclude selected sections from snippets.
- [Site names](https://developers.google.com/search/docs/appearance/site-names)
  and [site operator](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site):
  existing website identity markup and a bounded search observation do not
  establish a full index inventory or explain ranking.

Search-result pages are mutable. The observations above are a dated manual
record, not an immutable capture or a controlled ranking experiment.

## October 7 — local repair authorized by the keeper

Prepared locally, not committed or deployed. The changes address presentation
and metadata defects we can demonstrate; they do not establish the cause of
Google's ranking or promise a position.

- Put the existing SCVD General Store name and existing meta description in
  visible text directly below the homepage sign, before the rotating opening.
  No new marketing claim or rewritten service description.
- Exclude the rotating joke, bell count, support prose and visitor wall from
  snippets with `data-nosnippet`. They remain visible to readers. Shared room
  navigation gets the same exclusion; the page's own body remains eligible.
- Derive the shared site name from `STORE_SERVICE_NAME`, set room Open Graph
  URLs from the same path as their canonical, and supply escaped social titles
  and descriptions. Preserve intentionally unlisted rooms' `noindex`.
- Reserve Organization `sameAs` for the existing identity profiles; retain all
  external directory/report URLs as `subjectOf` WebPages. This corrects the
  relation's meaning without discarding the public evidence trail. No observed
  ranking loss has been attributed to the previous markup.
- Add a bounded, read-only public-page audit: `npm run seo:check`. It checks
  HTTP/HTML responses, titles/descriptions, canonical and Open Graph agreement,
  site-name consistency, JSON-LD parsing, robot directives and sampled sitemap
  membership. Missing fetches are unmeasured failures. It uses Python's standard
  library and needs no account. `npm run seo:test` tests the instrument offline
  and is included in both CI's quality job and the local gates command.

## Verification

| Check | Result |
| --- | --- |
| [Live before](live-before.json) | Eight sampled pages; missing `og:site_name` on all eight and missing `og:url` on seven inner pages. These are metadata defects, not proven ranking causes. |
| [Local after](local-after.json) | Same eight paths; zero audit issues or unmeasured fetches, with published canonical URLs retained. Local storage is not the live inventory. |
| Brand regression tests | 14 passed. The original 12 failed with the three page-source changes removed; the added wall-text test separately failed when its exclusion was removed. The noindex preservation check is an invariant, not a claimed new fix. |
| Related route/rendering checks | The other 11 files in the final focused run passed (156 tests). The brand file was rerun after correcting an HTML-entity mismatch in its fixture, yielding the 14 passes above. |
| Audit instrument | 12 offline tests passed, including blocked/unreachable pages, bad canonicals, invalid JSON-LD, zero-length snippets and invalid audit origins. |
| Typecheck and build | `npm run typecheck` and `npm run build:check` passed. |
| Browser | Homepage and `/what` inspected in the local browser; homepage at 390px has no horizontal overflow and the new introduction fits. |

A broader run also exposed an existing feature-registration failure:
`test/feature-surfaces.spec.ts` reports unregistered
`/ucp/v1/checkout-sessions/{id}` and `/ucp/v1/checkout-sessions/{id}/cancel`.
It fails identically with these SEO source changes removed in the original
working folder. The isolated release check below supersedes that blocker
assessment for current main. Full CI is still required before any merge;
these focused checks do not replace it. Existing unrelated local changes were
preserved.

To reproduce the preview audit while retaining production canonicals:

```sh
npm run dev -- --ip 127.0.0.1 --port 8790 --local-upstream scvd.store --upstream-protocol https
python3 scripts/seo-check.py --base http://127.0.0.1:8790 --canonical-base https://scvd.store
```

## Release and measurement

1. Release through the normal feature-branch PR and required CI gates when
   publishing is authorized. Rerun `npm run seo:check` against production and
   save its dated JSON; passing locally is not evidence of a live repair.
2. Use the account that owns the Search Console property. The available account
   still has no access. Inspect `/` and `/what`: indexed status, last crawl,
   Google-selected canonical and live indexability; check manual actions and
   security issues. No penalty or crawler block is established by this audit.
3. After the live page is verified, request indexing of those two URLs and
   confirm the existing sitemap is accepted. Do not repeatedly submit it or
   treat an accepted request as successful indexing.
4. Record branded-query impressions, clicks, average position and landing pages
   for `scvd store`, `scvd general store` and `scvd.store`, separated by country
   and device. Compare equal periods after a confirmed recrawl, accounting for
   low volume; record the same dated manual searches separately. AI Overview
   mentions and directory appearances are not visits to our domain.

This audit does not inspect all sitemap URLs, measure performance, authenticate
as Googlebot, retrieve Search Console data, or measure rankings. Those limits
must accompany a green report.

## October 7 — release preparation

The keeper authorized merge and deployment. The SEO-only change was transferred
onto an isolated branch from current main (`384978f8`); other unfinished changes
in the shared checkout are excluded. Current main already contains a visible
brand label above the sign; this change moves that label into the introduction
below it, beside the existing service description.

On this release tree, 293 focused tests in six files passed, including the
entire feature-surfaces suite. The older checkout's UCP registration failure
does not reproduce on this baseline and requires no unrelated release fix.
The 12 offline audit tests, typecheck and all three dry-run build checks passed.
Full PR CI and a production audit remain the publication gates; the earlier
local-only status describes the original preparation, not a deployment result.
