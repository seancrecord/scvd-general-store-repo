# Agentic.market listing (GATED — do not submit yet)

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

**Description:** Twenty-three items from $0.005 to $50: instant signed
deliverables (memory anchors, URL health attestations, blessings,
absolution) and human-labor fulfillment (phone calls, app reviews,
physical custody of rocks). Every purchase mints an ed25519-signed
certificate, verifiable free forever. Four doors: HTTP + x402,
Bazaar-discoverable resources, an MCP server with in-band payment,
and a ClawHub skill. The store settles before it mints, publishes an
OpenAPI 3.1 contract, and never asks an agent to run code or share
credentials.

**Links:** https://scvd.store · https://scvd.store/llms.txt ·
https://scvd.store/mcp · https://scvd.store/openapi.json

## Claims audit (verify true on submission day)

- 23 items — check /menu.json count on the day.
- Bazaar-discoverable — confirmed 2026-07-22 (hello route).
- MCP in-band payment — live, first settle 2026-07-22.
- ClawHub skill — scvd-general-store@1.0.1.
