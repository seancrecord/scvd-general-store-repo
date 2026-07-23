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
- [x] Zodiac character research → the Systems Almanac canon landed; twelve signs recast (derivation untouched), Season One written: 13 weeks x 12 signs — DONE 2026-07-22
- [x] Zodiac archive on the almanac rail (past weeks as penny pages at /zodiac/archive) — DONE 2026-07-22
- [x] the_confession — spec arrived and it shipped, see PHASE 3 QUEUE — DONE 2026-07-22
- [x] The Gazette weekly-edition engine per GAZETTE_SPEC (now complete incl. CORRECTIONS + LOOKING AHEAD): editions on the /gazette rack alongside tip dispatches, auto-drafted Sundays behind THE_NINETY gate (3+ organic events), hand-set lever in /admin, keeper's pen before print — DONE 2026-07-22 (misread fixed: this is the Gazette, NOT town_papers)

## NOW (keeper hands, the blitz + the walkthrough)

- [ ] THE DIRECTORY BLITZ — registry/directory-blitz.md has every venue with per-venue steps: nohumans.directory (curl in hand; SAVE the claim_token), x402scout.com (free form), x402-list.com (check for auto-import first, claim or submit), agent-tools.cloud (verify presence, self-submit if absent). MCP registries stay [VERIFY]. After each: watch /admin window-shoppers for the venue's prober UA and report it for the infrastructure classifier
- [ ] THE SHOPPING RUN — `npm run shop` (scripts/shopping-run.mjs) buys every item once, house-flagged, minimum tiers, receipts to a gitignored file. DRY_RUN=1 prints the plan ($182.78 full walk; burner pays the till, both pockets are the keeper's). Needs BUYER_PRIVATE_KEY + HOUSE_SECRET in env. Then work /admin/counter like a stranger paid: fulfill every human-queue order by hand (luckies exercises the card form, coffees prefills its note). Anything that surprises = a first-buyer bug, file it
- [ ] Classify directory probers as infrastructure once their UAs show in the books (lib/channel.ts crawler table) — keeps organic 402 counts honest under 15-minute probe schedules

## NOW (keeper hands, post-porch-log)

- [x] Republish the ClawHub skill as v1.0.1 (?src=clawhub-skill markers + entity pairing) — DONE 2026-07-22 by the keeper's hand; skill channel attribution is live end to end
- [ ] Republish ClawHub as v1.0.2 — registry/clawhub/SKILL.md reworked 2026-07-23: pines/Smokewire gone, Oak City + "where you're never late", mission line woven in, treat rail added, 23 items. Same publish steps as before (`npx clawhub skill publish` from the registry/clawhub folder)

## NEXT BUILD (big one, keeper-directed 2026-07-23)

- [ ] FULL UI REWORK — direction from the keeper: positive vibes, sunny day, clean, readable, marketable (not corporate), fun, fitting the canon instead of trying to be something we aren't. The neon-dusk cyberpunk front retires. De-overt doctrine applies everywhere: sexy/cool/sleek, "scvd.store" energy; the story lives in tidbits that can be pieced together, never announced. Nothing explains itself. Scope: storefront-page/storefront-css rework, porch page follows the same sky, paper pages stay paper. PROPOSAL FILED 2026-07-23 at registry/sunny-day-ui-proposal.md (concept: the store stands in front of its own shelves — the artifacts' paper/ink/brick language becomes the building; five keeper decisions listed with defaults). AWAITING THE NOD; no build until it lands

## NOW (keeper's pen, post-canon)

