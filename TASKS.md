# TASKS.md — Master Task List

Anti-shuffle file. When you ship something, move it to DONE with a date. Never delete ideas — ICEBOX with a reason.

## NOW

- [ ] DEPLOY.md checklist executed (Cloudflare: KV namespaces, secrets, repo connect, domain)
- [ ] Supervised $0.50 hello purchase from separate funded wallet = smoke test + Bazaar listing + Patron #0000

## NEXT (Prompt B: v2 shelves)

- [x] /skill.md (agentskills.io format) · verified_identity fields · Almanac ($0.01 journal pages) · Town Directory · novelty items (jar_of_tuesday, a_secret, grudge, smoker_blessing, retired_word + /retired-words, the_drawer, dibs) · weekly visit stamps · Trading Post + Gazette (tips reviewed, never auto-published) — DONE 2026-07-22

## THEN (Prompt C: discovery + hardening)

- [ ] Bazaar v2 extensions.bazaar metadata per buy route [VERIFY] · Penny Shelf (small_blessing $0.005, daily_fortune

## Discovered along the way (don't drop these)

- [ ] Almanac brisket page is a sensory-journal placeholder by design — keeper to replace with the real entry after the next cook (src/store/almanac/field-notes-brisket-july-2026.ts)
- [ ] Gazette paid route is a wildcard (`GET /gazette/*`) because issues publish at runtime; the 402 `resource` field is generic rather than per-issue. Fine for v0.2; per-issue route registration (rebuild stack on publish, or Durable Object route table) is the cleaner fix if strict clients complain
- [ ] verified_identity is stored-as-claimed + `identity_verified: false` everywhere; an actual verification dance (signed challenge against the claimed profile) is a v0.3 idea
- [ ] Contributor stamps mint on Gazette publish, keyed to contributor_name only — no delivery channel back to the contributor yet; they'd have to find their stamp id in the issue credits (issue JSON has stamp_ids). Consider a claim endpoint
- [ ] Tips share the ORDERS namespace (prefix `tip:`); fine at general-store volume, but listTips does a full list per admin view — paginate if the jar ever fills
- [ ] Directory listings live in src/store/directory.json (deploy to update). If the keeper wants to edit without deploying, move to KV + admin form
- [ ] /api/stamp issues freely (unique id each time); if stamp-farming ever matters, add the bell's one-per-day pattern

## DONE

- 2026-07-22 · Prompt B v2 shelves shipped: /skill.md, verified_identity on guestbook/request/tips, Keeper's Almanac (3 seed pages, penny x402), Town Directory + suggest_listing, 7 novelty items incl. dibs (instant) + /retired-words registry, weekly signed visit stamps (/api/stamp, verify at /api/verify), Trading Post (/api/tip, human review queue, counter-sign disclosure) + Gazette plumbing (free index, penny issues, contributor credits + contributor stamps). 48 tests green.
