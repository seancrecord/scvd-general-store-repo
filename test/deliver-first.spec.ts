import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentGate } from "@/lib/payment-gate";
import type { Env, HonoEnv } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * RULE 9, AMENDED 2026-08-10 — DELIVER FIRST, SETTLE AFTER.
 *
 * The keeper set his own acceptance condition and this file is it, in
 * his words: **fail a handler, assert no settle call and no on-chain
 * movement.** If the test passes, the property holds.
 *
 * WHAT TURNED THE RULE OVER. The old rule — "settle before you mint,
 * no certificate on unconfirmed payment, ever" — bought protection
 * against minting on unconfirmed payment and paid for it in the other
 * currency: money moves, the delivery step dies, the buyer holds
 * nothing and may not be running any more to complain. That is not a
 * thought experiment. It fired as `undelivered_sale` on both rails,
 * and the ambiguous-settle rescue, the paid retry and the entire
 * delivery audit exist because of it.
 *
 * The trade, both directions, so nobody reads this file as a
 * one-sided win:
 *
 *   settle-first   delivery fails → PAID, NO GOODS. Buyer is owed.
 *   deliver-first  settle fails   → goods out, no money. We eat it.
 *
 * Affordable here only because our goods cost approximately nothing to
 * make. A shop shipping physical goods should not take this trade.
 *
 * WHY THE TEST MOUNTS ITS OWN APP. The store deliberately has no route
 * that fails after taking payment — every pre-flight refusal, sold-out
 * included, runs BEFORE the gate and moves no money. Adding one to
 * production purely to prove failures are handled would put a
 * money-losing path in the store to demonstrate that money-losing
 * paths are caught. So the gate is mounted here, in front of a handler
 * that exists only to fail, which tests the ordering contract itself
 * rather than any one item's luck.
 */

let facilitator: ReturnType<typeof installFacilitatorMock>;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

beforeEach(() => {
  facilitator.settleCalls = 0;
});

/**
 * A gated route whose handler behaves however the test says. The path
 * is a REAL priced item, because the gate prices from the menu and a
 * made-up path would be testing a 404 rather than the money spine.
 */
function appThatFails(mode: "throws" | "non_2xx" | "delivers"): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  app.use("/api/buy/*", paymentGate);
  app.get("/api/buy/:item_id", (c) => {
    if (mode === "throws") throw new Error("the delivery step died");
    if (mode === "non_2xx") return c.json({ error: "sold out" }, 409);
    return c.json({ ok: true });
  });
  app.onError((_error, c) => c.json({ error: "handler failed" }, 500));
  return app;
}

async function buyThrough(
  app: Hono<HonoEnv>,
  path = "/api/buy/hello",
): Promise<Response> {
  const first = createExecutionContext();
  const challenge = await app.fetch(
    new Request(`${BASE}${path}`),
    testEnv,
    first,
  );
  await waitOnExecutionContext(first);
  expect(challenge.status).toBe(402);

  const accepted = decodePaymentRequired(challenge).accepts[0];
  if (!accepted) throw new Error("no tier offered");
  const second = createExecutionContext();
  const paid = await app.fetch(
    new Request(`${BASE}${path}`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    }),
    testEnv,
    second,
  );
  await waitOnExecutionContext(second);
  return paid;
}

describe("the keeper's acceptance test", () => {
  it("A HANDLER THAT THROWS TAKES NO MONEY — no settle call, nothing on chain", async () => {
    const response = await buyThrough(appThatFails("throws"));

    // The buyer is told it failed, and the buyer is not charged.
    expect(response.status).toBeGreaterThanOrEqual(400);
    /*
     * THE ASSERTION THE RULE RESTS ON. The facilitator is the chain in
     * these tests: a settle call is money moving. Zero of them means
     * the authorization the buyer signed was never presented, so there
     * is nothing to refund and nothing to chase — which is the entire
     * point of the amendment.
     */
    expect(facilitator.settleCalls).toBe(0);
  });

  it("A HANDLER THAT RETURNS A NON-2xx TAKES NO MONEY EITHER", async () => {
    /*
     * A 409 SOLD OUT after payment takes money without delivering just
     * as surely as a throw does. Under the old ordering that case was
     * caught only afterwards, by the delivery audit leaving a row open.
     * Under this one it cannot happen: no 2xx, no settle.
     */
    const response = await buyThrough(appThatFails("non_2xx"));
    expect(response.status).toBe(409);
    expect(facilitator.settleCalls).toBe(0);
  });

  it("still settles exactly once when the goods DO go out", async () => {
    // The other half of the property, and the one that would be easy
    // to break while fixing the first: a store that never charges
    // anybody passes both tests above.
    const response = await buyThrough(appThatFails("delivers"));
    expect(response.status).toBe(200);
    expect(facilitator.settleCalls).toBe(1);
  });
});

describe("what a failed delivery leaves behind", () => {
  it("writes NO settlement to the counters when the handler dies", async () => {
    const before = Number((await testEnv.COUNTERS.get("settles")) ?? 0);
    await buyThrough(appThatFails("throws"));
    const after = Number((await testEnv.COUNTERS.get("settles")) ?? 0);
    // A settle counter that moves without money moving is how a
    // reconciliation reads healthy through a failure.
    expect(after).toBe(before);
  });

  it("does not burn the buyer's authorization, so the retry is free", async () => {
    /*
     * The nonce is the buyer's one-shot. Spending it on a delivery
     * that never happened would turn "try again" into "sign again" at
     * exactly the moment the buyer has least patience — and the paid
     * retry exists because that bounce is real.
     */
    const app = appThatFails("throws");
    const first = createExecutionContext();
    const challenge = await app.fetch(
      new Request(`${BASE}/api/buy/hello`),
      testEnv,
      first,
    );
    await waitOnExecutionContext(first);
    const accepted = decodePaymentRequired(challenge).accepts[0];
    if (!accepted) throw new Error("no tier offered");
    const signature = buildPaymentSignature(accepted);

    for (const attempt of [1, 2]) {
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request(`${BASE}/api/buy/hello`, {
          headers: { "PAYMENT-SIGNATURE": signature },
        }),
        testEnv,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      // Not a 402 "that authorization has been through this till" —
      // it failed the same way both times, which is what retryable
      // means.
      expect(response.status, `attempt ${attempt}`).toBeGreaterThanOrEqual(400);
      expect(response.status, `attempt ${attempt}`).not.toBe(402);
    }
    expect(facilitator.settleCalls).toBe(0);
  });
});
