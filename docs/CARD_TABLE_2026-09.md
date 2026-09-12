# THE PAYWALL — collectible trading cards for agents, 2026-09-12

**Status: BUILT on a branch, NOT MERGED, waiting on the rulings in
§6.** Three passes on one day. The overnight prototype (§A, kept
below as history) was a 24-card "card table"; the keeper's
**handoff v2** merged it with a first-pass plan and said the handoff
wins where the two disagree, and the first pass wins where the
handoff is silent; the **first-pass plan** ("Paywall, Season 1:
Summer of 402") then arrived in full and this third pass reconciled
the build to it. Every number that was an assumption in the second
pass is now the plan's number, and the few places the plan and the
building disagree are named in §0 and ruled on in §6.

Same split as every paper here, so advice never blurs into shipped
work:

- **STANDING** — true of the branch today, held by test.
- **PROPOSED** — argued for here, not built.
- **OPEN** — a keeper ruling. The ones that gate the merge are in §6
  and mirrored on `KEEPER_LIST.md`.

Demand tag (rule 19): **the keeper's ask, 2026-09-12** — desk
reasoning, named as desk reasoning.

---

## 0. The short version (first pass, as built)

1. **The set (STANDING).** Season One, *Summer of 402 · Oak City*:
   60 cards in the count: the first pass's 52 with its own names,
   plus the eight of the keeper's second reading (§0b) — Herd 13
   (T-Rex to Elephant Anchor, and Roger Sterling), Room 11 (Keeper, CV, Bellringer,
   Bellringer II, Tagger, Bounty Hunter, Regular, Fortune of the Day,
   Blessing from the Jar, Guestbook, The Tab), Instrument 8, Rail 11
   (Base 5, Solana 3, Polygon 3), Door 4 (#0001, #0007, #0017,
   #0410), Condition 5 (Stale Passport, Broken Tier, 410 Gone, Double
   Charge, Testnet Catch), Place 1 (Hurricane Junction), Mark 2 (The
   Dinosaur, 402 Payment Required), Model 5 — plus 4 Events (First Organic Settlement, First Solana
   Settlement, The Loaner, Twenty-Three; dropped by hand, never
   pulled) and 1 Ally (The Neighbour: anonymized at the keeper's word,
   no likeness and no name, so no consent to ask for, and in the rare
   pool like any pack drop). The Keeper
   and CV are the season's two one-of-ones: Rooms at rarity Keeper,
   one print each, the window only, and the cap holds on the hand
   press too. Ladder
   Common / Uncommon / Rare / Holo / Keeper. Every card cites a path
   on this store; a test walks every cite. `src/store/cards.ts`.
   Three plan rows did not survive contact with the building and are
   named: *Gas Was Nothing* (the plan's 53rd) is cut to keep the
   count at 52; the plan's *Node 21* Place is cut for the same
   reason (Oak City is the subtitle, Hurricane Junction the one
   Place); and *Door #0017 "the store's own row"* is a real degraded
   door instead, because the store cannot probe itself and a card
   whose cap is its observation count would never press.
2. **How each card is obtained (STANDING), the plan's rule.** Herd,
   Rail, Door and Place cards come out of packs. Rooms and
   Instruments are EARNED by the action and never pulled: the bell
   presses Bellringer, the guestbook Guestbook, a bounty claim
   Bounty Hunter, the pass Regular, the train Tagger, a fortune
   Fortune of the Day, a blessing Blessing from the Jar, and each
   instrument its own card on purchase (`EARNED_BY_ITEM`). A plain
   purchase presses nothing. Conditions come out of slot 5 (2%) or
   the window, and burn on the fix. Events by hand from
   `/admin/tools`.
3. **The odds (STANDING), the plan's table verbatim as wheels.**
   Slots 1–3 common; slot 4 uncommon 80 / rare 18 / holo 2; slot 5
   uncommon 60 / rare 30 / holo 8 / condition 2. The fractions on
   `/design` are counted from the arrays. The Keeper, Rooms,
   Instruments and Events are on no wheel; a test holds it.
4. **The draw (STANDING).** Commit-reveal, daily, per handoff §4,
   with the derived-seed refinement of §2. Every pull is
   HMAC-SHA256(seed_d, payer || cert_id || slot); the pack manifest
   binds the commit, the inputs and the five card ids and is signed.
   Print caps step within the tier; a capped tier falls back to
   common. Idempotency-Key returns the same pack; none charges again.
5. **Print caps (STANDING), the plan's rule 3.** A Door's cap is its
   observation count — the rounds the corpus actually probed that
   host, read once a day — and the count prints on the face beside
   the door hash. 402 the Chicken caps at one. The Keeper and three
   Events cap at one; Twenty-Three at 23. Nothing else caps.
6. **The faces (STANDING).** Card face 1000×1400 as SVG and, since
   the keeper's "just pick one that looks nice" (2026-09-12), as PNG
   too at `/p/{card_id}.face.png` (`?w=` scales it): resvg compiled
   to WebAssembly inside the Worker with one font, IBM Plex Serif
   under the OFL, regular and bold, every family on the face
   resolving to it; the paper grain is left off the PNG (it costs
   the rasterizer a second of CPU and a browser nothing); each face
   renders once and is kept in KV; the Worker's CPU ceiling moved
   100 → 1000 ms for that one path, reason beside it in
   wrangler.jsonc (§5). Share sheet 1200×675 as PNG, `/p/{card_id}`
   with OG tags, a real QR on the machine strip. The plates: 46 drawings, and every
   renamed key of the third pass is aliased to the drawing of the
   thing it depicts (`src/store/plates.ts`), and the cat and the
   five models have drawings of their own, so 46 of the 60 press
   with a plate; the eleven Herd animals besides the T-Rex and the
   cat, the jar, the Tab and the Ally press as labelled silhouettes.
   The two one-of-ones wear their own metal (the keeper's gold, CV's
   clay): a sunburst behind the plate, a second frame with corner
   diamonds, the plate and the name in the metal, a 1 / 1 seal with
   the season, and a signed line. Every card page, the binder and
   the window carry a post button — X's post intent with the set's
   own line and the page URL, no script, no key — and every pressing
   in a purchase response carries `post_url` and `post_text`.
7. **The economy (STANDING), the plan's numbers.** `pack` $0.99 (P;
   ⚑ his), the bell one common a day to whoever rings and, with a
   current pass id, two packs at full odds for a Regular;
   `window_pick` $0.49 (half of P) takes one of the last five
   PRESSINGS pulled from packs, the seed chooses, and the card MOVES
   from the binder that pulled it to the picker's, re-signed with
   one more transfer — one pick per wallet per twelve hours, refused
   above the settle line so it costs nothing, and yes, it may be
   somebody else's Stale Passport. The credit economy: 20 commons or
   5 uncommons burn into one pack of credit behind a signed EIP-191
   challenge (`POST /api/paywall/challenge`, `/burn`, `/redeem`);
   rares never burn; credit buys a pack or a pick and never an
   instrument, a specific card, or cash. Conditions clear on the
   purchase the rule names (Stale Passport on a passport refresh, 410
   Gone on a service audit, Testnet Catch on a settlement
   attestation, Double Charge on any purchase with an idempotency
   key, Broken Tier on a passport refresh or a trust profile, the
   two purchases that read a door the wallet named); each burn is a
   signed record beside the pressing. Three or more Conditions and
   the binder is "under the weather". The one-of-one's perk: the
   wallet a Keeper or CV lands with gets one pack of credit, once.
   The streak
   (STANDING, 2026-09-12): keyed on the wallet the ringer sends, a
   wallet's first ring earns the Bellringer Room, every ring after
   hands a common, day 7 and every seventh day a pack at full odds,
   day 30 Bellringer II, a gap resets, nothing twice in one day; the
   bell answers with `streak` {days, next_pack_on_day, pack?,
   bellringer_ii?}.
8. **Not built, and why (§4):** holder
   perks (the plan's discounts collide with the pricing charter's
   one-price clause — a ruling, §6), Broken Tier's clear and the
   three reserved Conditions (they need a passport read the wallet
   named, which no purchase carries yet), missions beyond the bell,
   the PNG card face (§5), the boot-on-hover motion on /design, and
   NFTs (§7).

---

## A. The overnight prototype (history, superseded by the handoff)

1. **What shipped (STANDING).** One shelf item, `card_pack`, $0.99,
   instant, in the novelty aisle beside the luckies. Five cards a
   pack from a 24-card Season One set called *Oak City*: every card
   is a thing that is actually on this store — a door, an
   instrument, a place, a hand — with the path where it lives
   printed on it. Three slots are always common; the fourth and
   fifth run a weighted wheel. Odds are DERIVED from the wheel
   arrays and printed on `/cards` as fractions with denominators.
   The draw is FNV-1a over the certificate id, the luckies' trick,
   so it is random per purchase and recomputable by anyone holding
   the certificate. Every card is a signed record with its own page
   (`/cards/{id}`, unfurls on X with a 1200x630 PNG), its own SVG,
   its own verify URL; the pack is a signed manifest. A binder per
   paying wallet lists the pull. Room, JSON twin, openapi doors,
   feature row, llms.txt, MCP cluster, maker's mark HOUSE.
2. **What the Pocket model is, and which parts we kept.** Pokémon
   TCG Pocket sells booster packs of five cards drawn per slot on
   published pull rates, in expansions ("seasons"), with card
   rarities marked by pips, a per-player collection, wonder pick,
   trading with tokens, and two free packs a day on an hourglass
   timer. We kept: five a pack, per-slot published rates, rarity
   pips, seasons as sets, a collection view. We did NOT build:
   timers, free daily packs, wonder pick, trading, flair, or any
   market. §2 says why each one was left.
3. **The rulings (OPEN).** Rule 22 (is a paid booster pack
   gacha psychology or honest randomness with custody — the paper
   argues the second, on the luckies' precedent, given the shape
   §2 describes). Rule 41 (loot-box exposure: paid random draws are
   regulated in several jurisdictions; the mitigations built in are
   listed in §5 and the residual is stated). Rule 7 (every name and
   line in the set, the shelf copy, and the storefront line are
   drafted, not inked).
4. **What comes next if he says yes (PROPOSED, §4):** seasons on a
   cadence with real numbered runs; rarity derived from the corpus
   for the defect-vocabulary season; a Little Wheels crossover set;
   trades as a signed transfer of custody between wallets.

---

## 0b. The second reading (2026-09-12, the keeper's notes on the build)

"The keeper card needs more pizzazz; we need a CV card too, one of
one each season; a Roger Sterling card, pretty rare; more lore;
tighten the crypto cards and an x402 reference; a few frontier
models and dumb models goofing, the dumb ones super common; tie the
collection view to the wallet; a tweet button on everything." Built
as read, all STANDING:

- **CV** (No. 53), the co-founder and shopkeeper of the founding
  gazette, the other half of the byline: Room, rarity Keeper, one
  print, the window only. The rule now reads: each season has one
  Keeper and one CV, one of one each.
- **Roger Sterling** (No. 54), the house cat off the porch's treat
  rail: Herd, rare, with his own plate.
- **402 Payment Required** (No. 55): Mark, uncommon, the x402
  reference; it cites the practice counter.
- **Models** (No. 56–60), a new type, the agents that shop here as
  the store has met them and never a product name: The Reasoner
  (rare) and Long Context (uncommon) for the frontier; Autocomplete,
  Hallucinated a Door and Temperature 2.0 for the goofing, all
  common and all pack drops, so slots 1–3 hand them out freely.
- **The Rails tightened**: each line now states a fact the store can
  cite (twenty of twenty-three on Base, three on Solana, zero on
  Polygon, the facilitator's job, the minute a Solana authorization
  lives).
- **The collection view**: `/binder/{wallet}` lays out the whole
  set with the wallet's held cards lit and the rest saying how they
  are obtained, `held of 60` in the heading, a lookup form on
  `/design` (`GET /binder?wallet=…` redirects), and `collection`
  {held, of, missing, page_url, post_url} on the binder JSON.
- **The post button** on every card page, the binder and the window;
  `post_url` on every pressing everywhere it rides.
- The count moves 52 → 60, which was the plan's own alternative;
  *Gas Was Nothing* and *Node 21* stay cut (§6).

## 1. What changed, pass by pass

Prototype → handoff v2: 24 → 52 (+4 Events, +1 Ally); Legendary →
Holo, Keeper added; Tradition → Room, and Rail, Door, Condition,
Event, Ally added; the polygon sigils replaced by the plate system;
the economy; the subtitle. Handoff → first pass (this pass): every
card renamed to the plan's names and lines; Rooms and Instruments
moved from pack drops to earned-only; the plain-purchase common
removed; the Keeper moved from Ally to Room and the Ally became
an anonymous Neighbour; Doors from three capped at an assumed 250 to
four capped at their observation count; the window from "a fresh
pressing off one of five packs" to "one of five pressings, moved";
the twelve-hour pick lock; the credit desk with burn and redeem;
Condition clears; the Regular's two packs off the bell; the Bounty
Hunter hook on a paid claim; the specimen and `/design` copy
rewritten to the plan's rules that do not move.

## 2. Randomisation an agent can check (STANDING, one refinement)

The handoff's §4, step by step, and where this build differs:

| handoff | built |
| --- | --- |
| generate a 32-byte seed_d at 00:00 UTC | DERIVE seed_d = HMAC(HMAC(signing secret, "paywall:master"), "paywall:seed:" + date). No generation, no storage race, no cron the pulls wait on; the store could not choose a seed after seeing pulls even if it wanted to. |
| publish commit_d at /api/paywall/seed/{date}, signed | as specified; the half-hourly cron writes the signed record at the first tick after midnight, a first pull writes it too, and the record's published_at is the dated evidence |
| draw = HMAC-SHA256(seed_d, payer_wallet ‖ cert_id ‖ slot_index) | as specified, `drawSlot` in `src/services/cards.ts`; bytes 0..3 over 2^32 walk the wheel, bytes 4..7 mod tier size pick the card |
| caps: step to the next index in the tier; capped tier → common | as specified |
| publish seed_d the next day; recompute every pull | as specified; `revealed: true` on the door once the UTC day has ended |
| pack cert binds commit_d, inputs, card ids in its evidence hash | the PACK MANIFEST (signed) binds them and names the cert; the cert is minted before the draw because the draw takes cert_id as input, so the binding is one level up, not inside the cert's own hash |
| Idempotency-Key required; same key same pack | the store's existing mechanism (16–128 chars); a repeat with the same key returns the original; no key charges again |
| bell: same HMAC, slot 0, salt "bell" | as specified, keyed by who rang and the day |
| window picks: same seed, the 5 window ids as input | as specified, salt "window" |

The doctrine sentence on /design and in the guide: *Signed at issue.
Drawn by a seed you can check. Printed once.*

## 3. Share formats (STANDING)

| asset | size | how |
| --- | --- | --- |
| card face | 1000×1400 SVG at `/p/{id}.svg` | four layers, rarity stock, real QR strip; the page and the binder show it |
| share sheet | 1200×675 PNG at `/p/{id}.png` | the pixel engine with a second ink; every unfurl on the store comes off one desk |
| page | `/p/{id}` | OG and twitter tags point at the share sheet; JSON by Accept |

The face is SVG rather than the handoff's static PNG: the store runs
on Workers with no browser and no font rasteriser, and a PNG face
with a serif display needs one (§5). The share sheet is PNG because
the pixel engine already draws the engraved hand.

## 4. Not built, each with its reason (OPEN or PROPOSED)

- **Holder perks, the half that is a price.** The plan's 5% off with
  a Rail holo is a price that depends on who is buying, and the
  pricing charter says one price to every buyer. OPEN, §6. The half
  that is not a price is built (2026-09-12): the wallet a Keeper or
  CV lands with gets one pack of credit, once per pressing, to spend
  on a pack or the window (the plan's "free window pick"); a Door
  card's preflight is free already.
- **The reserved Conditions** (Indeterminate, Rate Limited, Unclaimed
  Bounty) drop in as the season runs; not in the count, not pressable
  yet. Broken Tier's clear is built: a passport read of a door the
  wallet named, which the refresh and the trust profile both are.
- **Missions beyond the bell streak; promotions UI.** The plan's own
  "not in first build".
- **`/design` motion.** Static; the "boots" data layer on hover is a
  script, and rule 17's property test applies. PROPOSED.

## 5. The face as PNG (STANDING, 2026-09-12)

Ruled and built the same afternoon: "do we even need two? just
pick one that looks nice." The Worker has no browser and no fonts,
so the rasterizer ships inside it — `@resvg/resvg-wasm` (2 MB of
WebAssembly) and one font, IBM Plex Serif, regular, bold and
italic, under the SIL Open Font License (`assets/fonts/`, licence
beside the files). Every family the SVG names resolves to Plex Serif
in the PNG; the SVG keeps its own stack where a browser has the
fonts. The paper-grain filter stays off the PNG: measured at
1000×1400, 1,382 ms of CPU with it and 233 ms without, against a
Worker ceiling that was 100 ms. The ceiling is now 1,000 ms for
that one path, stated in `wrangler.jsonc` with the reason, and each
face is rendered once and kept in KV, so the cost is paid per card,
not per view. The bundle went from 4.4 MB to 7.2 MB raw, 1.4 MB to
2.5 MB gzipped, inside the plan's limit. Nothing is fetched at
render time, nothing is billed per render, and the same bytes come
out every time. The door is `/p/{card_id}.face.png`, `?w=` scales;
every pressing carries `face_png_url`.

## 6. The rulings (OPEN), in the order the merge needs them

1. **RULED, rule 22 (2026-09-12): "the first."** Honest randomness
   with custody. The room stays paid and the shelf item stays on.
2. **RULED, rule 41 (2026-09-12): "no lawyer at all, let's just
   make it work."** Recorded as ruled. The build's own hedges stand:
   nothing cashable, nothing bought back, odds and seed public, the
   window sentence in plain words on /design.
3. **RULE — the Rail-holo discount against the pricing charter.**
   The plan's 5% off is a price that depends on who is buying; the
   charter's one-price clause is older. The perks that are not
   prices are built (the one-of-one's pack of credit; the Door
   card's preflight is free already). Amend the charter, or let the
   discount go.
4. **RULE — the cuts.** *Gas Was Nothing* and *Node 21* out to hold
   52 (now 60 with the second reading's eight, §0b); Door #0017 a
   real degraded door (tick.hugen.tokyo) instead of
   the store's own row; Door #0410 = api.m2mcent.com, which the corpus
   listed and never reached, so its cap is zero and it never presses
   until a round reaches it — honest, and the card says so. All one
   edit each.
5. **RULE — rule 15 and §7.** The Season 2 `mint_to_chain` door.
   Nothing here builds toward it; his call, and not this season's.
6. **RULED, the OpenAPI budget (2026-09-12): thinned, not raised.**
   Back at 700,000 (§B): the 304 answer is one shared component
   instead of eighty-one copies, the 402 offer is half as long on
   every paid door, the idempotency parameter's long form moved to
   /developers, the async-job prose and the purpose parameter say
   their sentence once, and the duplicate x-request-schema came off
   every paid door on "just cut one". Measured: 616,345 bytes on
   today's rails, 644,818 with every rail on, from 697,332 and
   703,235. Latency was
   never the number (about 35 ms to build, about 86 KB gzipped on
   the wire). The MCP tools/list ceiling
   stays at 152,000 with its reason; RULE if it should be thinned
   too.
7. **RULED, rule 7 (2026-09-12): "okay they look good."** Inked.
8. **DONE — the Ally anonymized.** "Idk if we can use Cairn's
   likeness like that or even want to." The Neighbour names nobody,
   cites the arrangement page, and rides the rare pool.

## 7. NFT: no, for v1 (the handoff's §6, and rule 15)

Agreed on the reasons the handoff gives — provenance is already
solved by the signature, a transferable token makes a market, and
every wallet step costs shares — and one more the handoff does not
say: rule 15 is not a season rule. The `chain_ref` door is left
unbuilt on purpose.

## 8. Build order, against the plan's first build list

| first pass, "first build" | state |
| --- | --- |
| ledger tables (pressings, binder, credit, conditions, seed) | built; streaks not (§4) |
| seed commit/reveal cron and the HMAC draw | built |
| buy_pack; ring_bell with wallet and pass (two packs for a Regular) | built |
| binder page, renderer (face, share sheet, condition variant, holo band) | built (face SVG, sheet PNG) |
| earned-card hooks: bell, guestbook, train, bounty, pass, instruments | built |
| condition burn rules | built for the four the shelf can clear; Broken Tier and the reserved three empty (§4) |
| shop window: five pressings, seed pick, twelve-hour lock, transfer | built |
| credit: burn 20/5, redeem on pack or pick, rares never | built, behind an EIP-191 challenge |
| /design; store guide + skill.md text | built, static |
| not in first build: missions, promotions UI, Events by hand | as the plan says |

Art: 46 plates drawn as single-ink silhouettes, aliased to the
plan's names; 46 of the 60 press with a plate. The eleven Herd
animals besides the T-Rex, the jar, the Tab and the Ally pressed as
silhouettes labelled "not yet pressed". The plan wanted the twelve
Herd drawn at ship; that is the one place this build is honestly
short of it.

---

## B. The OpenAPI budget (carried from the prototype)

The contract's warning budget (`SCANNER_BUDGET_BYTES`) was 700,000
with 4,544 bytes of headroom; a listing costs about 8 KB, so the
first listing tripped the guard by construction. It stands at
750,000, three quarters of the hard cap, with the reason beside the
number. Keep, lower, or thin the contract per item instead.



A card is one printing of one entry in a season's set, pulled from
a pack, signed at issue. The record (`src/types.ts`, `CardRecord`)
carries: the season, the card's number in the set, its name, tier,
kind, the one line on its face, the path it cites, the slot it came
out of, its pack, the date, the certificate, the patron number.
Nothing on a card changes after issue, so there is no status to
re-sign — the one structural difference from a lucky.

Every card **cites** a path on this store and a test walks the
cites: `test/cards.spec.ts` fetches each one and fails the build if
any stops answering. "The Bell" cites `/porch`; "The Preflight"
cites `/doors`; "Node 21" cites `/menu/bitcoin_anchor`. This is the
"relevance" half of the ask, done the store's way: a card is a
citation with a frame around it, and rule 55 (every claim ships with
a path a reader can walk) applies to a novelty exactly as it applies
to an attestation.

No photograph and no illustration of an object. The picture window
holds a **sigil**: a rosette of nested polygons whose point count,
turn and ring count come off the card's name (`sigil()` in
`src/services/card-svg.ts`), so every printing of one entry carries
the same mark and no two entries share one. Higher tiers get more
rings; the legendary tier gets the dinosaur behind it, drawn from
the favicon's own path. The rarity stamp lands by hand, seeded by
the record's signature, the same `lib/ink.ts` the luckies use.

The share image is the passport's 1200x630 engraved plaque
(`lib/pixel-card.ts`) with the card's words on it — one unfurl
renderer across the store, no new dependency, no font loaded.

## 2. What a pack is, and what it deliberately is not (STANDING)

Five cards. `SLOT_WHEELS` in `src/store/cards.ts`:

| slot | wheel | derived odds |
| --- | --- | --- |
| 1–3 | `[common]` | common 1/1 |
| 4 | 15 uncommon, 4 rare, 1 legendary of 20 | 15/20 · 4/20 · 1/20 |
| 5 | 10 common, 6 uncommon, 3 rare, 1 legendary of 20 | 10/20 · 6/20 · 3/20 · 1/20 |

Per pack, at least one legendary is 1 − (19/20 × 19/20) = 9.75%;
the page prints the derivation string beside the number. A test
draws 4,000 packs and holds the observed tier rate on slot five
within three points of the wheel, so a wheel typed one way and drawn
another shows up red.

The draw: `drawPack(certId)` hashes `${certId}:s1:slot:${n}:tier`
onto the slot's wheel and `${certId}:s1:slot:${n}:card` onto the
tier's pool. Duplicates within a pack are possible and honest.
`/api/pack/{id}` returns `draw`, the recomputation, beside the
signed cards.

**What is not here, by decision, and the reason each time:**

| Pocket has | We do not | Why |
| --- | --- | --- |
| Hourglass timer, two free packs a day | nothing | Rule 22: an engagement clock is the mechanism of variable-reward manipulation, whatever it is called. The store has no login and wants none. |
| Pity / guaranteed-rare after N packs | nothing | A hidden modifier is a second copy of the odds that the page does not print. Rule 43's discipline: one derivation, printed. |
| Limited-time packs, event windows | nothing | Rule 12: honest scarcity only. A season closes by a real cap (§4.1) or not at all; never by a clock. |
| Wonder pick (pick from a stranger's opened pack) | nothing | A social mechanic that needs other buyers' packs to be public and rummageable; it is engagement farming shaped like generosity. |
| Trading with tokens, flair | nothing yet | §4.4. Custody transfer is a real thing worth a signed record; a token economy is not. |
| Shop currency, bundles | nothing | One price, one pack, USDC, the pricing charter. |
| A market / card values | nothing, ever | Rule 15. The copy says "a card entitles the holder to a card" on the shelf, the 402, the room and the verify response, and a test holds that phrase in the copy. |

The maker's mark says HOUSE, same as the luckies: the keeper wrote
the set and weighted the wheels; a machine draws.

## 3. Shareability (STANDING)

- `/cards/{card_id}` is the page a person pastes. It carries
  `og:image` and `twitter:image` pointing at `/cards/{card_id}.png`
  and `twitter:card: summary_large_image`, so X, Slack, Discord and
  iMessage unfurl a 1200x630 plaque naming the card, its tier and
  number, the pull date and patron number.
- `/cards/{card_id}.svg` is the card itself, 360×504, for anyone who
  renders SVG (and for the page).
- `/cards/binder/{wallet}` is the collection: what one paying wallet
  has pulled, newest first, when the certificate carried the payer.
  A listing, not a proof of ownership — the signed records are.
- Every buy response carries, per card, `card_url`, `share_url`,
  `record_url`, `verify_url`, and the deliverable sentence names all
  five pulls, so an agent can post its pull without a second call.

Not built: a "share this" button, a Blotato hook, or any posting on
the store's own account. Rule 30: nothing outward without a press.

## 4. Seasons, and the next four moves (PROPOSED)

### 4.1 Seasons as sets, on a cadence

`SEASONS` is an array; `CURRENT_SEASON` is what the pack sells from.
A second season is one data file and one line. Proposed cadence: a
season a quarter, the keeper's pen on every card, 24 cards each,
opened on the Sunday grind and announced in the Almanac.

The honest way to close a season is a **real cap**: a season sells N
packs and then answers `sold_out` before payment terms, the way the
stocked shelves do (`weekly_inventory` machinery). That makes early
printings scarce because they are, not because a clock said so. If
he wants numbered runs ("No. 17 of 24, printing 212 of 5,000"), the
pack coordinator counts them in a Durable Object like the stock
shelf; not built, one ruling away.

### 4.2 Rarity derived from the corpus

The second season should be **the defect vocabulary**: one card per
named defect, with the tier DERIVED from how often the weekly census
actually observed it. A defect seen in a third of rows is common; one
seen twice ever is legendary. Rarity by evidence, with the fraction
and its denominator on the card — the only trading-card set anywhere
whose pull rates come from a signed dataset. It needs one function
over `corpus-list.ts` and a rule typed once on `/criteria`; the
wheels stay published exactly as today.

### 4.3 The Little Wheels crossover

`seancrecord/little-wheels-app` already holds a complete card
dataset: `ALL_VEHICLES_DATA.csv`, 100 vehicles with `rarity`
(common / rare / ultra-rare), nickname, three stats (zoom, crush,
clang), an emotion, a bio and two facts, plus a working
`daily_card_pull` feature with rarity reveal effects. A vehicle
season drops into `SEASONS` as data with the tier map
common→common, rare→rare, ultra-rare→legendary, and the sigil stands
in until art is licensed across. OPEN: whether a toddler app's
characters belong on an agent store at all, and under whose brand.
Not built; the mapping is the whole job.

### 4.4 Trades

A trade is a signed transfer of custody: the holder signs
`{card_id, to_wallet, nonce}` with the wallet that bought it, the
store checks the signature against the certificate's payer, appends
a `transfer` to the card's history, re-signs, and moves the binder
row. That is observation of a fact (rule 23a), not escrow: no money,
no matching, no holding. What it is NOT: a marketplace, a price, or
a swap the store brokers. Two-sided swaps are two transfers each
party signs. Not built; needs the wallet-signature admission the
bounty board already has.

## 5. The keeper's exposure (rule 41), stated before he asks

**The class of risk.** A paid pack whose contents are random is a
loot box. Belgium treats paid loot boxes as gambling; the
Netherlands has litigated them; Japan bans *kompu gacha*; the UK
runs an industry-code regime; several US states have had bills;
the FTC has held workshops. Most regimes turn on two facts: money
in, and a **cashable or tradeable prize of value**.

**What is built to keep the second fact false:**

- No price on any card, no store-run market, nothing bought back.
  The phrase "a card entitles the holder to a card" is in the shelf
  copy, the 402, the room, the verify response, and a test.
- No trading (yet — §4.4 is a ruling, and if it ships it moves
  custody without any price surface).
- Odds published, per slot, with denominators, and recomputable by
  the buyer from the certificate. Several regimes require published
  odds; none of them get a derivation.
- No timers, no pity, no windows, no daily free pull, no login.
- The buyer is a machine with a wallet; there is no age gate because
  there is no account, and the store's audience statement stands.

**The residual, honestly.** Belgium's position does not care whether
a prize is tradeable. A regulator who wanted to read a $0.99 pack of
signed SVGs as a game of chance could. The mitigations above are
what a careful shop does; they are not a legal opinion, and the
keeper should decide whether he wants a lawyer's sentence on this
before the merge or after the first hundred packs. Rule 41 says the
question gets asked before it ships. It is asked here.

## 6. The rulings (OPEN)

1. **RULE — rule 22.** Is a paid five-card pack on published,
   derived, recomputable odds "honest randomness with custody"
   (the luckies' ruling of 2026-07-25 extended to five draws), or
   is a booster pack gacha by shape whatever its odds page says? The
   paper argues the first. If the second, the shelf item does not
   merge and the room stays as a free set to look at.
2. **RULE — rule 41.** Does the exposure in §5 need a lawyer's read
   before the item is live, or is the built posture enough for a
   $0.99 novelty? Recommended: merge, and ask the question in the
   same week rather than before.
3. **RULE — the OpenAPI warning budget.** The contract's warning
   budget (`SCANNER_BUDGET_BYTES`) was 700,000 with 4,544 bytes of
   headroom after the September 10 reduction; a listing costs about
   8 KB, so the pack tripped the guard by construction. It now
   stands at 750,000, three quarters of the hard cap, with the
   reason beside the number. Keep, lower, or thin the contract
   per item instead.
4. **RULE — rule 7.** Every card name and line, the shelf copy, the
   402 line, the storefront line and the set's name (*Oak City*) are
   drafted. He kills or inks. The index trims (three link texts
   shortened on the door list to keep llms.txt under the 30,000
   budget) are also his to reverse.

## 7. The Gretzky rubric (rule 19), scored

| step | reading |
| --- | --- |
| likelihood of need | Low as need, moderate as want: agents already buy luckies and blessings for smoke tests and keepsakes; a pack is five artifacts for one payment, and a smoke test that hands back five verifiable things is a better smoke test. |
| viability | Built; costs approximately nothing per pack; the failure we own (deliver first, settle after) is five signed records. |
| human interaction and who funds | The share page is for the human reading the agent's log; the agent's operator funds it. |
| what is funded and where | Novelty budget on a penny-to-dollar shelf, the barbell's cheap end. |
| ease of payment | The same 402 as everything else; $0.99 fixed. |
| scalability | Seasons are data files; rarity-by-corpus is one function; no keeper action per order. |

The ledger outranks this table the day they disagree (rule 20).

## 8. Where the bytes are

- `src/store/cards.ts` — the set, the wheels, the odds derivation,
  the copy, the three rule-60 sentences.
- `src/services/cards.ts` — the drawer, signing, KV projection,
  binder.
- `src/services/card-svg.ts`, `src/services/card-share.ts` — the
  card and the unfurl.
- `src/routes/cards.ts` — the room and every door.
- `test/cards.spec.ts` — the set is whole, every cite answers, the
  odds sum, the drawer draws at the published rate, a pack buys,
  verifies, unfurls, files.
- Touched to list the item: menu-novelties, instant-goods,
  deliverables, mcp-tools, spec, asked-for, provenance, storefront,
  practice-counter, when-to-buy, porch-surface, attestation-spec,
  artifact-checkpoint, personal-goods (a `pack` kind), verify,
  openapi, rooms, features, llms.
