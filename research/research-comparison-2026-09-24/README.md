# Research Comparison release and discovery — September 24, 2026

Status: [release PR #912](https://github.com/seancrecord/scvd-general-store-repo/pull/912),
integrated with main `eedbcb56` and the documentation-only `dee13f08` update;
release checks running. Both September 24 spec-read entries were preserved. No
production deployment or paid comparison is claimed at this stage.

The keeper authorized release and one discovery-to-purchase qualification.
This is a directed house qualification, not organic demand or an independent
customer. No paid research content, trade or partner outreach is included.

## Concrete buyer use

An agent has found two candidate research URLs and needs a record of the
payment terms and history it used before choosing a provider. Free Look calls
remain the first option for inspecting each URL. Research Comparison adds one
signed assembly, exact same-network/asset quote groups, shared receiving-address
matches and a certificate binding. A buyer who needs only a quick free reading
has no demonstrated reason to pay for this assembly.

The candidate pair in this qualification serves different content: a full
equity research memo and analyst data. Comparing their payment terms does not
establish equivalent value or research quality. Both were found through the
external AgentCash search tool, and each input contract was retrieved before
probing. The ticker AAPL is public example input, not a trading instruction.

## Before-release observations

- `external-discovery-before.json`: AgentCash recognized the existing SCVD
  origin from OpenAPI as `ownership_verified`; its returned endpoint index did
  not contain `research_comparison`. Bounded candidate search results retained.
- `before-release.json`: local HTTP reads, with the client's default redirect
  following. SCVD returned `unknown_item`; both third-party reads ultimately
  returned 402. This file does not establish a direct 402 at each supplied URL.
- `before-release-direct.json`: the corrected no-redirect reading matches the
  product's probe policy. Read its status and Location fields at the supplied URL.
- `free-look-before.json`: existing free production Look readings. At 15:18 UTC,
  x402stock.xyz returned a usable challenge with advisories and host history
  covering four probed rounds of six. x402financialdata.com's supplied URL
  returned 308 to the store's probe; that host had one probed round of six.
  The history belongs to each host and is not proof about every endpoint.

The second provider's retrieved discovery contract reported `requiresPayment:
false`, while following its redirect reached a 402. That is a discrepancy
between these observed surfaces, not a diagnosis of its cause. No paid research
body was retrieved. These readings already show why the precise URL, network
path and observation date must remain visible in the comparison.

## Discovery and paid-step boundaries

An unbranded query for independent signed x402 observations returned ten
alternatives and no SCVD row in that bounded set (`unbranded-search-before.json`).
This does not establish absence from the whole directory. Advertised contracts
were then retrieved for three alternatives (`alternative-contracts.json`):

| Alternative | Retrieved contract | Implication for this release |
| --- | --- | --- |
| SYNTHORA x402 preflight | POST `/service`, advertised $0.01; endpoint or receiver input, optional caller-supplied prior snapshot | A one-cent preflight and change comparison already exist. Price alone is not differentiation. |
| Paddock verify-before-pay | GET endpoint/wallet checks with expected network, asset and seller inputs; discovery labels it `apiKey+paid` | Existing operator tools address the decision before payment. Authentication and actual behavior were not exercised here. |
| ClankerCEO merchant audit | GET with a target URL, advertised $0.01; generic object output schema | Another inexpensive endpoint audit is discoverable. A generic schema does not prove that a capability is absent. |

SCVD's proposed reason to choose this product is a bounded comparison of a
supplied set using its existing dated host history, published coverage limits
and one independently verifiable assembly. These contract reads do not prove
that combination is unique or that customers prefer it. The production record
must supply the latter evidence. Potential integration partners remain prospects;
no contact, endorsement or data-sharing agreement was obtained.

[Coinbase's seller guide](https://docs.cdp.coinbase.com/x402/seller/get-discovered)
describes validation as unpaid, with a settled call triggering Bazaar indexing.
A valid declaration or a successful quote does not establish an index entry.
After deployment, separately record the HTTP quote, MCP quote, Coinbase
validation, external index read and any completed payment. Do not count a
directed house purchase as demand or repeatedly buy merely to maintain rank.

Automatic approval review rejected the AgentCash balance lookup because the
tool may create a wallet and secret material locally. No workaround or payment
was attempted. The paid step requires explicit approval of that wallet setup
side effect, followed by a live quote capped at 0.01 USDC.

The existing store-wide feedback invitation accompanies ordinary eligible
purchases. It does not track which research provider the buyer later chose.
That outcome data and any partner export still require an explicit data contract;
this release introduces neither covert collection nor partner commitments.

## Release verification

Current-main integration required the new item's stable commerce SKU and rights
classification. The missing row was reproduced as a catalog failure before the
fix. The unchanged OpenAPI growth ceiling also failed with the new item; repeated
payment prose was shortened without dropping fields or increasing the limit.
The guide fingerprints were updated for the reviewed product additions.
The generated AGNTCY record was recut from the MCP catalog, and the UCP
fixtures and documentation count vocabulary now include the new shelf item.
These integration omissions first failed in the full local run; the affected
checks were then rerun after correction.

Typecheck, both Worker bundles, the native-payment build guard, scalability
audit, claims register and chain-reference checks passed. Focused discovery,
signature/tampering, purchase/recovery and catalog-size checks passed.

The full local run completed in 7,220.36 seconds across a large observed
wall-clock interruption: 821 files passed, eight failed; 15,526 tests passed,
27 failed, one skipped, and three Cloudflare runner-startup timeouts. This was
not a green run. Five failures were the integration omissions above and passed
after correction (UCP preparation 35, UCP profile 10, AGNTCY 16 and document
guard eight tests). The remaining 22 failures were in existing purchase suites.
Receipt context, archived observations and buyer-capacity races passed all 135
tests unchanged on rerun; settlement refusal passed all 217 unchanged. Required CI must
still run the complete suite before merge, including files the local runner
could not start.

PR and deployed readback will be recorded here when observed.
