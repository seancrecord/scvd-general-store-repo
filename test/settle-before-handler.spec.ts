import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const BASE = "https://scvd.store";

/**
 * WHERE SETTLEMENT SITS RELATIVE TO THE HANDLER — kept after the
 * ruling, pointed the other way.
 *
 * ⚑ THE RULING LANDED. This file was written to characterize the cost
 * of settling first so the keeper could rule on it with a demonstrated
 * fact in hand. He ruled on 2026-08-10: deliver first, settle after.
 * The property this file now pins is that a sale which DELIVERS still
 * settles exactly once — the half that would be easy to break while
 * fixing the other, because a store that never charges anybody passes
 * every deliver-first test there is. The failure side lives in
 * `test/deliver-first.spec.ts`, which is the keeper's own acceptance
 * condition.
 *
 * The original note is kept below because it argued the trade
 * honestly and the reasoning is why the rule turned over.
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

describe("a sale that delivers still settles, exactly once", () => {
  it("charges once for goods that went out", async () => {
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
     * One settle. Under the amended rule this is the SUFFICIENT
     * condition nobody should lose sight of: deliver-first is only
     * correct if delivering still takes the money. Zero here would
     * mean the store had started giving its goods away, and every
     * failure-side test would still be green.
     */
    expect(facilitator.settleCalls).toBe(1);
  });

  it("still keeps the delivery audit, because the gap narrowed and did not close", async () => {
    /*
     * The outbox row survives the amendment on purpose. The window it
     * watches used to hold the whole handler, chain reads included;
     * it now holds only what a route does after calling settle, which
     * should be the mint and nothing else. A signature or a KV write
     * can still fail in there, and small is not none.
     */
    const audit = await import("@/services/delivery-audit");
    expect(typeof audit.openDeliveryIntent).toBe("function");
    expect(audit.DELIVERY_GRACE_MINUTES).toBeGreaterThan(0);
  });
});
