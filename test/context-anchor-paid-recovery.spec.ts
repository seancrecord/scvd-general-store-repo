import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, shelves, call, request, object, sourceEnv, testEnv, facilitator, type Obj } from "./helpers/buyer-harness";
import { evmPayment, evmValid } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
let transfers: Obj[] = [];
let fault = "none", hits = 0;
const attempted = new Map<string, string>();
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
      // The signed fixture's sender, not the generic mock's unrelated wallet.
      const wire = object(object(JSON.parse(String(init?.body))).paymentPayload);
      if (receipt.success) receipt.payer = object(object(wire.payload).authorization).from;
      if (receipt.success) transfers.push(receipt);
      return Response.json(receipt, { status: response.status, headers: response.headers });
    }
    return response;
  });
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...args: Parameters<typeof inner.artifactStage>) => {
          if (args[2] !== undefined && fault === `checkpoint-${args[1]}-before`) {
            hits++; throw new Error("fixture checkpoint write failed");
          }
          const saved = await inner.artifactStage(...args);
          if (args[2] !== undefined && fault === `checkpoint-${args[1]}-after`) {
            hits++; throw new Error("fixture checkpoint acknowledgement lost");
          }
          return saved;
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...args: unknown[]) => Reflect.apply(member, inner, args) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
  const patrons = testEnv.PATRONS;
  testEnv.PATRONS = new Proxy(patrons, { get(target, property) {
    const member = Reflect.get(target, property);
    if (property === "put") return async (...args: unknown[]) => {
      const key = String(args[0]);
      const stage = key.startsWith(KV_KEYS.certPrefix) ? "certificate"
        : key.startsWith(KV_KEYS.anchor("")) ? "anchor"
        : key.startsWith(KV_KEYS.settlementCert("")) ? "index" : "other";
      if (transfers.length && stage !== "other") {
        const old = attempted.get(key);
        if (old !== undefined) expect(String(args[1])).toBe(old);
        attempted.set(key, String(args[1]));
        if (fault === `${stage}-before`) { hits++; throw new Error("fixture publication failure"); }
      }
      const result = await Reflect.apply(member, target, args);
      if (transfers.length && fault === `${stage}-after`) { hits++; throw new Error("fixture lost write acknowledgement"); }
      return result;
    };
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault = "none"; hits = 0; transfers = []; attempted.clear(); });

for (const door of ["http", "mcp"] as const) for (const network of [BASE_NETWORK, POLYGON_NETWORK]) {
  for (const point of ["certificate-before", "certificate-after", "index-before", "anchor-before", "anchor-after",
    "checkpoint-certificate-before", "checkpoint-certificate-after", "checkpoint-anchor-before",
    "checkpoint-anchor-after", "checkpoint-response-before", "checkpoint-response-after"]) {
    it(`${door} ${network} ${point}: resumes the same signed good, including concurrent retries`, async () => {
      const item = items.find(item => item.id === "context_anchor")!, tool = shelves(item)[0]!;
      const summary = `SCVD-E2E-${crypto.randomUUID()}-${"x".repeat(650)}-original`;
      const args = { summary, agent_name: "SCVD-E2E recipient", purpose: "SCVD-E2E exact restore" };
      const quote = await call(item, door, args, tool);
      const offer = quote.offers.find(offer => offer.network === network)!;
      const payment = btoa(JSON.stringify(await evmPayment(offer)));
      // No short-lived idempotency cache: the durable purchased good must stand on its own.
      const send = (input = args) => call(item, door, input, tool, payment);
      fault = point;
      const first = await send();
      expect(first.charged).toBe(true);
      expect(hits).toBeGreaterThan(0);
      expect(transfers).toHaveLength(1);
      fault = "none";
      const mismatch = await send({ ...args, summary: `${summary}-changed` });
      expect(mismatch.body.cert_id ?? object(mismatch.body.certificate).cert_id).toBeUndefined();
      expect(mismatch.quote).toBe(false);
      expect(mismatch.settles).toBe(0);
      const retries = await Promise.all([send(), send()]);
      for (const retry of retries) {
        expect(retry.status, JSON.stringify(retry.body)).toBe(200);
        expect(retry.protocolError).toBe(false);
        expect(retry.settles).toBe(0);
      }
      const a = retries[0]!.body, b = retries[1]!.body;
      const certId = a.cert_id ?? object(a.certificate).cert_id;
      expect(b.cert_id ?? object(b.certificate).cert_id).toBe(certId);
      expect(b.anchor_id).toBe(a.anchor_id);
      const checked = object(await (await request(`/api/verify/${String(certId)}`)).json());
      expect(checked.valid).toBe(true);
      expect(object(checked.certificate)).toMatchObject({ network, settlement_tx: transfers[0]!.transaction, purpose: args.purpose });
      const anchor = object(await (await request(String(a.anchor_url))).json());
      expect(object(anchor.anchor)).toMatchObject({ summary, agent_name: args.agent_name });
      const again = await send();
      expect(again.body.anchor_id).toBe(a.anchor_id);
      expect(again.settles).toBe(0);
      expect(transfers).toHaveLength(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.anchor("") })).keys).toHaveLength(1);
      expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).toBeNull();
    });
  }
}
