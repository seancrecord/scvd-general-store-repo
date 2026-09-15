# PROTOCOL SCREEN — 2026-09-14

Sources: https://scout.nekuda.ai/ (somebody else's reading) and the layer-3 repositories' own git history (first-hand). Every row re-checkable at its link.
Window: first run — the last 90 days, not the whole backlog.
Denominator: 1195 merges across 9 protocols (ACP, UCP, WebMCP, WebBotAuth, A2A, AP2, x402, MPP, Tempo TIPs).
Of this window, 58 rows fell under a standing ruling and 554 did not.

## Cadence

| Protocol | Layer | Maintainers | Source | 90d | 30d | breaking | spec | last | quiet? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| x402 | 3 our rail | x402 Foundation (Linux Foundation) | git | 267 | 105 | 0 (undeclared) | 41 | 2026-09-11 | no |
| UCP | 2 commerce | Google | scout | 108 | 38 | 17 | — | 2026-09-10 | no |
| Tempo TIPs ² | 4 settlement | Tempo | git | 58 | 21 | 0 (undeclared) | 58 | 2026-09-10 | no |
| A2A | 3 agent transport | Linux Foundation | scout | 54 | 19 | 0 | — | 2026-09-10 | no |
| MPP | 3 second wire | Stripe + Tempo (IETF track) | git | 47 | 20 | 0 (undeclared) | 27 | 2026-09-10 | no |
| WebBotAuth | 5 agent identity | Cloudflare + IETF | scout | 45 | 14 | 6 | — | 2026-09-10 | no |
| WebMCP | 4 browser runtime | Google + Microsoft | scout | 32 | 20 | 3 | — | 2026-09-14 | no |
| ACP | 2 commerce | OpenAI | scout | 1 | 0 | 0 | — | 2026-07-18 | **yes — 58d** |
| AP2 | 1 authorization | Google + FIDO Alliance | scout | 0 | 0 | 0 | — | none observed | **yes — ∞d** |

**Releases.** A commit is not a release; implementers adopt tagged versions.

| Protocol | Releases in window | Latest | Spec commits since it |
| --- | --- | --- | --- |
| x402 | 235 | `go-x402@v2.25.0` (2026-09-04) | 3 |
| Tempo TIPs | 25 | `tempo-alloy@1.11.0` (2026-08-20) | 16 |
| MPP | 13 | `spec-artifacts-2e3de24c07a9218456bd8814d6746a0dad941d06` (2026-09-09) | 1 |

