import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { counterLedger } from "@/lib/counter-ledger";
import { KV_KEYS } from "@/lib/kv-keys";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { getMenuItem } from "@/store";
import { raiseCountersToRecords } from "@/services/counter-raise";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const wallet = `0x${"ab".repeat(20)}`;
const transaction = `0x${"cd".repeat(32)}`;
const settleKey = KV_KEYS.payerSettle(wallet, transaction);
const at = new Date("2026-10-19T10:09:54.300Z");
const stub = () => purchaseIntentStore(bindings, "a".repeat(64));
const purchase = (): PurchaseIntent => ({
  version: 1, id: "a".repeat(64), token: "b".repeat(64),
  path: "/api/buy/hello", door: "http", payer: wallet,
  terms: { scheme: "exact", network: "eip155:8453", amount: "500000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: bindings.PAY_TO_ADDRESS, maxTimeoutSeconds: 300, extra: {} },
  request: "", item: getMenuItem("hello"), created_at: at.toISOString(), state: "settled",
  payment: { payer: wallet, network: "eip155:8453", transaction, paidUsdc: 0.5, tipUsdc: 0, settleHeaders: {} },
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at);
  await runInDurableObject(stub(), async (_, state) => { await state.storage.deleteAll(); });
  const artifact = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`eip155:8453:${transaction}`));
  await runInDurableObject(artifact, async (_, state) => { await state.storage.deleteAll(); });
  await counterLedger(bindings, KV_KEYS.payer(wallet))!.reset();
  for (const prefix of ["metric:", "metricw:", "payer:", KV_KEYS.payerSettlePrefix()]) {
    const listed = await bindings.COUNTERS.list({ prefix });
    for (const key of listed.keys) await bindings.COUNTERS.delete(key.name);
  }
  for (const key of (await bindings.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys) await bindings.PATRONS.delete(key.name);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("recovers both the certificate and its settle record after interruption before the till ran", async () => {
  await stub().beginPurchase(JSON.stringify(purchase()));
  expect(await bindings.COUNTERS.get(settleKey)).toBeNull();
  vi.setSystemTime(new Date(at.getTime() + 60_000));
  expect(await runDurableObjectAlarm(stub())).toBe(true);
  const record = JSON.parse((await stub().existingPurchase())!) as PurchaseIntent;
  expect(record.delivery?.certificate).toMatchObject({ payer: wallet, settlement_tx: transaction });
  expect(await bindings.COUNTERS.get(settleKey, "json")).toMatchObject({ item: "hello", transaction, at: at.toISOString() });
  const raised = await raiseCountersToRecords(bindings);
  expect(raised.raised).toEqual(expect.arrayContaining([
    { key: KV_KEYS.metric("2026-10", "paid", "hello"), from: 0, to: 1 },
    { key: KV_KEYS.metric("2026-10", "rev", "total"), from: 0, to: 500000 },
  ]));
  expect((await raiseCountersToRecords(bindings)).raised).toEqual([]);
});

it("repairs accounting even when goods were already delivered without booking twice", async () => {
  await stub().beginPurchase(JSON.stringify({ ...purchase(), delivery: { cert_id: "already-delivered" } }));
  await runDurableObjectAlarm(stub());
  const first = await bindings.COUNTERS.get(settleKey);
  expect(first).not.toBeNull();
  await runInDurableObject(stub(), instance => instance.alarm());
  expect(await bindings.COUNTERS.get(settleKey)).toBe(first);
});

it("keeps a failed record write armed after delivery and retries it without resettling", async () => {
  await stub().beginPurchase(JSON.stringify({ ...purchase(), delivery: { cert_id: "already-delivered" } }));
  await runInDurableObject(stub(), async (instance, state) => {
    const object = instance as unknown as { env: Env };
    const counters = object.env.COUNTERS;
    let failedWrites = 0;
    object.env.COUNTERS = new Proxy(counters, { get(target, field) {
      if (field === "put") return async () => { failedWrites++; throw new Error("fixture KV unavailable"); };
      const value = Reflect.get(target, field);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    try { await instance.alarm().catch(() => undefined); }
    finally { object.env.COUNTERS = counters; }
    expect(failedWrites).toBeGreaterThanOrEqual(3);
    expect(await state.storage.getAlarm()).not.toBeNull();
    expect((await state.storage.get<PurchaseIntent>("purchase"))?.x402?.accounted).toBeUndefined();
    await instance.alarm();
    expect((await state.storage.get<PurchaseIntent>("purchase"))?.x402?.accounted).toBe(true);
  });
  expect(await bindings.COUNTERS.get(settleKey)).not.toBeNull();
});

it("preserves an existing booking byte for byte and never increments partial counters again", async () => {
  const existing = JSON.stringify({ item: "hello", transaction, at: "2026-10-19T10:09:53.000Z", house: true });
  await bindings.COUNTERS.put(settleKey, existing);
  const paidKey = KV_KEYS.metric("2026-10", "paidh", "hello");
  await bindings.COUNTERS.put(paidKey, "7");
  await stub().beginPurchase(JSON.stringify({ ...purchase(), delivery: { cert_id: "already-delivered" } }));
  await runDurableObjectAlarm(stub());
  expect(await bindings.COUNTERS.get(settleKey)).toBe(existing);
  expect(await bindings.COUNTERS.get(paidKey)).toBe("7");
});

it("retains house attribution from the original request so the raise cannot invent an organic sale", async () => {
  await stub().beginPurchase(JSON.stringify({ ...purchase(), x402: { house: true }, delivery: { cert_id: "already-delivered" } }));
  await runDurableObjectAlarm(stub());
  expect(await bindings.COUNTERS.get(settleKey, "json")).toMatchObject({ house: true });
  const raised = await raiseCountersToRecords(bindings);
  expect(raised.house_records).toBe(1);
  expect(raised.organic_records).toBe(0);
  expect(raised.raised).toEqual([]);
});

it("refuses mismatched settled identity without clearing the accounting obligation", async () => {
  const record = purchase();
  record.payment!.payer = `0x${"ef".repeat(20)}`;
  record.delivery = { cert_id: "already-delivered" };
  await stub().beginPurchase(JSON.stringify(record));
  await runInDurableObject(stub(), async (instance, state) => {
    await expect(instance.alarm()).rejects.toThrow("identity unavailable");
    expect(await state.storage.getAlarm()).not.toBeNull();
  });
  expect(await bindings.COUNTERS.get(settleKey)).toBeNull();
});

it("retains settlement evidence even when the good needs manual delivery", async () => {
  await stub().beginPurchase(JSON.stringify({ ...purchase(), item: undefined }));
  await runDurableObjectAlarm(stub());
  expect(await bindings.COUNTERS.get(settleKey, "json")).toMatchObject({ item: "hello", transaction });
  const record = JSON.parse((await stub().existingPurchase())!) as PurchaseIntent;
  expect(record.delivery).toBeUndefined();
  expect(record.x402?.accounted).toBe(true);
});
