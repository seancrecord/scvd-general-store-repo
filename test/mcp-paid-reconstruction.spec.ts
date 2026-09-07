import { runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({ kind: "none", confirmed: false, hits: 0 }));
function trip(kind: string): void {
  if (fault.kind === kind && fault.confirmed) {
    fault.hits++;
    throw new Error(`fixture ${kind} failure after settlement`);
  }
}
vi.mock("@/services/certificates", async (original) => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    trip("generation");
    return actual.mintCertificate(...args);
  } };
});
vi.mock("@/lib/signing", async (original) => {
  const actual = await original<typeof import("@/lib/signing")>();
  return { ...actual, signCertificate: async (...args: Parameters<typeof actual.signCertificate>) => {
    trip("signing");
    return actual.signCertificate(...args);
  } };
});

vi.mock("@/services/settlement-records", async (original) => {
  const actual = await original<typeof import("@/services/settlement-records")>();
  return { ...actual, certIdForSettlement: async (...args: Parameters<typeof actual.certIdForSettlement>) => {
    if (fault.kind === "lookup_incomplete") return { certId: null, certain: false };
    if (fault.kind === "lookup_error") throw new Error("fixture lookup unavailable");
    return actual.certIdForSettlement(...args);
  } };
});

import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, shelves, baseline, call, request, object, sourceEnv, testEnv, facilitator, type Obj } from "./helpers/buyer-harness";
import { evmPayment, evmValid } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
let transfers: Obj[] = [];
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/verify")) {
      facilitator.verifyCalls++;
      const body = object(JSON.parse(String(init?.body)));
      const wire = object(body.paymentPayload);
      const isValid = await evmValid(wire, body.paymentRequirements as ChallengeRequirement);
      return Response.json({ isValid, payer: object(object(wire.payload).authorization).from, ...(!isValid ? { invalidReason: "invalid_signature" } : {}) });
    }
    const response = await inner(input, init);
    if (url.pathname.endsWith("/x402/settle")) {
      const receipt = object(await response.clone().json());
      // The signed fixture's sender, not the generic mock's unrelated wallet.
      const wire = object(object(JSON.parse(String(init?.body))).paymentPayload);
      if (receipt.success) receipt.payer = object(object(wire.payload).authorization).from;
      if (receipt.success) { transfers.push(receipt); fault.confirmed = true; }
      return Response.json(receipt, { status: response.status, headers: response.headers });
    }
    return response;
  });
  const recoveries = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(recoveries, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof recoveries.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...args: Parameters<typeof inner.artifactStage>) => {
          const saved = await inner.artifactStage(...args);
          if (args[1] === "response" && args[2] !== undefined) trip("checkpoint");
          return saved;
        };
        if (method === "complete") return async (token: string, response: string) => {
          const saved = await inner.complete(token, response);
          trip("checkpoint");
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
      if (String(args[0]).startsWith(KV_KEYS.certPrefix)) trip("storage");
      if (String(args[0]).startsWith(KV_KEYS.anchor(""))) trip("artifact");
      return Reflect.apply(member, target, args);
    };
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault.kind = "none"; fault.confirmed = false; fault.hits = 0; transfers = []; });

