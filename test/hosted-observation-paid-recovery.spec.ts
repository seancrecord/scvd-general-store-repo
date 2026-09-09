import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { atomicToUsdc, getPaymentStack } from "@/lib/payments";
import { verifyMessageSignature } from "@/lib/signing";
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0, reads = 0, unavailable = false;
let prepared: Obj | undefined, observed: Obj | undefined;
vi.mock("@/services/passport-refresh", async original => {
  const actual = await original<typeof import("@/services/passport-refresh")>();
  return { ...actual, performPassportRefresh: async (...args: Parameters<typeof actual.performPassportRefresh>) => {
    reads++; if (unavailable) throw new Error("fixture target disappeared");
    const report = await actual.performPassportRefresh(...args); observed = object(report); return report;
  } };
});
vi.mock("@/services/trust-profile", async original => {
  const actual = await original<typeof import("@/services/trust-profile")>();
  return { ...actual, performTrustProfile: async (...args: Parameters<typeof actual.performTrustProfile>) => {
    reads++; if (unavailable) throw new Error("fixture readiness changed");
    const report = await actual.performTrustProfile(...args); observed = object(report); return report;
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") { hits++; throw new Error("fixture signing unavailable"); }
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture lost mint acknowledgement"); }
    return minted;
  } };
});
vi.mock("@/services/hosted-observation", async original => {
  const actual = await original<typeof import("@/services/hosted-observation")>();
  return { ...actual, publishHostedObservation: async (...args: Parameters<typeof actual.publishHostedObservation>) => {
    if (fault === "publication-before") { hits++; throw new Error("fixture publication unavailable"); }
    await actual.publishHostedObservation(...args);
    if (fault === "publication-after") { hits++; throw new Error("fixture lost publication acknowledgement"); }
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observation-before") { hits++; throw new Error("fixture snapshot unavailable"); }
          const saved = await inner.retainObservation(...a);
          if (saved) prepared = object(JSON.parse(saved));
          if (a[2] !== undefined && fault === "observation-after") { hits++; throw new Error("fixture lost snapshot acknowledgement"); }
          return saved;
        };
        if (method === "retainHostedRefresh" || method === "prepareHostedProfile") {
          return async (...a: unknown[]) => {
            const point = "grant";
            if (fault === `${point}-before`) { hits++; throw new Error("fixture hosted write unavailable"); }
            const value = await Reflect.apply(Reflect.get(inner, method), inner, a);
            if (fault === `${point}-after`) { hits++; throw new Error("fixture lost hosted write acknowledgement"); }
            return value;
          };
        }
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && a[1] === "response" && fault === "response-before") { hits++; throw new Error("fixture response write unavailable"); }
          return inner.artifactStage(...a);
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault = ""; hits = reads = 0; unavailable = false; prepared = observed = undefined; vi.setSystemTime(NOW); });
const goods = [
  { id: "passport_refresh", snapshot: "passportRefresh", field: "refresh", payload: "observation", key: KV_KEYS.passportRefresh },
  { id: "trust_profile", snapshot: "trustProfile", field: "profile", payload: "record", key: KV_KEYS.trustProfile },
];
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: string, door: LaborDoor, rail: number, host?: string) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${Date.now()}-${crypto.randomUUID()}`;
  host ??= `${canary.toLowerCase()}.example`;
  const args = { url: `https://${host}/paid?subject=${canary}`, purpose: canary };
  const corpusKey = `${KV_KEYS.corpusPrefix}000000001`;
  const corpus = object(await sourceEnv.COUNTERS.get(corpusKey, "json"));
  object(object(corpus.snapshot).round).hosts = [{ host, url: args.url, verdict: "ready", failed: [], advisories: [] }];
  await sourceEnv.COUNTERS.put(corpusKey, JSON.stringify(corpus));
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  expect(offer).toBeDefined();
  const signed = await signLabor(offer), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { canary, host, args, network, stub: purchaseIntentStore(sourceEnv, identity.id), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
async function assertGood(body: Obj, original: Obj, product: typeof goods[number], url: string) {
  expect(body.observation).toEqual(original);
  const record = object(original[product.payload]);
  expect(body[product.field]).toEqual(record);
  expect(record.url).toBe(url);
  expect(JSON.parse(String(original.signed_payload))).toEqual(record);
  expect(await verifyMessageSignature(String(original.signed_payload), String(original.signature), String(original.public_key))).toBe(true);
  expect(await verifyMessageSignature(jcsCanonicalize(record), String(original.signature_jcs), String(original.public_key))).toBe(true);
  expect(await verifyMessageSignature(jcsCanonicalize({ ...record, url: "https://wrong.example/" }), String(original.signature_jcs), String(original.public_key))).toBe(false);
  expect(await sha256Hex(String(original.signed_payload))).toBe(original.evidence_hash);
  expect(object(JSON.parse(String(body.signed_payload))).attests).toBe(original.evidence_hash);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
}
for (const product of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", "response-before"]) it(`${product.id} ${door} rail ${rail}: ${point} retains original evidence and term`, async () => {
    const p = await purchase(product.id, door, rail); fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true); expect(first.body.charged).toBe(true); expect(hits).toBeGreaterThan(0); expect(transfers).toBe(1);
    expect(prepared).toBeDefined(); const original = structuredClone(observed!);
    expect(object(prepared![product.snapshot])).toEqual(original);
    const published = await sourceEnv.COUNTERS.get(product.key(p.host), "json");
    fault = ""; unavailable = true; const before = reads;
    await sourceEnv.COUNTERS.delete(`${KV_KEYS.corpusPrefix}000000001`);
    vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    const status = object(await (await request(`/api/purchase-status/${saved.id}`, { headers: { Authorization: `Bearer ${saved.token}` } })).json());
    expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    await assertGood(object(status.fulfillment), original, product, p.args.url);
    expect(await sourceEnv.COUNTERS.get(product.key(p.host), "json")).toEqual(published);
    const retry = await p.send(); expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
    await assertGood(retry.body, original, product, p.args.url);
    expect(reads).toBe(before); expect(transfers).toBe(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    expect(await runDurableObjectAlarm(p.stub)).toBe(false);
  });
  it(`${product.id} ${door} rail ${rail}: lost settlement answer keeps the original observation`, async () => {
    const p = await purchase(product.id, door, rail), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      receipt ??= await settle(...args); throw new TypeError("fixture lost confirmed settlement answer");
    });
    try {
      const first = await p.send(); expect(first.refused).toBe(true); expect(first.body.charged).toBeNull(); expect(transfers).toBe(1);
      const original = structuredClone(observed!); expect(object(prepared?.[product.snapshot])).toEqual(original);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown");
      if (!receipt?.success) throw new Error("Fixture did not settle");
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network, payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      unavailable = true; const before = reads; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      await assertGood(object(recovered.delivery), original, product, p.args.url);
      expect(reads).toBe(before); expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}