Ancestry is NOT computed — these clones are shallow. A row is marked released only when a tag points at it by sha (or by MPP's `spec-artifacts-<sha>` naming); everything else reads `unknown`, never `unreleased`.

² Tempo TIPs: scoped to tips/ — the node's Rust internals are deliberately out of frame.

## Still open (1)

| Ruling | Age | What was proposed |
| --- | --- | --- |
| R7-corpus-scheme-retention | 0d | The corpus keeps an advisory's name and not its detail, so the fragmentation time series cannot tell a real fork from our own blind spot. Retaining the scheme value changes what the corpus stores, so it is the keeper's call. |

## Already ruled on (58)

Not hidden — answered. Each was scored, then matched a standing ruling.

**R3-tempo-not-our-rail** (58) — We do not settle on Tempo. Its TIPs are read so that the day a named counterparty asks for it we are not starting from zero, and for the settlement mechanics MPP's charge methods cite — but a TIP moving is never work on shipped code here.

- Tempo TIPs #7485 docs(tips): approve TIP-1093 and TIP-1100
- Tempo TIPs #7522 docs(tip-1096): specify hash-based token authentication
- Tempo TIPs #7521 fix(evm): activate TIP-1096 at T13
- Tempo TIPs #7401 docs(tip-1016): update gas accounting specification
- Tempo TIPs #7451 docs(tip-1105): add T11 pricing hardening meta TIP
- Tempo TIPs #7398 fix(precompiles): remove TIP-1099 keychain ABI changes
- Tempo TIPs #7384 test: update verification profiles for T11 and T12
- Tempo TIPs #7396 docs(tip-1096): align activation on T13
- …and 50 more

## ACT — a consequential change on a surface we have shipped (90)

| Protocol | Ref | Level | Surface | What it does to us |
| --- | --- | --- | --- | --- |
| MPP | [#350](https://github.com/tempoxyz/mpp-specs/pull/350) | **spec** | mpp-battery, settlement-rails | docs(titles): use Title Case for the Stripe and Tempo charge intent titles |
| MPP | [#353](https://github.com/tempoxyz/mpp-specs/pull/353) | **spec** | mpp-battery, settlement-rails | fix: derive problem pages from the core specification |
| MPP | [#352](https://github.com/tempoxyz/mpp-specs/pull/352) | **spec** | mpp-battery, settlement-rails | docs: add author countries to IETF draft |
| MPP | [#351](https://github.com/tempoxyz/mpp-specs/pull/351) | **spec** | defect-vocabulary, mpp-battery, settlement-rails | fix: renew IETF draft from Datatracker expiry |
| WebMCP | [#281](https://github.com/webmachinelearning/webmcp/pull/281) | **breaking** | webmcp-channel | Add Origin Field to Observed Tool Collection Struct |
| x402 | [#3431](https://github.com/x402-foundation/x402/pull/3431) | **spec** | x402-wire, preflight-battery | fix(svm): split upto delegated-auth store errors from unauthenticated |
| x402 | [#2537](https://github.com/x402-foundation/x402/pull/2537) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails, discovery | feat: add Cardano implementation for Typescript package |
| MPP | [#349](https://github.com/tempoxyz/mpp-specs/pull/349) | **spec** | mpp-battery, settlement-rails | docs(tempo): cite TEMPO-TX-SPEC in the charge method |
| MPP | [#346](https://github.com/tempoxyz/mpp-specs/pull/346) | **spec** | mpp-battery, settlement-rails | Add XRPL payment method with charge and session intents |
| x402 | [#3372](https://github.com/x402-foundation/x402/pull/3372) | **spec** | x402-wire, preflight-battery, settlement-rails | feat(ts): Add optional extra.minDeposit hint for EVM batch-settlement |
| x402 | [#3346](https://github.com/x402-foundation/x402/pull/3346) | **spec** | x402-wire, preflight-battery | feat(ts): add delegated receiver authorizer for SVM upto |
| x402 | [#3354](https://github.com/x402-foundation/x402/pull/3354) | **spec** | x402-wire, preflight-battery, settlement-rails | fix(ts,go): update auth-capture v1.1 contracts to canonical deployment |
| x402 | [#3279](https://github.com/x402-foundation/x402/pull/3279) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(stellar): accept CAP-71 V2 address credentials for Protocol 28 |
| x402 | [#3145](https://github.com/x402-foundation/x402/pull/3145) | **spec** | x402-wire, preflight-battery, settlement-rails | Expand asset transfer methods with `upfront` payment flows, family spec: scheme_exact.md |
| WebBotAuth | [#135](https://github.com/cloudflare/web-bot-auth/pull/135) | **breaking** | signature-verification | Rewrite http-message-sig with explicit RFC 9421 API |
| x402 | [#3313](https://github.com/x402-foundation/x402/pull/3313) | **spec** | x402-wire, preflight-battery | validate builder-code app attribution on |
| x402 | [#3306](https://github.com/x402-foundation/x402/pull/3306) | **spec** | x402-wire, preflight-battery | fix(py):  add server-only extension_responses sidechannel |
| x402 | [#3067](https://github.com/x402-foundation/x402/pull/3067) | **spec** | x402-wire, preflight-battery, discovery | docs(specs): correct v2 §8 discovery fields to match the wire format |
| x402 | [#3283](https://github.com/x402-foundation/x402/pull/3283) | **spec** | x402-wire, preflight-battery, settlement-rails | feat(ts/go): auth-capture client v1.1 |
| MPP | [#328](https://github.com/tempoxyz/mpp-specs/pull/328) | **spec** | mpp-battery, settlement-rails | Alternate payment credential header |
| UCP | [#741](https://github.com/Universal-Commerce-Protocol/ucp/pull/741) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Move Payment Constructs from Shopping to Common Namespace |
| UCP | [#766](https://github.com/Universal-Commerce-Protocol/ucp/pull/766) | **breaking** | defect-vocabulary, commerce-observation | Replace inventory filtering with item availability filter |
| x402 | [#3240](https://github.com/x402-foundation/x402/pull/3240) | **spec** | x402-wire, preflight-battery | feat(ts/go): upfront paymentflow for exact mechanism |
| x402 | [#3197](https://github.com/x402-foundation/x402/pull/3197) | **spec** | x402-wire, preflight-battery, settlement-rails | Auth-capture spec update: v1.1 |
| MPP | [#334](https://github.com/tempoxyz/mpp-specs/pull/334) | **spec** | defect-vocabulary, mpp-battery, settlement-rails | docs: use payment-expired for expired challenges |
| MPP | [#326](https://github.com/tempoxyz/mpp-specs/pull/326) | **spec** | mpp-battery, settlement-rails | spec: add output schemas to payment discovery |
| MPP | [#325](https://github.com/tempoxyz/mpp-specs/pull/325) | **spec** | mpp-battery, settlement-rails | fix(tempo-charge): align the EIP-712 Proof contract with shipped v3 |
| UCP | [#765](https://github.com/Universal-Commerce-Protocol/ucp/pull/765) | **breaking** | defect-vocabulary, commerce-observation | Change Location Amenities from Array to Descriptor Map |
| x402 | [#3251](https://github.com/x402-foundation/x402/pull/3251) | **spec** | x402-wire, preflight-battery, settlement-rails | fix(ts/go/py): Validate batch settlement response |
| x402 | [#3235](https://github.com/x402-foundation/x402/pull/3235) | **spec** | x402-wire, preflight-battery, settlement-rails, discovery | docs(specs): refresh the contributing guide and impl template |
| UCP | [#763](https://github.com/Universal-Commerce-Protocol/ucp/pull/763) | **breaking** | defect-vocabulary, commerce-observation | Remove Deprecated ID Field and Clean Up Schema |
| UCP | [#424](https://github.com/Universal-Commerce-Protocol/ucp/pull/424) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Split PAN and Network Token credential types, use Constraint Expressions for instrument requirements |
| UCP | [#736](https://github.com/Universal-Commerce-Protocol/ucp/pull/736) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Move Primitive Types from Shopping to Common Namespace |
| x402 | [#2698](https://github.com/x402-foundation/x402/pull/2698) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | docs(svm): add `batch-settlement` SVM scheme specification |
| MPP | [#323](https://github.com/tempoxyz/mpp-specs/pull/323) | **spec** | mpp-battery, settlement-rails | docs: require challenge binding verification |
| MPP | [#321](https://github.com/tempoxyz/mpp-specs/pull/321) | **spec** | mpp-battery, settlement-rails | fix(charge): require MUST NOT for partial access on verification failure |
| UCP | [#688](https://github.com/Universal-Commerce-Protocol/ucp/pull/688) | **breaking** | defect-vocabulary, commerce-observation, discovery | Add Explicit Type Discriminator to Fulfillment Destinations |
| WebBotAuth | [#127](https://github.com/cloudflare/web-bot-auth/pull/127) | **breaking** | signature-verification, defect-vocabulary | Reject signatures with future `created` timestamps in Rust verifier |
| WebMCP | [#246](https://github.com/webmachinelearning/webmcp/pull/246) | **breaking** | webmcp-channel | Change executeTool() input from JSON string to object |
| x402 | [#3083](https://github.com/x402-foundation/x402/pull/3083) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat: add settlement pending state |
| WebMCP | [#241](https://github.com/webmachinelearning/webmcp/pull/241) | **breaking** | webmcp-channel | Change RegisteredTool inputSchema from string to object |
| WebBotAuth | [#125](https://github.com/cloudflare/web-bot-auth/pull/125) | **breaking** | signature-verification, defect-vocabulary | Rust verifier now fails closed on expired signatures |
| x402 | [#3133](https://github.com/x402-foundation/x402/pull/3133) | **spec** | x402-wire, preflight-battery | fix(ts): bind SIWX client challenge to the request origin |
| UCP | [#687](https://github.com/Universal-Commerce-Protocol/ucp/pull/687) | **breaking** | defect-vocabulary, commerce-observation | Define Deterministic Operating Hours for Location Service |
| UCP | [#712](https://github.com/Universal-Commerce-Protocol/ucp/pull/712) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Simplify payment schedule amounts and terms structure |
| UCP | [#653](https://github.com/Universal-Commerce-Protocol/ucp/pull/653) | **breaking** | ap2-mandate-instrument, commerce-observation, discovery | Define Sale-Basis Steps and Quantity Units for Line Items |
| x402 | [#3094](https://github.com/x402-foundation/x402/pull/3094) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(ts): svm upto paymentflow |
| UCP | [#692](https://github.com/Universal-Commerce-Protocol/ucp/pull/692) | **breaking** | ap2-mandate-instrument, commerce-observation, discovery | Add Payment Term Selection to Checkout Flow |
| x402 | [#3053](https://github.com/x402-foundation/x402/pull/3053) | **spec** | x402-wire, preflight-battery, settlement-rails | feat(ts): payment flow handlers |
| MPP | [#305](https://github.com/tempoxyz/mpp-specs/pull/305) | **spec** | mpp-battery, settlement-rails | feat(solana/charge): support for confidential transfers |
| MPP | [#309](https://github.com/tempoxyz/mpp-specs/pull/309) | **spec** | defect-vocabulary, mpp-battery, settlement-rails | feat(solana/session): tightening operator-signed mode, add idle timeout |
| MPP | [#258](https://github.com/tempoxyz/mpp-specs/pull/258) | **spec** | mpp-battery | Add Hedera session intent |
| x402 | [#2634](https://github.com/x402-foundation/x402/pull/2634) | **spec** | x402-wire, preflight-battery, settlement-rails, discovery | Specs(exact): propose Canton exact scheme for x402 (spec-only) |
| UCP | [#689](https://github.com/Universal-Commerce-Protocol/ucp/pull/689) | **breaking** | defect-vocabulary, commerce-observation | Make destination type optional in Platform requests |
| x402 | [#3039](https://github.com/x402-foundation/x402/pull/3039) | **spec** | defect-vocabulary, x402-wire, preflight-battery, discovery | fix: reject external / in bazaar discovery schema (SSRF) |
| x402 | [#3027](https://github.com/x402-foundation/x402/pull/3027) | **spec** | x402-wire, preflight-battery | fix(ts/go/py): merge server and client builder-code s arrays |
| x402 | [#2994](https://github.com/x402-foundation/x402/pull/2994) | **spec** | x402-wire, preflight-battery | fix(ts/go/py): always add client buildercodes |
| MPP | [#230](https://github.com/tempoxyz/mpp-specs/pull/230) | **spec** | mpp-battery, settlement-rails | Subscriptions: Intent + Stripe and Tempo Implementations |
| MPP | [#299](https://github.com/tempoxyz/mpp-specs/pull/299) | **spec** | mpp-battery, settlement-rails | Clarify Near Intents refund and settlement recovery |
| x402 | [#2937](https://github.com/x402-foundation/x402/pull/2937) | **spec** | x402-wire, preflight-battery | feat(py): server-provided recent blockhash in the exact 402 challenge |
| MPP | [#302](https://github.com/tempoxyz/mpp-specs/pull/302) | **spec** | mpp-battery, settlement-rails | Fix typo in input parameter name: 'maxAmountIn' to 'AmountIn' |
| x402 | [#2947](https://github.com/x402-foundation/x402/pull/2947) | **spec** | x402-wire, preflight-battery | Adds bazaar indexing troubleshooting guide |
| x402 | [#2849](https://github.com/x402-foundation/x402/pull/2849) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails, discovery | specs(exact): propose Starknet exact scheme for x402 v2 (spec-only) |
| x402 | [#2931](https://github.com/x402-foundation/x402/pull/2931) | **spec** | x402-wire, preflight-battery | Fix: Algorand CAIP-2 network IDs |
| x402 | [#2693](https://github.com/x402-foundation/x402/pull/2693) | **spec** | x402-wire, preflight-battery, settlement-rails | feat(svm): server-provided recent blockhash in the exact 402 challenge |
| x402 | [#2811](https://github.com/x402-foundation/x402/pull/2811) | **spec** | x402-wire, preflight-battery | docs+spec: clarify signer authorization in offer-receipt extension (#2462) |
| x402 | [#2697](https://github.com/x402-foundation/x402/pull/2697) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails, discovery | docs(svm): add `upto` SVM scheme specification |
| WebBotAuth | [#114](https://github.com/cloudflare/web-bot-auth/pull/114) | **breaking** | signature-verification, defect-vocabulary | Fix signature replay vulnerability by enforcing covered components |
| MPP | [#296](https://github.com/tempoxyz/mpp-specs/pull/296) | **spec** | mpp-battery | feat(solana/sessions): operational costs reduction |
| x402 | [#2852](https://github.com/x402-foundation/x402/pull/2852) | **spec** | x402-wire, preflight-battery | fix stellar tx fee |
| x402 | [#2888](https://github.com/x402-foundation/x402/pull/2888) | **spec** | x402-wire, preflight-battery | TS: siwx structured errors |
| x402 | [#2859](https://github.com/x402-foundation/x402/pull/2859) | **spec** | x402-wire, preflight-battery | Bind SIWX domain validation to a configured origin |
| x402 | [#2801](https://github.com/x402-foundation/x402/pull/2801) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(xrpl): add exact scheme TypeScript reference implementation |
| x402 | [#2850](https://github.com/x402-foundation/x402/pull/2850) | **spec** | x402-wire, preflight-battery | Aptos signature check |
| MPP | [#295](https://github.com/tempoxyz/mpp-specs/pull/295) | **spec** | mpp-battery | docs: expand MPP specification overview |
| x402 | [#2741](https://github.com/x402-foundation/x402/pull/2741) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | docs(specs): add exact scheme spec for Casper Network |
| MPP | [#225](https://github.com/tempoxyz/mpp-specs/pull/225) | **spec** | mpp-battery, settlement-rails | feat: add unified EVM session payment method |
| x402 | [#2547](https://github.com/x402-foundation/x402/pull/2547) | **spec** | x402-wire, preflight-battery, settlement-rails | spec(xrpl): add exact scheme |
| x402 | [#2707](https://github.com/x402-foundation/x402/pull/2707) | **spec** | x402-wire, preflight-battery | Hardened Hedera facilitator verify |
| MPP | [#201](https://github.com/tempoxyz/mpp-specs/pull/201) | **spec** | mpp-battery | Solana session intent specification |
| WebBotAuth | [#93](https://github.com/cloudflare/web-bot-auth/pull/93) | **breaking** | signature-verification, discovery | Add Rust Signature-Agent Header Parsers and Registry Module |
| WebBotAuth | [#92](https://github.com/cloudflare/web-bot-auth/pull/92) | **breaking** | signature-verification, defect-vocabulary, discovery | Add structured Signature-Agent header parser with typed discovery |
| x402 | [#2700](https://github.com/x402-foundation/x402/pull/2700) | **spec** | x402-wire, preflight-battery, settlement-rails | Make the facilitator's receiverAuthorizer optional in batch-settlement |
| MPP | [#227](https://github.com/tempoxyz/mpp-specs/pull/227) | **spec** | mpp-battery, settlement-rails | lint: Update spec lints |
| MPP | [#278](https://github.com/tempoxyz/mpp-specs/pull/278) | **spec** | mpp-battery | docs: document Tempo session v2 protocol |
| UCP | [#507](https://github.com/Universal-Commerce-Protocol/ucp/pull/507) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Add Fulfillment Methods and Availability to Catalog |
| MPP | [#284](https://github.com/tempoxyz/mpp-specs/pull/284) | **spec** | mpp-battery, settlement-rails | Add Near Intents charge intent |
| MPP | [#285](https://github.com/tempoxyz/mpp-specs/pull/285) | **spec** | mpp-battery, settlement-rails | docs: require non-empty challenge ids |
| MPP | [#282](https://github.com/tempoxyz/mpp-specs/pull/282) | **spec** | mpp-battery | chore(deps): bump xml2rfc from 3.33.0 to 3.34.0 in the python-deps group |
| x402 | [#1583](https://github.com/x402-foundation/x402/pull/1583) | **spec** | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(tvm): add TON mechanism for exact payment scheme |

¹ derived by this script from the commit subject, not declared by the maintainer.

## READ — consequential elsewhere, or payment-shaped on a named surface (140)

| Protocol | Ref | Level | Surface | What it does to us |
| --- | --- | --- | --- | --- |
| x402 | [#3440](https://github.com/x402-foundation/x402/pull/3440) | patch¹ | x402-wire, preflight-battery | fix(python): decode routeTemplate to a fixed point before traversal checks |
| WebBotAuth | [#144](https://github.com/cloudflare/web-bot-auth/pull/144) | minor | signature-verification | Add collision-safe KeyRing rename API with deprecation |
| UCP | [#813](https://github.com/Universal-Commerce-Protocol/ucp/pull/813) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add Loyalty Extension Specification to 2026-04-08 Release |
| x402 | [#3430](https://github.com/x402-foundation/x402/pull/3430) | minor¹ | defect-vocabulary, x402-wire, preflight-battery | feat(mcp,ts): use accept's maxTimeoutSeconds for tool timeout + Cardano sdk followups |
| UCP | [#809](https://github.com/Universal-Commerce-Protocol/ucp/pull/809) | patch | ap2-mandate-instrument, commerce-observation | Announce Payments Technical Council Inaugural Members |
| x402 | [#3408](https://github.com/x402-foundation/x402/pull/3408) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(go): raise HTTPFacilitatorClient default timeout to 90s |
| x402 | [#3409](https://github.com/x402-foundation/x402/pull/3409) | patch¹ | defect-vocabulary, x402-wire, preflight-battery | fix(python): default HTTPFacilitatorClient timeout to 90s |
| x402 | [#3402](https://github.com/x402-foundation/x402/pull/3402) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(hono): settlement-failure tests construct a real Response |
| x402 | [#3398](https://github.com/x402-foundation/x402/pull/3398) | patch¹ | x402-wire, preflight-battery, settlement-rails | Document minDeposit hint for batch-settlement scheme |
| x402 | [#3392](https://github.com/x402-foundation/x402/pull/3392) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(ts): buffer hono/next settlement replies and raise facilitator HTTP timeout |
| x402 | [#3364](https://github.com/x402-foundation/x402/pull/3364) | patch¹ | defect-vocabulary, x402-wire, preflight-battery | fix(python): exit on fatal HTTP adapter initialize errors |
| x402 | [#3366](https://github.com/x402-foundation/x402/pull/3366) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(python): reuse verify ERC-6492 payer code in settle |
| x402 | [#3365](https://github.com/x402-foundation/x402/pull/3365) | patch¹ | x402-wire, preflight-battery, settlement-rails | perf(evm): reuse verify ERC-6492 payer classification in settle |
| WebBotAuth | [#143](https://github.com/cloudflare/web-bot-auth/pull/143) | minor | signature-verification, defect-vocabulary, discovery | Improve Key Resolution and Directory Validation in Verifier |
| WebBotAuth | [#142](https://github.com/cloudflare/web-bot-auth/pull/142) | patch | signature-verification | Add JWK Security Guidance and Test Key Warnings |
| WebBotAuth | [#141](https://github.com/cloudflare/web-bot-auth/pull/141) | patch | signature-verification | Fix inaccurate descriptions in documentation files |
| WebMCP | [#284](https://github.com/webmachinelearning/webmcp/pull/284) | patch | defect-vocabulary, webmcp-channel | Update Documentation Examples to Current modelContext API |
| x402 | [#3074](https://github.com/x402-foundation/x402/pull/3074) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(java): buffer response body until settlement succeeds |
| x402 | [#3347](https://github.com/x402-foundation/x402/pull/3347) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(go): add delegated receiver authorizer for SVM upto |
| x402 | [#3320](https://github.com/x402-foundation/x402/pull/3320) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(python): validate builder-code app attribution on v2 |
| x402 | [#2973](https://github.com/x402-foundation/x402/pull/2973) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails, discovery | fix(go): bound HTTP response body reads |
| WebMCP | [#217](https://github.com/webmachinelearning/webmcp/pull/217) | minor | defect-vocabulary, webmcp-channel | Add consequentialHint Boolean Field to ToolAnnotations |
| x402 | [#3301](https://github.com/x402-foundation/x402/pull/3301) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go): return EXTENSION-RESPONSES on verify and settle |
| x402 | [#3089](https://github.com/x402-foundation/x402/pull/3089) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | docs(ts/mcp): update README for current API and payment shapes |
| x402 | [#3051](https://github.com/x402-foundation/x402/pull/3051) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(core): throw when no scheme server is registered |
| x402 | [#2962](https://github.com/x402-foundation/x402/pull/2962) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go): prevent settlement override percent overflow |
| WebBotAuth | [#139](https://github.com/cloudflare/web-bot-auth/pull/139) | minor | signature-verification | Pre-compute Ed25519 Verifying Keys at Import Time |
| x402 | [#3278](https://github.com/x402-foundation/x402/pull/3278) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(core): server-only extensionResponses sidechannel |
| x402 | [#3233](https://github.com/x402-foundation/x402/pull/3233) | minor¹ | x402-wire, preflight-battery, settlement-rails | feat(python): make facilitator gas limit configurable |
| x402 | [#3228](https://github.com/x402-foundation/x402/pull/3228) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(e2e): scope EVM/SVM client signer derivation to selected families |
| UCP | [#777](https://github.com/Universal-Commerce-Protocol/ucp/pull/777) | minor | ap2-mandate-instrument, commerce-observation | Add New Capabilities and Extensions for v2026-08-25 |
| UCP | [#770](https://github.com/Universal-Commerce-Protocol/ucp/pull/770) | patch | ap2-mandate-instrument, commerce-observation, discovery | Add v2026-08-25 Protocol Release Announcement to Docs |
| WebBotAuth | [#130](https://github.com/cloudflare/web-bot-auth/pull/130) | minor | signature-verification, defect-vocabulary, discovery | Add Signed Directory Response Test Vectors |
| x402 | [#3276](https://github.com/x402-foundation/x402/pull/3276) | patch¹ | x402-wire, preflight-battery | fix: upto proxy canonical address |
| x402 | [#3199](https://github.com/x402-foundation/x402/pull/3199) | minor¹ | x402-wire, preflight-battery | feat(evm): add Upto-only deployment entrypoint |
| x402 | [#3263](https://github.com/x402-foundation/x402/pull/3263) | minor¹ | x402-wire, preflight-battery | feat(Ts/Go): avoid fee-payer signing svm exact /verify + Go smart wallet support |
| x402 | [#3267](https://github.com/x402-foundation/x402/pull/3267) | patch¹ | x402-wire, preflight-battery, settlement-rails | Document upfront payment flow for exact scheme |
| UCP | [#589](https://github.com/Universal-Commerce-Protocol/ucp/pull/589) | **breaking** | ap2-mandate-instrument, commerce-observation | Add Location Search and Lookup Capabilities to Specification |
| UCP | [#761](https://github.com/Universal-Commerce-Protocol/ucp/pull/761) | patch | ap2-mandate-instrument, discovery | Reorganize Shopping Extensions Into Nested Subfolder Structure |
| x402 | [#3214](https://github.com/x402-foundation/x402/pull/3214) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat: settlement pending auto-recovery |
| UCP | [#746](https://github.com/Universal-Commerce-Protocol/ucp/pull/746) | **breaking** | ap2-mandate-instrument, commerce-observation | Refactor Token Binding to Be Vertical-Agnostic |
| UCP | [#762](https://github.com/Universal-Commerce-Protocol/ucp/pull/762) | patch | ap2-mandate-instrument | Clarify resource binding vs participant authorization in tokenization |
| x402 | [#3255](https://github.com/x402-foundation/x402/pull/3255) | patch¹ | x402-wire, preflight-battery, settlement-rails | Python payment flow handlers: phase examples & MCP hook parity |
| x402 | [#3247](https://github.com/x402-foundation/x402/pull/3247) | minor¹ | x402-wire, preflight-battery, settlement-rails | feat(py): payment flow |
| UCP | [#639](https://github.com/Universal-Commerce-Protocol/ucp/pull/639) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Remove Orphaned account_info JSON Schema File |
| UCP | [#757](https://github.com/Universal-Commerce-Protocol/ucp/pull/757) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add anyOf constraint to request_constraints schema |
| UCP | [#760](https://github.com/Universal-Commerce-Protocol/ucp/pull/760) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Clarify anyOf branch rules and improve constraint examples |
| UCP | [#753](https://github.com/Universal-Commerce-Protocol/ucp/pull/753) | **breaking** | — | Refactor Location Spatial Relations and Lookup Correlation |
| UCP | [#646](https://github.com/Universal-Commerce-Protocol/ucp/pull/646) | patch | ap2-mandate-instrument, commerce-observation | Remove deprecated id field from checkout update examples |
| x402 | [#3222](https://github.com/x402-foundation/x402/pull/3222) | patch¹ | x402-wire, preflight-battery, settlement-rails | Update docs/schemes/batch-settlement.mdx |
| UCP | [#723](https://github.com/Universal-Commerce-Protocol/ucp/pull/723) | patch | ap2-mandate-instrument, commerce-observation, discovery | Reorganize specification docs into domain vertical hierarchy |
| UCP | [#722](https://github.com/Universal-Commerce-Protocol/ucp/pull/722) | patch | defect-vocabulary, commerce-observation, discovery | Fix Schema Cache Isolation by Root Directory |
| WebMCP | [#250](https://github.com/webmachinelearning/webmcp/pull/250) | patch | webmcp-channel | Fix tool execute steps missing targetDocument parameter |
| UCP | [#671](https://github.com/Universal-Commerce-Protocol/ucp/pull/671) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Define Location Context Behavior for Fulfillment Extension |
| WebMCP | [#244](https://github.com/webmachinelearning/webmcp/pull/244) | patch | webmcp-channel | Fix normative defects in tool registration and observation |
| x402 | [#3141](https://github.com/x402-foundation/x402/pull/3141) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails, discovery | feat: add solana upto to go sdk (+ typescript parity fixes) |
| UCP | [#602](https://github.com/Universal-Commerce-Protocol/ucp/pull/602) | minor | ap2-mandate-instrument, commerce-observation | Add Payment Terms and Schedules to Checkout Specification |
| x402 | [#3155](https://github.com/x402-foundation/x402/pull/3155) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(ts): add ComputeBudget instructions to svm upto transactions |
| x402 | [#3153](https://github.com/x402-foundation/x402/pull/3153) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(evm): correct Monad USDC v1 EIP-712 domain name to "USDC" |
| UCP | [#720](https://github.com/Universal-Commerce-Protocol/ucp/pull/720) | patch | ap2-mandate-instrument, commerce-observation | Add Glossary and Split Payments to llms.txt Index |
| x402 | [#3115](https://github.com/x402-foundation/x402/pull/3115) | minor¹ | x402-wire, preflight-battery, settlement-rails | feat(go): payment flows for go sdk |
| UCP | [#657](https://github.com/Universal-Commerce-Protocol/ucp/pull/657) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Reserve `ucp` Protocol Namespace and Add `map_order` for Registry Ordering |
| x402 | [#3135](https://github.com/x402-foundation/x402/pull/3135) | patch¹ | x402-wire, preflight-battery, settlement-rails | Document upto SVM payment scheme |
| x402 | [#3120](https://github.com/x402-foundation/x402/pull/3120) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(svm): make facilitator transaction limits operator-configurable |
| x402 | [#3116](https://github.com/x402-foundation/x402/pull/3116) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(ts): escape backslashes in normalizePath instead of folding them to "/" |
| UCP | [#603](https://github.com/Universal-Commerce-Protocol/ucp/pull/603) | minor | ap2-mandate-instrument, commerce-observation, discovery | Add Payment Terms with Simple Schedules Support |
| UCP | [#614](https://github.com/Universal-Commerce-Protocol/ucp/pull/614) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Clarify UCP Core Release Versioning Contract in Docs |
| UCP | [#700](https://github.com/Universal-Commerce-Protocol/ucp/pull/700) | patch | defect-vocabulary | Serialize GitHub Pages Deploys and Add Job Timeouts |
| x402 | [#3105](https://github.com/x402-foundation/x402/pull/3105) | patch¹ | x402-wire, preflight-battery | fix(evm): correct Monad USDC EIP-712 domain name to "USDC" (#3102) |
| x402 | [#3100](https://github.com/x402-foundation/x402/pull/3100) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go): compile route patterns with (?s) so wildcards match line feeds |
| x402 | [#3088](https://github.com/x402-foundation/x402/pull/3088) | patch¹ | x402-wire, preflight-battery, settlement-rails | Document payment flows and settle phases |
| x402 | [#3055](https://github.com/x402-foundation/x402/pull/3055) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(python): match wildcard routes containing a line feed |
| x402 | [#3044](https://github.com/x402-foundation/x402/pull/3044) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix: match payment-gated routes on the escaped request path |
| x402 | [#2385](https://github.com/x402-foundation/x402/pull/2385) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(evm): verify Transfer event in receipt after exact/eip3009 settle |
| UCP | [#458](https://github.com/Universal-Commerce-Protocol/ucp/pull/458) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add Payment Authentication Actions for 3DS and DDC |
| x402 | [#3033](https://github.com/x402-foundation/x402/pull/3033) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(mcp): re-approve before signing corrective 402 recovery payment |
| x402 | [#3031](https://github.com/x402-foundation/x402/pull/3031) | minor¹ | x402-wire, preflight-battery | feat(evm): add Flare mainnet (14) default stablecoin |
| x402 | [#3022](https://github.com/x402-foundation/x402/pull/3022) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go): propagate payment response hook errors |
| x402 | [#3025](https://github.com/x402-foundation/x402/pull/3025) | minor¹ | x402-wire, preflight-battery, settlement-rails, discovery | feat(evm): add Celo mainnet (42220) and Celo Sepolia (11142220) default stablecoin |
| x402 | [#3024](https://github.com/x402-foundation/x402/pull/3024) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, discovery | docs: fix DEFAULT_ASSETS.md examples and stale file references |
| x402 | [#2727](https://github.com/x402-foundation/x402/pull/2727) | patch¹ | x402-wire, preflight-battery | fix: verify eip3009 transfer event in go |
| A2A | [#2081](https://github.com/a2aproject/A2A/pull/2081) | patch | a2a-agent-card | Clarify In-Task Authorization Scope Semantics in Spec |
| WebBotAuth | [#120](https://github.com/cloudflare/web-bot-auth/pull/120) | patch | signature-verification | Fix RFC 9421 authority port and percent-encoding normalization |
| x402 | [#2956](https://github.com/x402-foundation/x402/pull/2956) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go/http): add Cache-Control: no-store to 402 responses |
| x402 | [#2974](https://github.com/x402-foundation/x402/pull/2974) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix: add request timeouts to HTTPFacilitatorClient and guard eager init rejection |
| UCP | [#585](https://github.com/Universal-Commerce-Protocol/ucp/pull/585) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Clarify Business-Populated Response Values for Identity-Linked Sessions |
| x402 | [#2957](https://github.com/x402-foundation/x402/pull/2957) | patch¹ | x402-wire, preflight-battery, settlement-rails | Fix silent auth drop when createAuthHeaders returns a flat object |
| UCP | [#627](https://github.com/Universal-Commerce-Protocol/ucp/pull/627) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Authority Binding Now Accepts Exact Name-Host Match |
| UCP | [#590](https://github.com/Universal-Commerce-Protocol/ucp/pull/590) | patch | ap2-mandate-instrument, commerce-observation | Fix Example Signature Values to Use Raw r\|\|s Format |
| x402 | [#2944](https://github.com/x402-foundation/x402/pull/2944) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat: add Solana support to cloudfront-lambda-edge example |
| UCP | [#572](https://github.com/Universal-Commerce-Protocol/ucp/pull/572) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add policies[] array to cart, checkout, catalog, and order |
| UCP | [#582](https://github.com/Universal-Commerce-Protocol/ucp/pull/582) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add Extension-Defined Actions Primitive Across Shopping APIs |
| x402 | [#2933](https://github.com/x402-foundation/x402/pull/2933) | patch¹ | x402-wire, preflight-battery | Fix: SVM SIWx small-order Ed25519 verification |
| x402 | [#2924](https://github.com/x402-foundation/x402/pull/2924) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(evm): batch-settlement honors caller-supplied asset on networks outside DEFAULT_STABLECOINS |
| x402 | [#2899](https://github.com/x402-foundation/x402/pull/2899) | patch¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | fix(python): preserve streaming bodies on payment retry |
| x402 | [#2907](https://github.com/x402-foundation/x402/pull/2907) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go): return invalid payload for malformed payment signature |
| x402 | [#2917](https://github.com/x402-foundation/x402/pull/2917) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix: propagate batch settlement storage errors |
| A2A | [#2046](https://github.com/a2aproject/A2A/pull/2046) | patch | signature-verification, defect-vocabulary, a2a-agent-card, discovery | Fix Agent Card security field to v1.0 ProtoJSON format |
| x402 | [#2914](https://github.com/x402-foundation/x402/pull/2914) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(go): preserve request bodies across payment retries |
| UCP | [#592](https://github.com/Universal-Commerce-Protocol/ucp/pull/592) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add target parameter to extension_fields macro |
| ACP | [#281](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/pull/281) | minor | defect-vocabulary, commerce-observation | Add Optional Product URL Field to Checkout Item |
| UCP | [#523](https://github.com/Universal-Commerce-Protocol/ucp/pull/523) | minor | ap2-mandate-instrument, commerce-observation, discovery | Add Shopping Permalink Capability to Protocol Specification |
| x402 | [#2884](https://github.com/x402-foundation/x402/pull/2884) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(evm): auto-wrap any eth_account BaseAccount, not just LocalAccount |
| x402 | [#2883](https://github.com/x402-foundation/x402/pull/2883) | patch¹ | x402-wire, preflight-battery | fix go VerifyDeposit projected balance |
| x402 | [#2856](https://github.com/x402-foundation/x402/pull/2856) | patch¹ | x402-wire, preflight-battery, settlement-rails | docs: add XRPL to buyer quickstart, network lists, and facilitators |
| x402 | [#2857](https://github.com/x402-foundation/x402/pull/2857) | minor¹ | x402-wire, preflight-battery | feat(site): register XRPL testnet on the facilitator |
| UCP | [#581](https://github.com/Universal-Commerce-Protocol/ucp/pull/581) | patch | defect-vocabulary, commerce-observation | Remove Duplicate Schema, Use Canonical Business Fulfillment Config |
| x402 | [#2721](https://github.com/x402-foundation/x402/pull/2721) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(python/flask): return 500 (not empty 402) on unexpected settlement error |
| WebBotAuth | [#107](https://github.com/cloudflare/web-bot-auth/pull/107) | minor | signature-verification | Upgrade ed25519-dalek to v3.0.0 and regex to v1.13.0 |
| UCP | [#566](https://github.com/Universal-Commerce-Protocol/ucp/pull/566) | **breaking** | — | Promote `keys[]` as canonical profile signing key field |
| UCP | [#576](https://github.com/Universal-Commerce-Protocol/ucp/pull/576) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Fix Duplicate Descriptions for Scalar Schema Definitions in Docs |
| x402 | [#2622](https://github.com/x402-foundation/x402/pull/2622) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(python/fastapi): return 500 (and log) on unexpected settlement er… |
| A2A | [#2015](https://github.com/a2aproject/A2A/pull/2015) | patch | signature-verification, defect-vocabulary, a2a-agent-card | Add URI namespace docs and redirect pages for extensions/bindings |
| x402 | [#2810](https://github.com/x402-foundation/x402/pull/2810) | patch¹ | x402-wire, preflight-battery | fix(python/flask): use sync server in payment_middleware_from_config |
| x402 | [#2791](https://github.com/x402-foundation/x402/pull/2791) | patch¹ | x402-wire, preflight-battery, settlement-rails | fix(examples/go): make the echo server + http client pair work from a fresh clone |
| UCP | [#483](https://github.com/Universal-Commerce-Protocol/ucp/pull/483) | minor | ap2-mandate-instrument | Add Web Bot Auth (WBA) interoperability support |
| x402 | [#2744](https://github.com/x402-foundation/x402/pull/2744) | patch¹ | x402-wire, preflight-battery, settlement-rails, discovery | fix(evm): emit spec-compliant authorization_value_mismatch error for cross-SDK parity |
| WebBotAuth | [#99](https://github.com/cloudflare/web-bot-auth/pull/99) | minor | signature-verification | Bump major dev dependency versions across packages |
| WebBotAuth | [#94](https://github.com/cloudflare/web-bot-auth/pull/94) | patch | signature-verification, discovery | Update Documentation to Reference Current Draft Specifications |
| x402 | [#2718](https://github.com/x402-foundation/x402/pull/2718) | patch¹ | x402-wire, preflight-battery, settlement-rails | docs(contracts): record batch-settlement deployments on Optimism, Avalanche, Celo, Linea, Unichain, Monad |
| WebBotAuth | [#95](https://github.com/cloudflare/web-bot-auth/pull/95) | minor | signature-verification, discovery | Update Signature-Agent examples to current dictionary syntax |
| x402 | [#2713](https://github.com/x402-foundation/x402/pull/2713) | patch¹ | x402-wire, preflight-battery, settlement-rails | Batch settlement: facilitator setup docs + Go example link |
| x402 | [#2706](https://github.com/x402-foundation/x402/pull/2706) | patch¹ | x402-wire, preflight-battery | Optional facilitator receiver authorizer: py/go |
| x402 | [#2390](https://github.com/x402-foundation/x402/pull/2390) | minor¹ | x402-wire, preflight-battery, settlement-rails | feat(concordium): Exact mechanism implementation (replacement) |
| x402 | [#2705](https://github.com/x402-foundation/x402/pull/2705) | patch¹ | x402-wire, preflight-battery, settlement-rails | Update docs/schemes/batch-settlement.mdx |
| WebBotAuth | [#91](https://github.com/cloudflare/web-bot-auth/pull/91) | minor | signature-verification, discovery | Add Test Vectors for New Web Bot Auth Draft Specs |
| WebBotAuth | [#90](https://github.com/cloudflare/web-bot-auth/pull/90) | minor | signature-verification, discovery | Add Experimental Registry Draft Support for Web Bot Auth |
| x402 | [#2658](https://github.com/x402-foundation/x402/pull/2658) | minor¹ | x402-wire, preflight-battery, settlement-rails | feat: improve & document wallet compatibility |
| UCP | [#397](https://github.com/Universal-Commerce-Protocol/ucp/pull/397) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add message.path field conventions to Error Handling |
| A2A | [#1971](https://github.com/a2aproject/A2A/pull/1971) | patch | signature-verification, defect-vocabulary, a2a-agent-card | Update Homepage Banner to DeepLearning.AI Course |
| UCP | [#536](https://github.com/Universal-Commerce-Protocol/ucp/pull/536) | minor | defect-vocabulary, commerce-observation | Link common type references to shared reference page |
| UCP | [#494](https://github.com/Universal-Commerce-Protocol/ucp/pull/494) | patch | defect-vocabulary, commerce-observation | Fix session error payload structure in embedded protocol docs |
| UCP | [#380](https://github.com/Universal-Commerce-Protocol/ucp/pull/380) | patch | defect-vocabulary, commerce-observation | Standardize JSONPath descriptions across message schema types |
| x402 | [#2485](https://github.com/x402-foundation/x402/pull/2485) | minor¹ | defect-vocabulary, x402-wire, preflight-battery, settlement-rails | feat(go): add sign-in-with-x server and client support |
| x402 | [#2635](https://github.com/x402-foundation/x402/pull/2635) | patch¹ | x402-wire, preflight-battery | fix(evm): clarify client signer shape |
| x402 | [#2653](https://github.com/x402-foundation/x402/pull/2653) | patch¹ | x402-wire, preflight-battery | patch: account for dynamic extension info fields in client echo validation |
| x402 | [#2579](https://github.com/x402-foundation/x402/pull/2579) | minor¹ | x402-wire, preflight-battery, settlement-rails | feat(keeta): add @x402/keeta TypeScript package |
| UCP | [#439](https://github.com/Universal-Commerce-Protocol/ucp/pull/439) | patch | ap2-mandate-instrument, commerce-observation | Add cart_id cross-reference in Create Checkout docs |
| UCP | [#464](https://github.com/Universal-Commerce-Protocol/ucp/pull/464) | patch | defect-vocabulary | Clarify get_product unrecoverable error severity in catalog docs |
| UCP | [#509](https://github.com/Universal-Commerce-Protocol/ucp/pull/509) | patch | ap2-mandate-instrument, commerce-observation, discovery | Add Discovery Section to Checkout REST Binding Docs |

¹ derived by this script from the commit subject, not declared by the maintainer.

## LOG — in the denominator, nobody paged (324)

324 merges. Full rows in the JSON beside this file.

## What this screen did NOT see

- **scout** — Scout is somebody else's reading. A merge absent from it is unobserved, not absent.
- **scout** — Scout reports merges, not adoption. A specification can be quiet because it is finished, and a product can ship from infrastructure that never appears in a spec repository's log.
- **git** — Git carries no `breaking` flag. None of the layer-3 repositories uses conventional-commit breaking markers, so a git-sourced row's `breaking: false` means NOT DECLARED, never NOT BREAKING. Level and consequence on these rows are derived by this script, not stated by the maintainer.
- **git** — Release ancestry. Tags are read, but these clones are shallow, so a row is marked released only when a tag points at its exact commit. `unknown` means no tag names it — never that it has not shipped.
- **git** — The window is bounded by the clone. Anything older than the run's `--since` is outside the read, not absent from history.
- **window** — the git sources were read from 2026-06-16 forward; scout's own backlog reaches further back than that.
