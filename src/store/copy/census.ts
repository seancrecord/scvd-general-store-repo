/**
 * THE CENSUS FINDING, once, because it is the single most quotable
 * fact this store has produced and until 2026-08-10 it lived only in
 * the x402-sign package README — a surface no crawler of scvd.store
 * ever reaches. The conformance and corpus landing pages both print
 * it; a test holds this constant and the README to the same figure so
 * the two cannot drift.
 *
 * DATED, deliberately. The census is a dated observation of a moment,
 * not a standing claim about the ecosystem — the same register as
 * every corpus entry. When a later round finds a different number,
 * that round is a new dated finding, not an edit to this one.
 */
export const CENSUS_DATE = "2026-08-03";

/** The headline figure, alone, for the surfaces that can only carry a clause. */
export const CENSUS_NUMBER = "34 of 35";

/**
 * PLACEMENT-SCOPED, 2026-08-28 (the instrument audit). The earlier
 * wording said "serve no signed offers at all", and "at all" was a
 * claim the instrument could not make: the probe reads the challenge
 * from the PAYMENT-REQUIRED header, and the offer-receipt convention
 * places offers primarily in the 402 BODY — a placement that census
 * never parsed. The denominator also excludes this store's own door
 * (a Worker cannot fetch its own hostname), which is the one door
 * known to serve signed offers. The finding stays, dated, in the
 * scope it was actually measured.
 */
export const CENSUS_FINDING = `A census of every host on the public x402 discovery list (${CENSUS_DATE}, one GET each, reproducible by anyone via the free checker at POST /api/preflight/v1) found ${CENSUS_NUMBER} hosts serve no signed offers in the challenge header that probe reads — offers placed only in the 402 body were beyond that instrument's read — and the one attempting them serves offers that fail JWS parsing before a verifier reads a single field. Our own door, which serves signed offers, is not in the ${CENSUS_NUMBER.split(" ").pop()}: a census cannot probe its own host, and that exclusion flatters nobody but us, so it is stated.`;

/** What the finding means, plainly, for a reader deciding whether to care. */
export const CENSUS_WHY_IT_MATTERS =
  "A 402 without a signed offer asks the buyer to pay against terms nobody committed to. With one, the buyer holds a pre-payment commitment — price, asset, payTo, expiry — checkable against the issuer's published key by anyone, forever, without asking the issuer. In a market of autonomous buyers deciding whom to trust mechanically, that is the cheapest trust signal a seller can ship, and as of that dated census almost nobody shipped it where our instrument could see.";