for (const product of goods) for (const door of doors) {
  for (const point of ["observation-before", "observation-after"]) it(`${product.id} ${door}: ${point} refuses before settlement`, async () => {
    const p = await purchase(product.id, door, 0); fault = point;
    const first = await p.send(); expect(hits).toBeGreaterThan(0); expect(first.refused).toBe(true);
    expect(first.body).toMatchObject({ charged: false, settlement_attempted: false, code: "observation_storage_unavailable" });
    expect(transfers).toBe(0); expect(await p.stub.existingPurchase()).toBeNull();
    fault = ""; const retry = await p.send(); expect(retry.refused, JSON.stringify(retry.body)).toBe(false); expect(transfers).toBe(1);
    if (product.id === "trust_profile") expect(object(retry.body.profile).renewals).toBe(1);
  });
  it(`${product.id} ${door}: newer purchase survives older recovery`, async () => {
    const p = await purchase(product.id, door, 0); fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true); const original = structuredClone(observed!);
    fault = ""; vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const next = await purchase(product.id, door, 0, p.host); const second = await next.send(); expect(second.refused).toBe(false);
    const published = await sourceEnv.COUNTERS.get(product.key(p.host), "json");
    unavailable = true; expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(saved.delivery), original, product, p.args.url);
    expect(await sourceEnv.COUNTERS.get(product.key(p.host), "json")).toEqual(published);
    expect(transfers).toBe(2);
  });
  it(`${product.id} ${door}: a missing original cannot be replaced by current evidence`, async () => {
    const p = await purchase(product.id, door, 0); fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, (_instance, state) => state.storage.delete("observation"));
    fault = ""; unavailable = true; const before = reads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(saved.state).toBe("settled"); expect(saved.delivery).toBeUndefined();
    expect(reads).toBe(before); expect(transfers).toBe(1);
  });
}

