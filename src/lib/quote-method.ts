/**
 * HEAD IS A GET WITH THE BODY WITHHELD — AND FOR THREE WEEKS IT WAS A
 * DOOR WITH THE PRICE WITHHELD (2026-09-20).
 *
 * RFC 9110 §9.3.2: "The server SHOULD send the same header fields in
 * response to a HEAD request as it would have sent if the request
 * method had been GET." Every paid route this store hands the x402
 * stack is keyed `GET /path` (buildRoutesConfig in lib/payments.ts),
 * and the native lane's door tests all began `if (method !== "GET")`.
 * So a HEAD matched no paid route, the gate waved it through, and the
 * handler's belt-and-braces line answered 402 with NO PAYMENT-REQUIRED
 * header, NO WWW-Authenticate and therefore no price. The status said
 * "pay me" and every field that says what to pay was missing.
 *
 * WHO THAT COST. A directory probes a door twice — once GET, once
 * HEAD — and keeps one record. A reader holding the HEAD saw a 402
 * that quoted nothing, which reads exactly like a door that cannot be
 * paid. We published the price down one knock and withheld it down the
 * other, and no spec here could tell, because every spec knocks the
 * way a buyer knocks.
 *
 * THE SECOND HALF, AND IT IS THE PART THAT MOVES MONEY. Teaching the
 * gate that HEAD is GET would also teach it to SETTLE a HEAD — verify,
 * charge, fulfil, mint — and then hand the result to a runtime that
 * throws the body away (Hono's own dispatch: `new Response(null,
 * await dispatch(..., "GET"))`). Money out, goods nowhere. So HEAD
 * quotes and never settles: a payment presented on a HEAD is not read,
 * not verified and not charged, and the answer is the same 402 quote a
 * bare knock gets. A buyer pays with GET. That is not a grudging
 * exception to §9.3.2 — the header fields ARE the same, which is the
 * whole of what it asks for — and it is AT_SCALE.md rule 7 read
 * plainly: money fails closed.
 */

/** The method that carries a payment on any door this store keeps. */
export const PAYING_METHOD = "GET";

/**
 * A knock that may be answered but never charged. HEAD is the only one
 * today; OPTIONS never reaches the gate (lib/cors.ts answers it).
 */
export function isQuoteOnlyMethod(method: string): boolean {
  return method.toUpperCase() === "HEAD";
}

/**
 * The method a door should be ASKED ABOUT for this knock: the paying
 * method for a quote-only knock, and otherwise the method itself.
 * Every route table, capability test and challenge in this store reads
 * the answer through here, so the two lanes cannot answer a HEAD
 * differently from each other.
 */
export function quotedMethod(method: string): string {
  return isQuoteOnlyMethod(method) ? PAYING_METHOD : method;
}
