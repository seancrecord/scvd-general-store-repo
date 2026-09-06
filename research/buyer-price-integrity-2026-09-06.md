# Buyer price-integrity audit — September 6, 2026

Two price-disclosure defects remain. No mismatch was found between the selected price, simulated settlement request, original purchase receipt, or recorded order amount.

Audited revision: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, in an isolated worktree. Concurrent changes in the shared checkout are not covered. No real payments, external webhooks, deployment, or retained production edits.

## Coverage

The served catalog supplies the roster: 32 items. The audit made 249 purchases: 120 HTTP and 129 MCP, including every MCP shelf membership, each offered tier, and Base, Polygon and Solana (83 purchases each). Four products have multiple price tiers. These are local simulated settlements, not funded chain transactions.

For every item it compares `/menu.json` (including its spec price), per-item OpenAPI payment extensions, both `/.well-known/x402` discovery documents, every applicable MCP tool description, the human item page's visible price, and the menu lines in `/menu/llms.txt` and `/llms-full.txt`. It then compares actual 402 accept entries, the facilitator settlement request and successful response, signed certificate through `/api/verify`, the delivery's paid/tip fields, the human receipt text, and stored records where paid amounts occur. All 24 queued purchases also retrieve their public order URL. Public queue responses omit payment amounts; their stored order records contain the correct amounts.

`/llms.txt` is an index rather than a duplicate item catalog. Its two price mentions correctly say $0.001; item-level comparisons follow its menu guide. The test records the index for inspection. Exact price comparison covers all offered amounts down to the USDC atomic unit, including $0.001, $0.004, $0.005 and the $0.99/$1.98/$4.95 tiers. Minimums and tiers are explicitly disclosed on item pages and MCP; the prose menu labels minimums. No item needs its required input prepared before a price can be found in these discovery surfaces.

## BUY-020 — P2: OpenAPI's budget guidance uses a stale range

`info.x-guidance` says **“Prices run $0.004–$25”**. The same served document and catalog offer starting prices from **$0.001 to $300**, with optional tiers reaching $1,500. An agent planning a budget from the introductory guidance gets a different answer from the concrete operations.

The detailed operations, actual 402s, and settlements are correct. This is inaccurate discovery guidance, not an observed overcharge. Derive the range from the catalog and make clear whether the upper bound means starting prices or all offered tiers. Relevant source: `src/routes/openapi.ts`.

## BUY-021 — P2: receipts recommend a $0.004 good for $0.001

**231 purchase responses** include `attest_this_purchase`, whose URL targets `settlement_attestation`, while the accompanying note says **$0.001**. The targeted product's catalog, discovery, quotes and actual purchases consistently charge **$0.004**. The remaining 18 responses are the three attestation-family items that omit this recommendation.

`src/services/fulfillment.ts` interpolates `CHEAPEST_ON_THE_SHELF`, the current global minimum, into this specific product's recommendation. Derive that quoted amount from the recommended item itself. The original purchase's price and signed receipt remain correct; the defect is the next purchase promised by the response.

## Validation and limits

The acceptance suite collects all rows before asserting. It remains red for the two findings above. A causal control temporarily corrects only the two quoted prices; the entire suite must turn green, then both production files are restored byte-for-byte. The restored baseline is run again. Validation details and source hashes are in the companion validation JSON.

The evidence contains 283 rows: one discovery snapshot, one introductory-range check, 32 item-discovery checks and 249 purchases. These tests do not establish live chain balances, facilitator finality, SDK signing behavior, or completion of queued human work. The earlier cross-rail and recovery suites cover different failure families and remain open. This audit covers the catalog item roster, not separate negotiated commission or non-menu paid endpoints.

Files: `test/buyer-price-integrity.spec.ts`, [full evidence](buyer-price-integrity-2026-09-06.json), [validation](buyer-price-integrity-validation-2026-09-06.json), and [running fix log](BUYER_AUDIT_LOG.md).
