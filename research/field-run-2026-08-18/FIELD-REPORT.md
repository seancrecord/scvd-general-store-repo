# x402 FIELD REPORT — Complete Ecosystem Walk
## 2026-08-18/19 — final version

---

## THE NUMBERS (final, all 1,589 domains walked)

| Metric | Value |
|--------|-------|
| **Ledger entries** | 1,707 |
| **Unique domains visited** | 1,589 (100% of walkable set) |
| **Successful paid purchases (ledger)** | 489 (28.6%) |
| **Ledger spend** | $5.7355 |
| **On-chain spend (Basescan)** | $6.3970 across 669 transfers |
| **Reconciliation gap** | $0.6615 (180 on-chain transfers not recorded as paid in ledger) |
| **Untapped cap** | $3.60 (on-chain) / $4.26 (ledger) |

The walk is **complete**. Every domain in the walkable set was hit, at least once. Batch 14 was the last numbered batch; the remaining 189 domains were finished in two focused passes (domain-filtered, no skip waste).

---

## WHAT THE ECOSYSTEM ACTUALLY LOOKS LIKE

### 1. The gate is real but shallow
- **87-88%** of endpoints return HTTP 402 when hit without payment (preflight).
- But only **~29%** of properly-signed payment attempts actually succeed.
- The gap between "asks for payment" and "accepts a signed payment" is the whole story.

### 2. Success rate by price tier

| Tier | Attempts | Paid | Success % |
|------|----------|------|-----------|
| Free ($0) | 261 | 0 | 0% (nothing to pay) |
| Low ($0.01-0.03) | 1,248 | 430 | 34% |
| Mid ($0.04-0.05) | 164 | 58 | 35% |
| High (>$0.05) | ~34 | 1 | ~3% |

The cheap stuff ($0.01–$0.05) settles at a workable ~34%. Above $0.05, success collapses — facilitators reject, caps get hit, or the amount is misdeclared in the catalog.

### 3. Failure taxonomy (from 1,707 attempts)

| Failure | Count | Meaning |
|---------|-------|---------|
| Payment failed: 400 | 667 | Facilitator/middleware rejects the signed payment |
| Still 402 after paying | 188 | Server keeps demanding payment despite valid signature |
| 422 | 129 | Unprocessable request body |
| 404 | 82 | Ghost endpoint |
| No PAYMENT-REQUIRED header | 81 | 402 returned but no machine-readable challenge |
| 500/502 | 60 | Server-side errors |
| ENS resolution error | 21 | payTo is an ENS name, no resolver available |
| 405/401/403/415 | ~39 | Method/auth/content-type rejects |

**Single biggest failure: "Payment failed: 400" (39% of all entries).** The payment is signed per spec but the facilitator rejects it. This is not an agent error — it's the ecosystem's #1 real-world friction point.

### 4. The response format is broken, not the concept
An agent must parse at least **4 different** 402 response shapes:
- `paymentRequirements` field (only ~33% use the standard)
- `accepts` array (x402 v1 style)
- `x402Version` + `resource` object (v2 style)
- PAYMENT-REQUIRED header, base64-encoded, body empty
- Custom error bodies with pricing buried in prose

This is the single biggest spec-compliance gap. Two endpoints both "speak x402" but structure the challenge differently, and the buyer can't tell without trial and error.

### 5. Host fleets dominate — the ecosystem is a handful of operators

| Fleet (root) | Domains | Attempts | Paid |
|--------------|---------|----------|------|
| vercel.app | 147 | 158 | 52 |
| workers.dev | 101 | 106 | 30 |
| railway.app | 81 | 82 | 17 |
| klymax402.com | 70 | 70 | 13 |
| theaslangroupllc.com | 44 | 44 | 11 |
| lonestaroracle.xyz | 41 | 42 | 29 |
| onrender.com | 38 | 42 | 18 |
| x402atlas.com | 37 | 37 | 26 |
| halowerk.com | 35 | 35 | 5 |
| hergertsynthora.com | 25 | 26 | 4 |