const examples = [
  { id: "context_anchor", input: (canary: string) => ({ summary: canary }) },
  { id: "service_audit", input: (canary: string) => ({ url: `https://buyer-fixture.example/${canary}` }) },
  { id: "aura_walk", input: (canary: string) => ({ detail: canary }) },
];
async function purchase(id: string, args: Obj, network = BASE_NETWORK) {
  const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!;
  args = { ...baseline(item), ...args };
  const quote = await call(item, "mcp", args, tool);
  const offer = quote.offers.find(o => o.network === network)!;
  expect(offer).toBeTruthy();
  const wire = await evmPayment(offer), key = crypto.randomUUID();
  const send = (changed = args, payment = wire) => call(item, "mcp", changed, tool, btoa(JSON.stringify(payment)), key);
  return { item, tool, wire, key, send };
}
for (const product of examples) for (const network of [BASE_NETWORK, POLYGON_NETWORK]) {
  for (const point of ["generation", "signing", "storage"]) {
    it(`${product.id} ${network}: recovers a ${point} failure using the original payment`, async () => {
      const canary = `SCVD-E2E-${crypto.randomUUID()}`;
      const args: Obj = product.input(canary);
      const buying = await purchase(product.id, args, network);
      fault.kind = point;
      const first = await buying.send();
      expect(fault.hits).toBeGreaterThan(0);
      expect(transfers).toHaveLength(1);
      expect(first.body).toMatchObject({ code: "delivery_failed", charged: true });
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
      fault.kind = "none";
      const recovered = await buying.send();
      expect(recovered.protocolError).toBe(false);
      expect(recovered.settles).toBe(0);
      const certId = String(recovered.body.cert_id);
      const checked = object(await (await request(`/api/verify/${certId}`)).json());
      expect(checked.valid).toBe(true);
      expect(object(checked.certificate)).toMatchObject({ network, settlement_tx: transfers[0]!.transaction });
      if (product.id === "context_anchor") {
        const artifact = object(await (await request(String(recovered.body.anchor_url))).json());
        expect(object(artifact.anchor).summary).toBe(canary);
      } else if (product.id === "service_audit") {
        expect(object(recovered.body.audit).url).toBe(args.url);
        expect(object(checked.certificate).attests).toBe(object(recovered.body.audit).evidence_hash);
      } else {
        const order = object(await (await request(String(recovered.body.order_url))).json());
        expect(order.status).toBe("queued");
        const saved = JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.order(String(order.order_id))))!);
        expect(saved.detail).toBe(canary);
      }
      const replay = await buying.send();
      expect(replay.body.cert_id).toBe(recovered.body.cert_id);
      expect(replay.settles).toBe(0);
      expect(transfers).toHaveLength(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    });
  }
}

it("binds recovery to the full input, including bytes beyond the desk's query preview", async () => {
  const args = { summary: "x".repeat(650) + "ORIGINAL" };
  const buying = await purchase("context_anchor", args);
  fault.kind = "generation";
  await buying.send();
  fault.kind = "none";
  const changed = await buying.send({ summary: "x".repeat(650) + "CHANGED" });
  expect(changed.protocolError).toBe(true);
  expect(changed.quote).toBe(false);
  expect(changed.charged).toBe(true);
  expect(changed.settles).toBe(0);
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
  expect((await buying.send()).protocolError).toBe(false);
  expect(transfers).toHaveLength(1);
});

it("does not reconstruct from a forged payer or a payment moved to another chain", async () => {
  const buying = await purchase("context_anchor", { summary: "SCVD-E2E-authenticated-retry" });
  fault.kind = "generation";
  await buying.send();
  fault.kind = "none";
  const forged = structuredClone(buying.wire);
  object(object(forged.payload).authorization).from = "0x1111111111111111111111111111111111111111";
  const denied = await buying.send(undefined, forged);
  expect(denied.protocolError).toBe(true);
  expect(denied.body.cert_id).toBeUndefined();
  const differentChain = structuredClone(buying.wire);
  object(differentChain.accepted).network = POLYGON_NETWORK;
  const wrongChain = await buying.send(undefined, differentChain);
  expect(wrongChain.protocolError).toBe(true);
  expect(wrongChain.body.cert_id).toBeUndefined();
  expect(transfers).toHaveLength(1);
  expect((await buying.send()).protocolError).toBe(false);
});

for (const point of ["lookup_incomplete", "lookup_error"]) {
  it(`keeps paid recovery open when the certificate check reports ${point}`, async () => {
    const buying = await purchase("context_anchor", { summary: "SCVD-E2E-uncertain-recovery" });
    fault.kind = "generation";
    await buying.send();
    // A purchase from before artifact checkpoints still needs a certain lookup.
    const namespace = sourceEnv.PAID_RECOVERIES!;
    await runInDurableObject(namespace.get(namespace.idFromName(`${BASE_NETWORK}:${transfers[0]!.transaction}`)),
      async (_instance, state) => state.storage.deleteAll());
    fault.kind = point;
    const retry = await buying.send();
    expect(retry.protocolError).toBe(true);
    expect(retry.quote).toBe(false);
    expect(retry.charged).toBe(true);
    expect(retry.settles).toBe(0);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
    fault.kind = "none";
    expect((await buying.send()).protocolError).toBe(false);
    expect(transfers).toHaveLength(1);
  });
}

it("does not call a legacy certificate a delivered good or mint another against its payment", async () => {
  const buying = await purchase("context_anchor", { summary: "SCVD-E2E-missing-anchor" });
  fault.kind = "artifact";
  const first = await buying.send();
  expect(fault.hits).toBeGreaterThan(0);
  expect(first.charged).toBe(true);
  // Reproduce the old certificate-only state without an immutable manifest.
  const namespace = sourceEnv.PAID_RECOVERIES!;
  await runInDurableObject(namespace.get(namespace.idFromName(`${BASE_NETWORK}:${transfers[0]!.transaction}`)),
    async (_instance, state) => state.storage.deleteAll());
  fault.kind = "none";
  const retry = await buying.send();
  expect(retry.protocolError).toBe(true);
  expect(retry.quote).toBe(false);
  expect(retry.charged).toBe(true);
  expect(retry.body.already_delivered).not.toBe(true);
  expect(retry.body.recovery_reason).toBe("certificate_already_minted");
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).not.toBeNull();
  expect(transfers).toHaveLength(1);
});

