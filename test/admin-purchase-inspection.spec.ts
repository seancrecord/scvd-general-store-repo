import { env, runInDurableObject, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { app } from "@/index";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { mppEvmPurchasePayment, x402PurchasePayment } from "@/lib/purchase-payment";
import { inspectPurchase } from "@/services/purchase-inspection";
import { BASE_USDC } from "@/lib/base-rpc";
import { USDC_DECIMALS } from "@/lib/payments";
import { KV_KEYS } from "@/lib/kv-keys";
import type { PaymentRequirements } from "@x402/core/types";
import type { Env } from "@/types";
import { getMenuItem } from "@/store";

const bindings = env as unknown as Env;
const now = new Date("2026-09-16T12:00:00.000Z");
const month = now.toISOString().slice(0, 7);
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const marker = "private-buyer-material-must-not-escape";
const auth = { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}` };
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  await bindings.COUNTERS.delete(KV_KEYS.adminFailByIp("unknown"));
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function request(path: string, headers: Record<string, string> = auth, config = bindings) {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://scvd.store${path}`, { headers }), config, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
async function fixture(protocol: "mpp" | "x402" = "mpp", version: 1 | 2 = 2) {
  const terms: PaymentRequirements = { scheme: "exact", network: "eip155:8453", asset: BASE_USDC,
    amount: "1000000", payTo: `0x${"22".repeat(20)}`, maxTimeoutSeconds: 300, extra: {} };
  const payer = `0x${"11".repeat(20)}`;
  const authorization = { from: payer, to: terms.payTo, value: terms.amount,
    nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`, validAfter: "0", validBefore: "2000000000" };
  const payment_context = protocol === "mpp"
    ? await mppEvmPurchasePayment(terms, payer, authorization, "a".repeat(64))
    : await x402PurchasePayment(terms, payer, { payload: { authorization, signature: marker } });
  const record: PurchaseIntent = { version, id: payment_context.identity, token: marker, path: "/api/buy/context_anchor",
    door: "http", payer, terms, item: getMenuItem("context_anchor"), request: `summary=${marker}`, created_at: now.toISOString(), state: "settled",
    authorization: payment_context.authorization, payment_proof: payment_context.proof_digest,
    ...(version === 2 ? { payment_context, request_digest: "b".repeat(64) } : {}),
    payment: { transaction: `0x${"33".repeat(32)}`, payer, network: terms.network, paidUsdc: 1, tipUsdc: 0,
      settleHeaders: { "Payment-Receipt": marker } }, delivery: { secret_input: marker },
    ...(protocol === "mpp" ? { mpp: { challenge_id: marker, house: true, accounted: true as const } } : {}) };
  await save(record);
  return record;
}
async function save(record: PurchaseIntent) {
  await runInDurableObject(purchaseIntentStore(bindings, record.id), async (_instance, state) => { await state.storage.put("purchase", record); });
}
async function sale(record: PurchaseIntent, changed: Record<string, unknown> = {}) {
  const evidence = { id: record.id, month, payer: record.payer, transaction: record.payment!.transaction,
    amount: record.terms.amount, house: record.mpp!.house, ...changed };
  await runInDurableObject(ledger(), async (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS mpp_sales (id TEXT PRIMARY KEY, evidence TEXT NOT NULL)");
    state.storage.sql.exec("INSERT INTO mpp_sales (id, evidence) VALUES (?, ?)", record.id, JSON.stringify(evidence));
  });
}

it("requires keeper authentication before reading any purchase and never caches refusals", async () => {
  const get = vi.fn(() => { throw new Error("must not read a purchase"); });
  const response = await request(`/admin/purchases/${"a".repeat(64)}`, {}, { ...bindings,
    PAID_RECOVERIES: new Proxy(bindings.PAID_RECOVERIES!, { get: (target, key) => key === "get" ? get : Reflect.get(target, key) }) });
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(get).not.toHaveBeenCalled();
});

it("inspects the individual native sale without exposing credentials, inputs or goods", async () => {
  const record = await fixture(); await sale(record, { ignored_secret: marker });
  const response = await request(`/admin/purchases/${record.id}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Vary")).toContain("Authorization");
  const text = await response.text(); expect(text).not.toContain(marker);
  for (const hidden of ["payment_proof", "authorization", "request_digest", "challenge_id", "settleHeaders", "status_token"]) expect(text).not.toContain(hidden);
  expect(JSON.parse(text)).toMatchObject({ code: "purchase_inspected", read_at: now.toISOString(), purchase: {
    protocol: "mpp", network: record.terms.network, asset: BASE_USDC, decimals: USDC_DECIMALS,
    amount_atomic: record.terms.amount, payment_state: "settled", delivery_state: "delivered", house: true,
    accounting_check: "confirmed", ledger: { state: "matched", sale: { purchase_id: record.id } },
  } });
});

