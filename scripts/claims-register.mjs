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
    match: "An evidence observatory for agentic commerce: free x402",
    resolution: "dated",
    asOf: "2026-08-25",
    why: "Short form of the 0.10 canon; a meta description cannot carry POSITION_OPENING's length. Owed a second edit whenever the canon moves.",
  },
  {
    id: "identity.og-description",
    file: "src/store/copy/storefront.ts",
    match: "An evidence observatory for agentic commerce. Free conformance",
    resolution: "dated",
    asOf: "2026-08-25",
    why: "Same canon, social-card length.",
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
    id: "try.no-wrong-mode",
    file: "src/store/copy/practice-counter.ts",
    match: "There is no mode here to get wrong",
    resolution: "dated",
    asOf: "2026-08-25",
    why: "The practice counter has one path. A 'test mode' would be a different door pretending to be this one.",
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
  /**
   * THE FREE DOORS' PRICE (rule 57.3 sweep, 2026-08-29). "Free" is
   * the one claim on an instrument a reader cannot check by reading
   * it, so both halves are bound to behaviour rather than to a
   * sentence.
   */
  {
    id: "price.free-instruments.amount",
    file: "src/store/surface-contract.ts",
    match: 'amount: "$0.00"',
    resolution: "derived",
    from: "the absence of a payment gate on the routes themselves — test/free-doors-answer-rule-57.spec.ts POSTs every free door the atlas advertises with no payment and no credentials and fails if any answers 402, 401 or 403, or emits a PAYMENT-REQUIRED header",
    why: "A price of $0.00 typed beside a door that later grew a paywall is the same class of lie as a stale item count, and worse: it is the sentence an agent reads before deciding to call. The test proves the door takes no money rather than the file promising it does not.",
  },
  {
    id: "price.free-instruments.cadence",
    file: "src/store/surface-contract.ts",
    match: "There is no metered tier above it and no key that unlocks more of it",
    resolution: "derived",
    from: "the same assertion — a metered tier or a key would have to answer 402 or 401 to an unpaid, unauthenticated POST, and the test fails if any free door does",
    why: "Rule 57.3 asks for the cadence of anything paid; the honest cadence of a free door is that there is not one, and 'no key unlocks more of it' is checkable in exactly the same breath as 'it takes no money'.",
  },
  {
    id: "declined.browser-surfaces",
    file: "src/store/copy/declined.ts",
    match: "on document.modelContext for agents resident in the visitor's browser",
    resolution: "derived",
    from: "webmcpTools() and uiResourceCatalog() — the tool list, its count, and the card count render from the same derivations the surfaces serve",
    why: "The first draft nearly said 'scoped, not built' against a surface another desk shipped the same week; the sentence now reads the live catalog so the next release cannot falsify it.",
  },
];
