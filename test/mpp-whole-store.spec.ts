import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, Receipt } from "mppx";
import { Fetch } from "mppx/client";
import { charge } from "mppx/evm/client";
import { privateKeyToAccount } from "viem/accounts";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";
import { request, testEnv, facilitator, NOW } from "./helpers/buyer-harness";
import { readMppSales } from "@/services/mpp-sales";
import { computeStatsDiagnosed } from "@/services/stats";
import { inspectPurchase } from "@/services/purchase-inspection";
import { certificateProtocol, inspectNativeCertificate, nativeSaleIndex } from "@/services/certificate-accounting";
import { nativeCheckoutDoors } from "@/lib/purchase-capabilities";
import { LEGACY_NATIVE_ITEM } from "@/lib/mpp-checkout-capability";
import { manifestAccepts, priceTiersUsdc } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { MENU_ITEMS, getMenuItem } from "@/store";
import { decodeBase64Json } from "@/lib/base64-json";
import type { Certificate } from "@/types";

/**
 * THE WHOLE STORE (2026-09-18). The pilot proved one door; this walks
 * one door from each family the shelf sells through — a simple instant
 * good, a personal good the buyer writes, an observation the store
 * prepares before the settle, and a human-queue order — with the stock
 * SDK client, and reads each sale back through every ledger that must
 * agree: the native ledger's own row and its per-item split, the public
 * counts, the admin till, the purchase inspection, and the certificate
 * classifier the books sweep uses. test/mpp-checkout.spec.ts keeps the
 * failure matrix on the pilot's door; this spec is about the shelf.
 */
installLaborAdmissionHarness();
const buyer = privateKeyToAccount(`0x${"09".repeat(32)}`);
const client = charge({ account: buyer, authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
const month = NOW.toISOString().slice(0, 7);
const ledger = () => testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
/**
 * THE RESPONSE URL IS PART OF THE CONTRACT (CV, 2026-09-18). The SDK's
 * http transport reads every protocol's offer on a 402, and its x402
 * reader throws when the declared resource.url differs from
 * response.url, before the native challenge is ever signed. A Response
 * built by app.fetch carries no url, so the harness used to sidestep
 * the check a real fetch always makes; this wrapper restores it.
 */
const native = Fetch.from({ methods: [client], fetch: async (input, init) => {
  const req = new Request(input, init);
  const response = await request(req.url, { method: req.method, headers: req.headers });
  Object.defineProperty(response, "url", { value: req.url });
  return response;
} });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  facilitator.settleCalls = 0;
  facilitator.verifyCalls = 0;
  testEnv.MPP_CHECKOUT_ENABLED = "true";
  testEnv.MPP_CHALLENGE_KEY = "fixture-native-checkout-hmac-key";
  await ledger().reset();
  const keys = await testEnv.COUNTERS.list({ prefix: "mpp:" });
  for (const key of keys.keys) await testEnv.COUNTERS.delete(key.name);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); delete testEnv.MPP_CHECKOUT_ENABLED; delete testEnv.MPP_CHALLENGE_KEY; });

const atomicMinimum = (id: string) =>
  manifestAccepts(testEnv, priceTiersUsdc(getMenuItem(id)!)).find(row => row.network === BASE_NETWORK)!.amount;

/** One door from each family, with the inputs its contract requires. */
const DOORS: Array<{ id: string; query: string; delivers: "certificate" | "order" }> = [
  { id: "hello", query: "", delivers: "certificate" },
  { id: "the_confession", query: "confession=I%20claimed%20the%20build%20was%20done%20before%20checking%20it.", delivers: "certificate" },
  { id: "spot_check", query: "host=buyer-fixture.example", delivers: "certificate" },
  { id: "aura_walk", query: "url=https%3A%2F%2Fbuyer-fixture.example%2Fapi%2Fpaid", delivers: "order" },
];

