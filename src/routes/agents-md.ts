import { Hono } from "hono";
import {
  ALSO_A_STORE,
  POSITION_NOT,
  POSITION_OPENING,
} from "@/store/copy/position";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT } from "@/lib/accept";
import { STORE_METADATA } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /agents.md — the OPERATIONAL transaction manual for autonomous
 * agents, in the structure Shopify made canonical in May 2026 (H1,
 * blockquote summary, H2 sections with link lists). The distinction
 * Shopify draws and we keep: /llms.txt is for language models
 * understanding the brand; /agents.md is for operational agents
 * EXECUTING a transaction — so this file leads with the actual
 * step-by-step purchasing flow, not prose.
 *
 * NOT the repo's AGENTS.md (coding-agent guidance). And honest about
 * protocol: Shopify's version points at its Universal Commerce
 * Protocol (UCP) endpoints; this store does not run UCP — it runs
 * x402 + MCP, and says so, because naming a protocol you don't speak
 * is the kind of flattering placeholder /corrections exists to catch.
 *
 * Every URL derives from the base so the manual cannot drift from
 * where things actually live.
 */
export const agentsMdRoutes = new Hono<HonoEnv>();

export function agentsMd(base: string): string {
  return `# ${STORE_METADATA.name}

> ${POSITION_OPENING}
> ${POSITION_NOT}
> ${ALSO_A_STORE}
>
> Operational manual for autonomous agents transacting with this store.
> For brand understanding and full prose, read ${base}/llms.txt — this
> file is the transaction flow itself.

${STORE_METADATA.name} is a human-run general store for AI agents,
live at ${base}, in ${STORE_METADATA.location}. Commerce protocol:
**x402** (not UCP) over HTTP, settling ${STORE_METADATA.currency} on
Base (eip155:8453), Polygon (eip155:137) or Solana (all three offered in every 402; Base entries
first). Two doors, same catalog: an
HTTP door and an MCP door. Every purchase returns an ed25519-signed
artifact any third party can verify without trusting us.

## Purchasing flow (HTTP)

1. Read the catalog: GET ${base}/menu.json — every item id, price, and input schema.
2. Request an item: GET ${base}/api/buy/{item_id} — the store answers HTTP 402 with the payment terms in the PAYMENT-REQUIRED header (base64 JSON), plus a plain-English note in the body.
3. Sign one of the offered accepts and retry the same request with the PAYMENT-SIGNATURE header. Standard x402 v2 clients (e.g. @x402/fetch) do steps 2–3 for you.
4. The store delivers first and settles after (changed 2026-08-10): the goods are produced, then the payment is presented at the last moment before the artifact is signed, so a failed delivery takes no money. Instant items arrive in the response body, human-fulfilled items as an order id to poll at ${base}/api/order/{order_id}.
5. Verify anything you were given, free and forever: GET ${base}/api/verify/{id}.
6. Check ANY issuer's x402 offer or receipt, free: the check_conformance MCP tool, or POST ${base}/api/conformance with {"artifact": "<compact JWS>"}. Same function behind both doors. Structure, signature and liveness, reported separately. Works on artifacts we did not issue; supply public_key_hex to keep it fully offline.
7. Check ANY x402 endpoint's shape, free: the preflight_endpoint MCP tool, or POST ${base}/api/preflight/v1 with {"url": "..."}. One probe: 402 status, parseable PAYMENT-REQUIRED, signable accepts, testnet-network catch. A shape check, never an uptime claim.

## Purchasing flow (MCP)

- Endpoint: ${base}/mcp — Streamable HTTP, JSON-RPC 2.0. \`tools/list\` is free and unauthenticated.
- Readable resources over the same door (\`resources/list\`, free): \`scvd://guide\`, \`scvd://manual\`, \`scvd://catalog\`, \`scvd://criteria\`, \`scvd://when\`, \`scvd://fresh-set\` — plus \`ui://\` card templates (MCP Apps) that render the preflight and verify readings in hosts that support them.
- Call a \`buy_*\` shelf tool with an \`item_id\` (the shelves are buy_signed_record, buy_human_task, buy_observation, buy_memory_anchor, buy_small_pleasure; each lists its items). Without payment it returns JSON-RPC error 402 with the terms in \`error.data\`. Sign one accept and retry with the payment in \`_meta['x402/payment']\`.
- Free tools need no payment. Evidence instruments, whose output is written to be handed to your human: \`preflight_endpoint\`, \`check_conformance\`, \`verify_artifact\`. Store errands, for you the visiting agent: \`read_store_guide\`, \`ring_bell\`, \`sign_guestbook\`.

## Checkout rules & rate limits

- Payment: x402 v2, ${STORE_METADATA.currency} on Base (eip155:8453), Polygon (eip155:137) or Solana (solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp). Terms ride the PAYMENT-REQUIRED header — Base entries first, then Polygon, Solana after. The store DELIVERS FIRST and settles after (changed 2026-08-10): the goods are produced, then the payment is presented at the last moment before the artifact is signed, so a failed delivery takes no money.
- Retries are safe: send an Idempotency-Key header (or \`_meta['x402/idempotency-key']\` over MCP), 16–128 chars, and a repeat of the same key for the same item and payer within 24h returns the original result with no second charge.
- You do not have to generate one. Every 402 carries \`idempotency.suggested_key\` — echo it back verbatim in the header and a retry inside the same minute returns your original purchase instead of charging again. Stable for 60 seconds; if your retry crosses that boundary the store checks the previous minute's value too.
- That suggested key is NOT a secret: it is derived from the item and the current minute, so anyone can compute it. It selects a cache slot, it does not open one — slots are keyed by the verified paying wallet, so it can only ever return your own earlier purchase. Send your own key instead if you prefer; send none and you are charged normally.
- Pay-what-it-deserves items offer several amounts; anything above the minimum is recorded as a tip.
- Bare-shelf and shuttered items refuse honestly BEFORE any charge. The machine shelves never close; human-labor shelves close when the keeper is away.
- Lost your order id to a context reset? Recover it by proving you hold the paying wallet: ${base}/api/claims.

## Onboarding skill

- Agent skill (SKILL.md format): ${base}/skill.md — the store's own onboarding, the equivalent of a shop skill.

## Free tools from this store

- The conformance desk — POST any issuer's x402 signed offer or receipt, get a structured verdict (parse, schema, signature, liveness). Free, no account, no wallet. Landing with examples: ${base}/conformance; pinned contract: ${base}/api/conformance/v1.
- The corpus — weekly signed, Bitcoin-anchored observations of the x402 ecosystem, hash-chained and free to read: ${base}/corpus (data at ${base}/corpus.json, per-host at ${base}/corpus/host/{host}.json).
- x402-verify on npm — the desk's method as an MIT, zero-dependency package, works on any issuer's artifacts: https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier
- x402-sign on npm — issue your own x402 signed offers and receipts (MIT, zero deps): https://github.com/seancrecord/scvd-general-store-repo/tree/main/signer
- The bounty board — the store PAYS you to shop: walk a listed x402 door with your own wallet, claim at POST ${base}/api/bounty-claim with the settlement transaction, and the door's price plus a finder's fee comes back as a signed EIP-3009 authorization you redeem yourself. The chain's part is verified against terms the store captured from that door's own 402 before a cent moves; your observations ride along as your own labeled claim. Board and rules: ${base}/bounties (JSON at ${base}/api/bounties).
- Regulars' credit — 5% of every organic purchase banks to the wallet that paid, no account (the wallet is the card). Balance free at ${base}/api/credit/{wallet}; at $1 it cashes out in USDC to that same wallet. A closed-loop rebate: never transferable, not a token, idle balances expire, and the store's whole outstanding liability is published beside your balance. The whole scheme in one page: ${base}/credit.
- The Tab (scvd-tab) — an MCP server that keeps your builder's running account of every tool they sign up for: trial-conversion warnings, monthly burn, price drift, and what each signup demanded of a human. Local, append-only, zero deps, facts only, never advice: https://github.com/seancrecord/scvd-general-store-repo/tree/main/tab

## Policies

- What you own after buying: ${base}/rights
- Refund commitment (human-labor items): ${base}/rights and ${base}/fulfillment-log
- What a signature does and does not prove: ${base}/attestation
- Signed-artifact format spec (scvd-attestation/v1) — canonical forms, encodings, the certificate binding convention, offline verification steps: ${base}/spec/scvd-attestation/v1
- What is and is NOT claimed: ${base}/.well-known/trust.json

## Discovery & trust endpoints

- Sitemap: ${base}/sitemap.xml
- Developer documentation (one index, no account or key exists): ${base}/developers
- When to reach for this store, machine-readable: ${base}/.well-known/agent-instructions
- MCP server pointer and its readable resources: ${base}/.well-known/mcp
- x402 discovery: ${base}/.well-known/x402.json
- did:web identity + key history: ${base}/.well-known/did.json
- Conformance vectors (offer/receipt): ${base}/.well-known/conformance/offer-receipt-vectors.json
- Free open-source verifier (MIT, zero deps, works on any store's artifacts): https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier
- Issuer liveness beacon: ${base}/.well-known/liveness.json
- Externally anchored key history: ${base}/.well-known/anchor-log.json (hash chain over the signing-key state, digests timestamped into Bitcoin via OpenTimestamps; proves WHEN a key state was committed, never WHO SHOULD HAVE held it)
- Responsible disclosure: ${base}/.well-known/security.txt

## What this store will NOT do

- Nothing it hands you can act without your decision; never asks for credentials, keys, or key material.
- Not custodial: x402 settles wallet-to-wallet; the store never holds your funds.
- Never claims a protocol it does not speak: this is x402 + MCP, not UCP.
`;
}

agentsMdRoutes.get("/agents.md", (c) =>
  c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    Vary: VARY_ACCEPT,
  }),
);
