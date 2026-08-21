# KEEPER_LIST — the keeper's one desk file

Successor to MONDAY.md and TASKS.md (archived whole 2026-08-20 as
`docs/archive/MONDAY_2026-08-20.md` and
`docs/archive/TASKS_2026-08-20.md`) and to the old KEEPER_LIST.md,
which was rewritten in place — git history holds every version of
it. Three queues is
how a finished task got handed back twice; this is now the only
desk. The ritual is MONDAY's: carry only what is TRUE and OPEN,
strike closed items with their evidence, and when the sheet is
mostly history, archive it whole with its date and start again. A
desk file is not a diary.

Every item keeps the old list's taxonomy, because it prices keeper
time honestly: **LOOK** — open a page, read a number, five minutes.
**TEST** — exercise something that has never met reality. **RULE** —
only the keeper can decide; no work happens until he does.

**Last trued up: 2026-08-20.**

---

## NOW

**1. The bank walk — LOOK, first, because the records disagree.**
The TASKS archive (docs/archive/TASKS_2026-08-20.md, entry written
2026-08-13) says the walk stalled hourly from
08-12 13:30Z, cursor frozen at block 49,858,030, nineteen straight
failures shaped like a blown key quota, blocks going permanently
unreadable past ~2026-08-14 11:00Z — past that the hole is forever.
PROBLEMS.md #24 says the walk's backlog disease was FIXED 2026-08-11,
catch-up passes proven in tests. Both records stand with their dates;
neither is picked here. Open the dashboard and the admin: cursor past
49,858,030 means the stall record is stale and this closes; frozen
means follow the archived entry's steps — check/rotate the Alchemy key
(`BASE_RPC_URL_PRIMARY`), set the second-provider secret
(`BASE_RPC_URL_SECONDARY`) — and measure the hole honestly.

**2. The outreach recovery — TEST, two minutes** (08-19 batch).
`/admin/outreach`: "Clear ALL stamps (keeps contacts)" once, scout to
zero, then per card send the draft yourself, THEN mark sent. Nothing
on that page transmits; stamping without sending poisons next week's
list.

**3. Publish W34 to the public tally — LOOK + one press.**
`/admin/market` → Publish 2026-W34 to /registry (31% rot, the
signed-offers gap, the price map). Re-pressing replaces the row.

**4. ClawHub republish — TEST, five minutes.** From a level main:
`npm run skill:publish`. The ClawHub copy lags the site; the number
that is never stale is `SKILL_VERSION` in `src/store/spec.ts` (3.4.0
at this true-up) vs `registry/clawhub/published.json` (3.3.0).
(Earlier lines said 3.3.0 then 3.3.1 and were each stale on arrival
— per rule 45, the source files are the count, not this one.)

**5. The directory PR sidecar — keeper follow-through** (08-19).
Regenerate `providers/scvd/store/openapi.json` from the live
/openapi.json and /menu.json now that the dual-rail build deployed;
the Solana directory's two Greptile blockers dissolve.

**6. RULE: the settlement-attempt lane.** The biggest open ruling: a
parseable 402 says nothing about whether PAYING it gets goods, and
testing that means real spends at strangers' doors under the wallet
law ($25/month funding discipline, ask-first above $1, ruled
2026-08-18). The August field run (1,707 attempts, signed report) was
this done once by hand; the ruling is whether it becomes a standing
lane. Yes / no / conditions.

**7. RULE: the ERC-8183 evaluator key.** The read is DONE and the
position RULED 2026-08-18 (`docs/ERC8183_EVALUATOR.md`, on /becoming)
— do not re-read it. One ruling remains and alone blocks the
testnet-run build: yes/no/which key for the no-custody evaluator
wallet.

**8. The shopfront rail line — LOOK, check don't act** (2026-08-13).
After the next rail-split cron the front should read "8 on Base, 2 on
Solana," tail gone. If it persists, the unplaced sale is one of the
four Base hashes in the TASKS archive's NOW block;
`RAILS_ENTERED_BY_HAND` wants exactly one.

---

