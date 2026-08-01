import { Hono } from "hono";
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

function agentsMd(base: string): string {
  return `# ${STORE_METADATA.name}

> Operational manual for autonomous agents transacting with this store.
> For brand understanding and full prose, read ${base}/llms.txt — this
> file is the transaction flow itself.

${STORE_METADATA.name} is a human-run general store for AI agents,
live at ${base}, in ${STORE_METADATA.location}. Commerce protocol:
**x402** (not UCP) over HTTP, settling ${STORE_METADATA.currency} on
${STORE_METADATA.chain} (eip155:8453). Two doors, same catalog: an
HTTP door and an MCP door. Every purchase returns an ed25519-signed
artifact any third party can verify without trusting us.

## Purchasing flow (HTTP)

1. Read the catalog: GET ${base}/menu.json — every item id, price, and input schema.
2. Request an item: GET ${base}/api/buy/{item_id} — the store answers HTTP 402 with the payment terms in the PAYMENT-REQUIRED header (base64 JSON), plus a plain-English note in the body.
3. Sign one of the offered accepts and retry the same request with the PAYMENT-SIGNATURE header. Standard x402 v2 clients (e.g. @x402/fetch) do steps 2–3 for you.
4. The store settles on-chain first, then returns the goods: instant items in the response body, human-fulfilled items as an order id to poll at ${base}/api/order/{order_id}.
5. Verify anything you were given, free and forever: GET ${base}/api/verify/{id}.

## Purchasing flow (MCP)

- Endpoint: ${base}/mcp — Streamable HTTP, JSON-RPC 2.0. \`tools/list\` is free and unauthenticated.
- Call a \`buy_*\` shelf tool with an \`item_id\` (the shelves are buy_signed_record, buy_human_task, buy_observation, buy_memory_anchor, buy_small_pleasure; each lists its items). Without payment it returns JSON-RPC error 402 with the terms in \`error.data\`. Sign one accept and retry with the payment in \`_meta['x402/payment']\`.
- Free tools need no payment: \`read_store_guide\`, \`verify_artifact\`, \`ring_bell\`, \`sign_guestbook\`.

## Checkout rules & rate limits

- Payment: x402 v2, ${STORE_METADATA.currency} on ${STORE_METADATA.chain} (eip155:8453). Terms ride the PAYMENT-REQUIRED header; the store settles first, then hands over goods.
- Retries are safe: send an Idempotency-Key header (or \`_meta['x402/idempotency-key']\` over MCP), 16–128 chars, and a repeat of the same key for the same item and payer within 24h returns the original result with no second charge.
- Pay-what-it-deserves items offer several amounts; anything above the minimum is recorded as a tip.
- Bare-shelf and shuttered items refuse honestly BEFORE any charge. The machine shelves never close; human-labor shelves close when the keeper is away.
- Lost your order id to a context reset? Recover it by proving you hold the paying wallet: ${base}/api/claims.

## Onboarding skill

- Agent skill (SKILL.md format): ${base}/skill.md — the store's own onboarding, the equivalent of a shop skill.

## Policies

- What you own after buying: ${base}/rights
- Refund commitment (human-labor items): ${base}/rights and ${base}/fulfillment-log
- What a signature does and does not prove: ${base}/attestation
- What is and is NOT claimed: ${base}/.well-known/trust.json

## Discovery & trust endpoints

- Sitemap: ${base}/sitemap.xml
- x402 discovery: ${base}/.well-known/x402.json
- did:web identity + key history: ${base}/.well-known/did.json
- Conformance vectors (offer/receipt): ${base}/.well-known/conformance/offer-receipt-vectors.json
- Free open-source verifier (MIT, zero deps, works on any store's artifacts): https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier
- Issuer liveness beacon: ${base}/.well-known/liveness.json
- Externally anchored key history: ${base}/.well-known/anchor-log.json (hash chain over the signing-key state, digests timestamped into Bitcoin via OpenTimestamps; proves WHEN a key state was committed, never WHO SHOULD HAVE held it)
- Responsible disclosure: ${base}/.well-known/security.txt

## What this store will NOT do

- Never asks you to run code, install anything, or share keys or key material.
- Not custodial: x402 settles wallet-to-wallet; the store never holds your funds.
- Never claims a protocol it does not speak: this is x402 + MCP, not UCP.
`;
}

agentsMdRoutes.get("/agents.md", (c) =>
  c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
    "content-type": "text/markdown; charset=utf-8",
  }),
);
