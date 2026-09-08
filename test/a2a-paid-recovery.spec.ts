import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack, atomicToUsdc } from "@/lib/payments";
import { jcsCanonicalize } from "@/lib/jcs";
import { verifyMessageSignature } from "@/lib/signing";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { kitStore, type PreparedA2AKit } from "@/services/a2a-kit";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";
import { AGENT, card, authorization, fixture } from "./helpers/a2a-fixture";

// Both instrument and assertions use this clock. Put native A2A alarms in
// the future too, so only the explicitly invoked recovery runs in this test.
const saleTime = vi.hoisted(() => new Date(Math.floor(Date.now() / 1000) * 1000 + 365 * 86400_000));
installLaborAdmissionHarness();
let fault = "", hits = 0, targetCalls = 0, runtimeCalls = 0, unavailable = false, denied = false;
let targetUrl = "", prepared: PreparedA2AKit | undefined;
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") { hits++; throw new Error("fixture cannot sign certificate"); }
    const minted = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture certificate acknowledgement lost"); }
    return minted;
  } };
});
beforeAll(() => {
  const innerFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url).origin !== AGENT) return innerFetch(input, init);
    targetCalls++;
    if (init?.method === "POST") runtimeCalls++;
    if (unavailable) throw new Error("fixture target gone after payment");
    if (url === targetUrl) return Response.json(card);
    return fixture({ authorization: { ...authorization(), card_url: targetUrl, allow_scvd_audit: !denied } }).fetchImpl(url, init);
  });
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "retainObservation") return async (...a: Parameters<typeof inner.retainObservation>) => {
          if (a[2] !== undefined && fault === "observation-before") { hits++; throw new Error("fixture journal unavailable"); }
          const saved = await inner.retainObservation(...a);
          if (saved) prepared = JSON.parse(saved).a2aKit as PreparedA2AKit;
          if (a[2] !== undefined && fault === "observation-after") { hits++; throw new Error("fixture journal acknowledgement lost"); }
          return saved;
        };
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && a[1] === "response" && fault === "response-before") { hits++; throw new Error("fixture response checkpoint unavailable"); }
          return inner.artifactStage(...a);
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
  const kits = testEnv.A2A_KITS!;
  testEnv.A2A_KITS = new Proxy(kits, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof kits.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "save") return async (...a: Parameters<typeof inner.save>) => {
          if (fault === "kit-before") { hits++; throw new Error("fixture kit write unavailable"); }
          await inner.save(...a);
          if (fault === "kit-after") { hits++; throw new Error("fixture kit acknowledgement lost"); }
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => {
  fault = ""; hits = targetCalls = runtimeCalls = 0; unavailable = denied = false; prepared = undefined;
  vi.setSystemTime(saleTime);
});
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(door: LaborDoor, network: string) {
  const item = items.find(i => i.id === "a2a_repair_kit")!, canary = `SCVD-E2E-${crypto.randomUUID()}`;
  targetUrl = `${AGENT}/${canary}/agent-card.json`;
  const args = { url: targetUrl, purpose: canary };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const payment = await signLabor(offer), identity = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, payment);
  return { args, network, canary, payment, stub: purchaseIntentStore(sourceEnv, identity.id),
    send: (changed: Obj = args) => sendLabor(item.id, door, changed, payment) };
}
async function assertGood(body: Obj, original: PreparedA2AKit, p: Awaited<ReturnType<typeof purchase>>) {
  expect(body.kit_id).toBe(original.id);
  expect(body.report).toEqual(original.report);
  expect(original.report.observation.card_url).toBe(p.args.url);
  expect(original.report.observation.entitlement?.started_at).toBe(saleTime.toISOString());
  expect(original.report.observation.mode).toBe("runtime");
  expect(object(object(body.recheck).body).token).toBe(original.recheck_token);
  expect(await verifyMessageSignature(jcsCanonicalize(original.report.observation), original.report.signature, original.report.public_key)).toBe(true);
  expect(await verifyMessageSignature(jcsCanonicalize({ ...original.report.observation, card_url: "https://wrong.example/" }), original.report.signature, original.report.public_key)).toBe(false);
  const cert = object(body.certificate);
  expect(cert).toMatchObject({ purpose: p.canary, attests: original.report.evidence_hash });
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  const report = object(await (await request(String(body.report_url))).json());
  expect(report).toMatchObject({ id: original.id, cert_id: cert.cert_id, report: original.report,
    started_at: original.report.observation.entitlement!.started_at, ends_at: original.report.observation.entitlement!.ends_at,
    recheck_until: original.report.observation.entitlement!.recheck_until });
  expect(JSON.stringify(report)).not.toContain(original.recheck_token);
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  expect(transfers).toBe(1);
}
async function recover(p: Awaited<ReturnType<typeof purchase>>, original: PreparedA2AKit) {
  fault = ""; unavailable = true; vi.setSystemTime(new Date(saleTime.getTime() + 86400_000));
  const before = targetCalls;
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  const status = object(await (await request(`/api/purchase-status/${saved.id}`, { headers: { Authorization: `Bearer ${saved.token}` } })).json());
  expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
  await assertGood(object(status.fulfillment), original, p);
  const retry = await p.send();
  expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
  expect(retry.body).toMatchObject({ kit_id: original.id, report: original.report, charged: true, charged_again: false });
  expect(object(object(retry.body.recheck).body).token).toBe(original.recheck_token);
  expect(targetCalls).toBe(before);
  expect(await runDurableObjectAlarm(p.stub)).toBe(false);
  return object(status.fulfillment);
}
for (const door of doors) for (const network of laborNetworks()) {
  for (const point of ["certificate-before", "certificate-after", "kit-before", "kit-after", "response-before"]) it(`${door} ${network}: ${point} recovers the original paid kit with its target gone`, async () => {
    const p = await purchase(door, network); fault = point;
    const first = await p.send();
    expect(first.refused).toBe(true); expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0); expect(transfers).toBe(1); expect(runtimeCalls).toBeGreaterThan(0);
    expect(prepared).toBeDefined();
    await recover(p, structuredClone(prepared!));
  });
  it(`${door} ${network}: lost settlement answer retains the kit for confirmed recovery`, async () => {
    const p = await purchase(door, network), stack = getPaymentStack(testEnv), settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture drops settlement answer");
    });
    try {
      const first = await p.send();
      expect(first.refused).toBe(true); expect(first.body.charged).toBeNull(); expect(transfers).toBe(1);
      expect(prepared).toBeDefined();
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown");
      expect(object(first.body.recovery).purchase_id).toBe(saved.id);
      if (!receipt?.success) throw new Error("Fixture did not settle");
      // Chain finality has separate negative-control suites. Inject the known
      // local settlement result here to isolate survival of the purchased kit.
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network,
        payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      await recover(p, structuredClone(prepared!));
    } finally { spy.mockRestore(); }
  });
}
for (const door of doors) {
  for (const point of ["observation-before", "observation-after"]) it(`${door}: ${point} refuses settlement and safely retries`, async () => {
    const p = await purchase(door, laborNetworks()[0]!); fault = point;
    const first = await p.send();
    expect(hits).toBeGreaterThan(0); expect(first.refused).toBe(true);
    expect(first.body).toMatchObject({ code: "observation_storage_unavailable", charged: false, settlement_attempted: false });
    expect(transfers).toBe(0); expect(await p.stub.existingPurchase()).toBeNull();
    const before = runtimeCalls, original = prepared && structuredClone(prepared);
    fault = "";
    const retry = await p.send(); expect(retry.refused).toBe(false); expect(transfers).toBe(1);
    if (point === "observation-after") { expect(runtimeCalls).toBe(before); expect(retry.body.kit_id).toBe(original!.id); }
  });
  it(`${door}: wrong inputs cannot replace a settled kit`, async () => {
    const p = await purchase(door, laborNetworks()[0]!); fault = "response-before";
    expect((await p.send()).body.charged).toBe(true);
    fault = ""; unavailable = true; const before = targetCalls;
    const wrong = await p.send({ ...p.args, purpose: "different commission" });
    expect(wrong.refused).toBe(true); expect(wrong.body.charged).toBe(true); expect(transfers).toBe(1);
    expect(targetCalls).toBe(before);
    await recover(p, structuredClone(prepared!));
  });
  it(`${door}: concurrent first purchases retain one kit and one charge`, async () => {
    const p = await purchase(door, laborNetworks()[0]!);
    const replies = await Promise.all([p.send(), p.send()]);
    expect(replies.some(r => !r.refused)).toBe(true); expect(transfers).toBe(1);
    await recover(p, structuredClone(prepared!));
  });
  it(`${door}: recovery preserves a consumed recheck and the existing watch history`, async () => {
    const p = await purchase(door, laborNetworks()[0]!); fault = "kit-after";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(prepared!), store = kitStore(sourceEnv, original.id);
    expect((await store.recheck(original.recheck_token)).status).toBe("complete");
    await runInDurableObject(store, instance => instance.observeSlot(saleTime.getTime() + 86400_000));
    const history = await store.read();
    await recover(p, original);
    const after = await store.read();
    expect(after?.recheck).toEqual(history?.recheck); expect(after?.watch.passes).toEqual(history?.watch.passes);
    const before = targetCalls;
    expect(await store.recheck(original.recheck_token)).toEqual(history?.recheck); expect(targetCalls).toBe(before);
  });
  it(`${door}: a new sale still needs current permission after quoting`, async () => {
    const p = await purchase(door, laborNetworks()[0]!); denied = true;
    const result = await p.send();
    expect(result.refused).toBe(true); expect(result.body).toMatchObject({ code: "authorization_required", charged: false });
    expect(transfers).toBe(0); expect(runtimeCalls).toBe(0); expect(await p.stub.existingPurchase()).toBeNull();
  });
}

