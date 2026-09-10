import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { atomicToUsdc, getPaymentStack } from "@/lib/payments";
import { canonicalAddress } from "@/lib/addresses";
import { verifyMessageSignature } from "@/lib/signing";
import { jcsCanonicalize } from "@/lib/jcs";
import { KV_KEYS } from "@/lib/kv-keys";
import { canonicalizeProbe, sweepStandingWatches, startWatch, type StandingWatchRecord } from "@/services/standing-watch";
import { canonicalizeConformancePass, sweepConformanceWatches, startConformanceWatch, type ConformanceWatchRecord } from "@/services/conformance-watch";
import type { RecoverableWatch } from "@/services/watch-recovery";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./labor-admission";
import { items, shelves, call, object, request, sourceEnv, testEnv, NOW, type Obj } from "./buyer-harness";
import { evmBuyer, solBuyer } from "./buyer-signed-payments";

installLaborAdmissionHarness();
let fault = "", hits = 0;
let prepared: RecoverableWatch | undefined;
const failure = () => { hits++; throw new Error("fixture watch persistence unavailable"); };
vi.mock("@/lib/kv-retry", async original => {
  const actual = await original<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const watch = [KV_KEYS.standingWatchPrefix, KV_KEYS.conformanceWatchPrefix].some(prefix => args[1].startsWith(prefix));
    if (watch && fault === "publication-before") failure();
    await actual.kvPut(...args);
    if (watch && fault === "publication-after") failure();
  } };
});
vi.mock("@/lib/signing", async original => {
  const actual = await original<typeof import("@/lib/signing")>();
  return { ...actual, signMessage: async (...args: Parameters<typeof actual.signMessage>) => {
    if (fault === "commission-signing" && args[0].includes('"scvd.watch-commission.v1"')) failure();
    return actual.signMessage(...args);
  } };
});
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") failure();
    const saved = await actual.mintCertificate(...args);
    if (fault === "certificate-after") failure();
    return saved;
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...a: Parameters<typeof inner.artifactStage>) => {
          if (a[2] !== undefined && fault === `${a[1]}-before`) failure();
          const saved = await inner.artifactStage(...a);
          if (a[1] === "watch_record" && saved) prepared = JSON.parse(saved) as RecoverableWatch;
          if (a[2] !== undefined && fault === `${a[1]}-after`) failure();
          return saved;
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault = ""; hits = 0; prepared = undefined; vi.setSystemTime(NOW); });
type WatchItem = "standing_watch" | "conformance_watch";
const doors = ["http", "mcp", "mcp-standard"] as const;
async function purchase(id: WatchItem, door: LaborDoor, rail = 0) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${NOW.getTime()}-${crypto.randomUUID()}`;
  const args: Obj = { purpose: canary, url: `https://buyer-fixture.example/api/paid?subject=${canary}&value=%CE%B1` };
  const quote = await call(item, "mcp", args, shelves(item)[0]);
  const offer = quote.offers.find(o => o.network === network);
  expect(offer, JSON.stringify(quote.body)).toBeDefined();
  const signed = await signLabor(offer!), payer = network.startsWith("eip155:") ? evmBuyer.address.toLowerCase() : solBuyer;
  const identity = await purchaseIdentity(network, payer, signed);
  return { id, args, network, payer, stub: purchaseIntentStore(sourceEnv, identity.id),
    prefix: id === "standing_watch" ? KV_KEYS.standingWatchPrefix : KV_KEYS.conformanceWatchPrefix,
    send: (changed: Obj = args) => sendLabor(id, door, changed, signed) };
}
type Purchase = Awaited<ReturnType<typeof purchase>>;
async function publishWatch(env: typeof testEnv, value: RecoverableWatch) {
  if (value.kind === "operator") throw new Error("This fixture covers the URL watches");
  const key = (value.kind === "standing" ? KV_KEYS.standingWatch : KV_KEYS.conformanceWatch)(value.record.watch_id);
  return await env.PAID_RECOVERIES!.get(env.PAID_RECOVERIES!.idFromName(`watch:${key}`)).publishWatch(value);
}
async function assertGood(p: Purchase, body: Obj, original?: RecoverableWatch) {
  const cert = object(JSON.parse(String(body.signed_payload)));
  expect(cert.purpose).toBe(p.args.purpose);
  expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  const keys = await sourceEnv.ORDERS.list({ prefix: p.prefix });
  expect(keys.keys).toHaveLength(1);
  const saved = (await sourceEnv.ORDERS.get(keys.keys[0]!.name, "json")) as StandingWatchRecord | ConformanceWatchRecord;
  expect(saved).toMatchObject({ watch_id: body.watch_id, url: p.args.url, payer: canonicalAddress(p.payer),
    started_at: NOW.toISOString(), ends_at: new Date(NOW.getTime() + 7 * 86400_000).toISOString() });
  if (original) expect(saved).toMatchObject(original.record);
  const history = object(await (await request(String(body.history_url))).json());
  expect(history).toMatchObject({ watch_id: saved.watch_id, url: p.args.url, ends_at: saved.ends_at });
  const proof = object(body.commission);
  expect(history.commission).toEqual(proof);
  const commission = object(JSON.parse(String(proof.signed_payload)));
  expect(commission).toMatchObject({ type: "scvd.watch-commission.v1", cert_id: cert.cert_id, item_id: p.id,
    watch_id: saved.watch_id, url: p.args.url, started_at: saved.started_at, ends_at: saved.ends_at,
    interval_hours: p.id === "standing_watch" ? 1 : 24 });
  expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
  for (const change of [{ url: "https://wrong.example" }, { ends_at: "2099-01-01" }, { cert_id: "wrong" }]) {
    expect(await verifyMessageSignature(jcsCanonicalize({ ...commission, ...change }), String(proof.signature), String(proof.public_key))).toBe(false);
  }
  if ("probes" in saved) for (const probe of saved.probes) {
    expect(await verifyMessageSignature(canonicalizeProbe(saved.watch_id, saved.url, probe), probe.signature, probe.public_key)).toBe(true);
  }
  if ("passes" in saved) for (const pass of saved.passes) {
    expect(await verifyMessageSignature(canonicalizeConformancePass(saved.watch_id, saved.url, pass), pass.signature, pass.public_key)).toBe(true);
  }
  return saved;
}
async function recover(p: Purchase, original?: RecoverableWatch) {
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
  await assertGood(p, object(status.fulfillment), original);
  return object(status.fulfillment);
}
export function watchPaidRecovery(id: WatchItem): void {
  it(`${id}: discovery declares the signed commission before payment`, async () => {
    const api = object(await (await request("/openapi.json")).json());
    const schemas = object(object(api.components).schemas);
    // Components are part of the contract; check the declared fields after resolving them.
    const dereference = (schema: Record<string, unknown>) => {
      if (typeof schema.$ref !== "string") return schema;
      expect(schema.$ref).toMatch(/^#\//);
      let node: unknown = api;
      for (const part of schema.$ref.slice(2).split("/")) node = object(node)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      return object(node);
    };
    const proof = dereference(object(object(object(schemas.DeliveryEnvelope).properties).commission));
    expect(proof.required).toEqual(expect.arrayContaining(["signed_payload", "signature", "public_key"]));
    const path = id === "standing_watch" ? "/api/watch/{watch_id}" : "/api/conformance-watch/{watch_id}";
    const response = object(object(object(object(api.paths)[path]).get).responses)["200"];
    const schema = object(object(object(object(response).content)["application/json"]).schema);
    expect(dereference(object(object(schema.properties).commission))).toEqual(proof);
  });
  for (const door of doors) for (const [rail] of laborNetworks().entries()) {
    for (const point of ["certificate-before", "certificate-after", "watch_record-before", "watch_record-after", "commission-signing", "publication-before", "publication-after", "response-before"]) {
      it(`${id} ${door} rail ${rail}: ${point} recovers the original watch`, async () => {
        const p = await purchase(id, door, rail);
        fault = point;
        expect((await p.send()).body.charged).toBe(true);
        expect(hits).toBeGreaterThan(0);
        expect(transfers).toBe(1);
        const original = structuredClone(prepared);
        fault = ""; vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
        await recover(p, original);
        expect(transfers).toBe(1);
      });
    }
    it(`${id} ${door} rail ${rail}: ambiguous settlement retains target and term`, async () => {
      const p = await purchase(id, door, rail), stack = getPaymentStack(testEnv);
      const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
      let receipt: Awaited<ReturnType<typeof settle>> | undefined;
      const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
        if (!receipt) receipt = await settle(...args);
        throw new TypeError("fixture lost settlement answer");
      });
      try {
        expect((await p.send()).body.charged).toBeNull();
        expect(transfers).toBe(1);
        const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
        expect(saved.state).toBe("unknown");
        if (!receipt?.success) throw new Error("Fixture did not settle");
        await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
          payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
        vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
        await recover(p);
        expect(transfers).toBe(1);
      } finally { spy.mockRestore(); }
    });
  }
  for (const door of doors) {
    it(`${id} ${door}: concurrent first purchases settle and start once`, async () => {
      const p = await purchase(id, door);
      const results = await Promise.all([p.send(), p.send()]);
      expect(results.some(r => !r.refused)).toBe(true);
      await recover(p, prepared);
      expect(transfers).toBe(1);
    });
    it(`${id} ${door}: changed-input replay refuses; duplicate retry keeps one watch`, async () => {
      const p = await purchase(id, door);
      fault = "response-before";
      expect((await p.send()).body.charged).toBe(true);
      const original = structuredClone(prepared!); fault = "";
      expect((await p.send({ ...p.args, url: "https://wrong.example" })).refused).toBe(true);
      const results = await Promise.all([p.send(), p.send()]);
      expect(results.some(r => !r.refused)).toBe(true);
      await recover(p, original);
      expect(transfers).toBe(1);
    });
    it(`${id} ${door}: recovery after expiry preserves progress and publishes missed time`, async () => {
      const p = await purchase(id, door);
      fault = "response-before";
      expect((await p.send()).body.charged).toBe(true);
      const original = structuredClone(prepared!); fault = "";
      vi.setSystemTime(new Date(NOW.getTime() + 3600_000));
      if (id === "standing_watch") await sweepStandingWatches(testEnv, { burstGapMs: 0 });
      else await sweepConformanceWatches(testEnv);
      if (original.kind === "operator") throw new Error("This fixture covers the URL watches");
      const key = p.prefix + original.record.watch_id;
      const current = await sourceEnv.ORDERS.get(key, "json");
      // Simulate a lost KV projection after a later signed observation.
      await sourceEnv.ORDERS.delete(key);
      vi.setSystemTime(new Date(NOW.getTime() + 9 * 86400_000));
      const body = await recover(p);
      expect(await sourceEnv.ORDERS.get(key, "json")).toEqual(current);
      const history = object(await (await request(String(body.history_url))).json());
      expect(history.complete).toBe(true);
      const entries = (history.probes ?? history.passes) as unknown[];
      expect(entries).toHaveLength(1);
      expect(Number(object(history.summary)[id === "standing_watch" ? "hours_unprobed" : "days_unchecked"])).toBeGreaterThan(0);
      expect(transfers).toBe(1);
    });
    it(`${id} ${door}: persistent publication failure remains owed until repaired`, async () => {
      const p = await purchase(id, door); fault = "publication-before";
      expect((await p.send()).body.charged).toBe(true);
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      expect(JSON.parse((await p.stub.existingPurchase())!).delivery).toBeUndefined();
      fault = ""; await recover(p, prepared);
      expect(transfers).toBe(1);
    });
  }
  it(`${id}: a failed scheduled publication repairs itself after buyer delivery`, async () => {
    const p = await purchase(id, "http");
    const body = (await p.send()).body;
    await assertGood(p, body);
    vi.setSystemTime(new Date(NOW.getTime() + 3600_000));
    fault = "publication-before";
    const sweep = () => id === "standing_watch" ? sweepStandingWatches(testEnv, { burstGapMs: 0 }) : sweepConformanceWatches(testEnv);
    await expect(sweep()).rejects.toThrow();
    const key = p.prefix + String(body.watch_id);
    const coordinator = sourceEnv.PAID_RECOVERIES!.get(sourceEnv.PAID_RECOVERIES!.idFromName(`watch:${key}`));
    await sourceEnv.ORDERS.delete(key);
    expect(await runDurableObjectAlarm(coordinator)).toBe(true);
    expect(await sourceEnv.ORDERS.get(key)).toBeNull();
    fault = "";
    expect(await runDurableObjectAlarm(coordinator)).toBe(true);
    const saved = object(await sourceEnv.ORDERS.get(key, "json"));
    expect((saved.probes ?? saved.passes) as unknown[]).toHaveLength(1);
    expect(await runDurableObjectAlarm(coordinator)).toBe(false);
    await assertGood(p, body);
    expect(transfers).toBe(1);
  });
  it(`${id}: legacy progress survives adoption and rejects a changed commission`, async () => {
    const started = id === "standing_watch" ? await startWatch(testEnv, "https://buyer-fixture.example/api/paid") : await startConformanceWatch(testEnv, "https://buyer-fixture.example/api/paid");
    vi.setSystemTime(new Date(NOW.getTime() + 3600_000));
    if (id === "standing_watch") await sweepStandingWatches(testEnv, { burstGapMs: 0 });
    else await sweepConformanceWatches(testEnv);
    const key = (id === "standing_watch" ? KV_KEYS.standingWatch : KV_KEYS.conformanceWatch)(started.record.watch_id);
    const record = (await sourceEnv.ORDERS.get(key, "json")) as StandingWatchRecord | ConformanceWatchRecord;
    const coordinator = sourceEnv.PAID_RECOVERIES!.get(sourceEnv.PAID_RECOVERIES!.idFromName(`watch:${key}`));
    // Adopt a KV-only historical watch, including its real signed observation.
    await runInDurableObject(coordinator, async (_instance, state) => state.storage.deleteAll());
    const value = (id === "standing_watch" ? { kind: "standing", record } : { kind: "conformance", record }) as RecoverableWatch;
    expect((await publishWatch(testEnv, value)).record).toEqual(record);
    const stale = { ...value, record: started.record } as RecoverableWatch;
    const merged = await Promise.all([publishWatch(testEnv, stale), publishWatch(testEnv, value), publishWatch(testEnv, stale)]);
    expect(merged.every(result => JSON.stringify(result.record) === JSON.stringify(record))).toBe(true);
    await expect(publishWatch(testEnv, { ...value, record: { ...record, url: "https://wrong.example" } } as RecoverableWatch)).rejects.toThrow("Watch commission mismatch");
  });
}
