/**
 * THE REGISTER ITSELF — the rules file scripts/claims.mjs reads.
 *
 * One entry per public claim that has been RESOLVED. Everything
 * claim-shaped that is not in here counts against the budget, which
 * only ever goes down.
 *
 * KEYED ON TEXT, NOT ON A LINE NUMBER, because line numbers move
 * every time somebody adds an import and a register that drifts by
 * one line is worse than no register — it would resolve the wrong
 * sentence and report a clean sheet.
 *
 * AN ENTRY THAT MATCHES NOTHING FAILS THE RUN. That is the rot
 * check: copy gets rewritten, and a resolution left pointing at a
 * sentence nobody serves any more is a claim that has quietly
 * escaped its guard. The register is only worth what its weakest
 * entry is worth.
 *
 * FOUR RESOLUTIONS, and the fourth was learned the hard way on
 * 2026-08-25:
 *
 *   derived   The value comes from the code that decides it. Best,
 *             and unavailable more often than you would hope —
 *             a meta description has a length budget a paragraph
 *             constant cannot meet.
 *   dated     True on a stated day. Field name: asOf (ISO date),
 *             not as_of — claims.mjs does not read a date off the
 *             entry (the line itself, or this file, is the record),
 *             but a wrong name means the resolution does not carry
 *             the date a reader was promised. NOT the consolation
 *             prize: this store's entire method is the dated
 *             observation that expires and is re-taken, and copy
 *             was the one place it never applied that to itself.
 *             Stale copy is the cost of shipping fast, not a
 *             character failure — a date lets a reader weigh age
 *             instead of trusting forever.
 *   declined  A check we will never pass, refused in writing, with
 *             the reason attached. The Organization `address` is the
 *             case in point: a scanner flagged it missing, and the
 *             only address this store has is where the keeper lives.
 *             An agent moving fast at 1am nearly "fixed" that. The
 *             reasoning has to be reachable from the defect, or the
 *             next one fixes it.
 *   external  A fact about somebody else's surface. We can date when
 *             we last looked; we cannot bind it, and we must never
 *             pretend otherwise.
 */