it("the standard MCP payment dialect also recovers and reports paid retry refusals without new terms", async () => {
  const args = { summary: "SCVD-E2E-standard-recovery" };
  const buying = await purchase("context_anchor", args, POLYGON_NETWORK);
  const send = async (argumentsForRetry = args) => {
    const response = await request("/mcp?payment=tool-result", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 500, method: "tools/call", params: {
        name: buying.tool.name, arguments: { item_id: buying.item.id, ...argumentsForRetry },
        _meta: { "x402/payment": btoa(JSON.stringify(buying.wire)), "x402/idempotency-key": buying.key },
      } }),
    });
    return object(await response.json());
  };
  fault.kind = "generation";
  await send();
  expect(transfers).toHaveLength(1);
  fault.kind = "none";
  const mismatch = object((await send({ summary: "DIFFERENT" })).result);
  expect(mismatch.isError).toBe(true);
  expect(object(mismatch.structuredContent).charged).toBe(true);
  expect(object(mismatch._meta)["x402/payment-required"]).toBeUndefined();
  const recovered = object((await send()).result);
  expect(recovered.isError).not.toBe(true);
  const data = object(recovered.structuredContent);
  expect(data.paid_retry).toBe(true);
  expect(data.charged_again).toBe(false);
  expect(object(await (await request(`/api/verify/${String(data.cert_id)}`)).json()).valid).toBe(true);
  expect(object(object(recovered._meta)["x402/payment-response"]).transaction).toBe(transfers[0]!.transaction);
  expect(transfers).toHaveLength(1);
});

it("concurrent same-payment recovery returns one certificate", async () => {
  const buying = await purchase("context_anchor", { summary: "SCVD-E2E-concurrent-recovery" });
  fault.kind = "generation";
  await buying.send();
  fault.kind = "none";
  const [a, b] = await Promise.all([buying.send(), buying.send()]);
  expect(transfers).toHaveLength(1);
  const delivered = [a, b].filter(result => !result.protocolError);
  expect(delivered.length).toBeGreaterThan(0);
  for (const result of [a, b]) {
    if (result.protocolError) {
      expect(result.charged).toBe(true);
      expect(result.quote).toBe(false);
    } else expect(result.body.cert_id).toBe(delivered[0]!.body.cert_id);
  }
  const again = await buying.send();
  expect(again.body.cert_id).toBe(delivered[0]!.body.cert_id);
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
});

for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const lostAt of ["cache", "checkpoint"]) {
  it(`${network}: retrieves a completed recovery after losing the ${lostAt} response`, async () => {
    const summary = `SCVD-E2E-saved-${crypto.randomUUID()}`;
    const buying = await purchase("context_anchor", { summary }, network);
    fault.kind = "generation";
    expect((await buying.send()).charged).toBe(true);
    fault.kind = lostAt === "checkpoint" ? "checkpoint" : "none";
    const reconstructed = await buying.send();
    expect(reconstructed.protocolError).toBe(lostAt === "checkpoint");
    const certs = (await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys;
    expect(certs).toHaveLength(1);
    const cache = await sourceEnv.COUNTERS.list({ prefix: "idem:" });
    for (const entry of cache.keys) await sourceEnv.COUNTERS.delete(entry.name);
    if (lostAt === "cache") {
      expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).toBeNull();
    }
    fault.kind = "none";
    const changed = await buying.send({ summary: `${summary}-changed` });
    expect(changed.body.cert_id).toBeUndefined();
    const replay = await buying.send();
    expect(replay.protocolError).toBe(false);
    expect(replay.body.cert_id).toBe(certs[0]!.name.slice(KV_KEYS.certPrefix.length));
    expect(replay.body).toMatchObject({ charged: true, charged_again: false, paid_retry: true });
    const artifact = object(await (await request(String(replay.body.anchor_url))).json());
    expect(object(artifact.anchor).summary).toBe(summary);
    expect(replay.settles).toBe(0);
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).toBeNull();
    expect(transfers).toHaveLength(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  });
}