for (const version of [1, 2] as const) it(`reads x402 v${version} without inferring native or legacy accounting success`, async () => {
  const record = await fixture("x402", version);
  const response = await request(`/admin/purchases/${record.id}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ purchase: { protocol: "x402", accounting_check: "not_inspected",
    ledger: { state: "not_inspected" }, house: null, currency: "USDC" } });
});

it("keeps the legacy version's x402 interpretation even with an extraneous context", async () => {
  const legacy = await fixture("x402", 1); const native = await fixture();
  legacy.payment_context = native.payment_context; await save(legacy);
  expect((await inspectPurchase(bindings, legacy.id)).body.purchase).toMatchObject({ protocol: "x402", method: "exact" });
});

it("distinguishes an unresolved payment, unaccounted delivery and a lost accounting acknowledgement", async () => {
  const record = await fixture(); record.state = "unknown"; delete record.payment; delete record.delivery; delete record.mpp!.accounted; await save(record);
  expect((await inspectPurchase(bindings, record.id)).body.purchase).toMatchObject({ payment_state: "unknown",
    accounting_check: "awaiting_settlement_evidence", delivery_state: "not_established_by_this_record", ledger: { state: "missing" } });
  const delivered = await fixture(); delete delivered.mpp!.accounted; await save(delivered);
  expect((await inspectPurchase(bindings, delivered.id)).body.purchase).toMatchObject({ accounting_check: "missing", delivery_state: "delivered" });
  await sale(delivered);
  expect((await inspectPurchase(bindings, delivered.id)).body.purchase).toMatchObject({ accounting_check: "acknowledgement_pending", ledger: { state: "matched" } });
});

it("reports missing and mismatched evidence instead of trusting the accounting flag", async () => {
  const missing = await fixture();
  expect((await inspectPurchase(bindings, missing.id)).body.purchase).toMatchObject({ accounting_check: "inconsistent", ledger: { state: "missing" } });
  for (const [field, value] of Object.entries({ id: "c".repeat(64), month: "2026-08", payer: `0x${"44".repeat(20)}`,
    transaction: `0x${"55".repeat(32)}`, amount: "999999", house: false })) {
    const mismatch = await fixture(); await sale(mismatch, { [field]: value });
    expect((await inspectPurchase(bindings, mismatch.id)).body.purchase).toMatchObject({ accounting_check: "inconsistent", ledger: { state: "mismatch", mismatched_fields: [field] } });
  }
});

it("does not infer a settled payment from an unexpected ledger entry", async () => {
  const record = await fixture(); await sale(record); record.state = "not_settled"; await save(record);
  expect((await inspectPurchase(bindings, record.id)).body.purchase).toMatchObject({ payment_state: "not_settled",
    accounting_check: "inconsistent", ledger: { state: "mismatch", mismatched_fields: ["payment_state"] } });
});

it("separates invalid IDs, absent purchases and unavailable storage", async () => {
  expect((await request("/admin/purchases/not-an-id")).status).toBe(400);
  expect((await request(`/admin/purchases/${"f".repeat(64)}`)).status).toBe(404);
  const noStore = { ...bindings, PAID_RECOVERIES: undefined };
  const unavailable = await request(`/admin/purchases/${"f".repeat(64)}`, auth, noStore);
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toMatchObject({ code: "purchase_inspection_unavailable" });
  const record = await fixture();
  expect(await inspectPurchase({ ...bindings, COUNTER_LEDGER: undefined }, record.id)).toMatchObject({ status: 503,
    body: { code: "purchase_ledger_unavailable", purchase: { ledger: { state: "unavailable" } } } });
});

it("treats corrupt records and corrupt ledger JSON as unavailable, never absent", async () => {
  const record = await fixture();
  await runInDurableObject(ledger(), async (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS mpp_sales (id TEXT PRIMARY KEY, evidence TEXT NOT NULL)");
    state.storage.sql.exec("INSERT INTO mpp_sales VALUES (?, ?)", record.id, "broken-json");
  });
  expect((await inspectPurchase(bindings, record.id)).status).toBe(503);
  record.payment_context!.amount_atomic = "2"; await save(record);
  expect((await inspectPurchase(bindings, record.id)).body.code).toBe("purchase_inspection_unavailable");
});

it("keeps unknown assets unknown rather than assigning USDC precision", async () => {
  const record = await fixture("x402", 1); record.terms.asset = "unrecognized-asset"; await save(record);
  expect((await inspectPurchase(bindings, record.id)).body.purchase).toMatchObject({ currency: null, decimals: null });
});

it("offers a browser lookup and escapes retained fields", async () => {
  const form = await request("/admin/purchases", { ...auth, Accept: "text/html" });
  expect(form.status).toBe(200); expect(await form.text()).toContain('name="purchase_id"');
  const record = await fixture(); record.path = '/api/buy/<script>alert("x")</script>'; await save(record);
  const response = await request(`/admin/purchases?purchase_id=${record.id}`, { ...auth, Accept: "text/html" });
  expect(response.status).toBe(200);
  const html = await response.text(); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain('<script>alert("x")'); expect(html).not.toContain(marker);
});

it("leaves purchase storage, SQL, alarms and mirrors unchanged, including an empty ledger", async () => {
  const record = await fixture();
  const purchase = purchaseIntentStore(bindings, record.id);
  const snapshot = async () => ({
    purchase: await purchase.existingPurchase(),
    purchaseAlarm: await runInDurableObject(purchase, async (_instance, state) => state.storage.getAlarm()),
    ledger: await runInDurableObject(ledger(), async (_instance, state) => ({ alarm: await state.storage.getAlarm(),
      schema: state.storage.sql.exec("SELECT name, sql FROM sqlite_master ORDER BY name").toArray(),
      kv: [...await state.storage.list()] })),
    mirror: await bindings.COUNTERS.get(`mpp:sales:${month}`),
  });
  const before = await snapshot(); await request(`/admin/purchases/${record.id}`);
  expect(await snapshot()).toEqual(before);
  await sale(record);
  const afterSale = await snapshot(); const evidence = await ledger().readMppSale(record.id);
  await request(`/admin/purchases/${record.id}`);
  expect(await snapshot()).toEqual(afterSale); expect(await ledger().readMppSale(record.id)).toBe(evidence);
});
