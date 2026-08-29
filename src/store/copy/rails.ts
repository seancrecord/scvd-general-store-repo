/**
 * WHAT A STOCK CLIENT ACTUALLY DOES WITH THREE RAILS (task #89).
 *
 * This store offers Base, Polygon and Solana in every 402, at the same
 * tiers, and said so in a way that credited the BUYER with picking
 * among them: "same tiers on every rail, your wallet's choice."
 *
 * A stock client does not pick, and does not fall back. Read in the
 * installed packages on 2026-08-28:
 *
 *   - `applySpendControls` filters the accepts, then the default
 *     `paymentRequirementsSelector` takes `accepts[0]`
 *     (@x402/core client). This store puts Base first ON PURPOSE, so a
 *     blindly-signing client lands on Base — which is the same fact
 *     from the other side, and the reason the old sentence read as
 *     true from in here.
 *   - `wrapFetchWithPayment` (@x402/fetch) builds ONE payload, sends
 *     it, and retries only when a hook returns `{recovered: true}`.
 *     There is no loop over the remaining accepts. If the chosen rail
 *     fails, the other two are never attempted.
 *
 * So for an unconfigured buyer the rail is not a choice and not a
 * fallback: it is Base, or nothing. The sentence was wider than what
 * the buyer actually gets, published by us, and flattering to us —
 * the same family as the signed-offers claim narrowed in #73, and
 * exactly what rule 56 is for.
 *
 * WHAT IS STILL TRUE and stays: the rails ARE all offered, at the same
 * tiers, and a hand-rolling or deliberately configured client really
 * can take any of them. The fix was never to stop offering three
 * rails. It is to stop implying that an unconfigured client walks
 * them.
 *
 * ONE SENTENCE, EVERY SURFACE. The claim lived in two files and was
 * fixed in neither for weeks; a shared constant is what stops the
 * guide and the skill from drifting into two different truths about
 * the same library. The spec asserts both carry this verbatim, which
 * is a check no amount of prose-matching could do honestly — an
 * earlier draft of that test passed because an unrelated sentence
 * about reading order contained the words "takes the first".
 */
export const STOCK_CLIENT_RAIL_NOTE =
  "All three rails carry the same tiers, and a client that chooses can take any of them. A STOCK CLIENT DOES NOT CHOOSE: @x402/core selects the first accept that survives its spend controls — Base, because we list it first on purpose — and @x402/fetch pays once. It does not try the other rails if that payment fails. Three rails is a choice we offer, not a fallback you get for free; configure your client's selector if you want a different one.";