- [ ] **Light the Polygon rail** (shipped dark 2026-08-20, PAYMENT_RAILS.md
  Part D): `npx wrangler secret put POLYGON_PAY_TO` — the same 0x pay-to
  address works on Polygon as-is. Until the flag is set the store is
  byte-identical to before the rail. Gates already run: CDP facilitator
  supports polygon; Token Terminal has Polygon at 5.6M of 14M x402
  transfers/30d.
- [ ] **The three-rails copy pass, after the flag flips** (⚑ throughout):
  "USDC on Base or Solana" → three rails across storefront copy, /what,
  llms.txt, the skill twins, spec strings. Machine surfaces deriving from
  acceptedNetworks() follow the flag on their own; the ink is yours.
- [ ] LATER: the Polygon bank walk (POLYGON_RPC_URL secrets — the Alchemy
  account covers Polygon) so the $10 unreconciled cap can stand down the
  way Solana's did.

## NEXT## NEXT

**The frame:** the verification tier is still $0 outside — Assumption
0 unproven — while the economy under the position 10×'d. Everything
below serves the first outside dollar.

- ~~Swap the corpus denominator~~ — STRUCK 2026-08-20 at the
  re-review: the arXiv figure (13,760 / 420) is already what
  `src/services/population.ts` and docs/CORPUS_VELOCITY.md carry,
  and the old ~59,818 appears nowhere in the tree. Done before the
  merge; carried in error.
- **Promote undeclared_walkers to channel.ts — build, before
  trusting any denominator** (funnel finding 2026-08-18): the flat
  ~50–100 asks/day/item profile fingerprints catalog walkers still
  counted as organic.
- **x402-list — LOOK.** Acceptance waits on Finance → Verifiers
  (2026-08-18, correct filing). Once accepted: remove the token route
  (a nonce outliving its verification is litter), and recut the old
  imported "a lucky, $5–$25" description if it still stands (07-26
  item folds in here).