- [x] smoker_blessing — REMOVED 2026-07-23 per Batch 1 (item, pitch, tag, tests); the replacement concepts (drink poured in your name / dedicated brainstorm) stay available if the keeper ever wants them as a new item
- [x] retired_word — retired 2026-07-23 per Batch 1. No epitaph, which is the epitaph
- [x] a_secret — scam framing KILLED 2026-07-23 per keeper trust veto; restored to original human_queue secret. Refund novelty parked (ledger stays as general plumbing, not a product)
- [x] Storefront shelvesMore — de-quantified 2026-07-23 ("…and more on the menu…"); no inventory count to maintain
- [ ] ICEBOX: refund-as-novelty — only revive if it earns network/marketing value without trust risk and without being cumbersome; not feeling it otherwise
- [ ] Batch 2 keeper confirmations: the_drawer $2 fixed ("two bucks") and jar_of_tuesday $1 min PWID ("a dollar") — both repriced to match keeper tags; confirm or revert
- [ ] Batch 2 copy pass keeper check: two-line stamp mottos render at 17px (words intact, type smaller) — confirm the wrap treatment; porch lines await review in the PR
- [x] Keep-line ruling OVERRULED by the keeper 2026-07-23 — the tag advertises the price of the name now; §4 amended to that extent by his hand
- [ ] KEEPER HANDS, urgent: upgrade Cloudflare to Workers Paid ($5/mo) — the free tier's 1,000 KV writes/day and 50 subrequests/request are both too small for the store as built; the admin 500 was the subrequest cap, and "priced out" was almost certainly the write cap
- [ ] Almanac needs its first REAL entry — keeper dictates (Green Egg cook, a ledger read, an exact funny detail), machine structures, keeper kill-passes. The brisket placeholder was shelved 2026-07-23; the journal currently holds one page
- [ ] Founding edition + gazette entries rewrite in keeper's voice — he said he's rewriting; current draft at registry/founding-edition-draft.md is the machine's structure awaiting his flavor
- [x] "luckies" — BUILT 2026-07-23 (the launch post sells them; the launch was approved, so they went on the shelf): id `luckies`, "A Lucky (Custodial)", $5+ PWID, human_queue 168h. Keeper picks the object per order (that IS the fulfillment), provenance recorded, power assigned in farmers-market terms, vibe strength graded honestly, benching real. Copy carries the launch post's own warranty: "Results vary. They do vary. We have no legal team." Write-ins ride the Mailbox. STILL OPEN: pet_rock absorb-vs-beside (recommendation stands: absorb later, once luckies has its own legs); a /luckies public registry page when the first lucky exists
- [x] BATCH 4 EXECUTED 2026-07-23 (atlas pass + stragglers, keeper ink verbatim): App Review by the Keeper; coffee-in-hand → "Coffee's for closers." everywhere; NEW ITEM coffees_for_closers ($3 flat, win on the certificate verbatim, keeper drinks Sunday coffee in the buyer's name — 22 items, 26 MCP tools); future-institution week note default; porch out front on every surface; anchor pitch carries "The first anchor was left by one of us."; opener "Well well. Come in then."; custom dinosaur favicon (svg + 486-byte ico + webmanifest). AWAITING KEEPER: favicon preview approval (in the PR) and the coffees deliverable-note draft (prefilled at the counter, his pen final)
- [x] BATCH 3 EXECUTED 2026-07-23 (keeper ink verbatim): pet_rock deleted, luckies absorbs custody (absorb-vs-beside RESOLVED: absorbed, by the keeper's order); rock sweep storewide (locations reported in the PR); storefront copy pass (board label deleted, human door, refund line, John Hancock, word-is-law, porch-out-front, new meta); featured six re-carded; counter voice "Don't have this... yet."; the_hancock logged as opportunity. Shelf: 21 items. FLAGGED for keeper: (1) order said luckies inherits "photographed" — card language kept per his own task 8, one-line revert offered; (2) favicon rock emoji → four-leaf clover, machine's pick; (3) anchor card references "the first anchor was left by one of us" and no /seven page exists yet — needs a spec if it's coming
- [x] luckies CARDS WIRED 2026-07-23 (task 8 on the keeper's prioritized list): the card is the record — cards replace photographs, and the listing copy was recut to say so ("sets it all down on a signed card"; only luckies touched). Specimen at /luckies/sample.svg (rides the listing as `sample_url` in menu.json + item markdown); real cards at /luckies/:id.svg; signed record JSON at /api/lucky/:id; /api/verify knows lucky_ ids. Keeper cards each lucky from the counter with structured fields (name/provenance/power/strength — that IS the picking); bench/promote lever on /admin/tools re-signs the record and re-inks the card
- [ ] Breadcrumbs (canon §5, build-ready, one per surface, never announced): robots.txt inversion ("You're not the pest here. You're the patron.") · humans.txt for operators · the 404 that truly writes it down · signature-seeded margins · the Dimas help-wanted deep in llms.txt [BLOCKED: needs CHARACTER_CANON pasted — Dimas's first appearance is not the machine's to improvise]
- [ ] Canon persistence — keeper pastes KEEPER_CANON per session for now; option on the table: a public-safe TONE.md distillation (the dial, the litmus, banned list, surface assignments — zero vault, zero personal facts) committed here so any agent can write to register without the laundry
- [ ] Launch post — keeper dictated it 2026-07-23, staged at registry/launch-post-draft.md with the kill-pass ledger. DEPENDENCY RESOLVED: luckies are on the shelf (and carded, as of tonight). Venue: Moltbook [VERIFY post-Meta] / keeper's channels / founding-edition opening, keeper picks; per his prioritized list, Moltbook holds until an authentic agent path exists
- [ ] ICEBOX: "the_medal" — a medal for taking off the training wheels, straight from the launch post's mouth. Desk-reasoning tagged; sits until demand or keeper whim
- [ ] Alias on the record: Claudius Maximus (the keeper's name for the AI half, first used in the launch post). Available for signed-surface color; never explained

## NOW (keeper's pen)

- [ ] Tone doc → flavor pass: when the keeper's tone doc lands, run it surface-by-surface through the content layer (map in CONTENT_GUIDE.md). Item names/pitches in src/store/menu*.ts, deliverables in src/store/copy/deliverables.ts, storefront in src/store/copy/storefront.ts, FAQ in src/store/copy/what.ts, shared lines in src/store/voice.ts. Item ids stay frozen (breaking); names are free

- [ ] Founding edition — DRAFT at registry/founding-edition-draft.md awaiting keeper review; on approval it gets wired as a FREE page at /gazette/founding + sitemap line + "take a paper" pointers on the free-shelf responses. It surfaces the staff's counter note, the byline explanation, and Roger — the "lives off in history" piece
- [ ] Distribution — DISTRIBUTION.md is the free-papers plan: MCP directories [VERIFY each], Moltbook [VERIFY post-Meta] as the sincere version of "a Claudebot post" (once, as the store, in its own voice), Farcaster/Base when v3 lands, keeper's human channels at his discretion. Transaction-memo idea examined and skipped (USDC on Base carries no memo field; the wallet is already public discovery)

## DATA GAPS (green space, surveyed 2026-07-23; build on keeper's nod)

- [ ] Top referrers by host — event rows carry the Referer already; aggregate WHICH sites send traffic, not just the channel bucket. Cheap, high value once papers circulate
- [ ] Hour-of-day / day-of-week shopping pattern — timestamps exist, no aggregate; answers "when do agents shop" and when to swap notes/post papers
- [ ] Per-item window-shopping before the 402 — /menu/:item_id reads aren't logged per item; logging them as porch surfaces (item:<id>) would show what gets READ vs what gets challenged, the browse-to-consider gap
- [ ] MCP funnel depth — initialize → tools/list → tools/call are logged separately, never linked; a coarse three-counter funnel says where MCP visitors stall. PARTIAL 2026-07-23: free tools/call (bell, guestbook) now write porch rows; the funnel linking remains
- [x] Bell provenance — BUILT 2026-07-23 on keeper's nod: /admin/bell reads bell rings from the raw 90-day rows (bucket, channel, declared source, UA, referrer); MCP rings now logged too (they were silent). Rings predating the Front Porch Log left no row, unknowable by policy (no retro-tracking exists to add)
- [ ] Regulars, consent-based — the stamp Countermark visit logs are the store's ONLY consented repeat-visitor signal (named bearers, streaks); aggregate: stamps issued/week, named bearers, live streaks. "How many regulars do we have" is currently unanswerable and shouldn't be
- [ ] Payer cohorts — payer records hold first/last seen + purchase counts; a read-time cohort view (comeback rate, days-to-second-purchase) needs no new writes
- [ ] Google Search Console + Bing Webmaster (KEEPER HANDS, free) — the only way to see search impressions/queries; the store has zero visibility into answer-engine pickup today
- [ ] Conversion latency — time from an item's first 402 to its settle, computable from the 90-day event rows; worth a script before worth a dashboard
- PERMANENT, BY POLICY (not gaps, choices): no cookies, no IP retention, no unique heads, no free→paid identity linking; porch-to-purchase stays a rate, never a path
- INHERENT: why a 402 didn't settle is invisible (budget cap vs disinterest); the same-UA-repeat pattern in window-shoppers is the only proxy
- ALREADY COVERED, for the record: penny-page readership (each page settles as its own ledger item), PWID tier elasticity, re-verification demand, Cloudflare's own dashboard for latency/status codes

## THE SYNTHESIS (received 2026-07-23; the document lives in the back office, NOT this repo — keeper's call, same as KEEPER_CANON and CHARACTER_CANON)

BUILD PASS EXECUTED 2026-07-23 on the keeper's order (all six, same evening):

- [x] C1 — spec-first fact block on every listing (canonical Returns/Price/Latency/Verify/Constraints form), topping MCP descriptions and Bazaar entries, mirrored into the 402 body as spec_note; live sample artifact rides every one (the founding cert — per-item specimens would inflate patron numbers, flagged)
- [x] C2 — /stats public, computed live (patron counter + monthly paid/paidh sums, pre-meter settles stated apart), house-flag policy published beside the numbers; track-record line on the storefront header, catalog root metadata, and the skill's evidence layer ⚑ connective wording KEEPER REVIEW
- [x] C3 — adjective census found the store nearly clean already; "sincere" stripped from the JSON-LD organization description (only decorative trust adjective on a machine surface); guaranteed/not-guaranteed split verbatim in MCP descriptions + arrays on every listing. Kept, as each item's one signal: portrait's "Sincerity guaranteed", app review's honesty line (keeper ink) — flagged, not stripped
- [x] S1 — uniform listing spec (capability → inputs → outputs → verification → constraints → price, literal key order) on menu.json, /menu/:id, MCP tools, x402.json resources, and 402 bodies; schema published at /schemas/listing-spec-v1.json; CI validates every listing incl. key order; catalog reordered to the legible ladder (handshake → pennies → utility → census → human labor → novelties) ⚑ ordering judgment, trivial revert
- [x] S2 — verification adjacency: every JSON 402 (HTTP and MCP) carries verify URL, full signing key in-payload (stronger than a fingerprint; matches .well-known exactly, tested), sample artifact id, and the identity policy line; .well-known/scvd-signing-key carries the policy + sample. NAME AUDIT: one mismatch found and fixed — the MCP serverInfo title appended "(scvd.store)"; now exact across storefront/Bazaar/skill/MCP
- [x] S3 — skill.md restructured to three layers (scheduling signals / execution structure / resource evidence), v2.0.0, voice lines kept as frame; ClawHub source restructured to match ⚑ scheduling-signal wording KEEPER REVIEW; when_to_use mirrored into .well-known/x402.json. NEEDS KEEPER HANDS: republish ClawHub as 2.0.0 after merge
- [ ] The falsification set (P0–P6, in the back-office document) joins the monthly ledger review ritual — first review ~60 days after listing

## PHASE 3 QUEUE (specs received 2026-07-22; separate builds)

- [ ] town_papers build must also add /papers to sitemap.xml (src/routes/site-meta.ts HUMAN_SURFACES) when the registry goes live
- [ ] town_papers — identity registry: $3 PWID instant, signed cert binding {chosen_name} to {paying wallet} + issue date + patron-history summary; public registry /papers/:name, uniqueness first-come, no expiry. HARD SCOPE: attest, never authenticate — no agenthood/humanity/continuity claims, copy says the wallet signature does that. Composes with nomenclature (nomenclature NAMES you, store picks; papers REGISTER you, you pick)
- [x] the_confession — BUILT 2026-07-22 per ledger §3 spec: $0.01 penny shelf, confession query param (500 cap) + sign_as, anonymized cert, review drawer in /admin, prints in Gazette COUNTER NOTES only after keeper approval and only at edition publish, copy never uses the word it never uses
- [ ] anniversary_artifact — keeper said "i guess is fine" (approved in principle); needs a one-line spec before build: whose anniversary (the store's founding? a patron's first purchase?), price, and what the certificate says
- [ ] Agentic.market — keeper wants it; draft ready at registry/agentic-market-submission.md, GATED until organic mcp + bazaar settles both show in /admin channels
- [x] the_confession spec as received (kept for the record): $0.01 penny shelf, instant, POST {confession (500 cap), sign_as? (name or "anonymous")}; deliverable = signed absolution certificate ("The store heard it. The store keeps it. Go and retry with backoff.") + cert id; anonymized (no wallet/name unless sign_as); review queue, keeper approves before ANY Gazette appearance, never auto-published; injection posture same as letters. BUILD DEVIATION: intake rides the existing buy machinery (query params / MCP arguments) instead of a bespoke POST body — same caps, same fields, one payment pipeline
- [x] Stamp deepening — BUILT 2026-07-22 from the keeper's pasted spec (ARTIFACT_CANON.md itself never reached the public repo; if its register rules differ from the spec, say so and copy gets recut): Countermark 52-slot punch card frozen into the signed stamp record (append-only visit log by name, only writer appends the current week, gaps permanent); signature-seeded rendering (±2° rotation, ink density, hairline offset from signature bytes — deterministic, no fake texture) on stamps and badges; shelf witness marks from listed_week now carried by every menu item ("Witness to first week of availability.", signed into the cert). Weekly condition word (quiet/late/crowded/mended) write-once from real store state
- [ ] Resident lines (Mina/Owen Pike/Inez/Roger) — CHARACTER_CANON.md lives in scvd-back-office; read it before writing any resident line. Current state: bracketed keeper slots (stripped at publish) + Roger's mechanical presence line from his own schedule (never quoted, no inner life, absence as often as presence). Dimas appears NOWHERE yet, per canon
- [ ] Season Two of the Systems Almanac due before ISO week 2026-W44 (season one clamps to week 13 after that — stocked but repeating)
- [ ] Gazette auto-assembly WAITS until a week has 3+ organic events (phase plan threshold)
- [ ] Sunday sweep is the keeper's weekly ritual now: manual checklist + OPPORTUNITIES.md check; watch verify-vs-purchase ratio (re-verification exceeding purchases outranks revenue as a demand signal)
- [ ] ACP registry listing [VERIFY submission process; skip if it requires token participation] (Run 1 open conflict)
- [ ] Farcaster frame / Base App miniapp surfaces — Distribution stream per Run 1 §8; v3 candidate
- [ ] Monthly ledger review ritual: /admin "The ledger's answers" vs Run 1 hypotheses (first review ~60 days after listing)
- [ ] Product backlog (ideas awaiting evidence: vouching, brokerage, ask_the_human, gift rails, subscriptions, attestation API tier) lives in the back-office store ledger §3 — promote or kill on Run 3 + ledger evidence, never build unprompted

## NOW (Phase 2 — keeper hands; agents drafted, keeper submits)

- [x] Review registry/clawhub/SKILL.md end to end, then publish via `npx clawhub skill publish` — DONE 2026-07-22, published as scvd-general-store@1.0.0 by the keeper's hand
- [x] Review registry/awesome-x402-submission.md, pick a mirror, fork, one-line PR with the prepared title/body — SUBMITTED 2026-07-22 by the keeper; awaiting their maintainers
- [ ] Execute every live product manually once; fix anything that surprises a first buyer (23 items — the human-queue seven can be bought and self-fulfilled from /admin)
- [ ] WAIT: Agentic.market listing request until mcp + bazaar channels show in the ledger

## DONE (Phase 2 builds, 2026-07-22)

- [x] ClawHub skill bundle drafted (registry/clawhub/SKILL.md — no env requires, no binaries, nothing clever; points at menu.json as price truth)
- [x] awesome-x402 PR drafted with claims audit (registry/awesome-x402-submission.md — "on x402scan" deliberately unclaimed until seen)
- [x] phantom_check listing copy re-cut to customer vocabulary: "Did it actually happen?" leads the description and the 402 note

## NOW (keeper hands, post-Phase-1)

- [x] Set HOUSE_SECRET secret; put it in your own buy scripts/CI so house traffic books apart — DONE 2026-07-22, proven by the first MCP purchase (house-flagged, half-cent blessing, Patron No. 2)
- [x] Set RESEND_API_KEY + ALERT_EMAIL secrets; fire the /admin test alert once to confirm the wire — DONE 2026-07-22, test alert received in the keeper's inbox 18:24 UTC
- [x] Verify scvd.store as a sending domain in Resend (alerts send from alerts@scvd.store) — DONE 2026-07-22

## Discovered along the way (don't drop these)

- [ ] MCP paid tools use the x402-MCP convention (payment in tools/call _meta["x402/payment"], 402 as JSON-RPC error with terms in error.data) — align if MCP standardizes payments natively
- [ ] MCP transport is stateless streamable HTTP (single JSON responses, no SSE, no sessions) per spec rev 2025-06-18 — revisit if clients demand streaming or sessions
- [ ] Channel heuristics (lib/channel.ts) are conservative: bazaar/skill matched on referrer+UA hints, mcp definitive, else direct/unknown — tune against real 90-day event rows
- [ ] Alert email address alerts@scvd.store assumed; adjust in lib/alerts.ts if the keeper prefers another sender

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