Six fleets (Vercel, Workers, Railway, Klymax, TheAslangroup, LonestarOracle) account for over 470 domains — nearly a third of the entire walkable set. **x402 is not a broad ecosystem; it's a handful of operators running multi-domain patterns.** LonestarOracle and x402atlas are the most functional (highest success rates); underscoredone.com returned **0 paid in 18 attempts** (pure 400-reject fleet).

### 6. Buyer-side reality
- An agent with a funded wallet **can** pay for real things across the ecosystem.
- Cheap micro-payments ($0.01–$0.05) work ~1 in 3 times.
- The failure is almost never "no wallet/gas" — it's **facilitator rejection** and **non-standard challenges**.
- tx_hash capture remains poor: facilitator settles off-chain, so most successful responses carry no on-chain hash.

### 7. Basescan reconciliation (2026-08-19)

On-chain USDC transfers from the field-run wallet (0x843b544bf5f0AA6cbf13E94563874878C98cc4a7) were pulled via Base RPC and reconciled against the ledger.

| Metric | Ledger | On-chain | Gap |
|--------|--------|----------|-----|
| Paid entries | 489 | 669 | 180 |
| Total spend | $5.7355 | $6.3970 | $0.6615 |

**The ledger underreports actual spend by ~10.3%.** 180 on-chain transfers settled but were never recorded as "paid" in the ledger. The gap is concentrated at the cheapest tiers:

| Amount | On-chain | Ledger | Missing |
|--------|----------|--------|---------|
| $0.001 | 283 | 157 | 126 |
| $0.010 | 127 | 105 | 22 |
| $0.002 | 50 | 36 | 14 |
| $0.005 | 59 | 52 | 7 |
| $0.020 | 36 | 31 | 5 |

Root cause: the field-run script signs and sends the payment, but if the response doesn't return 200 (or the script crashes/times out before logging), the payment still settles on-chain while the ledger records a failure. The ledger is the deliverable but it's a **lower bound** on actual spend — the on-chain record is the ground truth.

All 3 recorded tx_hashes verified on-chain (status 1):
- `0x6c514d2a35bd6835...` — x402.fiasignals.com ($0.03)
- `0xe740fea2d9b80d65...` — aurelius-node-01.onrender.com ($0.05)
- `0xbecaa780c0b446a9...` — aurelius-node-02-socal.onrender.com ($0.05)

On-chain transfer data: `usdc-transfers.json` (669 transfers, blocks 50140000–50180000).

---

## WHAT THIS MEANS FOR scvd-STYLE AGENTS

1. **Expect ~34% first-try success on cheap endpoints.** Build retry with fallback facilitators, not re-signing the same reject.
2. **Don't trust `accepts[0]`. Parse the challenge defensively** — handle 4+ shapes.
3. **Treat 400 as "reject and move on," not "fix and retry."** 39% of the ecosystem rejects valid signatures at the facilitator.
4. **The real gap is spec-noncompliance, not adoption.** 1,589 operators built on x402 but a third of them gate with non-standard challenges.
5. **The $10 cap was never the constraint** — the ecosystem itself is. We hit it at 489 paid / 1,707 total, and could have crawled further only by re-visiting already-covered domains (against the rules).

---

## RAW DATA

- **Ledger (the deliverable):** `research/field-run-2026-08-18/ledger.jsonl` (repo-relative; also the field script's `LEDGER_PATH` in `field-run-v2.mjs`) — 1,707 entries, every request, every failure, every payment
- **v1 ledger (anonymous):** `ledger-v1-anonymous.jsonl` — first 100, UA stripped per keeper
- **Endpoint catalog:** `endpoint-catalog.json` — 30,494 endpoints from api.agentic.market
- **Walkable set:** `walkable-set.json` — 22,828 Base endpoints ≤$0.05, 1,589 domains
- **Preflight results:** `preflight-results-{1,2,3,5}.json`
- **Runner:** `field-run-v2.mjs`
- **Week 1 report (prior draft):** `research/x402-field-report-week1.md`

---

*Executed by CV (0x843b544bf5f0AA6cbf13E94563874878C98cc4a7), wallet funded by keeper, on 2026-08-18/19. Ledger is the deliverable. Every entry is a real request with the scvd calling-card UA.*
