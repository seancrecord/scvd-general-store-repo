import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { auditDeliveries } from "@/services/delivery-audit";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * THE DELIVERY INTENT, through the REAL money path rather than a unit
 * test of its parts.
 *
 * The service tests prove the audit reads rows correctly. This proves
 * the rows get written and cleared in the right places by the actual
 * gate — which is the half that could silently stop working, because
 * an intent that is never opened and an intent that is always closed
 * both look exactly like a healthy store.
 *
 * WHAT IS NOT COVERED HERE, said rather than left for someone to
 * assume: the post-settlement FAILURE path — handler throws or
 * returns a non-2xx after the money moved — is exercised at the unit
 * level (an unclosed row is precisely that state, and auditDeliveries
 * flags it) but NOT end to end, because inducing it needs a route
 * that fails after taking payment and this store deliberately has
 * none. Every pre-flight refusal, sold-out included, runs BEFORE the
 * gate and moves no money. Adding a route that fails after settling
 * purely to test the alarm would put a money-losing path in
 * production to prove a money-losing path is detected, which is the
 * wrong trade.
 */

beforeAll(() => {
  installFacilitatorMock();
});

async function clearIntents(): Promise<void> {
  const listed = await testEnv.ORDERS.list({
    prefix: KV_KEYS.deliveryIntentPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.ORDERS.delete(key.name);
  }
}

beforeEach(async () => {
  await clearIntents();
});

async function buyHello(): Promise<Response> {
  const url = `${BASE}/api/buy/hello`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0];
  if (!accepted) throw new Error("no tier offered");
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("the delivery intent on the real money path", () => {
  it("leaves NO open row behind a sale that delivered", async () => {
    const sale = await buyHello();
    expect(sale.status).toBe(200);

    // The row existed during the request and must not survive it.
    const listed = await testEnv.ORDERS.list({
      prefix: KV_KEYS.deliveryIntentPrefix,
    });
    expect(listed.keys.length).toBe(0);

    const audit = await auditDeliveries(testEnv);
    expect(audit.undelivered).toEqual([]);
    expect(audit.in_flight).toBe(0);
  });

  it("never opens a row for a request that did not pay", async () => {
    // A 402 moved no money, so there is nothing to owe anybody.
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(challenge.status).toBe(402);
    const listed = await testEnv.ORDERS.list({
      prefix: KV_KEYS.deliveryIntentPrefix,
    });
    expect(listed.keys.length).toBe(0);
  });

  it("never opens a row for a free surface", async () => {
    await SELF.fetch(`${BASE}/menu.json`);
    await SELF.fetch(`${BASE}/llms.txt`);
    const listed = await testEnv.ORDERS.list({
      prefix: KV_KEYS.deliveryIntentPrefix,
    });
    expect(listed.keys.length).toBe(0);
  });

  it("the audit desk answers, and says empty is expected rather than rendering blank", async () => {
    const res = await SELF.fetch(`${BASE}/admin/deliveries`, {
      headers: { Authorization: `Basic ${btoa("keeper:test-admin-password")}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body["verdict"])).toContain("No undelivered sales");
    // And it names the blind spot it exists to cover, so the desk
    // explains itself to whoever lands on it mid-incident.
    expect(String(body["blind_spot_this_covers"])).toContain(
      "before the handler",
    );
  });
});