- **Bank CSV through `reconcile_card_statement` — TEST**, keeper
  hands (#33); drives variability under 2%.
- **Fund + hand-capture the two paid directories — TEST** (#36,
  402index.io and x402scan). The blocker dissolved with the wallet
  law; what remains is a funded wallet and one paid response each.
- ~~Paste draft-vauban into a session~~ DONE 08-20 (web search
  reached what direct fetch could not). Verdict: ALIGN by prior work
  — the family pins the same RFC 8785 discipline as hopley, which
  `signature_jcs` already speaks; our declared-order primary stays.
  The namespace spec now carries the vocabulary mapping
  (certificate ≈ SettlementReceipt, attests ≈ action_ref). No
  migration, nothing normative binds us; drafts watched, not chased.
- **Hand CV the re-pinned Tab segments — TEST** (#37).
  `docs/CV_TEST_SEGMENTS.md` pins `ad60264` (the old list's `7a67130`
  superseded 2026-08-18). Parts 2, 3, 4, 6 are CV's. **Part 1 is
  keeper-or-unprimed-instance only** — a primed agent proves nothing,
  and it is the only test of `unspoken_pct`, never yet produced.
- **The real-inbox sweep — TEST** (08-10). Contract and routine
  shipped; never run against a real inbox, even by hand.
- **Pen passes on the 08-19 builds' ⚑ copy — RULE:** launch_check
  (FIELD_WALLET_KEY reported set 08-19, so only the pen remains, plus
  WALKABOUT.md's ⚑), the_mandate, regulars' credit, the bounty board
  — where his hand also posts the first bounties.
- **Foundation membership tiers — LOOK, ten minutes** (08-18 scan).
  Join disclosed, or don't; nothing lost either way.
- **Key succession — RULE, then build** (F3, 08-10). Every signed
  artifact dies with the key if no successor is pre-announced; the
  single point of failure under the corpus.
- **The dropped-delivery clock — LOOK** (08-10: "the test is time").
  A week of organic sales with no new `undelivered_sale` on Base
  closes it. Riding along: a second load of `/admin/reconciliation`
  should mark no old rows [NEW].
- **Gates on the clock — LOOK on the date, decided in advance**
  (2026-08-12): ~08-25 on-page battery kill gate (zero free-desk
  callers → kill listing priority, keep code); ~08-27
  settlement_attestation kill criteria (near-zero calls → park);
  ~09-10 execution-contract gate; ~09-10 WBA directory demand gate
  (≥3 payers or ≥10 cards → build, else queue stays collapsed);
  ~09-20 the 60-day line — judges the MARKET, never the citation
  channels.

---

## BACKLOG

**Unstaffed hires** (docs/archive/EMPLOYEES.md; registrar's round on shift, these
proposed 2026-07-28 — each is one check on the rounds + a rule-32
job file):

- **Night watch** (07-28) — notice firsts: first non-house wallet,
  repeat buyer, item sold twice, new decline reason. Reports only.
- **Shelf inspector** (07-28) — catch the store contradicting
  itself: shutter closed with orders queued, lapsed presence window,
  stocked shelf at zero, listing failing spec at runtime.
- **Bookkeeper** (07-28) — weekly, before the Sunday digest:
  rows-vs-counters drift and crawler reclassification. Reads rows,
  never rewrites a counter.

**Queued builds, keeper-approved, not yet:**

- Context-anchor tier ladder (keeper's sketch 08-12) — real cost is
  a body-borne input door for 40K+ summaries; RULE range reads and
  digest-signing at build time.
- The Meter Check (08-19) — token-billing recount; gated on enough
  x402 inference endpoints. Count, never model.
- **The Circle-badge slate** (keeper 08-20, off the 100/100 scanner
  read: "i say we do it all at some point"), in build order:
  1. SIWX / wallet auth — CAIP-122 message format on the claims
     door's existing wallet-signature challenge. Small, doctrine-fit
     (no accounts, no keys), mine, near-term.
  2. MPP (Machine Payments Protocol, Stripe+Tempo) — second payment
     standard beside x402. Spec read first; RULE before build: card
     rails are reversible ~90 days and our certificates are signed
     forever — settle-before-mint needs a chargeback answer (exclude
     forever-artifacts from MPP, price the risk, or delay minting).
  3. Circle Gateway nanopayments — accept their unified USDC
     balance. Circle onboarding first (keeper hand, likely KYB);
     code after is modest. The Alliance Program thread (Haider
     Bhatti, 08-20) is probably the same front door.
  4. World ID / Proof of Human — requires the keeper PERSONALLY
     enrolling (Orb/app) before anything buildable; the store-shaped
     use is the inversion: our human_witness carries OUR proof of
     personhood, never a gate on buyers. Last, by his own "idk
     how... at some point".
- **THE OUTSIDE-READS LOG** (08-20: Circle scanner 100/100 + two Exa
  strategy runs). One dated ledger, split hard so advice never blurs
  into what already stands — the keeper's own rule: "structure so we
  have both and it's not confusing which we've worked hard on."

  ALREADY STANDING — do not rebuild, point outsiders here:
  audit+cert+badge+renewal = service_audit / launch_check / audit
  badges / conformance_watch · canonical receipt schema =
  scvd-attestation spec + JCS dual-emit · guided first purchase =
  buy_simple + /try + payload_template · recurring wedge =
  conformance_watch + recurring_patronage · evidence-first directory
  = /registry + /fresh-set (rows cite the signed corpus) ·
  own-store-as-the-demo = the 402→pay→verify walk on every door ·
  first ICP = endpoint operators (the funnel, the wire, the tally).

  NEWLY FILED, deduped across all three reads, rough build order:
  1. The Endpoint Passport — ONE canonical object bundling audit +
     badge + watch state + registry metadata: HTML for eyes, JSON
     for agents, signed digest, expiry/renewal, check history,
     non-guarantee language. The umbrella most items below feed.
     First passport: our own endpoint, public.
  2. Freshness states — evidence degrades VISIBLY: fresh / aging /
     expired / broken / indeterminate, so an agent can refuse stale
     evidence automatically. Sell the refresh, never the grade.
  3. The authority pack — why trust the observer: verification
     library + byte-testable vectors, sample-artifact gallery,
     incident policy, revocation story. Key succession (F3, RULE
     open) is the floor of this pack; third outside read to name it.
  4. Outcome-verification separation — paid / settled / executed /
     delivered / externally-observed / not-checked as distinct
     fields, never collapsed (partially standing in /api/verify's
     split verdicts; extend to receipt language).
  5. The obstacle course + signed failure diagnosis — deterministic
     named failure modes to practice against, and the paid signed
     "why an agent cannot buy from this endpoint" report (preflight's
     battery, signed and sold).
  6. One trust panel — aggregator page for key/history, corrections,
     books, uptime, fulfillment stats; feeds the passport.
  7. The assurance ladder, named — novelty / observation / monitored
     / audited / witnessed as explicit spec levels.
  8. The distribution pack — passport made outreach-ready:
     copy-ready profile, JSON twin, embeddable badge, registry
     submission checklist (the wire's notes get an artifact to
     offer, not just a defect to report).
  9. Standards-boundary language — "x402-native", "maps to",
     "references", with mapping tables and test vectors; never
     "AP2/MPP compliant" without implementing the flows. Rides the
     MPP/x401 read (#51/#52).
  10. RULE (keeper): hosted trust profiles as a monthly SKU
      ($9–49 shape) — a new business line, his call alone.
  11. Paid receipt-verification API (Exa residue, filed 08-20 late):
      /api/verify checks OUR artifacts free; this door takes ANYONE'S
      receipt by POST and returns a signed verdict — valid / invalid
      / insufficient-evidence / expired / indeterminate. Free by ID
      stays free forever; batch/third-party is the paid tier. The
      conformance desk pointed at receipts instead of offers.
  12. Compatibility mapping pack as a sellable (Exa residue): item
      9's standards-boundary language turned product — what your
      metadata has, what's missing, what claims to avoid, for
      operators wanting AP2/ACP/MPP-facing language. After the MPP
      read.

  BUILD ORDER RE-RULED 08-20 late (keeper: "prioritize on roi +
  doability"), replacing the list order above where they differ:
  P1 trust surfaces batch — trust panel (6) + sample gallery (from
     3) + assurance ladder (7): cheapest, lifts conversion of every
     EXISTING paid door, and is the substrate the passport needs.
  P2 the Endpoint Passport (1) + freshness states (2): the default
     paid offer, mostly assembly of shipped SKUs.
  P3 paid receipt-verification API (11): new in-lane revenue door on
     an existing battery.
  P4 SIWX (Circle slate 1): small, badge + claims friction cut.
  P5 obstacle course + failure diagnosis (5).
  P6 authority-pack residue (3) — test vectors, verification
     library, incident policy.
  Interleaved cheap: the spec reads (x401, MPP chargeback memo,
     Gateway). After passport + MPP read: distribution pack (8),
     mapping pack (12). Sunday-gated: the chain-inflow reader.
- ~~Single-rail residues~~ DONE 08-20: /zodiac and /api/claims read
  both rails.
- ~~The Statement~~ SHIPPED 08-20 on the shelf (`the_statement`, the
  3.4.0 turnover).
- ~~The Fresh Set~~ BUILT 08-20, the day the keeper hand-ran the
  first full walk: /fresh-set, names only on the ready side, free
  (ruled on the funnel's own evidence — keeper may re-rule to the
  half-cent door).
- Pass-holder multiplier — deliberately DEFERRED until patrons renew
  (08-19, the Costco note).
- town_papers (add /papers to the sitemap same build) and
  anniversary_artifact (RULE: one-line spec first). Both 07-22
  vintage.

**Waiting on reality, not on work:**

- Pager ride-along (B2, 08-10) — `unspoken_pct` null until a real
  week of pages. The watches (B4) — no endpoint ever watched a full
  week. Tiered/PWID arithmetic (B5) — never exercised by an outside
  buyer; one deliberate $1+ graffiti buy would close it AND walk the
  review queue by hand (07-28's unrun diagnostic).
- Tab Parts 5 and 7; pooled Tab reads — gated on the pool having
  anything to aggregate.
- Bazaar ingestion conflict, UNRESOLVED since 2026-08-02:
  "phantom_check appeared" vs "CDP validate rejects it" cannot both
  be true. Re-look before spending on the five still-shelved
  invisible items; the settle-and-valid-declaration rule is not
  established until this closes.
- KV→R2 graduation — arrives on its own; watch lines: snapshot
  >~128 KB, register/bank values near ~1 MB.

**Cheap distribution, still undone:**

- scvd-tab listed nowhere (08-10) — live on npm since 08-10,
  cold-install proven 08-20; Glama and the MCP directories.
- MCP server card — the "we run no MCP server" skip reason is false
  (08-10); remaining blocker is SEP-2127 being a moving draft.
- Gated: agentic.market (organic mcp + bazaar settles first), ACP
  (skip if token required), Farcaster/Base miniapp, Gazette
  auto-assembly (a week with 3+ organic events).
- Keeper-voiced outreach, not delegable (07-27): Show HN, two or
  three builder asks, presence without selling.

**Old rulings and passes still owed, none near-term:**

- Office overhaul (keeper's words, 08-03) — RULE first: his three
  walk-in questions, then lead every room with the answers.
- Naming-law leftovers (07-28) — one RULE covers openapi
  `info.title`, webmanifest `name`, MCP `serverInfo.title`; trust
  list `issuer` sits INSIDE the signed payload and waits.
- Ownership/rights as a second axis, not a second made_by value
  (07-31) — RULE; plus the co-ownership line on /what and llms.txt.
- "First store of its kind" vs rule 3 (07-26) — RULE; on record:
  keep "you're early," drop "first."
- C2 residue (08-10): one word on whether commission rungs and quote
  expiry take the spec defaults; nothing blocked either way.
- Approval-prompt screenshot (07-28) — the Part 5 blocker; one
  screenshot beats a week built on a wrong assumption.
- /api/verify still not loud on the storefront, /what, the skill
  (07-27) — "free, unlimited, forever" is the best claim we have.
  Plus the 33x audit of MCP tool descriptions.
- Almanac: Season Two before 2026-W44 (season one repeats after),
  and the first REAL entry — keeper dictates, machine structures.
- Breadcrumbs (canon §5) — BLOCKED on CHARACTER_CANON paste; Dimas
  is not the machine's to improvise.
- Data gaps on the keeper's nod (07-23): referrers, hour-of-day, MCP
  funnel depth, regulars aggregate, payer cohorts, Search
  Console/Bing, conversion latency.

---

## STANDING

- **The Sunday Grind:** the ward round mints the weekly corpus
  snapshot (hand-runs mint too); Gazette draft behind THE_NINETY;
  recount before the digest; a trip-wire glance (a trigger fires →
  build that ONE thing); the weekly llms.txt cold read as a stranger.
- **The weekly corpus drop is the metric, not a task** — corpus
  velocity binds the whole intelligence category (G2);
  `docs/CORPUS_VELOCITY.md` is the plan.
- **Monthly ledger review:** npm download trends (x402-verify /
  x402-sign), the census line, standing kill-criteria, the
  falsification set P0–P6, and asking an outside model "where can an
  agent buy a signed artifact" — the one measurement we cannot take
  ourselves.
- **Rule 44:** the AEO sweep is a stop after changes, never a chore
  for later.
- **Battery versioning:** a ratified Foundation change cuts a new
  battery version the same week, old versions serving forever.
- **Registry watch:** the day the Foundation blesses a registry, the
  ward reads it (ruling 6 — every public directory, uniformly).
- **Assumption 0 reorder rule:** a stranger paying for anything in
  the verification tier reorders this whole file behind that item.

---

## Struck at the merge, with evidence — so nobody does it twice

ERC-8183 read: RULED 08-18, only the key ruling survives (NOW).
Wallet-law blanks: RULED 08-18, funding discipline. Deliver-first
(B6, 08-18), replay-concurrency (B7, 08-20), cold-read of remaining
artifact classes (B8, 08-19, all passed). Refund-window detector +
`order_id` (both 08-10; the TASKS backlog copy was stale). Launch
check, mandate, regulars' credit, bounty board (BUILT 08-19, pen
passes remain — NEXT). Second retirement (08-20, 26 → 22). ClawHub
2.9.0 staleness (overtaken; republish in NOW is what is left). The
08-05 pagination collapse (SOLVED 08-19, offset, never a cursor).
MCP-abandonment (closed measured-cheap 08-11, twice). The rest of
what the three files marked done stays in `docs/archive/`.
