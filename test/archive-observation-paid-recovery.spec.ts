import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack, atomicToUsdc } from "@/lib/payments";
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
let prepared: Obj | undefined, observed: Obj | undefined, published: Obj | undefined;
let reportKey = "";
// Keep the actual archive derivers and signing code. Recovery may not read
// today's books to replace yesterday's purchased evidence.
function observing() {
  reads++;
  if (unavailable) throw new Error("fixture archive unavailable after settlement");
}
vi.mock("@/services/spot-check", async original => {
  const actual = await original<typeof import("@/services/spot-check")>();
  return { ...actual, performSpotCheck: async (...args: Parameters<typeof actual.performSpotCheck>) => {
    observing();
    const report = await actual.performSpotCheck(...args);
    observed = object(report);
    reportKey = "";
    return report;
  } };
});
vi.mock("@/services/provenance-check", async original => {
  const actual = await original<typeof import("@/services/provenance-check")>();
  return { ...actual, performProvenanceCheck: async (...args: Parameters<typeof actual.performProvenanceCheck>) => {
    observing();
    const report = await actual.performProvenanceCheck(...args);
    observed = object(report);
    reportKey = KV_KEYS.provenanceCheck(report.record.provenance_id);
    return report;
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") { hits++; throw new Error("fixture signing unavailable"); }
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture certificate publication acknowledgement lost"); }
    return minted;
  } };
});
beforeAll(() => {
  const patrons = testEnv.PATRONS;
  testEnv.PATRONS = new Proxy(patrons, { get(target, property) {
    if (property === "put") return async (...args: Parameters<typeof patrons.put>) => {
      if (args[0] === reportKey && fault === "report-before") { hits++; throw new Error("fixture report publication failed"); }
      await target.put(...args);
      if (args[0] === reportKey) {
        published = object(JSON.parse(String(args[1])));
        if (fault === "report-after") { hits++; throw new Error("fixture report acknowledgement lost"); }
      }
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observation-before") { hits++; throw new Error("fixture observation write unavailable"); }
          const saved = await inner.retainObservation(...a);
          if (saved) {
            prepared = object(JSON.parse(saved));

          }
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
beforeEach(() => { fault = ""; hits = 0; reads = 0; unavailable = false; prepared = observed = published = undefined; reportKey = ""; vi.setSystemTime(NOW); });
const goods = [
  { id: "spot_check", snapshot: "spotCheck", field: "spot_check", input: "host" },
  { id: "provenance_check", snapshot: "provenanceCheck", field: "provenance_check", input: "address" },
];
let product = goods[0]!;
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: string, door: LaborDoor, rail: number) {
  product = goods.find(g => g.id === id)!;
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const subject = id === "spot_check" ? `${canary.toLowerCase()}.example` : `0x${(await sha256Hex(canary)).slice(0, 40)}`;
  const args = { [product.input]: subject, purpose: canary };
  // The buyer canary is in the actual corpus row, not only an echoed input.
  const key = `${KV_KEYS.corpusPrefix}000000001`;
  const corpus = object(await sourceEnv.COUNTERS.get(key, "json"));
  const snapshot = object(corpus.snapshot), round = object(snapshot.round);
  const host = id === "spot_check" ? subject : `${canary.toLowerCase()}.example`;
  round.hosts = [{ host, url: `https://${host}/paid`, verdict: "ready", failed: [], advisories: [],
    offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.001, pay_to: [subject] } }];
  await sourceEnv.COUNTERS.put(key, JSON.stringify(corpus));
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const signed = await signLabor(offer), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = extractPaymentNonce(signed) ?? object(signed.payload).transaction;
  const intentKey = await sha256Hex(jcsCanonicalize({ network, payer, identity }));
  return { canary, args, subject, network, stub: purchaseIntentStore(sourceEnv, intentKey), send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
async function assertGood(body: Obj, expected: Obj, subject: string, canary: string) {
  expect(body[product.field]).toEqual(expected.record);
  const proof = object(body.observation);
  expect(proof).toEqual(expected);
  const record = object(body[product.field]);
  expect(product.id === "spot_check" ? record.host : object(record.subject).address).toBe(subject);
  expect(record.asked_at).toBe(NOW.toISOString());
  expect(JSON.parse(String(proof.signed_payload))).toEqual(record);
  expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...record, asked_at: "2099-01-01" }), String(proof.signature), String(proof.public_key))).toBe(false);
  expect(await sha256Hex(String(proof.signed_payload))).toBe(body.evidence_hash);
  if (product.id === "spot_check") {
    expect(record.not_observed).toBe(false);
    expect(object(record.history).rounds_probed).toBe(1);
  } else {
    expect(record.never_seen).toBe(false);
    const weeks = record.weeks as Obj[];
    expect(weeks).toHaveLength(1);
    expect((weeks[0]!.doors as Obj[]).map(door => door.host)).toEqual([`${canary.toLowerCase()}.example`]);
    const response = await request(String(body.record_url));
    expect(response.status).toBe(200);
    const retrieved = object(await response.json());
    expect(retrieved).toMatchObject({ check: expected.record, signed_payload: expected.signed_payload, created_at: NOW.toISOString() });
    expect(retrieved.certificate).toBe(body.verify_url);
  }
  const cert = object(body.certificate);
  expect(cert.purpose).toBe(canary);
  expect(cert.attests).toBe(body.evidence_hash);
  const verified = object(await (await request(String(body.verify_url))).json());
  expect(verified.valid).toBe(true);
}
for (const { id } of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", ...(id === "provenance_check" ? ["report-before", "report-after"] : []), "response-before"]) it(`${id} ${door} rail ${rail}: ${point} recovers original signed evidence with archive unavailable`, async () => {
    const p = await purchase(id, door, rail);
    fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    expect(prepared).toBeDefined();
    const original = structuredClone(observed!);
    expect(object(prepared![product.snapshot])).toEqual(original);
    const firstPublished = published && structuredClone(published);
    expect(reads).toBeGreaterThan(0);
    const readsBefore = reads;
    fault = ""; unavailable = true; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
    expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    await assertGood(object(status.fulfillment), original, p.subject, p.canary);
    expect(reads).toBe(readsBefore);
    if (firstPublished) expect(await sourceEnv.PATRONS.get(reportKey, "json")).toEqual(firstPublished);
    expect(transfers).toBe(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
    expect(await runDurableObjectAlarm(p.stub)).toBe(false);
  });
}
for (const { id } of goods) for (const door of doors) {
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
    expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
    if (unavailable) expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: same-payment retry cannot substitute different buyer input`, async () => {
    const p = await purchase(id, door, 0);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    fault = ""; unavailable = true;
    const readsBefore = reads;
    const wrong = await p.send({ ...p.args, [product.input]: id === "spot_check" ? "wrong.example" : `0x${"22".repeat(20)}` });
    expect(wrong.refused).toBe(true);
    expect(wrong.body.charged).toBe(true);
    expect(transfers).toBe(1);
    const same = await p.send();
    expect(same.refused).toBe(false);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}
for (const { id } of goods) for (const door of doors) {
  it(`${id} ${door}: concurrent requests commit one evidence snapshot and settle once`, async () => {
    const p = await purchase(id, door, 0);
    const results = await Promise.all([p.send(), p.send()]);
    expect(results.some(result => !result.refused)).toBe(true);
    expect(transfers).toBe(1);
    unavailable = true;
    const readsBefore = reads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(record.delivery), object(prepared![product.snapshot]), p.subject, p.canary);
    expect(reads).toBe(readsBefore);
    expect(transfers).toBe(1);
  });
}

for (const { id } of goods) for (const door of doors) {
  it(`${id} ${door}: missing original evidence remains owed with no replacement`, async () => {
    const p = await purchase(id, door, 0); fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, (_instance, state) => state.storage.delete("observation"));
    fault = ""; unavailable = true; const before = reads;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(record.state).toBe("settled"); expect(record.delivery).toBeUndefined();
    const retry = await p.send(); expect(retry.refused).toBe(true); expect(retry.body.charged).toBe(true);
    expect(reads).toBe(before); expect(transfers).toBe(1);
  });
  it(`${id} ${door}: changed archive cannot rewrite the purchased report`, async () => {
    const p = await purchase(id, door, 0); fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(observed!);
    await sourceEnv.COUNTERS.delete(`${KV_KEYS.corpusPrefix}000000001`);
    fault = ""; const before = reads; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(object(record.delivery), original, p.subject, p.canary);
    expect(reads).toBe(before); expect(transfers).toBe(1);
  });
}

for (const { id } of goods) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`${id} ${door} rail ${rail}: lost settlement acknowledgement retains the original report`, async () => {
    const p = await purchase(id, door, rail), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture drops confirmed settlement answer");
    });
    try {
      const first = await p.send();
      expect(first.refused).toBe(true); expect(first.body.charged).toBeNull(); expect(transfers).toBe(1);
      const original = structuredClone(observed!);
      expect(object(prepared![product.snapshot])).toEqual(original);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown");
      expect(object(first.body.recovery).purchase_id).toBe(saved.id);
      if (!receipt?.success) throw new Error("Fixture did not settle");
      // Use the actual confirmed fixture receipt, not a second settlement.
      // Chain finality itself is covered by separate negative-control suites.
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
        payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      unavailable = true; const before = reads; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      await assertGood(object(recovered.delivery), original, p.subject, p.canary);
      expect(reads).toBe(before); expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}
