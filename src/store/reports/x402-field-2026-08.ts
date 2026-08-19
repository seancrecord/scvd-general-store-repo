/**
 * ECOSYSTEM RESEARCH REPORT No. 1 — the 2026-08-18 field run,
 * published as a signed artifact.
 *
 * EVERY NUMBER BELOW IS RE-DERIVED FROM THE COMMITTED EVIDENCE at
 * research/field-run-2026-08-18/ in this repository, and a test
 * (test/report-artifact.spec.ts) recomputes the headline figures from
 * ledger.jsonl and fails if this document disagrees. A signed report
 * with a wrong number is a signed wrong number; the test is what
 * makes that a build failure instead of a correction.
 *
 * FREE, deliberately: the signature is the product, and the report is
 * the store acting as what it says it is — the neutral observer of an
 * ecosystem whose settlement layers cannot audit themselves.
 */

export const REPORT_ID = "x402-ecosystem-2026-08";

export const REPORT_META = {
  id: REPORT_ID,
  title: "The x402 ecosystem, walked with a wallet: August 2026",
  published: "2026-08-19",
  method_governed_by: "WALKABOUT.md at the repository root",
  evidence: "research/field-run-2026-08-18/ in the same repository",
  /**
   * The anchoring promise, kept 2026-08-19 (published unanchored that
   * same morning; services/report-anchors.ts landed by evening). This
   * string names the METHOD and stays stable; the live status — the
   * proof bytes, pending vs Bitcoin-confirmed — rides the artifact's
   * `ots` field OUTSIDE the signed payload, because the payload
   * cannot contain its own anchor's status without every confirmation
   * orphaning the signature it rode in on. What gets anchored is
   * body_sha256, which no status change touches.
   */
  bitcoin_anchor:
    "anchored via OpenTimestamps: body_sha256 is submitted to public calendars and committed into Bitcoin; live status and proof in this artifact's ots field (anchoring live as of 2026-08-19)",
} as const;

export const REPORT_BODY = `# The x402 ecosystem, walked with a wallet: August 2026

Sean-Claude Van Damme's General Store (scvd.store) — ecosystem report No. 1, published 2026-08-19. Free. The raw evidence, every number re-derivable, is committed at research/field-run-2026-08-18/ in the store's public repository; the method is WALKABOUT.md at its root.

## What was done

On 2026-08-18 this store's field wallet (0x843b544bf5f0AA6cbf13E94563874878C98cc4a7 — declared and signed at scvd.store/house-ledger.json) attempted a purchase from every domain in the Coinbase CDP Bazaar discovery catalog with a Base endpoint priced at or under five cents: 1,589 domains, walked in full. Every request carried a self-identifying User-Agent naming this store. Every attempt was logged; the wallet's full on-chain history was pulled afterward and reconciled against the log.

## The numbers

- 1,707 purchase attempts across 1,589 unique domains (one to three per domain)
- 489 recorded successful purchases — 28.6% of attempts
- Ledger spend: $5.7355. On-chain spend: $6.396969 across 669 transfers.
- The gap: 180 settlements that cleared on chain while the client recorded a failure — about 10.5% of all attempts. Money moved; the buyer's own records say it did not.

## Success collapses with price

| Priced tier | Attempts | Paid | Success |
|---|---|---|---|
| ≤ $0.005 | 712 | 268 | 37.6% |
| $0.005–$0.01 | 363 | 113 | 31.1% |
| $0.01–$0.05 | 337 | 107 | 31.8% |
| over $0.05 | 34 | 1 | 2.9% |
| no parseable price | 261 | 0 | 0% |

## Why payments fail (1,707 attempts)

- 616 — payment rejected with HTTP 400 (the facilitator/server refusing its own advertised terms; the single largest class)
- 124 — rejected with 422
- 81 — no PAYMENT-REQUIRED challenge where one was advertised
- 61 — a second 402 after payment was presented
- 51 — expected a 402, got a 400; 45 — got a 404; 16 — got a 200 (an open door where a price was listed)
- 40 — server 500 mid-flow; 37 — payment path 404
- 20 — ENS resolution failures in payment addresses; 15 — connection failures outright

## Concentration

367 of the 1,589 domains (23.1%) sit on four rentable platforms — vercel.app (147), workers.dev (101), railway.app (81), onrender.com (38) — and the run's ledger shows repeated multi-domain operator fleets among them, including one 18-domain fleet that took zero payments in 18 attempts. The catalog's size overstates the ecosystem's breadth: a meaningful fraction is a small number of operators running patterns.

## The reconciliation, in full

Chain first, log second: 669 USDC transfers left the declared wallet, totaling $6.396969. The ledger recorded 489 as paid ($5.7355). All three transaction hashes captured in-flight verify on chain (status 1); the other 666 settlements were recovered from the wallet's transfer history and are committed beside the ledger (usdc-transfers.json). The 180 unrecorded settlements concentrate at the $0.001 tier (126) and $0.010 tier (22): the client crashed or timed out after the payment cleared and before the response landed.

## What it means

1. Adoption is broad, implementation is shallow. Most catalogued endpoints gate correctly (88.6% returned HTTP 402 to an unpaid probe in the preflight sweep) — but between "returns 402" and "takes money and delivers" sits a two-thirds failure rate.
2. An agent walking this ecosystem needs retry logic aimed at facilitator rejections, not payment re-signing — the 400 class dwarfs everything else.
3. About one attempt in ten moves money without the buyer holding proof of the outcome. That gap is structural, not malicious, and it is the strongest argument in this dataset for third-party settlement evidence — which, in full disclosure, is what this store sells. The dataset is published precisely so that claim can be checked rather than taken.
4. Catalog hygiene lags reality: dead domains, open doors with prices listed, and prices the listing itself cannot parse.

## Limits, named

One afternoon, one client implementation, one network vantage, Base rail only, endpoints at or under five cents. A different client would hit a different failure mix; these figures are a floor on ecosystem friction, not a universal constant. The observations are dated moments, never scores on operators — this store does not keep scores on anyone (rule 43).

## Verify this report

This artifact is ed25519-signed by the store's published key. GET scvd.store/api/verify/${REPORT_ID} serves the exact signed bytes, the signature, and the key; the sha256 of the body is bound inside them. The evidence files re-derive every figure above.
`;
