# Merit — discovery metadata compatibility

Case M-001. Dated September 24, 2026. Stage: locally reproduced mechanism;
partner response, deployed-service behavior and recurring demand unknown.

## Outreach completed

The keeper approved the exact note, which was [posted to #1014](https://github.com/Merit-Systems/x402scan/issues/1014#issuecomment-5817308384)
on September 24 and verified by fetching the comment and matching its body.
Before sending, the issue remained open with the same two existing comments;
npm still published 1.7.5 with unchanged archive integrity. See
[send record](merit-outreach.json) and [pre-send issue read](merit-presend-issue.json).
Await intended-contract clarification. No reply, use or adoption established.

## Question and result

Does the pricing/protocol combination described in x402scan's discovery
instructions resolve in the currently published `@agentcash/discovery`?

**The hybrid example fails locally; a structured protocol entry fixes the
same nested-price input.** The claim that this package cannot parse nested
pricing is too broad. This distinction is the incremental contribution beyond
the existing reports. Do not repost the issue body as if it were new research.

| Input variation | Schema accepts | Resolver result |
| --- | --- | --- |
| Nested price + `protocols: ["x402"]` | No | No payment info |
| Same nested price + `protocols: [{"x402": {}}]` | Yes | Price and protocol retained |
| Flat price + string protocol | Yes | Legacy value normalized |
| Structured protocol + nested price missing amount | No | No payment info |

These are four controlled local cases, not four live endpoints. Changing only
the protocol representation between the first two cases isolates that cause
within this resolver. Full CLI warnings and deployed registration were not
executed. The script asserts both positive controls and both negative cases.

## Sources and provenance

- [Issue #1014](https://github.com/Merit-Systems/x402scan/issues/1014):
  current API capture `merit-issue-1014-network`, open at collection time.
- `merit-1014-comments`: both comments retrieved on one page; issue metadata
  reported two comments. Existing outside corroboration and the reporter's
  reply are already present. No new contact is inferred from those replies.
- [Pinned discovery instructions](https://github.com/Merit-Systems/x402scan/blob/131a5d3ca9f71f145b6da4a40334c0b52544194c/docs/DISCOVERY.md):
  `merit-discovery-doc`, from commit recorded by `merit-main-network`.
- [Published package metadata](https://registry.npmjs.org/@agentcash%2fdiscovery/latest):
  `merit-discovery-package-network`; version 1.7.5 at collection time.
- `discovery-tarball`: archive identified by that metadata. Registry SHA-512
  matches. Its MIT license remains inside the archive.
- [Local reproduction](merit-reproduction.json), executable with
  [reproduce-merit.mjs](reproduce-merit.mjs).

The runtime evaluates the unmodified resolver slice from `dist/index.js`
beside the package's bundled schemas, in a timed local VM without network
functions or package CLI execution. Export syntax is omitted to evaluate the
bundled schema definitions. No dependency installation or source rewrite was
needed. This is a scoped component reproduction, not an end-to-end proof.

## Proposed contribution

Supply the failing hybrid and the structured control as a small regression
pair. Suggest aligning the docs' protocol example with the structured parser
shape, or explicitly supporting the hybrid if that is the intended contract.
Ask which behavior the maintainer intends before offering an upstream fix.
Do not claim a registration or pricing bug in their current deployed service.

Recipient route: existing issue #1014, a factual follow-up with disclosure
that SCVD prepared the reproduction. No sales email, new duplicate issue,
or general platform audit. Recheck comments/version before sending.

Smallest reciprocal ask: confirm whether this structured-protocol control
matches the intended contract; if useful, identify one docs/discovery change
for SCVD to independently recheck. A reply is participation, not adoption.

## Falsifier and limits

A current package that resolves the hybrid, changed docs that no longer
describe it, or a materially different deployed contract would narrow or
retire the claim. The reproduction explicitly does not establish prevalence,
lost buyers, dollar impact, signature quality, or partner willingness to pay.
Merit already has its own validation; our incremental value must be shown
by the precise control and subsequent use, not asserted from independence.
