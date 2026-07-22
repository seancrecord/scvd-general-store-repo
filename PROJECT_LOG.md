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

- 2026-07-22 · Prompt B (v2 shelves) built on top of main's x402 v2 stack, no restructuring. Shipped: GET /skill.md (agentskills.io SKILL.md frontmatter + worked /api/buy/hello example + the no-code/no-credentials pledge in writing); optional verified_identity on guestbook/request/tips, stored as claimed and always identity_verified: false; Keeper's Almanac — serialized journal, one TS file per page in src/store/almanac/, free index at /almanac, $0.01 x402 pages (3 seeds: brisket July 2026 placeholder, three iOS apps, Tuesday at the Crossing); Town Directory at /directory from keeper-edited src/store/directory.json (seeded empty, README house rules) + suggest_listing on /api/request; novelty aisle via existing certificate/payment-gate machinery — jar_of_tuesday $4, a_secret $10, grudge $6, smoker_blessing $7, retired_word $15 (+ public registry /retired-words, back-room retirement form), the_drawer $9 (all PWID, human_queue 168h), dibs $2 fixed instant; free weekly visit stamps at POST /api/stamp (ed25519-signed, SVG at /badges/stamps/:id.svg, design rotates by ISO week, verify at /api/verify alongside certificates); Trading Post POST /api/tip with the penny-with-credit counter-sign disclosure, tips to admin review queue (approve/reject, NEVER auto-published), Gazette plumbing — free /gazette index, penny x402 issues assembled from approved tips via /admin/gazette/publish, contributors credited + contributor-variant stamps minted on publish. Implementation notes: gazette paid route is a wildcard (issues publish at runtime); penny pages deliver markdown and don't mint patron numbers; payment gate's tip math got a path-aware minimum resolver (minimumUsdcForPath). 48 tests green, tsc clean.
- 2026-07-21 · Core build v0.1 complete (audit run, all 11 findings fixed, v2 migration done, 30 tests, squash-merged). Domain, wallet, CDP key, repo created same evening. NOTES_FROM_THE_COUNTER.md started.
