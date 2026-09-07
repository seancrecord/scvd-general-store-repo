import { runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({ kind: "none", confirmed: false, hits: 0 }));
vi.mock("@/services/settlement-records", async (original) => {
  const actual = await original<typeof import("@/services/settlement-records")>();
  return { ...actual, certIdForSettlement: async (...args: Parameters<typeof actual.certIdForSettlement>) => {
    if (fault.kind === "lookup") throw new Error("fixture certificate lookup unavailable");
    if (fault.kind === "incomplete") return { certId: null, certain: false };
    return actual.certIdForSettlement(...args);
  } };
});
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, baseline, call, object, sourceEnv, testEnv, facilitator, type Obj } from "./helpers/buyer-harness";
import { evmPayment, evmValid } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
let transfers: Obj[] = [];
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/verify")) {
      facilitator.verifyCalls++;
      const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
      const isValid = await evmValid(wire, body.paymentRequirements as ChallengeRequirement);
      return Response.json({ isValid, payer: object(object(wire.payload).authorization).from,
        ...(!isValid ? { invalidReason: "invalid_signature" } : {}) });
    }
    const response = await inner(input, init);
    if (url.pathname.endsWith("/x402/settle")) {
      const receipt = object(await response.clone().json());
      if (receipt.success) { transfers.push(receipt); fault.confirmed = true; }
    }
    return response;
  });
  for (const name of ["PATRONS", "ORDERS"] as const) {
    const original = testEnv[name];
    testEnv[name] = new Proxy(original, { get(target, property) {
      const member = Reflect.get(target, property);
      if (property === "put") return async (...args: unknown[]) => {
        if (fault.confirmed && fault.kind === "product" &&
          [KV_KEYS.anchor(""), KV_KEYS.serviceAudit(""), KV_KEYS.orderPrefix].some(prefix => String(args[0]).startsWith(prefix))) {
          fault.hits++;
          throw new Error("fixture product write failed after mint");
        }
        return Reflect.apply(member, target, args);
      };
      return typeof member === "function" ? member.bind(target) : member;
    } });
  }
});
beforeEach(() => { fault.kind = "none"; fault.confirmed = false; fault.hits = 0; transfers = []; });

for (const id of ["context_anchor", "service_audit", "aura_walk", "the_collab"]) {
  for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const after of ["none", "lookup", "incomplete"]) {
    it(`${id} ${network} ${after}: a certificate alone cannot close the owed delivery`, async () => {
      const item = items.find(item => item.id === id)!;
      const args = { ...baseline(item), purpose: `SCVD-E2E-${crypto.randomUUID()}` };
      const quote = await call(item, "http", args);
      const offer = quote.offers.find(offer => offer.network === network)!;
      expect(offer).toBeTruthy();
      const payment = btoa(JSON.stringify(await evmPayment(offer))), key = crypto.randomUUID();
      fault.kind = "product";
      const first = await call(item, "http", args, undefined, payment, key);
      expect(fault.hits).toBeGreaterThan(0);
      expect(first.charged).toBe(true);
      expect(transfers).toHaveLength(1);
      const certs = (await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys;
      expect(certs).toHaveLength(1);
      const tx = String(transfers[0]!.transaction), intentKey = KV_KEYS.deliveryIntent(tx);
      const before = await sourceEnv.ORDERS.get(intentKey);
      expect(before).not.toBeNull();
      if (id === "context_anchor") {
        // Legacy sales have a certificate but no recoverable artifact manifest.
        const namespace = sourceEnv.PAID_RECOVERIES!;
        await runInDurableObject(namespace.get(namespace.idFromName(`${network}:${tx}`)),
          async (_instance, state) => state.storage.deleteAll());
      }
      fault.kind = after;
      for (let attempt = 0; attempt < 2; attempt++) {
        const retry = await call(item, "http", args, undefined, payment, key);
        expect(retry.status).toBe(500);
        expect(retry.body).toMatchObject({ code: "delivery_failed", charged: true, charged_again: false,
          transaction: tx, network });
        expect(retry.body.already_delivered).not.toBe(true);
        expect(retry.quote).toBe(false);
        expect(retry.settles).toBe(0);
        expect(await sourceEnv.ORDERS.get(intentKey)).toBe(before);
      }
      expect(transfers).toHaveLength(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    });
  }
}
