import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, PaymentRequest, Receipt } from "mppx";
import { Fetch } from "mppx/client";
import { charge } from "mppx/evm/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";
import { request, testEnv, facilitator, NOW, object } from "./helpers/buyer-harness";
import { readMppSales } from "@/services/mpp-sales";
import { inspectPurchase } from "@/services/purchase-inspection";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { manifestAccepts, usdcToAtomic } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { nativeCheckoutGuide, nativeCommissionEnabled } from "@/lib/purchase-capabilities";
import { nativeOfferAdvertised } from "@/lib/mpp-checkout-capability";
import { COMMISSION_ITEM_ID, COMMISSION_RUNGS } from "@/store/commission-desk";

/**
 * NATIVE COMMISSIONS (2026-09-19). The desk's rungs pay a live keeper
 * quote at exactly the rung's price, against ?commission= naming a
 * request the keeper quoted there; the route fixes the price and the
 * desk's admission fixes which quote it honours, and every refusal is
 * refused unpaid. The native lane now offers one challenge at the rung
 * on the same unpaid GET, runs the same admission after verification
 * and before settlement, records the desk's item at the quote with the
 * accepted terms, and books the sale under the desk's item beside the
 * shelf's rows. The last paid door family on x402 alone joins the lane.
 */
installLaborAdmissionHarness();
const BASE = "https://scvd.store";
const RUNG = COMMISSION_RUNGS[1]!;
const month = NOW.toISOString().slice(0, 7);
const ledger = () => testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const rungTerms = (rung: number) => manifestAccepts(testEnv, [rung]).filter(row => row.network === BASE_NETWORK);
const meta = (challenge: Challenge.Challenge) => challenge.opaque ? PaymentRequest.deserialize(challenge.opaque) : challenge.meta;
const adminAuth = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` };

let buyer = charge({ account: privateKeyToAccount(generatePrivateKey()), authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
const native = () => Fetch.from({ methods: [buyer], fetch: async (input, init) => {
  const req = new Request(input, init);
  const response = await request(req.url, { method: req.method, headers: req.headers });
  Object.defineProperty(response, "url", { value: req.url });
  return response;
} });

async function writeIn(description: string): Promise<string> {
  const response = await request("/api/request", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, offer_usdc: 40, contact: "secret-contact@example.com" }) });
  expect(response.status).toBe(201);
  return String(object(object(await response.json()).request).id);
}
async function quoteViaAdmin(id: string, usdc: number, windowHours: number): Promise<void> {
  const quoted = await request(`/admin/commission/${id}/quote`, { method: "POST",
    headers: { ...adminAuth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ usdc: String(usdc), window_hours: String(windowHours) }).toString(), redirect: "manual" });
  expect([200, 302]).toContain(quoted.status);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  facilitator.settleCalls = 0;
  facilitator.verifyCalls = 0;
  testEnv.MPP_CHECKOUT_ENABLED = "true";
  testEnv.MPP_CHALLENGE_KEY = "fixture-native-checkout-hmac-key";
  buyer = charge({ account: privateKeyToAccount(generatePrivateKey()), authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
  await ledger().reset();
  const keys = await testEnv.COUNTERS.list({ prefix: "mpp:" });
  for (const key of keys.keys) await testEnv.COUNTERS.delete(key.name);
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.useRealTimers();
  delete testEnv.MPP_CHECKOUT_ENABLED; delete testEnv.MPP_CHALLENGE_KEY;
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});

it("every published rung quotes one native challenge at its price beside the x402 offer; an off-ladder rung is no door", async () => {
  for (const rung of COMMISSION_RUNGS) {
    expect(nativeOfferAdvertised(testEnv, `/api/commission/pay/${rung}`, "GET")).toBe(true);
    const key = crypto.randomUUID();
    const quote = await request(`/api/commission/pay/${rung}`, { headers: { "Idempotency-Key": key } });
    expect(quote.status, String(rung)).toBe(402);
    expect(quote.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    const challenges = Challenge.fromResponseList(quote);
    expect(challenges.map(challenge => challenge.request.amount)).toEqual([usdcToAtomic(rung)]);
    expect(challenges[0]!.request.amount).toBe(rungTerms(rung)[0]!.amount);
    expect(meta(challenges[0]!)).toMatchObject({ purchase_key: key, request_digest: await httpArtifactDigest(`${BASE}/api/commission/pay/${rung}`) });
  }
  expect(nativeOfferAdvertised(testEnv, "/api/commission/pay/37", "GET")).toBe(false);
  expect((await request("/api/commission/pay/37")).headers.get("WWW-Authenticate")).toBeNull();
});

it("the stock client pays a live quote natively: the order, the desk's acceptance, the ledger under the desk's item, and the same credential again is the same order", async () => {
  const id = await writeIn("A hand-painted conformance report, paid natively");
  await quoteViaAdmin(id, RUNG, 96);
  const url = `${BASE}/api/commission/pay/${RUNG}?commission=${id}`;
  const response = await native()(url);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(facilitator.settleCalls).toBe(1);
  expect(Receipt.deserialize(response.headers.get("Payment-Receipt")!)).toMatchObject({ method: "evm", status: "success" });
  const body = object(await response.json());
  expect(String(body.order_id)).toMatch(/^ord_/);
  const recovery = object(body.recovery);
  expect(String(recovery.purchase_id)).toMatch(/^[a-f0-9]{64}$/);

  // The desk's record: accepted, pointing at the order.
  const status = object(await (await request(`/api/commission/${id}`)).json());
  expect(status.status).toBe("accepted");
  expect(String(status.order_url ?? object(status.order ?? {}).url ?? "")).toContain(String(body.order_id));

  // The purchase record: the desk's item at the quote, the accepted terms, no tip.
  const record = JSON.parse((await purchaseIntentStore(testEnv, String(recovery.purchase_id)).existingPurchase())!) as PurchaseIntent;
  expect(record).toMatchObject({ state: "settled", door: "http", item: { id: COMMISSION_ITEM_ID, price_usdc: RUNG }, commission: { id, quote_usdc: RUNG } });
  expect(record.payment).toMatchObject({ paidUsdc: RUNG, tipUsdc: 0 });

  // The native ledger and the inspection, under the desk's item.
  const sale = JSON.parse((await ledger().readMppSale(String(recovery.purchase_id)))!) as Record<string, unknown>;
  expect(sale).toMatchObject({ item: COMMISSION_ITEM_ID, amount: usdcToAtomic(RUNG), house: false });
  expect((await readMppSales(testEnv)).by_item[COMMISSION_ITEM_ID]).toMatchObject({ organic: 1, organic_amount_atomic: usdcToAtomic(RUNG) });
  const inspected = await inspectPurchase(testEnv, String(recovery.purchase_id));
  expect(inspected.body.purchase).toMatchObject({ protocol: "mpp", accounting_check: "confirmed", ledger: { state: "matched", sale: { item: COMMISSION_ITEM_ID } } });

  // The same credential again: the original order, no second settle, no second acceptance.
  const challenge = Challenge.fromResponseList(await request(`/api/commission/pay/${RUNG}?commission=${id}`))[0]!;
  const header = await buyer.createCredential({ challenge: challenge as never, context: {} });
  const again = await request(`/api/commission/pay/${RUNG}?commission=${id}`, { headers: { Authorization: header } });
  expect(again.status).toBe(200);
  expect(object(await again.json()).order_id).toBe(body.order_id);
  expect(facilitator.settleCalls).toBe(1);
});

it("the desk's admission still refuses unpaid: no quote id, a request quoted at another rung, and a credential for another door", async () => {
  const id = await writeIn("Quoted at one rung, paid at another");
  await quoteViaAdmin(id, RUNG, 96);
  // A genuine credential for this rung's bare door, sent without the quote id.
  const bare = Challenge.fromResponseList(await request(`/api/commission/pay/${RUNG}`))[0]!;
  const noQuote = await request(`/api/commission/pay/${RUNG}`, { headers: { Authorization: await buyer.createCredential({ challenge: bare as never, context: {} }) } });
  expect(noQuote.status).toBe(400);
  expect(String(object(await noQuote.json()).error)).toContain("?commission=");
  // The wrong rung, with the quote id: the challenge is genuine for that URL, the desk refuses before settlement.
  const other = COMMISSION_RUNGS[0]!;
  const wrongUrl = `/api/commission/pay/${other}?commission=${id}`;
  const wrong = Challenge.fromResponseList(await request(wrongUrl))[0]!;
  const refused = await request(wrongUrl, { headers: { Authorization: await buyer.createCredential({ challenge: wrong as never, context: {} }) } });
  expect(refused.status).toBe(409);
  expect(String(object(await refused.json()).error)).toContain(`quoted at $${RUNG}`);
  // A credential minted for the right rung but a different quote's URL does not open this one.
  const right = Challenge.fromResponseList(await request(`/api/commission/pay/${RUNG}?commission=${id}`))[0]!;
  const crossed = await request(`/api/commission/pay/${RUNG}?commission=someone-else`, { headers: { Authorization: await buyer.createCredential({ challenge: right as never, context: {} }) } });
  expect(crossed.status).toBe(402);
  expect(object(await crossed.json()).code).toBe("mpp_verification_refused");
  expect(facilitator.settleCalls).toBe(0);
  // The quote is still live: nothing above charged.
  expect(object(await (await request(`/api/commission/${id}`)).json()).status).toBe("quoted");
});

it("discovery names the lane, and the disabled lane quotes no challenge on a rung", async () => {
  expect(nativeCommissionEnabled(testEnv)).toBe(true);
  expect(nativeCheckoutGuide(testEnv)).toMatch(/Commission Desk's rungs/);
  delete testEnv.MPP_CHECKOUT_ENABLED;
  expect(nativeCommissionEnabled(testEnv)).toBe(false);
  const quote = await request(`/api/commission/pay/${RUNG}`);
  expect(quote.status).toBe(402);
  expect(quote.headers.get("WWW-Authenticate") ?? "").not.toMatch(/^Payment /);
});
