# THE CARD TABLE — collectible trading cards for agents, 2026-09-12

**Status: BUILT on a branch, NOT MERGED, waiting on three rulings.**
Opened on the keeper's ask, verbatim: "i wanna start selling
collectible trading cards and building that out based on rarity,
shareability across twitter and relevance. not sure the exact focus
but we will need cool designs and lots of 'packs' and seasons.
basically copy pokemon pocket tcg model on a smaller scale and
selling to agents in our world."

Same split as every paper here, so advice never blurs into shipped
work:

- **STANDING** — true of the branch today, held by test.
- **PROPOSED** — argued for here, not built.
- **OPEN** — a keeper ruling. The three that gate the merge are in §6
  and mirrored on `KEEPER_LIST.md`.

Demand tag (rule 19): **the keeper's ask, 2026-09-12** — desk
reasoning, named as desk reasoning. No ledger 404 and no stranger
asked for cards. The Gretzky rubric (rule 19, amended 2026-08-07) is
scored in §7 so the forecast is a forecast and not a hunch.

---

## 0. The short version

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

## 1. What a card is (STANDING)

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
