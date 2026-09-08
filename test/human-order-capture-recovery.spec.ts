import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { BASE_NETWORK } from "@/lib/payments";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { getMenuItem } from "@/store";
import { getOrder } from "@/services/orders";
import { installLaborAdmissionHarness, sendLabor, signLabor, transfers } from "./helpers/labor-admission";
import { baseline, call, items, shelves, object, request, testEnv, sourceEnv, NOW } from "./helpers/buyer-harness";
import { evmBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
const namespace = testEnv.PAID_RECOVERIES!;
afterEach(() => { testEnv.PAID_RECOVERIES = namespace; vi.setSystemTime(NOW); });
for (const id of ["aura_walk", "the_collab"]) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door}: a retained purchase before its artifact journal is not a missing legacy brief`, async () => {
    const item = items.find(item => item.id === id)!;
    const args = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(offer => offer.network === BASE_NETWORK)!;
    const wire = await signLabor(offer), key = crypto.randomUUID();
    const identity = await purchaseIdentity(BASE_NETWORK, evmBuyer.address, wire);
    const stub = purchaseIntentStore(sourceEnv, identity.id);
    let hits = 0;
    testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
      if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
        const inner = target.get(...args);
        return new Proxy(inner, { get(target, method) {
          if (method === "openArtifact") return async () => { hits++; throw new Error("fixture artifact journal unavailable"); };
          const member = Reflect.get(target, method);
          return typeof member === "function" ? (...args: unknown[]) => Reflect.apply(member, target, args) : member;
        } });
      };
      const member = Reflect.get(target, property);
      return typeof member === "function" ? member.bind(target) : member;
    } });
    const first = await sendLabor(id, door, args, wire, key);
    expect(first.body.charged).toBe(true);
    expect(hits).toBeGreaterThan(0);
    expect(transfers).toBe(1);
    const saved = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
    expect(saved).toMatchObject({ state: "settled", item: { id, sla_hours: getMenuItem(id)!.sla_hours } });
    testEnv.PAID_RECOVERIES = namespace;
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
    const retry = await sendLabor(id, door, args, wire, key);
    expect(retry.refused).toBe(true);
    expect(retry.quote).toBe(false);
    expect(retry.body).toMatchObject({ charged: true, code: "purchase_recovery_pending" });
    expect(object(retry.body.recovery)).toMatchObject({ purchase_id: identity.id, status_token: saved.token });
    const changed = await sendLabor(id, door, { ...args, detail: `${args.detail}-CHANGED` }, wire, crypto.randomUUID());
    expect(changed.refused).toBe(true);
    expect(object(changed.body.recovery).purchase_id).toBe(identity.id);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const read = await request(String(object(retry.body.recovery).status_url), { headers: { Authorization: `Bearer ${saved.token}` } });
    const status = object(await read.json());
    expect(status.delivery_state).toBe("order_created");
    const good = object(status.fulfillment);
    const order = object(await (await request(String(good.order_url))).json());
    expect(order).toMatchObject({ order_id: good.order_id, created_at: saved.created_at, sla_hours: saved.item!.sla_hours });
    expect((await getOrder(sourceEnv, String(good.order_id)))?.detail).toBe(args.detail);
    const replay = await sendLabor(id, door, args, wire, key);
    expect(replay.refused).toBe(false);
    expect(replay.body.order_id).toBe(good.order_id);
    expect(transfers).toBe(1);
  });
}
