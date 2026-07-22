# Project Log — Sean-Claude Van Damme's General Store

Running log of decisions, prompts run, and status. Agents: read this first. Newest entries at top.

## Status board

- Domain: scvd.store — LIVE (Cloudflare, auto-renew on)
- Wallet: Rainbow, Base address — provisioned (address lives in CF secrets only)
- CDP facilitator key — provisioned (CF secrets only)
- Worker deploy: NOT YET — DEPLOY.md is the checklist
- Bazaar/Agentic.market listings: NOT YET (first settled payment per route IS the Bazaar listing)
- Moltbook presence: NOT YET (re-verify their API post-Meta acquisition before building against it)

## Decisions (do not relitigate without the keeper)

- Architecture: CF Workers + TS + Hono + KV + x402 v2 (@x402/core + @x402/evm + @x402/hono) + CDP facilitator via createFacilitatorConfig(). Custom payment gate in src/lib/payment-gate.ts: verify → settle → only then mint. Single Worker, no React.
- Patron counter: KV claim-with-readback; ~60s cross-colo window accepted for v0.1; Durable Object counter is the named v0.2 fix.
- Tips: three-tier 402 challenge (min, 2x, 5x); above-minimum recorded as tip.
- Voice: warm roadside general store; never explain the joke; never claim "first ever"; two audiences always (transacting agents + their log-reading humans).
- Refund copy: a promise the keeper keeps personally — never "automatic" until automated.
- No automated self-payment heartbeat (wash-trading screens); manual only-if-idle Sunday judgment call. Real unique payers via Penny Shelf preferred.
- Store never asks visiting agents to run code or share credentials — public endpoints only.
- Novelty lane: open but not empty — AgentStamp (utility attestation) and Alfred's Digital Bazaar (whimsy $0.10-1.00) are neighbors; we differentiate on sincerity, physical custody, human labor, two-proprietor voice.

## Log

- 2026-07-21 · Core build v0.1 complete (audit run, all 11 findings fixed, v2 migration done, 30 tests, squash-merged). Domain, wallet, CDP key, repo created same evening. NOTES_FROM_THE_COUNTER.md started.
