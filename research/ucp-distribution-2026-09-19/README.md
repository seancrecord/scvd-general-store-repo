# UCP distribution — September 19, 2026

Keeper confirmed UCP live and authorized the distribution pivot, with Muse intake bundled into this round. No recurring fees.

## Live scope read

GET https://scvd.store/.well-known/ucp returned the [saved profile](profile.json): catalog search/lookup, checkout and order live; 31 catalog products out of 35 shelf products, with four sub-cent products excluded because the UCP USD prices use integer minor units. Five payment-handler instances are advertised. Counts are this reading, not maintained constants.

GET https://scvd.store/ucp/v1/catalog/lookup?id=hello returned the [saved catalog response](hello-catalog.json), including the $0.50 hello variant. These requests were read-only; no checkout or payment was created.

[PR #842](https://github.com/seancrecord/scvd-general-store-repo/pull/842) records a paid hello checkout on Base and completion replay returning the same order/settlement. Its author reports 23 live checks and a separate chain read. This pass read that evidence report; it did not independently pay or re-read the transaction. [PR #843](https://github.com/seancrecord/scvd-general-store-repo/pull/843) expands the qualification driver to Solana. Both were open at the initial reading; the September 19 follow-through confirmed #842 and #843 merged at 12:59:03Z and 13:05:29Z respectively. A broad advertised catalog is not evidence that every product/rail was paid end to end.

## Public report confirmed

[UCP Checker report](https://ucpchecker.com/check/scvd.store) published after the free no-account check. Observed at 2026-09-19T12:52:19Z: Verified, HTTP 200, version 2026-08-25, REST, catalog search/lookup, checkout, order and the custom inputs capability detected. The five USDC handler instances are visible; each gateway is labelled Unknown. The report retains schema warnings and names root signing-key placement as its biggest blocker. The current [UCP overview](https://ucp.dev/specification/overview/) permits profiles to include public keys and requires top-level `keys[]` when keys are published. Missing keys alone therefore do not establish a schema violation; whether a signing-dependent flow requires them needs a separate scoped check. No key handling was changed to satisfy a score. No paid checkout was run by this pass, and the report's broader agent-readiness language is not adopted as our claim. The public trust source links this dated report without a score badge.

## Submitted

- **Community UCP Directory:** [registration issue #3](https://github.com/homototus/ucp-directory/issues/3), confirmed open. Followed its registration template; neither registry data nor prior issues contained SCVD. Includes the live profile, custom USDC/x402 handler specification, source and scoped Base purchase evidence. Awaiting maintainer admission/crawler verification. This is a community project, not an official UCP endorsement.
- **UCPList:** submitted https://scvd.store under Merchants at https://ucplist.ai/submit with the authorized business contact. UI confirmed **“We got it — thanks!”**. Its source dataset contained no SCVD entry before submission. The rendered pricing page confirms the basic community listing is free; no premium tier, subscription or newsletter requested. Review pending; no public listing URL returned. A second GitHub PR to the same dataset would duplicate this submission.

- **Awesome UCP:** [implementation PR #30](https://github.com/Upsonic/awesome-ucp/pull/30), submitted after reading CONTRIBUTING.md and checking prior SCVD PRs. One merchant implementation entry; operator affiliation disclosed, live profile and scoped paid evidence linked. Review pending.

- **UCP Merchant Directory (awesomeucp):** [merchant PR #1](https://github.com/awesomeucp/merchants/pull/1), a separate directory from Upsonic's Awesome UCP list. Authorized operator submission, free GitHub route, `verified: false` and `featured: false`. Its data model predates SCVD's current profile, so the entry flattens capability arrays, maps the REST descriptor, and groups rail instances under one USDC/x402 display provider. This is not Google Pay compatibility. The schema URLs use working release-pinned official links. Data validation passed all 11 entries; production build/typecheck passed. Browser browse, Technology filter, detail page and merchant API checked. Upstream lint retains 10 errors and 4 warnings outside the JSON addition. Listing review pending.
- **Directory rendering repair:** [issue #2](https://github.com/awesomeucp/merchants/issues/2) and [fix PR #3](https://github.com/awesomeucp/merchants/pull/3) report and repair the Service Endpoints panel's invented discovery path. SCVD's REST base was rendered as `/ucp/v1/.well-known/ucp`; the fix displays the actual REST base while the existing Integration Guide uses `wellKnownUrl`. Production build passed; browser before/after verified. This contribution is separate from listing acceptance.

## Canonical discovery repair

The [schema-link reading](schema-links.json) found four advertised official URLs returning 404. The matching `2026-08-25` release URLs all returned HTTP 200 JSON with matching capability names. The [canonical repair](../../src/lib/ucp/version.ts) derives the advertised base from `UCP_VERSION`. Typecheck, 24 focused profile/launch tests and the UCP conformance gate passed; the regression assertions failed before the fix. The full local suite passed 794 files / 15,148 tests with one skip on the repair before rebasing onto the merged distribution batch. After rebasing onto that merged batch, typecheck and all 40 combined UCP/trust focused checks passed. Full CI remains the merge gate. No payment path or vendored validation schema was changed. These are SCVD's advertised-link defects, distinct from the UCP Checker report's signing-key warning.

## Next / boundaries

- **Muse:** keeper submitted SCVD x402 Verifier September 19; browser confirmed receipt. Existing MCP connection with five free verification tools, no payment tools or authentication. Review pending, no public listing or host execution qualification. The agent could not read the linked Connector Terms and handed the final agreement/press to the keeper. [Submission receipt and scope](../muse-connector-2026-09-19.md#submitted--keeper-completed-the-final-press).
- **Google:** UCP discovery itself is permissionless; Google's own onboarding is separate. Official [Merchant Center requirements](https://developers.google.com/merchant/ucp/guides/overview/merchant-center) require an account in good standing, approved products, product eligibility and feed configuration. This reading does not establish SCVD eligibility or Google support for the custom USDC handler. Preserve the keeper's existing merchant-intake status; do not duplicate it or claim approval.
- **UCPStore:** its [current homepage](https://www.ucpstore.dev/) offers a coming-soon integration service and waitlist, not a public external-merchant listing route. Set aside; no waitlist, account, paid plan or subscription requested.

Primary sources and access limits are recorded in [SPEC_READS](../../docs/SPEC_READS.md).

Tracking batch [#844](https://github.com/seancrecord/scvd-general-store-repo/pull/844) merged at 2026-09-19T16:33:14Z after quality and all four test shards passed. A subsequent `trust.json` readback was unavailable from the available clients (HTTP 403 / browser client block), so this pass confirms the merge, not production deployment of those records.