export const REGISTER = [
  {
    id: "how-it-works.no-body",
    file: "src/routes/how-it-works.ts",
    match: "There is no body to post and no field to fill",
    resolution: "derived",
    from: "howItWorksRoutes registers GET handlers only, so Hono answers 405 to every other method",
    why: "Caught unbound on the room's first gates run (2026-08-30) and it was right to: the sentence is claim-shaped and nothing proved it. It is not a dating case — it is a structural fact about how the route is registered, not an observation that expires. test/how-it-works.spec.ts POSTs a real body at both spellings and requires 405, so the sentence fails the build the day the door starts accepting one.",
  },
  {
    id: "limits.preflight.rate",
    file: "src/routes/developers.ts",
    match: "One family of paths is limited and the rest are not",
    resolution: "derived",
    from: "PROBES_PER_MINUTE / GLOBAL_PROBES_PER_MINUTE",
    why: "Said the opposite for a day after 0.13 shipped a limiter. Now reads the limiter's own constants.",
  },
  {
    id: "limits.openapi.rate",
    file: "src/routes/openapi.ts",
    match: "The free preflight is limited — ",
    resolution: "derived",
    from: "PROBES_PER_MINUTE / GLOBAL_PROBES_PER_MINUTE",
    why: "The machine-readable copy of the same stale sentence. Found by this register's first run.",
  },
  {
    id: "identity.meta-description",
    file: "src/store/copy/storefront.ts",
    match: "An evidence observatory for agentic commerce: preflight an x402 door before paying",
    resolution: "dated",
    asOf: "2026-09-01",
    why: "Short form of the sixty words inked 2026-09-01; a meta description cannot carry the whole paragraph. Owed a second edit whenever the canon moves.",
  },
  {
    id: "identity.og-description",
    file: "src/store/copy/storefront.ts",
    match: "ogDescription: VALUE_PROPOSITION",
    resolution: "derived",
    from: "VALUE_PROPOSITION",
    why: "The social card carries the keeper's sixty words verbatim since 2026-09-01, read from the one constant every first screen derives from.",
  },
  {
    id: "identity.no-street-address",
    file: "src/pages/storefront-page.ts",
    match: "There is no street address or shop floor",
    resolution: "declined",
    why: "A readiness audit flagged Organization.address missing, and the first answer declined the whole field: the only address this store has is where the keeper lives. Half of that held. On 2026-08-26 the block gained a LOCALITY-level PostalAddress derived from OPERATOR.location — the town has been on the sign, the badges and the stamps since July — and the street line stays declined for the original reason, which is the reason this entry still exists.",
  },
  {
    id: "distribution.cli-on-npm",
    file: "src/store/cli.ts",
    match: "export const CLI_PUBLISHED = true;",
    resolution: "derived",
    from: "CLI_PUBLISHED",
    why: "A readiness audit asked for an official CLI on npm. The keeper published it on 2026-08-28 — scvd-cli@0.1.0, from CI with provenance — and this flag turned every surface that names the package over with it: /developers in three dialects, /llms.txt, the RFC 9727 catalog, the package README. The entry stays after the publish rather than being deleted, because the flag is what keeps the install line honest in BOTH directions, and this register is where that guarantee is written down. It also earned its keep at the flip: this file pinned the old literal, so the register failed the build the moment the constant moved and the copy had not all followed.",
  },
  {
    id: "ops.no-automatic-remedy",
    file: "src/routes/admin.ts",
    match: "There is no automatic remedy and that is deliberate",
    resolution: "declined",
    why: "Undelivered sales are fulfilled or refunded by the keeper's hand. A cron that re-runs a handler with unknown side effects could double-deliver; a refund is money moving.",
  },
  {
    id: "directory.no-paid-placement",
    file: "src/routes/directory.ts",
    match: "There is no fee and no placement to buy",
    resolution: "declined",
    why: "The trust list is the keeper's own. Selling a line would make the list a product, and the list is evidence.",
  },
  {
    id: "keys.no-revocation-list.llms",
    file: "src/routes/llms.ts",
    match: "There is no revocation list and there will not be one",
    resolution: "declined",
    why: "A revocation endpoint on the same host as the key it revokes adds ceremony and no security.",
  },
  {
    id: "keys.no-revocation-list.continuity",
    file: "src/store/key-continuity.ts",
    match: "There is no revocation list and there will not be one under this design",
    resolution: "declined",
    why: "Same refusal as llms, on the continuity page the key itself cites.",
  },
  {
    id: "keys.no-revocation-registry.spec",
    file: "src/routes/namespace-spec.ts",
    match: "There is no revocation registry, and this spec does not pretend one",
    resolution: "declined",
    why: "Expiry, public withdrawal, and key retirement do the work. A registry we served would be the compromised host marking itself honest.",
  },
  {
    id: "score.no-ranking.doors",
    file: "src/routes/doors.ts",
    match: "There is no ranking to get",
    resolution: "declined",
    why: "Rule 43, on the room a reader most expects a ranking in — #26 asked for a scoreboard by name. The list is alphabetical and every row is one dated observation; test/door-index.spec.ts fails on a fractional number in any host row, which is what a ranking would have to compute.",
  },
  {
    id: "score.no-rating.llms",
    file: "src/routes/llms.ts",
    match: "There is no rating, no ranking, and no",
    resolution: "declined",
    why: "Rule 43. We publish dated observations. A rating of anyone, including us, is a grade.",
  },
  {
    id: "surface.no-human-well-known",
    file: "src/routes/well-known.ts",
    match: "There is no human-facing version of this page and that is deliberate",
    resolution: "declined",
    why: "The well-known room is for automated diligence. The human rooms already say it better.",
  },
  {
    id: "support.no-queue",
    file: "src/store/trust-signals.ts",
    match: "There is no support queue, no ticket system and no phone number",
    resolution: "declined",
    why: "One person. A queue would be the first false claim on a page about legitimacy.",
  },
  {
    id: "licence.no-attribution-clause",
    file: "src/store/rights.ts",
    match: "There is no attribution requirement and no commercial-use clause",
    resolution: "declined",
    why: "Bought is bought. A licence that follows you home is a second price nobody mentioned at the till.",
  },
  {
    id: "units.atomic-example.payment-gate",
    file: "src/lib/payment-gate.ts",
    match: "5000 atomic is $0.005",
    resolution: "dated",
    asOf: "2026-08-25",
    why: "Textbook USDC-6-decimals conversion in the 402 body. Not a shelf price — the half-cent that makes atomic vs dollars visible.",
  },
  {
    id: "units.atomic-example.preflight",
    file: "src/routes/preflight.ts",
    match: "Amounts are ATOMIC units",
    resolution: "dated",
    asOf: "2026-08-25",
    why: "Same textbook conversion on the defect vocabulary the preflight publishes.",
  },
  {
    id: "identity.openapi-guidance",
    file: "src/routes/openapi.ts",
    match: "SCVD General Store verifies x402 commerce and sells signed artifacts",
    resolution: "dated",
    asOf: "2026-08-25",
    why: "A length-budget x-guidance paragraph. Prices and routes inside it go stale; the register will fail when the sentence is rewritten.",
  },
  {
    id: "skill.legacy-penny-signal",
    file: "src/store/spec.ts",
    match: "the Penny Shelf, from $0.005",
    resolution: "dated",
    asOf: "2026-07-27",
    why: "Superseded scheduling-signal list, kept for the record and explicitly voided. Not served.",
  },
  /**
   * THE DECLINED POSITIONS (P12, 2026-08-27) — the section on
   * /developers that publishes scanner recommendations we refuse,
   * with reasons, the way /corrections publishes mistakes.
   */
  {
    id: "declined.ai-train",
    file: "src/store/copy/declined.ts",
    match: "Training is distribution here, not leakage",
    resolution: "declined",
    why: "Scanners award a point for ai-train=no; this store wants to be in the corpus models learn from. The policy line itself derives from CONTENT_SIGNAL, the same constant robots.txt serves, so the quote cannot drift from the file.",
  },
  {
    id: "declined.wikipedia",
    file: "src/store/copy/declined.ts",
    match: "a deleted article is worse than none",
    resolution: "declined",
    why: "Diligence scans want Wikipedia/Wikidata in sameAs. A month-old company fails notability; an article written to game the checklist gets deleted; a sameAs to a missing page is a false claim in machine form. Revisit at real notability.",
  },
  {
    id: "declined.browser-surfaces",
    file: "src/store/copy/declined.ts",
    match: "quote_store_purchase (free) and complete_store_purchase (consequential)",
    resolution: "derived",
    from: "webmcpTools() and uiResourceCatalog() — the tool list, its count, and the card count render from the same derivations the surfaces serve",
    why: "The first draft nearly said 'scoped, not built' against a surface another desk shipped the same week; the sentence now reads the live catalog so the next release cannot falsify it.",
  },
  /**
   * THE BOUNTY BOARD'S REFUSAL CATALOGUE (2026-09-08) — the board
   * publishes every way the claim door says no, so a walker reads
   * them before their money is gone rather than after.
   */
  {
    id: "bounties.refusal.spent-listing",
    file: "src/services/bounty-board.ts",
    match: "There is no second try on a spent listing",
    resolution: "derived",
    from: "claimBounty's `bounty.status !== \"open\"` refusal, taken against the status bountyStatusAt derives at read time",
    why: "Claim-shaped and correctly caught: it tells a stranger their money is gone. It is structural rather than dated — one bounty pays once because the claim door refuses any listing whose derived status is not open, and the row carries the door's own wording, which test/bounty-board.spec.ts drives against the live door. The day a spent listing could pay twice, the catalogue's drift test goes red before this sentence does.",
  },
  /*
   * THE NEIGHBOURS' PRICES, 2026-09-10. Five receipt rows on
   * /neighbours quote a figure from somebody else's shelf: what a
   * door charged on the day we paid it. The register's fourth
   * resolution was written for exactly this — a fact about another
   * surface that we can date and cannot bind. Each row already
   * carries its purchase date in the `date` field; these entries
   * repeat it as asOf so the resolution carries the date a reader
   * was promised. Re-taking the observation means buying again.
   */
  /*
   * THE REDEMPTION GAS FIGURES (2026-09-11). Both are readings of ONE
   * transaction on Base, named in the sentence itself, so a reader who
   * doubts either can fetch the receipt and recompute rather than
   * taking the page's word. That is the strongest binding a claim
   * about money gets here: not our ledger, not our memory, a hash.
   *
   * The gas UNITS are a fact of the transaction and do not drift. The
   * fee in dollars does drift, with the base fee and the ETH price,
   * which is exactly why the sentence tells the reader to multiply it
   * out themselves instead of quoting a number that will quietly go
   * stale on the page.
   */
  {
    id: "bounty.redemption.gas-observed",
    file: "src/routes/bounties.ts",
    match: "One redemption of ours used 92,332 gas",
    resolution: "external",
    asOf: "2026-09-11",
    why: "gasUsed from the receipt of 0xa59a9232267f5dcad1b07ae58e0f063a8777e7eeab75cff9d0e2d8287d7f381e on Base, read from mainnet.base.org. The hash is in the sentence; the number is recomputable by anyone, and the dollar figure beside it is explicitly handed back to the reader to derive.",
  },
  {
    id: "bounty.redemption.third-party-submitter",
    file: "src/routes/bounties.ts",
    match: "We have seen this work without arranging it.",
    resolution: "external",
    asOf: "2026-09-11",
    why: "The same receipt: a USDC Transfer log moving 0.10 to the walker, in a transaction whose sender is a different address and whose `to` is Multicall3. An observation of what the chain shows, named as not arranged, not endorsed and not verified by us.",
  },
  {
    id: "neighbours.clinic.per-line-price",
    file: "src/store/neighbours.ts",
    match: "sold at $0.001 per line up to $1.00 per article",
    resolution: "external",
    asOf: "2026-09-09",
    why: "The Clinic's own price list, as their 402 quoted it on the purchase day. Their price, not ours; the row's date field is the record and the receipt is in the run ledger.",
  },
  {
    id: "neighbours.sniperx.settled-then-404",
    file: "src/store/neighbours.ts",
    match: "token/price SETTLED $0.01 on-chain (real transaction), then 404'd",
    resolution: "external",
    asOf: "2026-09-09",
    why: "What SniperX's token/price door charged and did on the purchase day: settled, then answered 404. A dated observation of one transaction, checkable against the chain, and covered by the page's corrections mailbox if the operator disputes it.",
  },
  {
    id: "neighbours.sniperx.tuition",
    file: "src/store/neighbours.ts",
    match: "$0.01 of tuition: settle-after-validate is a real ordering property",
    resolution: "external",
    asOf: "2026-09-09",
    why: "Our reading of the same $0.01, labelled as ours in the row. The figure is the door's price on the purchase day, same basis as the came_back line above it.",
  },
  {
    id: "neighbours.suverse.data-tier",
    file: "src/store/neighbours.ts",
    match: "Bought three doors including a $0.05 data tier.",
    resolution: "external",
    asOf: "2026-09-09",
    why: "SuVerse Pay's tier price as quoted on the purchase day. Theirs to change; the row's date says when we saw it.",
  },
  {
    id: "neighbours.suverse.teaser-vs-data",
    file: "src/store/neighbours.ts",
    match: "the $0.001 doors work, but the real data doors are $0.05",
    resolution: "external",
    asOf: "2026-09-09",
    why: "Two SuVerse Pay prices observed on the same walk, quoted so a buyer reads the price column before paying. Both are theirs; the date is ours.",
  },
];
