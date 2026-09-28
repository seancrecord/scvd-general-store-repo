# AEO hand check — September 28, 2026

SCVD is discoverable in some answer surfaces. The clearest unbranded hits
in this walk were Gemini's monitoring answer, Perplexity's defect explanation,
and Google's answer about the Hugging Face dataset. Broad conformance,
settlement and receipt questions mostly used other sources. This is a bounded
observation, not a population citation rate or evidence of improvement.

## Method and limits

Used the eight exact queries in [the hand-check plan](../../docs/AEO_HAND_CHECK.md)
in the actual Gemini, Perplexity and Google browser interfaces, on September
28 around 17:10–17:30 UTC. Fresh Gemini/Perplexity conversations; one completed
answer per query. Google used ordinary Search's AI Overview, not AI Mode.
Accounts and defaults were retained, so personalization is not controlled.
Gemini's picker showed Pro when verified late in the walk; an early collector
label said Flash-Lite without preserving supporting state. Model consistency
across the walk is therefore unverified. Perplexity used its default Search
experience. This is not a controlled comparison between models.

ChatGPT guest accepted the category query (prefixed “Search the web:”) but
only acknowledged it; no completed searched answer was obtained. All eight
ChatGPT slots remain unmeasured. Google failed to generate the category
overview: that slot is also unmeasured, not a miss. Gemini's first buyer/brand
submissions encountered a loading/composer race; they are excluded and retried
with the exact composer text checked before submission. Both ultimately
completed. The first branded retry remained searching and did not survive
reopening; a fresh exact-query attempt completed and its citation drawer was
inspected. In total, 23 of 32 slots produced an answer (including Gemini's
defect clarification); nine are unmeasured.

Only answer text and visible citations count. Ordinary search listings and
the query itself do not count as answer mentions. Citation drawers were not
exhaustively expanded; “no visible citation” is narrower than “no citation
exists.” Account details, tracking URLs and complete model answers are not
published in this record. Cited competitor capabilities are model claims,
not independently verified competitive intelligence.

## Results

N = no visible SCVD mention/citation in the completed answer. U = unmeasured.
“Publisher” identifies keeper-scvd on Hugging Face rather than scvd.store.
Accuracy refers to SCVD descriptions, not the overall technical correctness
of the answer. Missing exact citation URLs are explicitly marked.

