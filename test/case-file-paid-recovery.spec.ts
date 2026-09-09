import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack, atomicToUsdc } from "@/lib/payments";
import { performMandate, storeMandate } from "@/services/mandates";
import { BASE_USDC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { caseFileQueryDigest, getCaseFile, type CaseFileInput } from "@/services/case-file";
import { sha256Hex } from "@/lib/idempotency";
import { verifyMessageSignature } from "@/lib/signing";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0, preparations = 0, unavailable = false;
let chainAmount = 500000n;
let prepared: Obj | undefined, observed: Obj | undefined;
const failure = () => { hits++; throw new Error("fixture storage acknowledgement unavailable"); };
vi.mock("@/services/case-file", async original => {
  const actual = await original<typeof import("@/services/case-file")>();
  return { ...actual, performCaseFile: async (...args: Parameters<typeof actual.performCaseFile>) => {
    preparations++;
    if (unavailable) throw new Error("fixture chain unavailable after settlement");
    const report = await actual.performCaseFile(...args);
    observed = object(report);
    return report;
  }, storeCaseFile: async (...args: Parameters<typeof actual.storeCaseFile>) => {
    if (fault === "record-before") failure();
    const saved = await actual.storeCaseFile(...args);
    if (fault === "record-after") failure();
    return saved;
  } };
});
vi.mock("@/lib/kv-retry", async original => {
  const actual = await original<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const productRecord = args[1].startsWith(KV_KEYS.caseFile(""));
    const query = args[1].startsWith(KV_KEYS.caseFileQuery(""));
    if (productRecord && fault === "publication-before" || query && fault === "query-before") failure();
    await actual.kvPut(...args);
    if (productRecord && fault === "publication-after" || query && fault === "query-after") failure();
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
  const innerFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof init?.body === "string" ? init.body : "";
    if (raw.includes('"method":"eth_')) {
      const rpc = object(JSON.parse(raw));
      const topic = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
      const result = rpc.method === "eth_blockNumber" ? "0x80" : rpc.method === "eth_getBlockByNumber" ? { timestamp: `0x${Math.floor(NOW.getTime() / 1000).toString(16)}` }
        : rpc.method === "eth_getTransactionReceipt" ? { status: "0x1", blockNumber: "0x64", logs: [{ address: BASE_USDC,
          topics: [TRANSFER_TOPIC, topic(evmBuyer.address), topic("0x2222222222222222222222222222222222222222")],
          data: `0x${chainAmount.toString(16).padStart(64, "0")}` }] } : null;
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    }
    return innerFetch(input, init);
  });
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
beforeEach(() => { fault = ""; chainAmount = 500000n; hits = preparations = 0; unavailable = false; prepared = observed = undefined; vi.setSystemTime(NOW); });
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(door: LaborDoor, rail: number, given?: Obj) {
  const item = items.find(i => i.id === "the_case_file")!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}`, digest = await sha256Hex(canary);
  const mandate = !given ? await performMandate(sourceEnv, { text: canary, declaredCapUsdc: 2 }) : undefined;
  if (mandate) await storeMandate(sourceEnv, mandate, "fixture-prior-mandate");
  const args = given ?? { tx_hash: `0x${digest}`, claim: `${canary}\nRecord \"π & 🚀\" exactly.`,
    url: `https://door.example/${canary}?a=1&b=2`, mandate_id: mandate!.mandate_id, launch_check_id: `lc_${canary}`,
    payer: evmBuyer.address, recipient: "0x2222222222222222222222222222222222222222", expected_amount_usdc: "1.25", purpose: canary };
  const quote = await call(item, "mcp", args, shelves(item)[0]);
  const offer = quote.offers.find(o => o.network === network);
  expect(offer, JSON.stringify(quote.body)).toBeDefined();
  const signed = await signLabor(offer!), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { args, network, stub: purchaseIntentStore(sourceEnv, identity.id),
    send: (changed: Obj = args) => sendLabor("the_case_file", door, changed, signed) };
}
async function assertGood(p: Awaited<ReturnType<typeof purchase>>, body: Obj, snapshot: Obj, purchasedAt = NOW.toISOString()) {
  const cert = object(JSON.parse(String(body.signed_payload))), file = object(snapshot.caseFile);
  expect(cert.purpose).toBe(p.args.purpose);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  expect(body.case_file).toEqual(file);
  expect(file.query).toEqual({ tx_hash: p.args.tx_hash, chain: "evm", mandate_id: p.args.mandate_id, endpoint_url: p.args.url, launch_check_id: p.args.launch_check_id });
  expect(file.declared).toMatchObject({ claim: p.args.claim, expected_amount_usdc: 1.25, payer: p.args.payer, recipient: p.args.recipient });
  const { signature, public_key, signature_covers, signature_jcs, signature_jcs_covers, ...signed } = file;
  expect(await verifyMessageSignature(JSON.stringify(signed), String(signature), String(public_key))).toBe(true);
  expect(await verifyMessageSignature(JSON.stringify({ ...signed, declared: { claim: "wrong" } }), String(signature), String(public_key))).toBe(false);
  expect(cert.attests).toBe(file.evidence_hash);
  expect(object(object(file.settlement).attestation).amount_usdc).toBe(0.5);
  expect(object(object(file.mandate).mandate).mandate_id).toBe(p.args.mandate_id);
  const stored = object(await (await request(String(body.case_purchase_url ?? body.case_url))).json());
  expect(stored).toMatchObject({ case: file, cert_id: cert.cert_id, created_at: purchasedAt });
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.caseFile("") })).keys.filter(k => k.name === KV_KEYS.caseFile(String(file.case_id)))).toHaveLength(1);
}
for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", "record-before", "record-after", "publication-before", "publication-after", "query-before", "query-after", "response-before"]) it(`the_case_file ${door} rail ${rail}: ${point} recovers the original good`, async () => {
    const p = await purchase(door, rail);
    fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    expect(prepared).toBeDefined();
    const snapshot = structuredClone(prepared!);
    expect(snapshot.caseFile).toEqual(observed);
    const preparedCount = preparations;
    fault = ""; unavailable = true; chainAmount = 9000000n; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
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
for (const door of doors) {
  for (const point of ["observation-before", "observation-after"]) it(`the_case_file ${door}: ${point} refuses settlement safely`, async () => {
    const p = await purchase(door, 0);
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
  it(`the_case_file ${door}: a changed-input replay cannot replace the purchased good`, async () => {
    const p = await purchase(door, 0);
    fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    const snapshot = structuredClone(prepared!);
    fault = ""; unavailable = true;
    expect((await p.send({ ...p.args, claim: "wrong" })).refused).toBe(true);
    const same = await p.send();
    expect(same.refused).toBe(false);
    await assertGood(p, same.body, snapshot);
    expect(transfers).toBe(1);
  });
  it(`the_case_file ${door}: concurrent duplicates retain one identity and settle once`, async () => {
    const p = await purchase(door, 0);
    const results = await Promise.all([p.send(), p.send()]);
    expect(results.some(r => !r.refused)).toBe(true);
    expect(transfers).toBe(1);
    unavailable = true;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(p, object(record.delivery), prepared!);
  });
  it(`the_case_file ${door}: missing original preparation stays owed without substituting new work`, async () => {
    const p = await purchase(door, 0);
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

for (const door of doors) for (const [rail] of laborNetworks().entries()) {
  it(`the_case_file ${door} rail ${rail}: lost settlement acknowledgement retains the original good`, async () => {
    const p = await purchase(door, rail), stack = getPaymentStack(testEnv);
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
  it(`the_case_file ${door}: reused assemblies retain both purchase certificates through reverse recovery`, async () => {
    const first = await purchase(door, 0);
    fault = "response-before";
    expect((await first.send()).body.charged).toBe(true);
    const snapshot = structuredClone(prepared!);
    const original = (await getCaseFile(sourceEnv, String(object(snapshot.caseFile).case_id)))!;
    fault = ""; unavailable = true;
    const secondAt = new Date(NOW.getTime() + 3600_000);
    vi.setSystemTime(secondAt);
    const second = await purchase(door, 0, first.args);
    const newer = await second.send();
    expect(newer.refused, JSON.stringify(newer.body)).toBe(false);
    expect(newer.body.reused).toBe(true);
    await assertGood(second, newer.body, snapshot, secondAt.toISOString());
    expect((await getCaseFile(sourceEnv, original.case.case_id))!.cert_id).toBe(original.cert_id);
    const newerUrl = String(newer.body.case_purchase_url);
    expect(object(await (await request(newerUrl)).json()).cert_id).not.toBe(original.cert_id);
    // Force recovery to rebuild both projections from durable state, after a
    // second buyer has received a certificate against the same assembly.
    await sourceEnv.PATRONS.delete(KV_KEYS.caseFile(original.case.case_id));
    await sourceEnv.PATRONS.delete(KV_KEYS.caseFilePurchase(original.case.case_id, original.cert_id));
    expect(await runDurableObjectAlarm(first.stub)).toBe(true);
    const recovered = JSON.parse((await first.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(first, object(recovered.delivery), snapshot);
    expect(await getCaseFile(sourceEnv, original.case.case_id)).toEqual(original);
    expect(object(await (await request(newerUrl)).json()).cert_id).not.toBe(original.cert_id);
    expect((await request(`/case/${original.case.case_id}?cert_id=unrelated`)).status).toBe(404);
    expect(transfers).toBe(2);
    expect(preparations).toBe(1);
  });

  it(`the_case_file ${door}: old recovery cannot revive expired evidence or replace a newer assembly`, async () => {
    const first = await purchase(door, 0);
    fault = "response-before";
    expect((await first.send()).body.charged).toBe(true);
    const snapshot = structuredClone(prepared!);
    const file = object(snapshot.caseFile);
    const query: CaseFileInput = { txHash: String(first.args.tx_hash), mandateId: String(first.args.mandate_id),
      endpointUrl: String(first.args.url), launchCheckId: String(first.args.launch_check_id),
      payer: String(first.args.payer), recipient: String(first.args.recipient), expectedAmountUsdc: 1.25, claim: String(first.args.claim) };
    const queryKey = KV_KEYS.caseFileQuery(await caseFileQueryDigest(query));
    fault = "";
    vi.setSystemTime(new Date(NOW.getTime() + 86401_000));
    // An intentionally stale KV pointer is not evidence that a file is fresh.
    await sourceEnv.PATRONS.put(queryKey, String(file.case_id));
    const second = await purchase(door, 0, first.args);
    const newer = await second.send();
    expect(newer.refused).toBe(false);
    expect(newer.body.case_id).not.toBe(file.case_id);
    unavailable = true;
    expect(await runDurableObjectAlarm(first.stub)).toBe(true);
    expect(await sourceEnv.PATRONS.get(queryKey)).toBe(newer.body.case_id);
    const recovered = JSON.parse((await first.stub.existingPurchase())!) as PurchaseIntent;
    await assertGood(first, object(recovered.delivery), snapshot);
    expect(transfers).toBe(2);
    expect(preparations).toBe(2);
  });

  it(`the_case_file ${door}: missing original case bytes stay owed without replacement`, async () => {
    const p = await purchase(door, 0);
    fault = "certificate-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, async (_instance, state) => {
      const row = (await state.storage.get<{ path: string; digest: string; value: string }>("observation"))!;
      const value = JSON.parse(row.value) as Obj;
      delete value.caseFile;
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

  it(`the_case_file ${door}: persistent publication failure stays owed until storage returns`, async () => {
    const p = await purchase(door, 0);
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
