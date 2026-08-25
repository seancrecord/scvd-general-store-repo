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
 *   dated     True on a stated day. NOT the consolation prize: this
 *             store's entire method is the dated observation that
 *             expires and is re-taken, and copy was the one place it
 *             never applied that to itself. Stale copy is the cost
 *             of shipping fast, not a character failure — a date
 *             lets a reader weigh age instead of trusting forever.
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
    match: "The free preflight at /api/preflight/v2 spends outbound",
    resolution: "derived",
    from: "PROBES_PER_MINUTE / GLOBAL_PROBES_PER_MINUTE",
    why: "Said the opposite for a day after 0.13 shipped a limiter. Now reads the limiter's own constants.",
  },
  {
    id: "limits.openapi.rate",
    file: "src/routes/openapi.ts",
    match: "The free preflight at /api/preflight/v2 is limited",
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
    id: "identity.no-premises-address",
    file: "src/pages/storefront-page.ts",
    match: "There is no premises address — one person, no shop floor",
    resolution: "declined",
    why: "A readiness audit flagged Organization.address missing. The only address is where the keeper lives. A PostalAddress would be a home or an invention, and inventing it is the failure /corrections exists to catch.",
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
];
