import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack, atomicToUsdc } from "@/lib/payments";
import { getPatronAnchor, publishPatronAnchor, sweepPatronAnchors } from "@/services/patron-anchors";
import { sha256Hex } from "@/lib/idempotency";
import { verifyMessageSignature } from "@/lib/signing";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";
import { pendingProofBytes, bitcoinProofBytes } from "./helpers/ots";

installLaborAdmissionHarness();
let fault = "", hits = 0, preparations = 0, unavailable = false;
let prepared: Obj | undefined, observed: Obj | undefined;
const failure = () => { hits++; throw new Error("fixture storage acknowledgement unavailable"); };
vi.mock("@/services/mandates", async original => {
  const actual = await original<typeof import("@/services/mandates")>();
  return { ...actual, performMandate: async (...args: Parameters<typeof actual.performMandate>) => {
    preparations++;
    if (unavailable) throw new Error("fixture signing unavailable after settlement");
    const report = await actual.performMandate(...args);
    observed = object(report);
    return report;
  }, storeMandate: async (...args: Parameters<typeof actual.storeMandate>) => {
    if (fault === "record-before") failure();
    const saved = await actual.storeMandate(...args);
    if (fault === "record-after") failure();
    return saved;
  } };
});
vi.mock("@/services/anchor-submit", async original => {
  const actual = await original<typeof import("@/services/anchor-submit")>();
  return { ...actual, submitDigestToOts: async (...args: Parameters<typeof actual.submitDigestToOts>) => {
    preparations++;
    if (unavailable) throw new Error("fixture calendars unavailable after settlement");
    return actual.submitDigestToOts(args[0], { ...args[1], calendars: ["https://calendar.test"],
      fetch: async () => new Response(pendingProofBytes()) });
  } };
});
vi.mock("@/lib/kv-retry", async original => {
  const actual = await original<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const productRecord = args[1].startsWith(KV_KEYS.mandate("")) || args[1].startsWith(KV_KEYS.patronAnchorPrefix);
    if (productRecord && fault === "publication-before") failure();
    if (productRecord && fault === "upgrade-publication" && object(object(JSON.parse(String(args[2]))).ots).status === "complete") failure();
    await actual.kvPut(...args);
    if (productRecord && fault === "publication-after") failure();
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") failure();
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") failure();
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
          if (a[2] !== undefined && fault === "observation-before") failure();
          const saved = await inner.retainObservation(...a);
          if (saved) prepared = object(JSON.parse(saved));
          if (a[2] !== undefined && fault === "observation-after") failure();
          return saved;
        };
        if (method === "publishPatronAnchor") return async (...a: unknown[]) => {
          if (fault === "record-before") failure();
          const saved = await Reflect.apply(Reflect.get(inner, method), inner, a);
          if (fault === "record-after") failure();
          return saved;
        };
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && a[1] === "response" && fault === "response-before") failure();
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
beforeEach(() => { fault = ""; hits = preparations = 0; unavailable = false; prepared = observed = undefined; vi.setSystemTime(NOW); });
const ids = ["the_mandate", "bitcoin_anchor"] as const;
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: string, door: LaborDoor, rail: number) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`, digest = await sha256Hex(canary);
  const args = id === "the_mandate"
    ? { mandate: `${canary}\nRecord \"π & 🚀\" exactly.`, submitted_as: "principal", declared_cap_usdc: "1.25", expires_at: "2027-01-01T00:00:00Z", purpose: canary }
    : { digest: digest.toUpperCase(), label: canary, purpose: canary };
  const quote = await call(item, "mcp", args, shelves(item)[0]);
  const offer = quote.offers.find(o => o.network === network);
  expect(offer, JSON.stringify(quote.body)).toBeDefined();
  const signed = await signLabor(offer!), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { id, args, digest, canary, network, stub: purchaseIntentStore(sourceEnv, identity.id),
    send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
async function assertGood(p: Awaited<ReturnType<typeof purchase>>, body: Obj, snapshot: Obj) {
  const cert = object(JSON.parse(String(body.signed_payload)));
  expect(cert.purpose).toBe(p.canary);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  if (p.id === "the_mandate") {
    const mandate = object(snapshot.mandate);
    expect(body.mandate).toEqual(mandate);
    expect(mandate).toMatchObject({ mandate_text: p.args.mandate, submitted_as: "principal", declared_cap_usdc: 1.25,
      expires_at: p.args.expires_at, recorded_at: NOW.toISOString() });
    const { signature, public_key, signature_covers, ...signed } = mandate;
    expect(await verifyMessageSignature(JSON.stringify(signed), String(signature), String(public_key))).toBe(true);
    expect(await verifyMessageSignature(JSON.stringify({ ...signed, mandate_text: "wrong" }), String(signature), String(public_key))).toBe(false);
    expect(cert.attests).toBe(mandate.evidence_hash);
    const stored = object(await sourceEnv.PATRONS.get(KV_KEYS.mandate(String(body.mandate_id)), "json"));
    expect(stored).toMatchObject({ mandate, cert_id: cert.cert_id, created_at: NOW.toISOString() });
    expect((await request(String(body.mandate_url))).status).toBe(200);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.mandate("") })).keys).toHaveLength(1);
  } else {
    const anchor = object(snapshot.patronAnchor);
    expect(body.digest).toBe(p.digest);
    expect(body.anchor_id).toBe(anchor.anchor_id);
    expect(cert.attests).toBe(p.digest);
    const stored = object(await sourceEnv.PATRONS.get(KV_KEYS.patronAnchor(String(body.anchor_id)), "json"));
    expect(stored).toEqual({ ...anchor, cert_id: cert.cert_id });
    expect(stored).toMatchObject({ digest: p.digest, label: p.canary, created_at: NOW.toISOString(), ots: { status: "pending" } });
    const response = await request(String(body.proof_url));
    expect(response.status).toBe(200);
    expect(object(await response.json())).toMatchObject({ digest: p.digest, label: p.canary });
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.patronAnchorPrefix })).keys).toHaveLength(1);
  }
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
}
for (const id of ids) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", "record-before", "record-after", "publication-before", "publication-after", "response-before"]) it(`${id} ${door} rail ${rail}: ${point} recovers the original good`, async () => {
    const p = await purchase(id, door, rail);
    fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    expect(prepared).toBeDefined();
    const snapshot = structuredClone(prepared!);
    if (id === "the_mandate") expect(snapshot.mandate).toEqual(observed);
    const preparedCount = preparations;
    fault = ""; unavailable = true; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
    expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    await assertGood(p, object(status.fulfillment), snapshot);
    expect(preparations).toBe(preparedCount);
    expect(transfers).toBe(1);
    expect(await runDurableObjectAlarm(p.stub)).toBe(false);
  });
}
for (const id of ids) for (const door of doors) {
  for (const point of ["observation-before", "observation-after"]) it(`${id} ${door}: ${point} refuses settlement safely`, async () => {
    const p = await purchase(id, door, 0);
    fault = point;
    const first = await p.send();
    expect(hits).toBeGreaterThan(0);
    expect(first.body).toMatchObject({ code: "observation_storage_unavailable", charged: false, settlement_attempted: false });
    expect(transfers).toBe(0);
    expect(await p.stub.existingPurchase()).toBeNull();
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
    fault = ""; unavailable = point === "observation-after";
    expect((await p.send()).refused).toBe(false);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: a changed-input replay cannot replace the purchased good`, async () => {
    const p = await purchase(id, door, 0);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    const snapshot = structuredClone(prepared!);
    fault = ""; unavailable = true;
    expect((await p.send({ ...p.args, ...(id === "the_mandate" ? { mandate: "wrong" } : { digest: "11".repeat(32) }) })).refused).toBe(true);
    const same = await p.send();
    expect(same.refused).toBe(false);
    await assertGood(p, same.body, snapshot);
    expect(transfers).toBe(1);
  });
  it(`${id} ${door}: concurrent duplicates retain one identity and settle once`, async () => {
    const p = await purchase(id, door, 0);
    const results = await Promise.all([p.send(), p.send()]);
    expect(results.some(r => !r.refused)).toBe(true);
    expect(transfers).toBe(1);
    unavailable = true;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(p, object(record.delivery), prepared!);
  });
  it(`${id} ${door}: missing original preparation stays owed without substituting new work`, async () => {
    const p = await purchase(id, door, 0);
    fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, async (_instance, state) => { await state.storage.delete("observation"); });
    fault = ""; unavailable = true;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(record.state).toBe("settled");
    expect(record.delivery).toBeUndefined();
    expect(transfers).toBe(1);
  });
}

for (const id of ids) for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`${id} ${door} rail ${rail}: lost settlement acknowledgement retains the original good`, async () => {
    const p = await purchase(id, door, rail), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture drops confirmed settlement answer");
    });
    try {
      const first = await p.send();
      expect(first.refused).toBe(true);
      expect(first.body.charged).toBeNull();
      expect(transfers).toBe(1);
      const snapshot = structuredClone(prepared!);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown");
      expect(object(first.body.recovery).purchase_id).toBe(saved.id);
      if (!receipt?.success) throw new Error("Fixture did not settle");
      // Reconciliation uses the actual successful fixture receipt. Finality
      // and wrong-chain negative controls live in the chain-recovery suites.
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
        payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      const count = preparations;
      unavailable = true; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      await assertGood(p, object(recovered.delivery), snapshot);
      expect(preparations).toBe(count);
      expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}
for (const door of doors) {
  it(`bitcoin_anchor ${door}: recovery preserves a swept proof even after its public projection disappears`, async () => {
    const p = await purchase("bitcoin_anchor", door, 0);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    const anchor = object(prepared!.patronAnchor);
    const before = (await getPatronAnchor(sourceEnv, String(anchor.anchor_id)))!;
    fault = "";
    const sweep = await sweepPatronAnchors(sourceEnv, { now: new Date(NOW.getTime() + 3600_000),
      fetch: async () => new Response(bitcoinProofBytes(900000)) });
    expect(sweep.upgraded).toBe(1);
    const upgraded = (await getPatronAnchor(sourceEnv, before.anchor_id))!;
    expect(upgraded.ots.status).toBe("complete");
    expect(upgraded.ots.proof_base64).not.toBe(before.ots.proof_base64);
    await sourceEnv.PATRONS.delete(KV_KEYS.patronAnchor(before.anchor_id));
    unavailable = true;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(object(recovered.delivery)).toMatchObject({ anchor_id: before.anchor_id, digest: p.digest, ots_status: "complete" });
    expect(await getPatronAnchor(sourceEnv, before.anchor_id)).toEqual(upgraded);
    // Stale pending publications arriving concurrently cannot erase completion.
    await Promise.all([publishPatronAnchor(sourceEnv, before), publishPatronAnchor(sourceEnv, upgraded)]);
    expect(await getPatronAnchor(sourceEnv, before.anchor_id)).toEqual(upgraded);
    expect(transfers).toBe(1);
  });
}
for (const id of ids) for (const door of doors) {
  it(`${id} ${door}: an incomplete paid snapshot cannot create a replacement record`, async () => {
    const p = await purchase(id, door, 0);
    fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, async (_instance, state) => {
      const row = (await state.storage.get<{ path: string; digest: string; value: string }>("observation"))!;
      const value = JSON.parse(row.value) as Obj;
      delete value[id === "the_mandate" ? "mandate" : "patronAnchor"];
      await state.storage.put("observation", { ...row, value: JSON.stringify(value) });
    });
    fault = "";
    const count = preparations;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const recovered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(recovered.delivery).toBeUndefined();
    expect(preparations).toBe(count);
    expect(transfers).toBe(1);
  });
}
for (const id of ids) for (const door of doors) {
  it(`${id} ${door}: a persistent publication failure stays owed until storage returns`, async () => {
    const p = await purchase(id, door, 0);
    fault = "publication-before";
    expect((await p.send()).body.charged).toBe(true);
    const snapshot = structuredClone(prepared!);
    const count = preparations;
    unavailable = true;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const owed = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(owed.state).toBe("settled");
    expect(owed.delivery).toBeUndefined();
    fault = "";
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const delivered = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(p, object(delivered.delivery), snapshot);
    expect(preparations).toBe(count);
    expect(transfers).toBe(1);
  });
}

it("bitcoin_anchor: an acknowledged purchase retains an upgrade whose KV write fails", async () => {
  const p = await purchase("bitcoin_anchor", "http", 0);
  const bought = await p.send();
  expect(bought.refused).toBe(false);
  const anchorId = String(bought.body.anchor_id);
  fault = "upgrade-publication";
  await expect(sweepPatronAnchors(sourceEnv, { now: new Date(NOW.getTime() + 3600_000),
    fetch: async () => new Response(bitcoinProofBytes(900001)) })).rejects.toThrow();
  expect((await getPatronAnchor(sourceEnv, anchorId))!.ots.status).toBe("pending");
  fault = "";
  let upstreamCalls = 0;
  await sweepPatronAnchors(sourceEnv, { fetch: async () => { upstreamCalls++; throw new Error("fixture calendar offline"); } });
  const restored = (await getPatronAnchor(sourceEnv, anchorId))!;
  expect(restored.ots.status).toBe("complete");
  expect(restored.ots.upgraded_at).toBe(new Date(NOW.getTime() + 3600_000).toISOString());
  expect(upstreamCalls).toBe(0);
  expect(transfers).toBe(1);
});
