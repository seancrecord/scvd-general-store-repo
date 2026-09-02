# ROADMAP — September 2026

Feature order. The desk is `KEEPER_LIST.md` (his hands).
Two queues, one job each.

August phases 0–5 (what shipped, with acceptance) live at
`docs/archive/OBSERVATORY_ROADMAP_2026-08.md`. Do not update
that file. The 2026-09-01 dump attic is
`docs/archive/DESK_DUMP_2026-09-01.md`.

**Still open.** Ranking a queue is not closing a row. A
stranger paying for a verification-tier item reorders this
file behind that item (Assumption 0).

The bottleneck named 2026-09-01 is packaging, not another
`llms.txt`. Agents already have doors. Humans and routing
models need a first screen that makes the value obvious,
and a public proof they can cite. Grow from inventory we
already produce. Do not grow by becoming a score.

---

## NOW — next builds (serial, #65)

Stop paper that is untrue. Then package the doors we
already have so a stranger can choose, cite, and route.
Then ship the one SKU already named.

| # | Task | Why now | Acceptance |
| --- | --- | --- | --- |
| N1 | **#82 — paid audit to battery v2.** Done 2026-09-01. Headline cites the census battery. Dated note on `/criteria`. | Two instruments disagreed in public. One was what a buyer paid for. | `AUDIT_CRITERIA_VERSION` matches the census battery. A v1-only fixture fails the paid door. |
| N2 | **First-screen packaging.** Done 2026-09-01. The 60 words are one constant (`VALUE_PROPOSITION`); `POSITION_OPENING` opens with them, so the homepage, `/llms.txt`, `/llms-full.txt`, `agents.md`, the OpenAPI description, the MCP handshake and the skill all inherit. OG card carries them verbatim; README opens with them. Three paths into rooms that exist (`/api/preflight/v1`, `/conformance`, `/corpus`) print on the homepage, the guide and the README in the words' own order — no `/start`. `test/first-screen.spec.ts` is the rule 44 sweep. | The dump is right about the bottleneck and wrong about the noun. We already have `POSITION_LINE`. We do not have the extraction-first first screen. | One derived paragraph, six surfaces. Rule 44 sweep. No "verification layer," no "trust layer." |
| N3 | **Sample output + does-not-prove on the top paid SKUs.** Done 2026-09-01. Five specimens (`/samples/{once-over,conformance-watch,night-watch,launch-check,settlement-attestation}.json`), each built by the paid artifact's own arithmetic over a door that cannot exist, unsigned; printed in full on the item page, equal to the JSON byte for byte. Every item that mints an artifact class prints the class's `signs` / `does_not_prove` verbatim on the page, in menu.json and in the markdown twin. `test/item-limits.spec.ts` is the family guard. | Abstract trust is why humans bounce. The honesty is already computed. | Five flagship items. Test pins the guard. |
| N4 | **Provenance shelf (M5).** Done 2026-09-01 as `provenance_check`, The Company an Address Keeps, $5, copy as approved: the named join from the signed chain, delivered and never published; free self-audit at `/api/provenance/self` (EIP-191 challenge), consent offer at the end, self-audits counted weekly and never logged. | Only new SKU already named. Copy is the gate. | On the shelf, derived, free-own path tested, refusal in the body. |
| N6 | **Walkabout runner to spec.** DONE 2026-09-01: `scripts/walkabout.mjs` + `scripts/lib/walkabout.mjs`, `npm run walkabout:test`, WALKABOUT.md "The runner". First real run reconciles itself; the August gap is a separate `reconcile` against run zero's block range when the keeper wants it. WALKABOUT.md approved 2026-09-01 with a standing weekly approval at the defaults. The August script has the calling-card UA and caps but caps at $0.10 not $0.05, has no sanctions screen, no one-per-domain rule, no Web Bot Auth signing, no corpus-vocabulary output. Reuse the on-chain sanctions oracle in `services/launch-check.ts`. Targets: the 2026-08-18 domain set plus the ward round, not the 100-row feed. First job of the runner: reconcile the August ledger's 180 unrecorded on-chain transfers. | The only observation class nobody else produces is what a door did with real money. CV is the hands with the wallet. | Runner obeys all eight rules; ledger + report committed per run; every number in the report re-derives from the ledger; the August gap stated in dollars. |
| N5 | **Bazaar / discovery freshness for our own paid doors.** Done 2026-09-01. Every round reads the CDP search index once and records `our_doors` — claimed, found, missing, or could-not-check — on the signed round (public, dated, in the corpus); `/admin/ward` prints it; an alert fires when the missing set changes. Re-register is his press. Extended 2026-09-02 with the other direction: `stale` (retired doors the index still returns — the 11 rows Agent Economy Report scored as down) and `unknown` (paths under `/api/buy/` that are neither on the menu nor retired), alert when the stale set changes. Delisting is a letter to Coinbase, his hand. | Recency decay is how a listed store goes invisible. This is the marketplace half of "do not miss a takeoff." | A miss fails a TEST or writes a dated row. No silent re-buy. |
| N7 | **Tiers on the passport — doctrine first, then the feature.** Prompt verbatim: `docs/PROMPTS_2026-09-02.md` §1. Two branches in order: (a) DONE 2026-09-02 — the doctrine swap — "never a ranking, and never a verdict without its derivation and denominator beside it" on every surface the old sentence names, dated note on `/criteria`, nothing resigned; ⚑ the sentence is his ink and the x402-list row is his press. (b) DONE 2026-09-02 — the derived tier (observed / established / standing / broken / indeterminate) from the signed per-host history on the passport's own newest-wins fold, the rule typed once on `/criteria` (`src/services/passport-tier.ts` is the only source), the fraction and the rows on the passport, its JSON, the chip, the hosted profile and `/corpus/host/{host}.json`, and `/corpus/tiers.json` alphabetical. `test/passport-tier.spec.ts` is the red-first list; derived-not-typed fails on any tier printed without its fraction. | A stranger said it unprompted (l0: reliability weighted by settled USDC, not directory rank). The tier with its denominator is the answer that stays on this side of "score." | Rule typed once; no tier without its fraction; tiers.json has no position field; old sentence absent from every public surface; the contradicting copy listed and judged for `/corrections`. |
| N8 | **The Case File, $0.25.** DONE 2026-09-02 as `the_case_file` (`src/services/case-file.ts`; served at `/case/{case_id}`): seven sections present or absent by name, the gaps counted against us, the conflict line when we are a party, idempotent by tx + mandate inside a day, `watchRowsForHost` the one new lookup; `test/case-file.spec.ts` is the red-first list. Price $0.25, keeper-confirmed 2026-09-02. Prompt verbatim: `docs/PROMPTS_2026-09-02.md` §2. After N7 (section 4 cites the tier). The composability list the prompt asks for was filed in chat before code: settlement, reconciliation, mandate, corpus host rows, watch rows by host + window (expected missing), fulfillment log by tx (expected missing), launch check by id. No verdict, ever; "this store is a party" on its face when we are. | The dispute instrument without a court (23b holds): what was observed, what was not, assembled for the human deciding. Composed from primitives already on the shelf. | Every section present/absent stated; gaps counted against us; conflict line iff we are a party; no verdict word in any field; declared never touches observed; price equal in every map. |
| N9 | **The collector cannot pay, structurally.** DONE 2026-09-02: `test/collector-cannot-pay.spec.ts` walks static and dynamic imports from every probe root and fails the build if a signing-capable module is reachable; the one path that existed (the menu's copy importing `FIELD_SPEND_CAP_USD` from the signer) is cut by `src/services/launch-check-terms.ts`. An import-graph test: nothing reachable from the census, preflight, or watch probe path can reach a signing-capable module; paying is the walkabout runner and the launch check, named, reason-logged. Small; may ride the N7(b) branch. | Their ADR. We hold it as policy today; a test makes it a property of the code. | The build fails if the probe graph reaches a signer. |

Replay census (#37) follows the paid-audit v2 fold (done
this sitting — the battery a replay would cite). Different
ticket from leftover-queue #37 (CV test-segment).

---

## SOON — grow the citation loop

Do not start these ahead of N2. Each is inventory we
already produce, pointed at a stranger.

| # | Task | Why soon | Acceptance |
| --- | --- | --- | --- |
| S1 | **Weekly corpus brief a stranger can quote.** Done 2026-09-01 as The Week's Doors, `/corpus/brief` (his name). Short. Hosts observed, payable vs not, named defect classes, gaps counted against us. Not a "State of x402 Checkout" brand until he inks the name. Not a ranking. `/corpus` + trajectory + `/doors` are the feed; this is the human/agent digest. | Original dated data is how we get cited. Gazette self-drafting is retired; the data is not. | One signed page or row per week, derived from the snapshot, screenshot-able without becoming a leaderboard. |
| S2 | **Passport on the front.** Done 2026-09-01 (his slot ruling): `/passport` on the storefront, share colophon on every host page. `/passport` and `/passport/{host}` exist and are held off the storefront pending his slot ruling. The dump's "public endpoint passports" is this room, not a new product. Embed is a *colophon* linking the dated page, never "preflight passed." | Merchants share a page that makes them look observed, not approved. Rule 43 / 54. | Slot ruling on the desk. Then `on_storefront` and a share card that carries date, gaps, stale-after. |
| S3 | **Merchant kit as a bundle, not a new brand.** Done 2026-09-01 as `opening_day`, The Opening Day, $9 (his ink): one launch check, seven days of conformance watch on the same door, the passport page, one certificate, one URL (`/api/opening-day/{cert_id}`). Same engines as the parts; no second battery. | The dump's "launch kit" is packaging of SKUs we sell. | Menu row derived. No second battery. |
| S4 | **Watch as the standing product, said plainly.** Done 2026-09-01: subtitles inked on the four operator instruments. *2026-09-01, derived half done:* both watch histories now carry `the_next_week` — rule 23a on the artifact, the same item priced off the shelf, the door pre-filled — so the week no longer ends in silence. Never a renewal. | Recurring revenue without a new primitive. | Copy only, then rule 44. |
| S5 | **`/try` as the 60-second demo.** Paste a door, preflight; paste a receipt, conformance; buy the cheapest item; verify. Video and transcript are his hands. | The practice counter is already the demo. Record it; do not rebuild it. | First screen of `/try` is the five minutes. |
| S6 | **menu.json / atlas already answer shopping agents.** Add only fields we can *derive*: `when` from `scvd://when`, sample URL from `/samples`, verify pattern from `/api/verify/{id}`. No hand-typed persona novel. | Shopping agents need transactional data. We have it in three places. One derivation. | No new typed category list. |
| S7 | **Depth before you buy.** DONE 2026-09-02: `archive_depth` on the 402 of `spot_check`, `trust_profile` and `provenance_check` for the subject named (never a preview of the answer), the archive's own depth on their menu.json rows and item pages, zero printed as zero, never-met stated as never met; `test/depth-before-you-buy.spec.ts`. Free callers see the archive depth for a host — rounds held, weeks spanned, first and last seen — on the 402 body and the item page of `spot_check`, `provenance_check`, `trust_profile`, and any corpus slice, before paying. Zero when zero. | Their ADR-011, and our own gap: we sell history and show nowhere how much of it exists for this host. | Depth derived, printed before the money; a host we never saw says so. |
| S8 | **Cross-surface consistency, as a battery fold.** Designed 2026-09-02: `docs/S8_CROSS_SURFACE_2026-09.md`. Three tiers by what the truth costs — A: the door disagreeing with itself inside the one 402 we already hold (five checks, two fold into v3); C: the catalog's copy against the live door for every probed host, derived from the index the census already fetches; B: the door's other surfaces on the same origin, on the paid audit only, four states (read, silent, absent, unreadable) and a fraction with its denominator. Eight legitimate differences named so none prints as a contradiction; the catalog's drift attributed to the catalog on its face. Four PRs in order; four ⚑ decisions on the desk. 402 amount vs menu vs `llms.txt` vs discovery doc; health vs tool descriptions. A named defect class; our own doors run it first. Separate from N7, which does not change the battery. Line for the desk: which pairs stay costly to fake once the check is public. | The thread handed us the design and we were bitten by it ourselves (the ClawHub prices). Nobody on x402-list computes it. | Battery version bumps; dated `/criteria` note; a fixture with two honest surfaces that disagree fails. |
| S9 | **Named exclusions on the demand numbers.** DONE 2026-09-02: `exclusions` on `/corpus/wallet-facts.json` (house wallets with who and since, house agents, the crawler table) and `src/store/exclusions.ts`, the dated register whose newest row pins both table sizes — `test/named-exclusions.spec.ts` fails a change without its row. Publish, by name and wallet where known, which indexers, scanners and house wallets are excluded from the organic counts (`house-wallets.json` already holds the why), and write a dated row when an exclusion changes a published number. | Their mechanism is more rigorous than our published bot-vs-organic split. One derivation from a file we keep. | `/corpus/wallet-facts.json` carries the list; a change writes a dated row. |
| S10 | **The Operator's Statement** (his name, ruled 2026-09-02; $21 a month and the cadence confirmed the same day). `the_statement`'s engine at a 30-day cadence on one payTo, with distinct-payer count and concentration derived from the same transfers. Sold to the operators with real payers, not to agents at $0.99. Never a renewal: 23a pointer at term end. | Revenue attestation from a party that isn't them. Built, mis-sold. | Cadence term item; payer count and concentration re-derive from the transfers; pointer, not renewal. |
| S11 | **The AURa walk as a report.** DONE 2026-09-02 as `aura_walk`, The Aura Walk, $150 (his number), human queue, a week's promise, one a week ⚑ drafted with a waitlist: the cold-agent pass this store runs on itself (`AGENT_UX.md` is the spec; `src/store/aura-walk.ts` mirrors its entry points and measures, and `test/aura-walk.spec.ts` holds the two to each other), sold on a door the buyer names in `url`, run by his hand with Claude Sonnet 5 or Opus 5 by default and weaker models on request in `detail` (his ruling). The completed order carries the report with every transcript attached. Registered on every surface keeper-time is sold on; the copy on the row is ⚑ drafted for his ink. Models of varying capability shop one door; where they stall, refuse, misread the accepts, or pay on the wrong rail; signed, transcripts on the artifact. Commission class; ⚑ price ($50–150 on the desk) and the model runs are his hands. | Human-legible, high-margin, nobody else on the list offers it. The method is already published. | Commission item; transcripts attached; the method page is the spec. |

Free spot check as the outreach is already live as the welcome on
`/admin/outreach` (2026-09-01). After N7 the welcome carries the
tier, and a dead door we saw goes in the same note. His hands.

---

## LATER — option value, demand-tagged

Hands in many pots, cheap, reversible. Build when a
trigger fires, not from enthusiasm. Detail: dump attic
+ August parked table.

**If discovery takeoff (Bazaar / Agentic.Market / Circle
lists us and strangers arrive):** pull S1–S2 forward;
do not invent `/for-merchants` pages.

**If someone links a scvd.store reading unprompted:**
cheap `/check/{host}` (census-only). Live-probe stays
parked (unfurl / SSRF).

**If a named counterparty wants a rail:** lane A, flag-
dark, after he inks the rail run-through. Not before.

**If webmcp channel has arrival data:** `check_this_store`,
porch `ring_bell`, WebMCP conformance instrument.

| # | Task | Trigger / why later |
| --- | --- | --- |
| L1 | Phase 4 `/agent/v1`, `find_endpoints`, `@scvd/agent` | Nothing is asking. Free desks already have MCP tools. |
| L2 | Phase 5 chips, `@scvd/launch-check`, first `cross_ref` consumer | 5.2 pricing is ⚑. 5.1 partly live as `/corpus/diff.json`. |
| L3 | First lane-B reader (MPP / AP2 / ACP) | After rail ink + intake collision. Parser, not a till. ACP/UCP merchant checkout stays read-only. |
| L4 | Directory / facilitator QA as a *report we already run* | Sell the weekly brief (S1) to a named directory. Do not build a second census. |
| L5 | Corpus slices as paid history / API | Free public summaries stay free. Paid = convenience and history, not a score. Demand tag. |
| L6 | "Buyer safety" *looks* | An agent asks "what do you hold about this door?" — that is preflight + passport, maybe a threshold SKU. Not a wallet trust score. Not KYA. |
| L7 | CI check for *our* fixtures | A GitHub Action that fails *their* deploy is a new product. Demand tag. x402-verify already exists on npm. |
| L8 | #83 / #70 / #71 / #68 / #80 / #57 / #58 | Parked tickets. After NOW. |
| L9 | `/observatory` page, Solana parity, Tab leftovers | Per-build. |
| L10 | Card family, cheap `/check/{host}`, D5 patronage sell-up | Demand / ink. |
| L11 | Cross-protocol evidence desk | Same as L3, grown up. "First attestation authority" is not the goal; cheap readers are. |
| L12 | Sponsored bounties: an operator pays to post their door on the board | Demand tag: an operator asks. Honest only if loud — public bounty, disclosed finder wallets, corpus flags the settles bounty-driven never organic. The quiet version is the wash trading we called out. Do it that way or not at all. |

---

## NOT THIS ROADMAP

Struck or already live. Do not reopen. Do not rebuild.

**Already live — the dump often asks for these.**
`llms.txt` / `llms-full.txt`, `agents.md`, sitemap +
`.md`, `menu.json`, `atlas.json`, OpenAPI, MCP, x402,
ARD, A2A, DID / key history, corpus JSON, `/conformance`,
`/try`, `/samples`, `/doors`, `/passport`, `/coverage`,
`/when`, visit stamps, JSON-LD (Organization, WebSite,
Product, Offer, Service, ItemList, FAQPage, Dataset),
`/pricing.md`, `index.md`, Web Bot Auth desk, watches,
launch check, settlement attestation, bazaar self-row
in the ward round.

**Already the wrong noun.** "Independent receipt and
endpoint verification layer." "Trust-but-verify desk."
"Commercial evidence authority." Category is evidence
observatory. `POSITION_LINE` already says it. `/becoming`
still carrying "trust layer" is a desk ruling, not a
rebrand.

**Scores and their cousins.** Leaderboards. "Preflight
passed" badges. Agent-readiness scorecard. Rating
dashboards. KYA / wallet trust-score. Reputation
portable scores. Health index. TraceRank feed.
AggregateRating. Wikipedia `sameAs`. A numeric 0–100
anything. *A tier with its fraction and its rows (N7) is
not on this list; a tier without them is.*

**New page trees.** `/for-builders`, `/for-merchants`,
`/x402/conformance`. Rooms exist. Retrieval is titles
and first-screen answers, not a parallel sitemap.

**New primitives that reopen 23b or 17.** Escrow.
Dispute court. Insurance underwriting (named buyer
first, we remain the evidence, they hold the risk).
Broad payment-approval widgets. Managed key-succession
as a product (we have not done it for ourselves).

**More AI-visibility files for their own sake.** The
dump's own warning. Markdown twins where no markdown
document exists are a 404 on purpose.

---

## How this file is used

- One item per branch.
- ⚑ stops for the desk.
- Copy is drafted here only as a suggestion; he inks.
- When the market moves, *pull a LATER row forward* —
  do not start a third list.
