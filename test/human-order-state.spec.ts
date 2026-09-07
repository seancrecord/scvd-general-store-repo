import { queueLoad } from "@/services/queue-capacity";
import { auditRefundWindows } from "@/services/refund-window";
import { beforeEach, expect, it, vi } from "vitest";
import { installBuyerHarness, sourceEnv, testEnv } from "./helpers/buyer-harness";
import { getMenuItem } from "@/store";
import { recordInventorySale, remainingInventory, resetWeeklyInventory, getOrder, listOrders, completeOrder, acknowledgeOrder } from "@/services/orders";
import { writeManagedOrder } from "@/services/managed-orders";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import type { OrderRecord } from "@/types";
installBuyerHarness();
let seed: OrderRecord;
beforeEach(() => {
  seed = { managed_order: true, order_id: `ord_${crypto.randomUUID()}`, item_id: "aura_walk", item_name: "fixture",
    status: "queued", created_at: new Date().toISOString(), sla_hours: 168, paid_usdc: 150,
    tip_usdc: 0, patron_number: 1, cert_id: `cert_${crypto.randomUUID()}`, detail: "SCVD-E2E original brief" };
});

it("a stale creation and acknowledgement preserve the latest completion; old callback results cannot replace it", async () => {
  await writeManagedOrder(testEnv, seed);
  const first = await writeManagedOrder(testEnv, seed, { kind: "complete", at: "2026-09-05T12:01:00Z", deliverable: "first answer" });
  await writeManagedOrder(testEnv, seed, { kind: "complete", at: "2026-09-05T12:02:00Z", deliverable: "revised answer" });
  await Promise.all([
    writeManagedOrder(testEnv, seed),
    writeManagedOrder(testEnv, seed, { kind: "acknowledge", at: "2026-09-05T12:03:00Z" }),
    writeManagedOrder(testEnv, seed, { kind: "webhook", completion: first.completion, result: "obsolete callback" }),
  ]);
  const current = await getOrder(testEnv, seed.order_id);
  expect(current).toMatchObject({ status: "completed", deliverable: "revised answer", detail: seed.detail,
    completed_at: "2026-09-05T12:02:00Z", acknowledged_at: "2026-09-05T12:03:00Z" });
  expect(current?.webhook).toBeUndefined();
  // Simulate a stale listing projection: all order readers must consult current state.
  await sourceEnv.ORDERS.put(KV_KEYS.order(seed.order_id), JSON.stringify(seed));
  expect((await listOrders(testEnv)).find(o => o.order_id === seed.order_id)?.deliverable).toBe("revised answer");
  expect((await queueLoad(testEnv)).open_total).toBe(0);
  expect((await auditRefundWindows(testEnv, new Date("2026-10-01T12:00:00Z"))).breaches).toHaveLength(0);
});

it("a replay cannot attach a different certificate to a coordinated order", async () => {
  await writeManagedOrder(testEnv, seed);
  await expect(writeManagedOrder(testEnv, { ...seed, cert_id: "different-certificate" })).rejects.toThrow();
  expect((await getOrder(testEnv, seed.order_id))?.cert_id).toBe(seed.cert_id);
});

it("inventory counts one immutable sale per order, including concurrent duplicate retries and legacy counts", async () => {
  const item = getMenuItem(seed.item_id)!;
  await sourceEnv.COUNTERS.put(KV_KEYS.inventory(item.id, currentWeekKey()), "1");
  await Promise.all(Array.from({ length: 4 }, () => recordInventorySale(testEnv, item, seed)));
  expect(await remainingInventory(testEnv, item)).toBe(item.weekly_inventory! - 2);
  await recordInventorySale(testEnv, item, { ...seed, order_id: `ord_${crypto.randomUUID()}` });
  expect(await remainingInventory(testEnv, item)).toBe(item.weekly_inventory! - 3);
  await resetWeeklyInventory(testEnv);
  expect(await remainingInventory(testEnv, item)).toBe(item.weekly_inventory);
});

it("a late recovery records inventory in the week originally purchased", async () => {
  const item = getMenuItem(seed.item_id)!;
  const previous = { ...seed, created_at: "2026-08-01T12:00:00Z" };
  await recordInventorySale(testEnv, item, previous);
  expect(await remainingInventory(testEnv, item)).toBe(item.weekly_inventory);
  await recordInventorySale(testEnv, item, previous);
  const prefix = `${KV_KEYS.inventory(item.id, currentWeekKey(new Date(previous.created_at)))}:`;
  expect((await sourceEnv.COUNTERS.list({ prefix })).keys).toHaveLength(1);
});

it("a late callback cannot overwrite a newer completion or acknowledgement", async () => {
  seed.callback_url = "https://buyer-fixture.example/callback";
  await writeManagedOrder(testEnv, seed);
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const original = globalThis.fetch;
  let calls = 0;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== seed.callback_url) return original(input, init);
    calls++;
    if (calls === 1) { entered(); await waiting; return new Response("old callback", { status: 500 }); }
    return new Response("new callback", { status: 200 });
  });
  try {
    const first = completeOrder(testEnv, seed.order_id, "old answer");
    await started;
    await completeOrder(testEnv, seed.order_id, "revised answer");
    await acknowledgeOrder(testEnv, seed.order_id);
    release();
    await first;
    const latest = await getOrder(testEnv, seed.order_id);
    expect(latest).toMatchObject({ status: "completed", deliverable: "revised answer", webhook: "delivered (HTTP 200)" });
    expect(latest?.acknowledged_at).toBeDefined();
    expect(calls).toBe(2);
  } finally { release(); spy.mockRestore(); }
});
