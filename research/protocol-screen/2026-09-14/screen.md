# PROTOCOL SCREEN — 2026-09-14

Source: https://scout.nekuda.ai/ (somebody else's reading, re-checkable at each PR link).
Window: first run — the last 90 days, not the whole backlog.
Denominator: 823 merges across 6 protocols (ACP, UCP, WebMCP, WebBotAuth, A2A, AP2).

## Cadence

| Protocol | Layer | Maintainers | 90d | 30d | breaking 90d | last merge | quiet? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UCP | 2 commerce | Google | 108 | 38 | 17 | 2026-09-10 | no |
| A2A | 3 agent transport | Linux Foundation | 54 | 19 | 0 | 2026-09-10 | no |
| WebBotAuth | 5 agent identity | Cloudflare + IETF | 45 | 14 | 6 | 2026-09-10 | no |
| WebMCP | 4 browser runtime | Google + Microsoft | 32 | 20 | 3 | 2026-09-14 | no |
| ACP | 2 commerce | OpenAI | 1 | 0 | 0 | 2026-07-18 | **yes — 58d** |
| AP2 | 1 authorization | Google + FIDO Alliance | 0 | 0 | 0 | none observed | **yes — ∞d** |

## ACT — breaking, on a surface we have shipped (22)

| Protocol | PR | Level | Surface | What it does to us |
| --- | --- | --- | --- | --- |
| WebMCP | [#281](https://github.com/webmachinelearning/webmcp/pull/281) | **breaking** | webmcp-channel | Add Origin Field to Observed Tool Collection Struct |
| WebBotAuth | [#135](https://github.com/cloudflare/web-bot-auth/pull/135) | **breaking** | signature-verification | Rewrite http-message-sig with explicit RFC 9421 API |
| UCP | [#741](https://github.com/Universal-Commerce-Protocol/ucp/pull/741) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Move Payment Constructs from Shopping to Common Namespace |
| UCP | [#766](https://github.com/Universal-Commerce-Protocol/ucp/pull/766) | **breaking** | defect-vocabulary, commerce-observation | Replace inventory filtering with item availability filter |
| UCP | [#765](https://github.com/Universal-Commerce-Protocol/ucp/pull/765) | **breaking** | defect-vocabulary, commerce-observation | Change Location Amenities from Array to Descriptor Map |
| UCP | [#763](https://github.com/Universal-Commerce-Protocol/ucp/pull/763) | **breaking** | defect-vocabulary, commerce-observation | Remove Deprecated ID Field and Clean Up Schema |
| UCP | [#424](https://github.com/Universal-Commerce-Protocol/ucp/pull/424) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Split PAN and Network Token credential types, use Constraint Expressions for instrument requirements |
| UCP | [#736](https://github.com/Universal-Commerce-Protocol/ucp/pull/736) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Move Primitive Types from Shopping to Common Namespace |
| UCP | [#688](https://github.com/Universal-Commerce-Protocol/ucp/pull/688) | **breaking** | defect-vocabulary, commerce-observation, discovery | Add Explicit Type Discriminator to Fulfillment Destinations |
| WebBotAuth | [#127](https://github.com/cloudflare/web-bot-auth/pull/127) | **breaking** | signature-verification, defect-vocabulary | Reject signatures with future `created` timestamps in Rust verifier |
| WebMCP | [#246](https://github.com/webmachinelearning/webmcp/pull/246) | **breaking** | webmcp-channel | Change executeTool() input from JSON string to object |
| WebMCP | [#241](https://github.com/webmachinelearning/webmcp/pull/241) | **breaking** | webmcp-channel | Change RegisteredTool inputSchema from string to object |
| WebBotAuth | [#125](https://github.com/cloudflare/web-bot-auth/pull/125) | **breaking** | signature-verification, defect-vocabulary | Rust verifier now fails closed on expired signatures |
| UCP | [#687](https://github.com/Universal-Commerce-Protocol/ucp/pull/687) | **breaking** | defect-vocabulary, commerce-observation | Define Deterministic Operating Hours for Location Service |
| UCP | [#712](https://github.com/Universal-Commerce-Protocol/ucp/pull/712) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Simplify payment schedule amounts and terms structure |
| UCP | [#653](https://github.com/Universal-Commerce-Protocol/ucp/pull/653) | **breaking** | ap2-mandate-instrument, commerce-observation, discovery | Define Sale-Basis Steps and Quantity Units for Line Items |
| UCP | [#692](https://github.com/Universal-Commerce-Protocol/ucp/pull/692) | **breaking** | ap2-mandate-instrument, commerce-observation, discovery | Add Payment Term Selection to Checkout Flow |
| UCP | [#689](https://github.com/Universal-Commerce-Protocol/ucp/pull/689) | **breaking** | defect-vocabulary, commerce-observation | Make destination type optional in Platform requests |
| WebBotAuth | [#114](https://github.com/cloudflare/web-bot-auth/pull/114) | **breaking** | signature-verification, defect-vocabulary | Fix signature replay vulnerability by enforcing covered components |
| WebBotAuth | [#93](https://github.com/cloudflare/web-bot-auth/pull/93) | **breaking** | signature-verification, discovery | Add Rust Signature-Agent Header Parsers and Registry Module |
| WebBotAuth | [#92](https://github.com/cloudflare/web-bot-auth/pull/92) | **breaking** | signature-verification, defect-vocabulary, discovery | Add structured Signature-Agent header parser with typed discovery |
| UCP | [#507](https://github.com/Universal-Commerce-Protocol/ucp/pull/507) | **breaking** | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Add Fulfillment Methods and Availability to Catalog |

## READ — breaking elsewhere, or payment-shaped on a named surface (64)

| Protocol | PR | Level | Surface | What it does to us |
| --- | --- | --- | --- | --- |
| WebBotAuth | [#144](https://github.com/cloudflare/web-bot-auth/pull/144) | minor | signature-verification | Add collision-safe KeyRing rename API with deprecation |
| UCP | [#813](https://github.com/Universal-Commerce-Protocol/ucp/pull/813) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add Loyalty Extension Specification to 2026-04-08 Release |
| UCP | [#809](https://github.com/Universal-Commerce-Protocol/ucp/pull/809) | patch | ap2-mandate-instrument, commerce-observation | Announce Payments Technical Council Inaugural Members |
| WebBotAuth | [#143](https://github.com/cloudflare/web-bot-auth/pull/143) | minor | signature-verification, defect-vocabulary, discovery | Improve Key Resolution and Directory Validation in Verifier |
| WebBotAuth | [#142](https://github.com/cloudflare/web-bot-auth/pull/142) | patch | signature-verification | Add JWK Security Guidance and Test Key Warnings |
| WebBotAuth | [#141](https://github.com/cloudflare/web-bot-auth/pull/141) | patch | signature-verification | Fix inaccurate descriptions in documentation files |
| WebMCP | [#284](https://github.com/webmachinelearning/webmcp/pull/284) | patch | defect-vocabulary, webmcp-channel | Update Documentation Examples to Current modelContext API |
| WebMCP | [#217](https://github.com/webmachinelearning/webmcp/pull/217) | minor | defect-vocabulary, webmcp-channel | Add consequentialHint Boolean Field to ToolAnnotations |
| WebBotAuth | [#139](https://github.com/cloudflare/web-bot-auth/pull/139) | minor | signature-verification | Pre-compute Ed25519 Verifying Keys at Import Time |
| UCP | [#777](https://github.com/Universal-Commerce-Protocol/ucp/pull/777) | minor | ap2-mandate-instrument, commerce-observation | Add New Capabilities and Extensions for v2026-08-25 |
| UCP | [#770](https://github.com/Universal-Commerce-Protocol/ucp/pull/770) | patch | ap2-mandate-instrument, commerce-observation, discovery | Add v2026-08-25 Protocol Release Announcement to Docs |
| WebBotAuth | [#130](https://github.com/cloudflare/web-bot-auth/pull/130) | minor | signature-verification, defect-vocabulary, discovery | Add Signed Directory Response Test Vectors |
| UCP | [#589](https://github.com/Universal-Commerce-Protocol/ucp/pull/589) | **breaking** | ap2-mandate-instrument, commerce-observation | Add Location Search and Lookup Capabilities to Specification |
| UCP | [#761](https://github.com/Universal-Commerce-Protocol/ucp/pull/761) | patch | ap2-mandate-instrument, discovery | Reorganize Shopping Extensions Into Nested Subfolder Structure |
| UCP | [#746](https://github.com/Universal-Commerce-Protocol/ucp/pull/746) | **breaking** | ap2-mandate-instrument, commerce-observation | Refactor Token Binding to Be Vertical-Agnostic |
| UCP | [#762](https://github.com/Universal-Commerce-Protocol/ucp/pull/762) | patch | ap2-mandate-instrument | Clarify resource binding vs participant authorization in tokenization |
| UCP | [#639](https://github.com/Universal-Commerce-Protocol/ucp/pull/639) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Remove Orphaned account_info JSON Schema File |
| UCP | [#757](https://github.com/Universal-Commerce-Protocol/ucp/pull/757) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add anyOf constraint to request_constraints schema |
| UCP | [#760](https://github.com/Universal-Commerce-Protocol/ucp/pull/760) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Clarify anyOf branch rules and improve constraint examples |
| UCP | [#753](https://github.com/Universal-Commerce-Protocol/ucp/pull/753) | **breaking** | — | Refactor Location Spatial Relations and Lookup Correlation |
| UCP | [#646](https://github.com/Universal-Commerce-Protocol/ucp/pull/646) | patch | ap2-mandate-instrument, commerce-observation | Remove deprecated id field from checkout update examples |
| UCP | [#723](https://github.com/Universal-Commerce-Protocol/ucp/pull/723) | patch | ap2-mandate-instrument, commerce-observation, discovery | Reorganize specification docs into domain vertical hierarchy |
| UCP | [#722](https://github.com/Universal-Commerce-Protocol/ucp/pull/722) | patch | defect-vocabulary, commerce-observation, discovery | Fix Schema Cache Isolation by Root Directory |
| WebMCP | [#250](https://github.com/webmachinelearning/webmcp/pull/250) | patch | webmcp-channel | Fix tool execute steps missing targetDocument parameter |
| UCP | [#671](https://github.com/Universal-Commerce-Protocol/ucp/pull/671) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Define Location Context Behavior for Fulfillment Extension |
| WebMCP | [#244](https://github.com/webmachinelearning/webmcp/pull/244) | patch | webmcp-channel | Fix normative defects in tool registration and observation |
| UCP | [#602](https://github.com/Universal-Commerce-Protocol/ucp/pull/602) | minor | ap2-mandate-instrument, commerce-observation | Add Payment Terms and Schedules to Checkout Specification |
| UCP | [#720](https://github.com/Universal-Commerce-Protocol/ucp/pull/720) | patch | ap2-mandate-instrument, commerce-observation | Add Glossary and Split Payments to llms.txt Index |
| UCP | [#657](https://github.com/Universal-Commerce-Protocol/ucp/pull/657) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Reserve `ucp` Protocol Namespace and Add `map_order` for Registry Ordering |
| UCP | [#603](https://github.com/Universal-Commerce-Protocol/ucp/pull/603) | minor | ap2-mandate-instrument, commerce-observation, discovery | Add Payment Terms with Simple Schedules Support |
| UCP | [#614](https://github.com/Universal-Commerce-Protocol/ucp/pull/614) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation, discovery | Clarify UCP Core Release Versioning Contract in Docs |
| UCP | [#700](https://github.com/Universal-Commerce-Protocol/ucp/pull/700) | patch | defect-vocabulary | Serialize GitHub Pages Deploys and Add Job Timeouts |
| UCP | [#458](https://github.com/Universal-Commerce-Protocol/ucp/pull/458) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add Payment Authentication Actions for 3DS and DDC |
| A2A | [#2081](https://github.com/a2aproject/A2A/pull/2081) | patch | a2a-agent-card | Clarify In-Task Authorization Scope Semantics in Spec |
| WebBotAuth | [#120](https://github.com/cloudflare/web-bot-auth/pull/120) | patch | signature-verification | Fix RFC 9421 authority port and percent-encoding normalization |
| UCP | [#585](https://github.com/Universal-Commerce-Protocol/ucp/pull/585) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Clarify Business-Populated Response Values for Identity-Linked Sessions |
| UCP | [#627](https://github.com/Universal-Commerce-Protocol/ucp/pull/627) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Authority Binding Now Accepts Exact Name-Host Match |
| UCP | [#590](https://github.com/Universal-Commerce-Protocol/ucp/pull/590) | patch | ap2-mandate-instrument, commerce-observation | Fix Example Signature Values to Use Raw r||s Format |
| UCP | [#572](https://github.com/Universal-Commerce-Protocol/ucp/pull/572) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add policies[] array to cart, checkout, catalog, and order |
| UCP | [#582](https://github.com/Universal-Commerce-Protocol/ucp/pull/582) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add Extension-Defined Actions Primitive Across Shopping APIs |
| A2A | [#2046](https://github.com/a2aproject/A2A/pull/2046) | patch | signature-verification, defect-vocabulary, a2a-agent-card, discovery | Fix Agent Card security field to v1.0 ProtoJSON format |
| UCP | [#592](https://github.com/Universal-Commerce-Protocol/ucp/pull/592) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add target parameter to extension_fields macro |
| ACP | [#281](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/pull/281) | minor | defect-vocabulary, commerce-observation | Add Optional Product URL Field to Checkout Item |
| UCP | [#523](https://github.com/Universal-Commerce-Protocol/ucp/pull/523) | minor | ap2-mandate-instrument, commerce-observation, discovery | Add Shopping Permalink Capability to Protocol Specification |
| UCP | [#583](https://github.com/Universal-Commerce-Protocol/ucp/pull/583) | patch | defect-vocabulary, ap2-mandate-instrument | Replace CODEOWNERS with automated governance workflows |
| UCP | [#581](https://github.com/Universal-Commerce-Protocol/ucp/pull/581) | patch | defect-vocabulary, commerce-observation | Remove Duplicate Schema, Use Canonical Business Fulfillment Config |
| WebBotAuth | [#107](https://github.com/cloudflare/web-bot-auth/pull/107) | minor | signature-verification | Upgrade ed25519-dalek to v3.0.0 and regex to v1.13.0 |
| UCP | [#566](https://github.com/Universal-Commerce-Protocol/ucp/pull/566) | **breaking** | — | Promote `keys[]` as canonical profile signing key field |
| UCP | [#576](https://github.com/Universal-Commerce-Protocol/ucp/pull/576) | patch | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Fix Duplicate Descriptions for Scalar Schema Definitions in Docs |
| A2A | [#2015](https://github.com/a2aproject/A2A/pull/2015) | patch | signature-verification, defect-vocabulary, a2a-agent-card | Add URI namespace docs and redirect pages for extensions/bindings |
| UCP | [#483](https://github.com/Universal-Commerce-Protocol/ucp/pull/483) | minor | ap2-mandate-instrument | Add Web Bot Auth (WBA) interoperability support |
| WebBotAuth | [#99](https://github.com/cloudflare/web-bot-auth/pull/99) | minor | signature-verification | Bump major dev dependency versions across packages |
| WebBotAuth | [#94](https://github.com/cloudflare/web-bot-auth/pull/94) | patch | signature-verification, discovery | Update Documentation to Reference Current Draft Specifications |
| WebBotAuth | [#95](https://github.com/cloudflare/web-bot-auth/pull/95) | minor | signature-verification, discovery | Update Signature-Agent examples to current dictionary syntax |
| WebBotAuth | [#91](https://github.com/cloudflare/web-bot-auth/pull/91) | minor | signature-verification, discovery | Add Test Vectors for New Web Bot Auth Draft Specs |
| WebBotAuth | [#90](https://github.com/cloudflare/web-bot-auth/pull/90) | minor | signature-verification, discovery | Add Experimental Registry Draft Support for Web Bot Auth |
| UCP | [#397](https://github.com/Universal-Commerce-Protocol/ucp/pull/397) | minor | defect-vocabulary, ap2-mandate-instrument, commerce-observation | Add message.path field conventions to Error Handling |
| A2A | [#1971](https://github.com/a2aproject/A2A/pull/1971) | patch | signature-verification, defect-vocabulary, a2a-agent-card | Update Homepage Banner to DeepLearning.AI Course |
| UCP | [#536](https://github.com/Universal-Commerce-Protocol/ucp/pull/536) | minor | defect-vocabulary, commerce-observation | Link common type references to shared reference page |
| UCP | [#494](https://github.com/Universal-Commerce-Protocol/ucp/pull/494) | patch | defect-vocabulary, commerce-observation | Fix session error payload structure in embedded protocol docs |
| UCP | [#380](https://github.com/Universal-Commerce-Protocol/ucp/pull/380) | patch | defect-vocabulary, commerce-observation | Standardize JSONPath descriptions across message schema types |
| UCP | [#439](https://github.com/Universal-Commerce-Protocol/ucp/pull/439) | patch | ap2-mandate-instrument, commerce-observation | Add cart_id cross-reference in Create Checkout docs |
| UCP | [#464](https://github.com/Universal-Commerce-Protocol/ucp/pull/464) | patch | defect-vocabulary | Clarify get_product unrecoverable error severity in catalog docs |
| UCP | [#509](https://github.com/Universal-Commerce-Protocol/ucp/pull/509) | patch | ap2-mandate-instrument, commerce-observation, discovery | Add Discovery Section to Checkout REST Binding Docs |

## LOG — in the denominator, nobody paged (154)

154 merges. Full rows in the JSON beside this file.

## What this screen did NOT see

- x402 — our own rail. Scout does not track it; nothing here is evidence about it.
- MPP / Tempo — the second wire. Not tracked by scout.
- Anything merged and not yet ingested by scout, or merged in a repo scout does not read.
