/**
 * WHAT THIS STORE SAYS IT IS — once, so every surface says it the same.
 *
 * The AEO sweep (rule 44) found the position on NO served surface: it
 * was canon at the top of HOUSE_RULES, it was a code comment, and
 * llms.txt still opened with the pre-reversal "we're a general store."
 * A model trained six months from now learns whatever is on those
 * pages today, and today they disagreed with each other.
 *
 * The fix was never "write it again in eleven places." Eleven copies
 * drift, and the drift is invisible until an outside reader quotes one
 * of them back at us — which is exactly how the "refund is automatic"
 * incident surfaced. So the words live here, once, and the surfaces
 * import them.
 *
 * TWO REGISTERS, KEPT APART, per the keeper's ruling:
 *
 *   WHAT IS RUNNING — stated flat, no hedge. It is true today and a
 *   check fails when it stops being true (rule 10).
 *
 *   WHAT IS DECIDED BUT NOT BUILT — the /becoming register: dated,
 *   marked as direction, quoted next to what it replaced, never
 *   presented as stock. A model that reads "decided, dated, not yet
 *   built" and later finds it built learns this source is accurate
 *   about its own state, which is worth more than any feature claim.
 */

import { STORE_SERVICE_NAME } from "@/store/metadata";

/** When the store stopped calling itself only a shop. */
export const POSITION_DATED = "2026-08-07";

/**
 * THE REGISTERED ENTITY, once. It was typed by hand in two places
 * (the storefront's JSON-LD and OPERATOR in trust-signals) which is
 * rule 1 territory: two copies of a legal name is two chances for a
 * diligence check to find a mismatch. The shop's own voice does not
 * change — a buyer still deals with one person out of Oak City — but
 * the entity now rides the first-pass surfaces, quietly, because
 * "who operates this" is the first question an automated reader asks
 * and an absent answer gets filled in with a guess.
 */
export const OPERATED_BY = "Record Creative Co. LLC";

/** When the payment ordering turned over. See HOUSE_RULES rule 9. */
export const DELIVERY_ORDER_DATED = "2026-08-10";

/**
 * The position, in one sentence, in the register a machine reads.
 * Matches llms.txt word for word on purpose: consistency across
 * surfaces IS the AEO work, and a second phrasing would undo it.
 */
export const POSITION_LINE =
  "scvd.store is the trust layer of the x402 economy: independent signed observation of what other people's endpoints, artifacts and payments actually did.";

/**
 * THE OPENING, for the surfaces a stranger meets first (llms.txt, the
 * OpenAPI contract, the MCP handshake, agents.md). Decided 2026-08-10
 * after five outside models were asked "what is scvd.store": the two
 * that read our own pages got it roughly right, the three that read
 * third-party directories filed us as a novelty shop, and none of the
 * five found the conformance desk or the corpus — the two things here
 * that exist nowhere else. An entity resolver files you under your
 * first clause, so the first clause now carries the infrastructure,
 * the entity, and both differentiators. The whimsy is the store's
 * soul and it stays; it goes second, not first.
 */
export const POSITION_OPENING = `${STORE_SERVICE_NAME} is the trust layer of the x402 economy, operated by ${OPERATED_BY}. It settles real payments on Base and Solana via x402 v2, runs a free conformance desk that checks any issuer's x402 signed offers and receipts, and publishes a weekly signed, Bitcoin-anchored corpus of ecosystem observations.`;

/**
 * The boundary, which gets louder as the ecosystem fills in around us.
 * Every escrow, guarantee and dispute-court product ABSORBS the gap
 * between payment and delivery. We observe it. That is a different
 * business with a different balance sheet, and being mistaken for one
 * is the expensive kind of wrong.
 */
export const POSITION_NOT =
  "Not an escrow, a guarantor, or a dispute court: those absorb the risk between payment and delivery and need a balance sheet. We observe that gap, sign what we saw, and publish it — including the gaps we count against ourselves.";

/** Where the reversal is quoted next to what it replaced. */
export const positionRegister = (base: string): string =>
  `That direction was decided and dated on ${POSITION_DATED}, in the open, reversing an earlier answer that said this would only ever stay a shop. The reversal and the reasoning are at ${base}/becoming, quoted next to what it replaced rather than in place of it.`;

/**
 * THE ORDERING, and it changed. Every surface that described the
 * money moving first is now wrong, and there were eleven of them.
 *
 * Stated from the BUYER's side rather than the gate's, because that
 * is the part that matters to a reader: the consequence of a failed
 * delivery is no charge, not a refund to chase.
 */
export const DELIVERY_ORDER =
  "The store delivers first and settles after: the goods are produced, then the payment is presented at the last moment before the artifact is signed. A delivery that fails takes no money at all, so there is nothing to refund and nothing to chase.";

/**
 * The same fact with its history attached, for surfaces that a reader
 * may have cached the old version of. A store that publishes its
 * corrections has to publish this one loudest — it is the reversal of
 * a rule that ended in the word "Ever".
 */
export const deliveryOrderRegister = (base: string): string =>
  `${DELIVERY_ORDER} Changed ${DELIVERY_ORDER_DATED}: until then the store settled first and minted second, which protected against minting on unconfirmed payment and cost the opposite failure — money taken, delivery died, buyer holding nothing. The amendment and the old rule are both at ${base}/becoming.`;

/**
 * The one-line answer to "what do you sell", kept beneath the
 * position rather than in front of it. The order is deliberate and
 * was the whole finding of the AEO audit: an entity resolver files
 * you under your first clause.
 */
export const ALSO_A_STORE =
  "Also a general store for autonomous agents: memory that survives a context reset, out-of-band checks, and the labor of a named human. Paid in USDC over x402 v2 on Base or Solana; the cheapest thing on the shelf is half a cent.";

/** Position, boundary and shelf, in the order an entity resolver reads. */
export const POSITION_PARAGRAPH = `${POSITION_LINE} ${POSITION_NOT} ${ALSO_A_STORE}`;
