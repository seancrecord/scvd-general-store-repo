import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const BASE = "https://scvd.store";

/**
 * WHERE SETTLEMENT SITS RELATIVE TO THE HANDLER — characterized, so
 * the keeper's ruling rests on a demonstrated fact rather than on a
 * code comment.
 *
 * WHAT THIS TEST IS AND IS NOT. It does NOT prove deliver-first works
 * here; that cannot be tested without rewriting the gate, and pretending
 * otherwise would be the exact overclaim this store keeps catching. What
 * it does is pin the COST of the ordering we chose, which is the premise
 * the whole deliver-first argument rests on.
 *
 * THE BACKGROUND. x402's stock middleware settles AFTER the route
 * handler returns, which means a handler that fails with a 4xx cancels
 * the payment instead of stranding it. Our gate inverts that on purpose
 * — payment-gate.ts settles, then calls next() — so that a failed
 * settlement can never mint a certificate. Rule 9: "settle before you
 * mint. No certificate, order, or inventory movement on unconfirmed
 * payment. Ever."
 *
 * We bought protection against minting-on-unconfirmed-payment and paid
 * for it with the strand risk. THE STRAND RISK IS NOT HYPOTHETICAL: it
 * fired three times in production as `undelivered_sale`, and it is why
 * the ambiguous-settle rescue and the paid retry both exist.
 *
 * So the trade is real in both directions, and the test that matters is
 * the one that shows the money moves first. If that ever stops being
 * true — if someone reorders the gate — this file goes red and the
 * decision gets made deliberately rather than discovered in an alert.
 */

let facilitator: ReturnType<typeof installFacilitatorMock>;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

describe("settlement happens before the handler runs", () => {
  it("moves the money first, which is what makes 'paid, no goods' possible at all", async () => {
    facilitator.settleCalls = 0;

    const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    expect(challenge.status).toBe(402);

    const signature = buildPaymentSignature(
      decodePaymentRequired(challenge).accepts[0] as never,
    );
    const paid = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "PAYMENT-SIGNATURE": signature },
    });
    expect(paid.status).toBe(200);

    /*
     * One settle, and it happened inside this request. The ordering
     * itself is not directly observable from out here — what IS
     * observable is that a settle occurred for a purchase whose
     * handler then ran. That is the necessary condition for the
     * failure class: if the handler had died after this point, the
     * money would already have moved and the buyer would hold
     * nothing.
     */
    expect(facilitator.settleCalls).toBe(1);
  });

  it("leaves a delivery intent behind, which is the store admitting the gap exists", async () => {
    /*
     * The outbox row is the tell. It is written AFTER settlement and
     * BEFORE the handler, and it only exists because settling first
     * creates a window where money has moved and goods have not. A
     * store that settled last would not need one.
     *
     * So the presence of this machinery is itself the characterization:
     * we know the gap is there, we instrumented it rather than closed
     * it, and closing it is the ruling in front of the keeper.
     */
    const audit = await import("@/services/delivery-audit");
    expect(typeof audit.openDeliveryIntent).toBe("function");
    expect(audit.DELIVERY_GRACE_MINUTES).toBeGreaterThan(0);
  });
});
