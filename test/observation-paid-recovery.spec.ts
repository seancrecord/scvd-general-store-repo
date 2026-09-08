import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack } from "@/lib/payments";
import { verifyMessageSignature } from "@/lib/signing";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0, reads = 0, unavailable = false;
let prepared: Obj | undefined;
vi.mock("@/services/attestation", async original => {
  const actual = await original<typeof import("@/services/attestation")>();
  return { ...actual, observeSettlement: async (...args: Parameters<typeof actual.observeSettlement>) => {
    reads++;
    if (unavailable) throw new Error("fixture chain reader unavailable");
    return actual.observeWithFacts(args[0], args[1], null, 1000);
  } };
});
vi.mock("@/lib/base-rpc", async original => {
  const actual = await original<typeof import("@/lib/base-rpc")>();
  return { ...actual, getBlockNumber: async () => {
    reads++;
    if (unavailable) throw new Error("fixture chain head unavailable");
    return 1000;
  }, getReceiptsBatch: async () => {
    reads++;
    if (unavailable) throw new Error("fixture chain receipts unavailable");
    return new Map();
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture certificate publication acknowledgement lost"); }
    return minted;
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observation-before") { hits++; throw new Error("fixture observation write unavailable"); }
          const saved = await inner.retainObservation(...a);
          if (saved) prepared = object(JSON.parse(saved));
          if (a[2] !== undefined && fault === "observation-after") { hits++; throw new Error("fixture observation acknowledgement lost"); }
          return saved;
        };
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
beforeEach(() => { fault = ""; hits = 0; reads = 0; unavailable = false; prepared = undefined; vi.setSystemTime(NOW); });
const goods = ["settlement_attestation", "attestation_bundle"];
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: string, door: LaborDoor, rail: number) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const hash = () => `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const hashes = [hash(), hash()], canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const args = { ...(id === "attestation_bundle" ? { tx_hashes: hashes.join(",") } : { tx_hash: hashes[0] }), purpose: canary };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const signed = await signLabor(offer), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = extractPaymentNonce(signed) ?? object(signed.payload).transaction;
  const key = await sha256Hex(jcsCanonicalize({ network, payer, identity }));
  return { network, canary, args, signed, hashes: id === "attestation_bundle" ? hashes : hashes.slice(0, 1),
    stub: purchaseIntentStore(sourceEnv, key), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
async function assertGood(body: Obj, expected: Obj, hashes: string[], canary: string) {
  const actual = body.attestations ? body.attestations as Obj[] : [object(body.attestation)];
  const original = expected.bundle ? expected.bundle as Obj[] : [object(expected.attestation)];
  expect(actual).toEqual(original);
  expect(actual.map(a => a.tx_hash)).toEqual(hashes);
  for (const a of actual) {
    const entries = Object.entries(a), end = entries.findIndex(([key]) => key === "signature");
    expect(end).toBeGreaterThan(0);
    expect(await verifyMessageSignature(JSON.stringify(Object.fromEntries(entries.slice(0, end))), String(a.signature), String(a.public_key))).toBe(true);
    expect(a.observed_at).toBe(NOW.toISOString());
  }
  const cert = object(body.certificate);
  expect(cert.purpose).toBe(canary);
  expect(cert.attests).toBe(expected.attests);
  const verified = object(await (await request(String(body.verify_url))).json());
  expect(verified.valid).toBe(true);
}
for (const id of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-after", "response-before"]) it(`${id} ${door} rail ${rail}: ${point} recovers original signed evidence with upstream down`, async () => {
    const p = await purchase(id, door, rail);
    fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    expect(prepared).toBeDefined();
    const original = structuredClone(prepared!);
    const readsBefore = reads;
    fault = ""; unavailable = true; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
    expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    await assertGood(object(status.fulfillment), original, p.hashes, p.canary);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    expect(await runDurableObjectAlarm(p.stub)).toBe(false);
  });
}
for (const id of goods) for (const door of doors) {
  for (const point of ["observation-before", "observation-after"]) it(`${id} ${door}: ${point} prevents settlement and permits the same request`, async () => {
    const p = await purchase(id, door, 0);
    fault = point;
    const first = await p.send();
    expect(hits).toBeGreaterThan(0);
    expect(first.refused).toBe(true);
    expect(first.body).toMatchObject({ code: "observation_storage_unavailable", charged: false, settlement_attempted: false });
    expect(transfers).toBe(0);
    expect(await p.stub.existingPurchase()).toBeNull();
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
    const readsBefore = reads;
    fault = ""; unavailable = point === "observation-after";
    const retry = await p.send();
    expect(retry.refused).toBe(false);
    if (unavailable) expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: same-payment retry cannot substitute different buyer input`, async () => {
    const p = await purchase(id, door, 0);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    fault = ""; unavailable = true;
    const readsBefore = reads;
    const wrong = await p.send({ ...p.args, purpose: "SCVD-E2E-different-purchase" });
    expect(wrong.refused).toBe(true);
    expect(wrong.body.charged).toBe(true);
    expect(transfers).toBe(1);
    const same = await p.send();
    expect(same.refused).toBe(false);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}
for (const id of goods) for (const door of doors) {
  it(`${id} ${door}: missing legacy evidence never triggers a new paid observation`, async () => {
    const p = await purchase(id, door, 0);
    fault = "certificate-after";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, async (_instance, state) => { await state.storage.delete("observation"); });
    const readsBefore = reads;
    fault = "";
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(record.delivery).toBeUndefined();
    const retry = await p.send();
    expect(retry.refused).toBe(true);
    expect(retry.body.charged).toBe(true);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: concurrent requests commit one evidence snapshot and settle once`, async () => {
    const p = await purchase(id, door, 0);
    const results = await Promise.all([p.send(), p.send()]);
    expect(results.some(result => !result.refused)).toBe(true);
    expect(transfers).toBe(1);
    unavailable = true;
    const readsBefore = reads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(record.delivery), prepared!, p.hashes, p.canary);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}
for (const id of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`${id} ${door} rail ${rail}: lost settlement receipt retains the original evidence for confirmed recovery`, async () => {
    const p = await purchase(id, door, rail);
    const stack = getPaymentStack(testEnv), settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture lost settlement response");
    });
    try {
      const first = await p.send();
      expect(first.refused).toBe(true);
      expect(first.body.charged).toBeNull();
      expect(transfers).toBe(1);
      expect(receipt?.success).toBe(true);
      const original = structuredClone(prepared!);
      const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(record.state).toBe("unknown");
      expect(object(first.body.recovery).purchase_id).toBe(record.id);
      // Finality evidence has its own negative-control suites. Here the
      // confirmed result is injected only after proving receipt ambiguity;
      // the new assertion is survival of the already purchased observation.
      if (!receipt?.success) throw new Error("Fixture did not settle");
      await p.stub.updatePurchase({ state: "settled", payment: {
        transaction: receipt.transaction, network: p.network, payer: record.payer,
        paidUsdc: Number(record.terms.amount) / 1_000_000, tipUsdc: 0, settleHeaders: receipt.headers,
      } });
      unavailable = true;
      vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      const readsBefore = reads;
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      await assertGood(object(recovered.delivery), original, p.hashes, p.canary);
      expect(reads).toBe(readsBefore);
      expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}
