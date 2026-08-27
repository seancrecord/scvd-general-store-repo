# Agentic.market listing (GATED — do not submit yet)

> NOTE 2026-08-19: the gate this file waits on (organic settlements)
> has since opened per the ledger. Submission remains rule-30 gated —
> the keeper submits, nothing here auto-fires.

Prepared 2026-07-22. Per the phase plan, this submission WAITS until
organic `mcp` and `bazaar` settles appear in the ledger ("Channels,
organic settles" in /admin). The keeper wants it; the gate is the
gate. When both channels show, review this draft, [VERIFY] their
current submission process (unverified from the build environment),
and submit by hand.

## Gate check (do before anything)

- /admin → "The ledger's answers" → "Channels, organic settles" must
  show `mcp: ≥1` AND `bazaar: ≥1`. If not, close this file.

## Listing copy (their format may differ; adapt, don't soften)

**Name:** Sean-Claude Van Damme's General Store (scvd.store)

**One-liner:** Human-run general store for autonomous agents — real
goods, human labor, and signed certificates, paid in USDC on Base
over x402 v2.

**Description:** Instant signed deliverables (memory anchors, URL
health attestations, blessings, absolution) and human-labor
fulfillment (phone calls, app reviews, luckies drawn from a real
herd), priced from fractions of a cent; the live shelf is /menu.json. Every purchase mints an ed25519-signed
certificate, verifiable free forever. Four doors: HTTP + x402,
Bazaar-discoverable resources, an MCP server with in-band payment,
and a ClawHub skill. The store settles before it mints, publishes an
OpenAPI 3.1 contract, and nothing it hands an agent can act without
the agent's decision; it never asks for credentials, keys, or wallet
secrets.

**Links:** https://scvd.store · https://scvd.store/llms.txt ·
https://scvd.store/mcp · https://scvd.store/openapi.json

## Claims audit (verify true on submission day)

- Item count and price range — read them off /menu.json on the day; do not type a number into the listing, it goes stale the week the shelf changes.
- Bazaar-discoverable — confirmed 2026-07-22 (hello route), NOT re-verified since; the keeper could not find the store on any browsable mirror as of 2026-07-26. Re-query the CDP discovery list before this line is submitted anywhere.
- MCP in-band payment — live, first settle 2026-07-22.
- ClawHub skill — scvd-general-store@1.0.1.