for (const door of doors) {
  it(`${door}: an EVM retry repairs publication before the scheduled recovery runs`, async () => {
    const p = await purchase(door, laborNetworks()[0]!); fault = "kit-before";
    expect((await p.send()).body.charged).toBe(true);
    const original = structuredClone(prepared!); fault = ""; unavailable = true;
    const before = targetCalls;
    let body: Obj;
    if (door === "http") {
      const response = await request(`/api/buy/a2a_repair_kit?${new URLSearchParams(p.args)}`, {
        headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(p.payment)) },
      });
      expect(response.status).toBe(200); expect(response.headers.get("Paid-Retry")).toBe("true");
      const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      const receipt = Object.entries(record.payment!.settleHeaders).find(([name]) => name.toLowerCase() === "payment-response")?.[1];
      expect(receipt).toBeDefined(); expect(response.headers.get("Payment-Response")).toBe(receipt);
      body = object(await response.json());
    } else {
      const retry = await p.send();
      expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
      expect(retry.body).toMatchObject({ charged: true, charged_again: false });
      body = retry.body;
    }
    expect(body).toMatchObject({ kit_id: original.id, report: original.report });
    expect(object(object(body.recheck).body).token).toBe(original.recheck_token);
    expect(targetCalls).toBe(before); expect(transfers).toBe(1);
  });
  it(`${door}: a missing original snapshot stays owed rather than observing a replacement`, async () => {
    const p = await purchase(door, laborNetworks()[0]!); fault = "kit-before";
    expect((await p.send()).body.charged).toBe(true);
    await runInDurableObject(p.stub, (_instance, state) => state.storage.delete("observation"));
    fault = ""; unavailable = true; const before = targetCalls;
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
    expect(record.state).toBe("settled"); expect(record.delivery).toBeUndefined();
    const retry = await p.send(); expect(retry.refused).toBe(true); expect(retry.body.charged).toBe(true);
    expect(targetCalls).toBe(before); expect(transfers).toBe(1);
  });
}
