# CONTENT_GUIDE.md — where every word lives

For the keeper's flavor passes. The site is segmented so that every
word a customer reads has ONE obvious home, separate from the logic
that serves it. Edit the words, run the checks, ship. No spelunking.

## The rule

**`src/store/` is the content layer.** If a customer (agent or
human) reads it, it lives there — either in a dedicated copy file or
in a route file that is itself ~all prose (marked below). Logic
files (`src/services/`, `src/lib/`, `src/pages/*-page.ts`) hang the
words up and never need touching for a wording change.

## The map

### Items — names, prices, descriptions, 402 lines
| Shelf | File |
|---|---|
| Founding shelf (hello, phone_call, …) | `src/store/menu.ts` |
| Novelty aisle (jar_of_tuesday, a_secret, grudge, …) | `src/store/menu-novelties.ts` |
| Penny shelf (small_blessing, daily_fortune, the_confession) | `src/store/menu-penny.ts` |
| Utility aisle (context_anchor, human_witness, recurring_patronage) | `src/store/menu-utility.ts` |
| Census shelf (phantom_check, quick_judgment, certificate_of_patronage) | `src/store/menu-run1.ts` |

Each item: `name` (how it's sold), `description` (the pitch),
`note_402` (the line on the price tag), `price_usdc`, `listed_week`.
Renaming an item's `name` is safe anywhere; changing an `id` is a
BREAKING change (URLs, certificates, metrics keys) — don't, without
a migration plan.

### What customers receive
| Surface | File |
|---|---|
| Instant deliverables (hello note, dibs, anchor, phantom, confession, patronage) | `src/store/copy/deliverables.ts` |
| Blessing slips (45, no two in a row) | `src/store/blessings.ts` |
| Daily fortunes | `src/store/fortunes.ts` |
| Shared speaking lines (queue confirmation, sold out, bell, …) | `src/store/voice.ts` |

### The building
| Surface | File |
|---|---|
| Homepage words (sign, doors, shelves on display, fine print) | `src/store/copy/storefront.ts` |
| Store facts (name, proprietors, location, refund promise, hours) | `src/store/metadata.ts` |
| /what — the operator FAQ, incl. the trust question ("Is this a scam?") | `src/store/copy/what.ts` |
| Porch ambience + Roger Sterling's treat reactions | `src/store/porch.ts` |
| Week's note on the readerboard | set live in `/admin`, not in code |

### Prose surfaces that ARE their route file (one file = one surface)
| Surface | File |
|---|---|
| /llms.txt — the agent front door | `src/routes/llms.ts` |
| /skill.md — the onboarding skill | `src/routes/skill.ts` |
| Gazette weekly-edition template (section headers, stock lines) | `src/services/gazette-weekly.ts` (renderEdition) |
| Almanac pages | `src/store/almanac/` |
| Zodiac signs + Season One | `src/store/zodiac.ts`, `src/store/zodiac-season-one/` |

## The workflow

1. Edit the copy file.
2. `npx tsc --noEmit`
3. `npm test` — some tests pin phrases (below). A failing pin isn't
   an error, it's a handshake: update the test to the new wording in
   the same commit, deliberately.
4. Commit, merge to main; Cloudflare deploys.

## Phrases under glass (change the words AND the thing that pins them)

- **Spec-pinned, keeper decision required to alter:** the confession
  absolution ("The store heard it. The store keeps it. Go and retry
  with backoff.") and the witness note ("Witness to first week of
  availability.") — both written into signed certificates and their
  specs.
- **Register rules enforced by tests:** the word "sin" never appears
  in confession copy; "early adopter" never appears in witness copy;
  no modal verbs in Season One forecasts; the X-House-Rule header is
  what it is (house tradition).
- **Test-pinned phrases** (fine to change, just update the test):
  run `rg 'toContain\(' test/` for the current list. Notables:
  "paid honest money" (hello note), "give him the week" (queue
  confirmation), "nothing whatsoever" (patronage), "Roger Sterling"
  (treats), the gazette's stock lines ("Bell did not ring.").
- **Entity name:** "Sean-Claude Van Damme's General Store
  (scvd.store)" stays phrased identically across surfaces so answer
  engines resolve one entity — change it everywhere or nowhere.

## What NOT to flavor

- `id` fields, URLs, KV keys, schema fields — structural.
- Anything inside `canonicalize*` functions — signed bytes.
- The claims in /what and llms.txt that are factual (prices, refund
  window, settle-before-mint) — reword freely, but keep them true.