| Family | Engine | Named | scvd.store cited | Accuracy / conflation | SCVD source or visible alternative |
| --- | --- | --- | --- | --- | --- |
| Category | ChatGPT | U | U | No completed answer | Guest acknowledgment only |
| Category | Gemini | N | N | — | Source labels Medium, Eco, x402List, Circle; exact citation URLs not resolved |
| Category | Google AIO | U | U | Overview generation failed | Organic first result SmartFlow; not an AEO result |
| Category | Perplexity | N | N | — | [x402 FAQ](https://docs.x402.org/faq) |
| Settlement | ChatGPT | U | U | Not run after guest failure | — |
| Settlement | Gemini | N | N | — | Source labels Solana, MetaMask, Eco, thirdweb, Stripe; URLs not resolved |
| Settlement | Google AIO | N | N | — | Coinbase, x402, Circle, MetaMask; [Coinbase verify](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/verify-payment) visible |
| Settlement | Perplexity | N | N | — | [Stripe](https://docs.stripe.com/payments/machine/x402), [x402 FAQ](https://docs.x402.org/faq) |
| Receipt | ChatGPT | U | U | Not run | — |
| Receipt | Gemini | N | N | — | VDM Nexus recommended first; [verifier](https://verify.vdmnexus.com) named in answer |
| Receipt | Google AIO | N | N | — | x402, PEAC, OMATrust; SCVD's MCP Market listing appeared only organically |
| Receipt | Perplexity | N | N | — | [x402 offer/receipt](https://docs.x402.org/extensions/offer-receipt) |
| Monitoring | ChatGPT | U | U | Not run | — |
| Monitoring | Gemini | Y | Y | Correct category/signing; broad uptime framing overstates what a bounded observation proves | [SCVD /what](https://scvd.store/what); MERCURY x402 recommended first |
| Monitoring | Google AIO | N | N | — | x402List, OnchainExpat, GitHub; [OnchainExpat](https://onchainexpat.com/monitor) visible |
| Monitoring | Perplexity | N | N | — | [x402-list methodology](https://x402-list.com/methodology), [zauth](https://zauth.inc/docs/provider-hub) |
| Dataset | ChatGPT | U | U | Not run | — |
| Dataset | Gemini | N | N | — | x402dash first, Apify next; citation URLs not resolved |
| Dataset | Google AIO | Publisher | N | Identified SCVD dataset; readiness/payment-status wording needs caution | [keeper-scvd on Hugging Face](https://huggingface.co/keeper-scvd) cited in overview |
| Dataset | Perplexity | N | N | — | [x402station dataset](https://huggingface.co/datasets/x402station/preflight-dataset-v0_1) first; x402dash, PulseFeed, x402-list, Ontario also named |
| Defect | ChatGPT | U | U | Not run | — |
| Defect | Gemini | N | N | Asked for clarification rather than identifying protocol | No citations |
| Defect | Google AIO | N | N | — | Ledger and Coinbase source labels; test402 result organic, not an observed SCVD citation |
| Defect | Perplexity | Citation label | Y | Correct offer/challenge mismatch concept; generated example is not a verified fixture | [SCVD defect definition](https://scvd.store/defects/offer-contradicts-challenge) |
| Buyer | ChatGPT | U | U | Not run | — |
| Buyer | Gemini | N | N | Verified exact-query retry | MetaMask source labels; no source URL resolved |
| Buyer | Google AIO | N | N | — | Coinbase, Fastly, x402, Polygon source labels |
| Buyer | Perplexity | N | N | — | [Coinbase buyer quickstart](https://docs.cdp.coinbase.com/x402/buyer/quickstart) |
| Branded | ChatGPT | U | U | Not run | — |
| Branded | Gemini | Y | Y | Correct category and non-guarantees; overstates preflight payability and breadth of Bitcoin anchoring | [SCVD /what](https://scvd.store/what) |
| Branded | Google AIO | Y | Not observed | Correct evidence-observatory category; overstates every verdict being signed and blends general-store framing | Glama, MCP Servers, Enterprise DNA source labels; SCVD's own pages are organic results |
| Branded | Perplexity | Y | Y | Correct independent-evidence category and explicit non-guarantees; preflight “payable” wording is broader than unpaid checks prove | [Homepage](https://scvd.store/), [/what](https://scvd.store/what) |

## Revisit links for positive answers

- [Gemini monitoring](https://gemini.google.com/app/6fae7053946520bb), observed 17:18 UTC; source drawer inspected separately and resolved to `/what`.
- [Perplexity defect](https://www.perplexity.ai/search/49615fa1-b51d-4c29-af72-2dbbaedd9681), observed 17:22 UTC.
- [Perplexity branded](https://www.perplexity.ai/search/51f99c06-bc79-469f-af70-de6b51d65926), observed 17:24 UTC.
- [Google dataset query](https://www.google.com/search?q=x402+endpoint+readiness+dataset), observed 17:21 UTC.
- [Google branded query](https://www.google.com/search?q=What+is+scvd.store%3F), observed 17:24 UTC.
- [Gemini branded](https://gemini.google.com/app/e172526cb78a41d7), completed after the exact-query retry; `/what` citation resolved in the drawer.

Corrected [Gemini buyer retry](https://gemini.google.com/app/46603257a3e932ef)
completed without a SCVD mention. The excluded Gemini conversation ending
`88a683b30c8e4e84` answered a truncated prompt, not either prescribed query.

Conversation links may require the originating account. Google links rerun a
query and are not immutable receipts; the rows above record what was visible.

## Concrete repair

Live Node fetches returned HTTP 200 for the HTML and markdown service-audit
page. HTML already had task-oriented copy and a detailed evidence contract;
markdown omitted most of that contract. Single-item JSON also omitted the
summary present in menu.json. Existing discoverability machinery was not absent.

The local patch reuses that same derived summary in markdown and item JSON,
adds the existing task title and required-input purchase template to markdown,
and puts the summary before the long description in HTML and markdown.
It changes no product capabilities, pricing, signing, crawler policy or schema.
The intended benefit is a complete, quotable answer regardless of representation;
any effect on engine inclusion remains unmeasured until after publication.

Validation: four new regression cases failed on the original source, then
passed after the fix. Five focused files / 35 tests passed, TypeScript passed,
and all three production bundle checks passed. Nothing deployed by this work.

## Edge-access observation

Plain Python urllib reads returned Cloudflare 403 / error 1010, while ordinary
Node fetches of the same public surfaces succeeded. Example: `/robots.txt`,
17:16:32 UTC, ray `a4246580fe7f8456-EWR`. This is a client-specific edge-policy
observation, not evidence that genuine Google, OpenAI or Perplexity crawlers
are blocked. Check the matching security event and genuine crawler traffic
before attributing AEO gaps to WAF. Keep the existing spoofed-crawler protection.

## What this changes next

1. Publish the reviewed representation fix, then repeat the same questions
   at the existing October 15 checkpoint. Preserve engine/model and missingness.
2. Complete ChatGPT with a working searched-answer session; do not replace it
   with results from a different search backend.
3. Reuse the [partner evidence brief](PARTNER_REUSE.md) in the existing pilot
   work. The visible Hugging Face hit makes data distribution a concrete lead;
   it does not establish that a new directory submission will cause citations.
4. Broad question misses do not yet justify another page tree. Keep the
   existing six-week decision gate, and distinguish mentions, evidence reuse,
   referral visits and purchases.
