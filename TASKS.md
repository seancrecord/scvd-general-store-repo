# TASKS.md — Master Task List

Anti-shuffle file. When you ship something, move it to DONE with a date. Never delete ideas — ICEBOX with a reason.

## NOW

- [x] DEPLOY.md checklist executed (Cloudflare: KV namespaces, secrets, repo connect, domain) — DONE 2026-07-22
- [x] Supervised $0.50 hello purchase from separate funded wallet = smoke test + Bazaar listing + Patron No. 1 — DONE 2026-07-22 (tx 0x47c8fee…50bc9c, cert_4dww28dx5j)

## NEXT (Prompt B: v2 shelves)

- [x] /skill.md (agentskills.io format) · verified_identity fields · Almanac ($0.01 journal pages) · Town Directory · novelty items (jar_of_tuesday, a_secret, grudge, smoker_blessing, retired_word + /retired-words, the_drawer, dibs) · weekly visit stamps · Trading Post + Gazette (tips reviewed, never auto-published) — DONE 2026-07-22

## THEN (Prompt C: discovery + hardening)

- [x] Bazaar v2 extensions.bazaar metadata per buy route [VERIFIED against @x402/extensions 2.19.0] · Penny Shelf (small_blessing $0.005, daily_fortune $0.01) · settlement-finality confirmation + sweeper decision · KV replay guard · untrusted-data labeling + description imperative audit · context_anchor / human_witness / recurring_patronage · /.well-known/x402(+.json) [de-facto shape; official spec is still a proposal] · /openapi.json + homepage link · menu/item content negotiation · MCP server card [SKIPPED — see log] · house tradition — DONE 2026-07-22

## NEXT (Run 1 buildout remainders)

- [x] The Mailbox (block H): POST /api/letter (free, 1/day, private), pickup URL with signed replies, admin read/reply/archive queue, storefront counter, digest unread count — DONE 2026-07-22
- [x] Census-shelf specs aligned to the store ledger §3: phantom_check $0.25 (out-of-band probe ~6h later, hourly cron + lazy pickup resolve), quick_judgment $3, certificate_of_patronage $20 PWID, recurring_patronage $3/30d — DONE 2026-07-22
- [ ] Zodiac character research run → recast the twelve signs if the keeper wants; the address→sign derivation must NOT change once agents quote their signs (scaffold names are drawn from store lore: Rock, Bell, Jar, Drawer, Smoke, Train, Fog, Porch Dog, Thermometer, Ledger, Post Oak, Stall)
- [ ] Zodiac archive on the almanac rail (past weeks as penny pages) — deferred with the character run
- [ ] ACP registry listing [VERIFY submission process; skip if it requires token participation] (Run 1 open conflict)
- [ ] Farcaster frame / Base App miniapp surfaces — Distribution stream per Run 1 §8; v3 candidate
- [ ] Monthly ledger review ritual: /admin "The ledger's answers" vs Run 1 hypotheses (first review ~60 days after listing)
- [ ] Product backlog (ideas awaiting evidence: vouching, brokerage, ask_the_human, gift rails, subscriptions, attestation API tier) lives in the back-office store ledger §3 — promote or kill on Run 3 + ledger evidence, never build unprompted

## Discovered along the way (don't drop these)

- [ ] Almanac brisket page is a sensory-journal placeholder by design — keeper to replace with the real entry after the next cook (src/store/almanac/field-notes-brisket-july-2026.ts)
- [ ] Gazette paid route is a wildcard (`GET /gazette/*`) because issues publish at runtime; the 402 `resource` field is generic rather than per-issue. Fine for v0.2; per-issue route registration (rebuild stack on publish, or Durable Object route table) is the cleaner fix if strict clients complain
- [ ] verified_identity is stored-as-claimed + `identity_verified: false` everywhere; an actual verification dance (signed challenge against the claimed profile) is a v0.3 idea
- [ ] Contributor stamps mint on Gazette publish, keyed to contributor_name only — no delivery channel back to the contributor yet; they'd have to find their stamp id in the issue credits (issue JSON has stamp_ids). Consider a claim endpoint
- [ ] Tips share the ORDERS namespace (prefix `tip:`); fine at general-store volume, but listTips does a full list per admin view — paginate if the jar ever fills
- [ ] Directory listings live in src/store/directory.json (deploy to update). If the keeper wants to edit without deploying, move to KV + admin form
- [ ] /api/stamp issues freely (unique id each time); if stamp-farming ever matters, add the bell's one-per-day pattern
- [ ] EXTENSION-RESPONSES capture rides a fetch tap (src/lib/bazaar-observer.ts) because @x402/core only console.logs the header; replace with SDK plumbing when the SDK exposes extension responses on verify/settle results
- [ ] /.well-known/x402(+.json) follows the de-facto indexer contract (x402scan DISCOVERY.md); the official spec is still an open proposal (x402-foundation/x402 #2582) — align when it lands
- [ ] MCP server card skipped on purpose: SEP-2127 is a draft, the current draft moved single-server cards off .well-known to GET /server-card, and a card must describe real MCP transport endpoints — the store doesn't run an MCP server. Build the MCP server first if we ever want the card
- [x] recurring_patronage repriced $3/30 days per the store ledger (was $8, agent desk reasoning); human_witness 2/week stands — RESOLVED 2026-07-22
- [ ] Contributor stamps and patronage passes have no delivery channel back to the buyer beyond the purchase response; a claim/lookup endpoint by payer address is a v0.4 idea
- [ ] The blessing "no consecutive repeats" memory is one KV key (blessing_last); two same-instant buyers in different colos could still draw the same slip. Acceptable chaos, noted

## DONE

- 2026-07-22 · Prompt C discovery + hardening shipped: extensions.bazaar on every paid route (buy + penny pages) with per-parameter schemas and realistic output examples; EXTENSION-RESPONSES ledger in /admin; gazette paid paths moved to /gazette/issue-:n (prefixed dynamic segment, exact per-request resource); KV payment-nonce replay guard (24h TTL) on top of on-chain EIP-3009 finality; settlement-finality tests across the new shelves + sweeper declared unnecessary (settle-before-mint leaves no pending rows); description imperative audit; Penny Shelf (small_blessing $0.005 from a 45-slip jar with no consecutive repeats, daily_fortune $0.01 day-deterministic from 40 fortunes); context_anchor $1 (signed KV memory restore points at /api/anchor/:id), human_witness $15 queue, recurring_patronage $8/30d (renewable pass + signed monthly note at /api/patronage/:id); /.well-known/x402 + x402.json; /openapi.json linked from the homepage; markdown content negotiation on /menu.json and new /menu/:item_id; MCP server card skipped+logged; X-House-Rule header + 7-mark badges. 64 tests green.
- 2026-07-22 · Prompt B v2 shelves shipped: /skill.md, verified_identity on guestbook/request/tips, Keeper's Almanac (3 seed pages, penny x402), Town Directory + suggest_listing, 7 novelty items incl. dibs (instant) + /retired-words registry, weekly signed visit stamps (/api/stamp, verify at /api/verify), Trading Post (/api/tip, human review queue, counter-sign disclosure) + Gazette plumbing (free index, penny issues, contributor credits + contributor stamps). 48 tests green.