it("every shelf item is a native door, and only the shelf is", () => {
  expect(nativeCheckoutDoors(testEnv).map(item => item.id).sort()).toEqual(MENU_ITEMS.map(item => item.id).sort());
  expect(DOORS.map(door => getMenuItem(door.id)!.fulfillment)).toEqual(["instant", "instant", "instant", "human_queue"]);
});

for (const door of DOORS) {
  it(`${door.id}: quotes its own minimum, sells natively, and every ledger reads the same sale`, async () => {
    const path = `/api/buy/${door.id}${door.query ? `?${door.query}` : ""}`;
    const quote = await request(path);
    expect(quote.status).toBe(402);
    const challenge = Challenge.deserialize(quote.headers.get("WWW-Authenticate")!);
    expect(challenge).toMatchObject({ method: "evm", intent: "charge", request: { amount: atomicMinimum(door.id) } });
    expect(quote.headers.get("PAYMENT-REQUIRED"), "x402 stays beside it").toBeTruthy();

    const response = await native(`https://scvd.store${path}`);
    expect(response.status, door.id).toBe(200);
    expect(facilitator.settleCalls).toBe(1);
    expect(Receipt.deserialize(response.headers.get("Payment-Receipt")!)).toMatchObject({ method: "evm", status: "success" });
    const body = await response.json<Record<string, unknown>>();
    const recovery = body.recovery as { purchase_id: string } | undefined;
    expect(recovery?.purchase_id, "the private recovery handle").toMatch(/^[a-f0-9]{64}$/);
    if (door.delivers === "order") expect(body).toHaveProperty("order_id");
    else expect((body.certificate as Certificate).item).toBe(door.id);

    // The native ledger: the row names its item, the month splits by it.
    const sale = JSON.parse((await ledger().readMppSale(recovery!.purchase_id))!) as Record<string, unknown>;
    expect(sale).toMatchObject({ item: door.id, amount: atomicMinimum(door.id), house: false });
    const totals = await readMppSales(testEnv);
    expect(totals).toMatchObject({ organic: 1, house: 0, organic_amount_atomic: atomicMinimum(door.id) });
    expect(totals.by_item).toEqual({ [door.id]: { organic: 1, house: 0, organic_amount_atomic: atomicMinimum(door.id), house_amount_atomic: "0" } });

    // The public count and the admin till, per item.
    const { stats, till_by_item } = await computeStatsDiagnosed(testEnv);
    expect(stats.payments!.by_protocol).toContainEqual({ name: "mpp", purchases: 1 });
    expect(till_by_item[door.id]).toMatchObject({ organic: 1 });

    // The inspection and the classifier the books sweep uses.
    const inspected = await inspectPurchase(testEnv, recovery!.purchase_id);
    expect(inspected.body.purchase).toMatchObject({ protocol: "mpp", path: `/api/buy/${door.id}`, accounting_check: "confirmed",
      ledger: { state: "matched", sale: { item: door.id } } });
    if (door.delivers === "certificate") {
      const certificate = body.certificate as Certificate;
      expect(await certificateProtocol(testEnv, certificate)).toBe("mpp");
      expect(await inspectNativeCertificate(testEnv, certificate)).toBe("matched");
      const index = await nativeSaleIndex(testEnv, [certificate.settlement_tx!]);
      expect(index.ids.get(certificate.settlement_tx!.toLowerCase())).toEqual([recovery!.purchase_id]);
    }
  });
}

it("the x402 terms name the URL that was asked, query and all, so a strict client can pay a door that needs one", async () => {
  // A door that requires a query (spot_check needs ?host=) declared the
  // bare door as its resource; the stock client compared it to the URL
  // it had asked and refused to sign anything. The bare knock is unchanged.
  const path = "/api/buy/spot_check?host=strict-client.example";
  const decode = (response: Response) => decodeBase64Json(response.headers.get("PAYMENT-REQUIRED")!) as { resource: { url: string } };
  expect(decode(await request(path)).resource.url).toBe(`https://scvd.store${path}`);
  expect(decode(await request("/api/buy/spot_check")).resource.url).toBe("https://scvd.store/api/buy/spot_check");
  const response = await native(`https://scvd.store${path}`);
  expect(response.status).toBe(200);
  expect(facilitator.settleCalls).toBe(1);
});

