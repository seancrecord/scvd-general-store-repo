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
];
