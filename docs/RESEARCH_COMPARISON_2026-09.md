# Research Comparison — September 24, 2026

Release preparation on `codex/research-comparison-release`, integrated with
main at `eedbcb56` after the keeper authorized release, then reconciled with
the documentation-only `dee13f08` update and Calling Card/buyer-cohort main
at `553ede01`. [Release PR #912](https://github.com/seancrecord/scvd-general-store-repo/pull/912)
records the final CI and deployment status. The original local
implementation was based on `7059dc8a`. Production status and live discovery
readings are recorded in `research/research-comparison-2026-09-24/README.md`.
The working name is Research Comparison; the shelf price is 0.01 USDC per comparison.

The keeper approved building a small product from existing instruments,
prompted by Coinbase agents purchasing research. Production use is the intended
learning surface. There is no demand-test gate, partner commitment or claim of
native Coinbase integration in this implementation.

## What the buyer receives

Supply two to four distinct public HTTPS endpoint URLs. Each receives one
unauthenticated preflight through the existing instrument, with its shared
budget, bounded reads and target restrictions. The existing Look history
deriver supplies cached host history independently of the live read.

The signed result retains caller order and contains:

- Live reports, per-row start and completion times, and explicit instrument gaps.
- Advertised atomic payment amounts, grouped only by matching network and asset.
  Amounts remain strings; no floating-point price conversion or inferred decimals.
  Malformed, variable and unrecognized terms remain incomparable.
- Dated host history, coverage denominators, gaps and its last recorded endpoint.
  A network change requires a matching endpoint URL and complete comparable terms.
  Historical aggregate prices cannot prove exact per-asset price changes.
- Shared advertised receiving addresses on the same network within the supplied
  set. EVM case is normalized; Solana case is preserved. This is neither an
  operator-identity claim nor evidence of common research sources.
- Offer truncation counts, history gaps, limits and links to the free instruments.

The record uses the existing ed25519 and RFC 8785 signing helpers. Its exact
payload hash binds into the purchase certificate. Use `observation` for the
research signature: the outer purchase envelope separately signs the certificate.

No research content is bought or evaluated. The tool makes no claim about
content accuracy, freshness, licensing, investment suitability or independence.
Different receiving addresses do not establish independent research sources.

## Calling and discovery

The ordinary HTTP buy route is `/api/buy/research_comparison`. `urls` is a
JSON-encoded array carried as one query parameter. It is also a string argument
on the existing MCP `buy_observation` shelf with
`item_id: "research_comparison"`. The compact MCP view derives the per-item tool.

Example input (fictional providers):

```json
{
  "item_id": "research_comparison",
  "urls": "[\"https://research-a.example/quote\",\"https://research-b.example/quote\"]"
}
```

The standard product machinery derives its menu page, search result, OpenAPI
purchase path, x402 discovery metadata, MCP schema and browser tool surface.
The practice counter and the current UCP commerce catalog include the item.
Existing main already shares OpenAPI payment-header definitions; shorter repeated
payment wording and shared MCP descriptions preserve the catalog-size limits.
The product stays in the generated buy family already covered by the feature
register; it adds no standalone room or API family. No external directory
listing, crawl or Coinbase routing has been verified for this undeployed item.

The free alternative is `POST /api/look/v1` with `{"url":"..."}`, once per
endpoint, plus the separate free preflight and host-history views. It is a live
call, not an ETag freshness check. Money buys assembly, signing and certificate
binding. It does not buy a different verdict.

## Settlement, recovery and learning

Prepare and retain the signed comparison before settlement. Retries carry the
same request and payment and recover the original bytes, even if providers or
the archive change. Missing original evidence must not trigger a replacement
probe after settlement. A wholly unavailable/refusing live instrument yields
an explicit uncharged refusal. Partial gaps are delivered at the fixed price;
an actual unreachable probe remains a reading with its network-path limit.

URLs and observations stay in private purchase recovery. They do not feed the
public corpus or partner exports. Existing item-level quote, purchase and
recovery accounting supplies the first operational data. No new collection of
trade intentions or private research prompts is introduced. Partner sharing
needs a separately defined data contract; none is silently enabled here.

## Verification record

The following results describe the original local build before integration.
The release record names checks against the current main branch separately.

The first discovery regression failed before implementation because the product
was absent from the menu. Instrument tests cover target bounds, malformed and
oversized terms, atomic precision, chain/asset separation, address case,
same-endpoint history scope, partial failures, empty history and signature
tampering. Purchase fixtures cover HTTP and both MCP payment dialects,
certificate binding, changed-input refusal, recovery and no-settlement failures.
All settlement in these tests is mocked; no real funds or target purchases.

Final product and affected discovery checks: 243 tests across ten files passed,
including both catalog-size budgets.
TypeScript and both Worker dry-run builds passed. OpenAPI internal references,
payment fields and the existing document-size ceiling passed. No deployment,
commit or external directory submission was made.

The full repository run completed in 1,248.92 seconds: 617 files passed and
12 failed; 10,327 tests passed, 12 failed and one was skipped. This run started
before the final catalog and discovery fixes. All eight change-related failures
pass in the final focused checks above. Four unrelated failures were reproduced
against unchanged `7059dc8a`:
`counter-cadence`, `bounty-asks-and-tiers`, `passport-decision` and `receipt-chain`.
These are not being represented as green checks or changed in this product work.
The complete suite was not rerun after those focused fixes.