it("a row booked during the pilot reads as the pilot's product, beside the split", async () => {
  // The pilot's ledger rows carry no item. Their month's totals do not
  // split; readMppSales folds the unsplit remainder under the one product.
  await ledger().recordMppSale({ id: "a".repeat(64), month, payer: `0x${"11".repeat(20)}`, transaction: `0x${"b".repeat(64)}`, amount: "1000000", house: true });
  await ledger().recordMppSale({ id: "c".repeat(64), month, payer: `0x${"11".repeat(20)}`, transaction: `0x${"d".repeat(64)}`, amount: "500000", house: false, item: "hello" });
  const totals = await readMppSales(testEnv);
  expect(totals).toMatchObject({ organic: 1, house: 1, organic_amount_atomic: "500000", house_amount_atomic: "1000000" });
  expect(totals.by_item).toEqual({
    hello: { organic: 1, house: 0, organic_amount_atomic: "500000", house_amount_atomic: "0" },
    [LEGACY_NATIVE_ITEM]: { organic: 0, house: 1, organic_amount_atomic: "0", house_amount_atomic: "1000000" },
  });
  // A retry of that pilot sale, now naming its item, is the same sale, not changed evidence.
  await ledger().recordMppSale({ id: "a".repeat(64), month, payer: `0x${"11".repeat(20)}`, transaction: `0x${"b".repeat(64)}`, amount: "1000000", house: true, item: LEGACY_NATIVE_ITEM });
  expect((await readMppSales(testEnv)).house).toBe(1);
  // A split that claims more than the month holds is unreadable, not silently trusted.
  await testEnv.COUNTERS.put(`mpp:sales:${month}`, JSON.stringify({ organic: 0, house: 1, organic_amount_atomic: "0", house_amount_atomic: "1000000",
    by_item: { hello: { organic: 1, house: 0, organic_amount_atomic: "500000", house_amount_atomic: "0" } } }));
  await expect(readMppSales(testEnv)).rejects.toThrow();
});

it("the split is keyed by shelf items only: an object's own reserved names are refused, not written", async () => {
  // A sale's item becomes a bracket key on the month's split. "__proto__"
  // spells like an item; written, it would land on Object.prototype.
  const base = { month, payer: `0x${"11".repeat(20)}`, transaction: `0x${"f".repeat(64)}`, amount: "1000", house: false };
  for (const item of ["__proto__", "constructor", "prototype"]) {
    await expect((async () => await ledger().recordMppSale({ ...base, id: "e".repeat(64), item }))()).rejects.toThrow("Invalid MPP sale");
  }
  expect(Object.hasOwn(Object.prototype, "organic")).toBe(false);
  expect(({} as Record<string, unknown>).organic).toBeUndefined();
  expect((await readMppSales(testEnv)).by_item).toEqual({});
  // A mirrored split that already carries such a key is unreadable, not folded.
  await testEnv.COUNTERS.put(`mpp:sales:${month}`, '{"organic":1,"house":0,"organic_amount_atomic":"1000","house_amount_atomic":"0",' +
    '"by_item":{"__proto__":{"organic":1,"house":0,"organic_amount_atomic":"1000","house_amount_atomic":"0"}}}');
  await expect(readMppSales(testEnv)).rejects.toThrow("MPP sales unreadable");
});

it("no challenge where there is no door: an unknown item, a trailing slash, MCP", async () => {
  for (const path of ["/api/buy/no_such_item", "/api/buy/hello/"]) {
    const response = await request(path);
    expect(response.headers.get("WWW-Authenticate") ?? "").not.toMatch(/^Payment /);
  }
  const listed = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  expect(JSON.stringify(await listed.json())).not.toContain("WWW-Authenticate");
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});
