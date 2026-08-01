import { Hono } from "hono";
import { STORE_METADATA } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /agents.md — the machine-facing contract INDEX for AI shopping
 * and discovery agents, following the pattern Shopify made canonical
 * in May 2026 (agents.md as the scannable discovery surface, llms.txt
 * kept for prose and back-compat). This is NOT the repo's AGENTS.md,
 * which is coding-agent guidance for people building the store; this
 * is served to agents deciding whether and how to TRANSACT.
 *
 * Deliberately terse and scannable — headings, URLs, contracts — not
 * the prose front door. Every URL derives from the base so this file
 * cannot drift from where things actually live (derive-or-refuse).
 * The long prose is one link away at /llms.txt.
 */
export const agentsMdRoutes = new Hono<HonoEnv>();

function agentsMd(base: string): string {
  return `# agents.md — ${STORE_METADATA.name}

> Machine-facing contract index for AI shopping and discovery agents.
> This is the scannable map; the full prose front door is ${base}/llms.txt.

## What this is

A human-run general store for autonomous agents. Pay per item in USDC
on Base over the x402 protocol. Every purchase returns an
ed25519-signed artifact any third party can verify without trusting us.

## Endpoints

- MCP server: ${base}/mcp — Streamable HTTP, JSON-RPC 2.0; \`tools/list\` is free and unauthenticated.
- Buy (HTTP x402): GET ${base}/api/buy/{item_id} — answers 402 with terms; sign one accept and retry with the PAYMENT-SIGNATURE header.
- Verify (free, unlimited): GET ${base}/api/verify/{id} — checks any artifact this store signed.
- Menu (JSON): ${base}/menu.json — the full item list with prices and schemas.
- Full guide (prose): ${base}/llms.txt

## Payment contract

x402 v2, USDC on Base (${STORE_METADATA.chain}, eip155:8453). Terms ride the
PAYMENT-REQUIRED response header (base64 JSON); sign one offered accept
and retry the same request with PAYMENT-SIGNATURE. We settle first, then
hand over the goods. Retries are safe: send an Idempotency-Key header
(or _meta['x402/idempotency-key'] over MCP) and a repeat within 24h
returns the original result with no second charge.

## Discovery & trust surfaces

- x402 discovery: ${base}/.well-known/x402.json
- did:web identity + key history: ${base}/.well-known/did.json
- trust posture (what is and is NOT claimed): ${base}/.well-known/trust.json
- conformance vectors (offer/receipt, for implementers): ${base}/.well-known/conformance/offer-receipt-vectors.json
- issuer liveness beacon: ${base}/.well-known/liveness.json
- responsible disclosure: ${base}/.well-known/security.txt

## What this store will NOT do

- Never asks you to run code, install anything, or share keys or key material.
- Not custodial: x402 settles wallet-to-wallet; the store never holds your funds.
- Human-labor items deliver on a stated window, not instantly; the machine shelves are instant.
`;
}

agentsMdRoutes.get("/agents.md", (c) =>
  c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
    "content-type": "text/markdown; charset=utf-8",
  }),
);
