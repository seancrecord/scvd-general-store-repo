import { runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { getPaymentStack } from "@/lib/payments";
import { purchaseIdentity, purchaseIntentStore } from "@/services/purchase-intent";
import { KV_KEYS } from "@/lib/kv-keys";
import { idempotencyScope, idempotentPurchaseStore, jsonBodyDigest } from "@/lib/idempotency";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { call, items, shelves, object, testEnv, sourceEnv, request, NOW } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
const namespace = testEnv.PAID_RECOVERIES!;
afterEach(() => { testEnv.PAID_RECOVERIES = namespace; vi.restoreAllMocks(); vi.setSystemTime(NOW); });

function wrapStoreCall(method: string, around: (call: () => Promise<unknown>) => Promise<unknown>) {
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof target.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, key) {
        const member = Reflect.get(inner, key);
        if (key === method) return (...args: unknown[]) => around(() => Reflect.apply(member, inner, args));
        return typeof member === "function" ? (...args: unknown[]) => Reflect.apply(member, inner, args) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
}
function storageFault(method: string, after: boolean) {
  let hits = 0;
  wrapStoreCall(method, async call => {
    hits++;
    if (after) await call();
    throw new Error("fixture loses storage reply");
  });
  return () => hits;
}
async function setup(network: string, itemId = "context_anchor") {
  const item = items.find(i => i.id === itemId)!;
  const args: Record<string, string> = itemId === "the_collab" ? { detail: `SCVD-E2E-${crypto.randomUUID()}` } : { summary: `SCVD-E2E-${crypto.randomUUID()}` };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const first = await signLabor(offer), second = await signLabor(offer), key = crypto.randomUUID();
  const payer = network.startsWith("eip155:") ? evmBuyer.address : solBuyer;
  const { id } = await purchaseIdentity(network, payer, first);
  return { item, args, offer, first, second, key, id, payer, stub: purchaseIntentStore(sourceEnv, id) };
}
async function dropCache() {
  const prefix = KV_KEYS.idempotency("", "", "").split(":")[0] + ":";
  for (const row of (await sourceEnv.COUNTERS.list({ prefix })).keys) await sourceEnv.COUNTERS.delete(row.name);
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const network of laborNetworks()) {
    it(`${door} ${network}: simultaneous claims admit exactly one fresh authorization`, async () => {
      const p = await setup(network);
      let arrived = 0, release!: () => void;
      const bothAtClaim = new Promise<void>(resolve => { release = resolve; });
      // Both requests finish their empty lookups before either claim reaches
      // real durable storage. Early status lookup alone cannot pass this race.
      wrapStoreCall("claimIdempotentPurchase", async call => {
        if (++arrived === 2) release();
        await bothAtClaim;
        return call();
      });
      const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
      const results = await Promise.all([
        sendLabor(p.item.id, door, p.args, p.first, p.key),
        sendLabor(p.item.id, door, p.args, p.second, p.key),
      ]);
      expect(arrived).toBe(2);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(transfers).toBe(1);
      expect(results.filter(result => !result.refused)).toHaveLength(1);
      const duplicate = results.find(result => result.refused)!;
      expect(duplicate.quote).toBe(false);
      expect(duplicate.body.settlement_attempted).toBe(false);
    });

    it(`${door} ${network}: an unresolved purchase survives fresh signatures, cache loss and a closed shelf`, async () => {
      const p = await setup(network, "the_collab");
      const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement").mockRejectedValue(new Error("fixture loses settlement answer"));
      const first = await sendLabor(p.item.id, door, p.args, p.first, p.key);
      expect(first.body).toMatchObject({ charged: null, code: "settlement_unknown" });
      await dropCache();
      await sourceEnv.COUNTERS.delete(KV_KEYS.keeperLastSeen);
      const second = await sendLabor(p.item.id, door, p.args, p.second, p.key);
      expect(second.refused).toBe(true);
      expect(second.quote).toBe(false);
      expect(second.body).toMatchObject({ charged: null, charged_again: false, settlement_attempted: false });
      expect(object(second.body.recovery).purchase_id).toBe(p.id);
      expect(object(second.body.recovery).status_token).toBe(object(first.body.recovery).status_token);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it(`${door} ${network}: a fresh signature retrieves the original good after cache loss and object eviction`, async () => {
      const p = await setup(network);
      const first = await sendLabor(p.item.id, door, p.args, p.first, p.key);
      expect(first.refused).toBe(false);
      await runDurableObjectAlarm(p.stub);
      const original = object(JSON.parse((await p.stub.existingPurchase())!));
      await dropCache();
      // The MCP door's arguments are its body: the surface carries their canonical digest, not a query.
      const surface = door === "http"
        ? await idempotencyScope(new URL(p.item.buy_url, "https://scvd.store").pathname, new URLSearchParams(p.args))
        : await idempotencyScope(`mcp:buy_${p.item.id}`, new URLSearchParams(), await jsonBodyDigest({ item_id: p.item.id, ...p.args }));
      const slot = await idempotentPurchaseStore(sourceEnv, surface, p.payer, p.key);
      // Reset the isolate, retaining durable state. A module Map cannot pass.
      expect(await slot.readIdempotentPurchase()).toBe(p.id);
      await expect(runInDurableObject(slot, (_instance, state) => state.abort())).rejects.toThrow("abort()");
      const again = await sendLabor(p.item.id, door, p.args, p.second, p.key);
      expect(again.refused, String(again.body.code)).toBe(false);
      expect(again.body.charged_again).toBe(false);
      const originalCert = object(object(original.delivery).certificate).cert_id;
      expect(again.body.cert_id ?? object(again.body.certificate).cert_id).toBe(originalCert);
      expect(transfers).toBe(1);
    });
  }

  for (const after of [false, true]) {
    it(`${door}: a ${after ? "lost" : "failed"} atomic claim never submits payment; only its owner can resume`, async () => {
      const p = await setup(laborNetworks()[0]!);
      const hits = storageFault("claimIdempotentPurchase", after);
      const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
      const failed = await sendLabor(p.item.id, door, p.args, p.first, p.key);
      expect(hits()).toBe(1);
      expect(failed.body).toMatchObject({ charged: null, settlement_attempted: false });
      expect(spy).not.toHaveBeenCalled();
      testEnv.PAID_RECOVERIES = namespace;
      if (after) {
        const loser = await sendLabor(p.item.id, door, p.args, p.second, p.key);
        expect(loser.refused).toBe(true);
        expect(spy).not.toHaveBeenCalled();
      }
      const resumed = await sendLabor(p.item.id, door, p.args, p.first, p.key);
      expect(resumed.refused, String(resumed.body.code)).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  }

  it(`${door}: unreadable keyed admission fails closed`, async () => {
    const p = await setup(laborNetworks()[0]!);
    const hits = storageFault("readIdempotentPurchase", false);
    const spy = vi.spyOn(getPaymentStack(testEnv).httpServer, "processSettlement");
    const result = await sendLabor(p.item.id, door, p.args, p.first, p.key);
    expect(hits()).toBeGreaterThan(0);
    expect(result.body).toMatchObject({ charged: null, settlement_attempted: false });
    expect(spy).not.toHaveBeenCalled();
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: one EVM wallet shares a purchase across rails, while a deliberate new key starts a new purchase`, async () => {
    const networks = laborNetworks().filter(network => network.startsWith("eip155:"));
    const p = await setup(networks[0]!);
    expect((await sendLabor(p.item.id, door, p.args, p.first, p.key)).refused).toBe(false);
    await runDurableObjectAlarm(p.stub);
    await dropCache();
    const offer = (await call(p.item, "mcp", p.args, shelves(p.item)[0])).offers.find(o => o.network === networks[1])!;
    const otherRail = await signLabor(offer);
    const replay = await sendLabor(p.item.id, door, p.args, otherRail, p.key);
    expect(replay.refused, String(replay.body.code)).toBe(false);
    expect(replay.body.charged_again).toBe(false);
    expect(transfers).toBe(1);
    const deliberate = await sendLabor(p.item.id, door, p.args, otherRail, crypto.randomUUID());
    expect(deliberate.refused, String(deliberate.body.code)).toBe(false);
    expect(transfers).toBe(2);
  });
}
