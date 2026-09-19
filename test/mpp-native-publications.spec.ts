import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, PaymentRequest, Receipt } from "mppx";
import { Fetch } from "mppx/client";
import { charge } from "mppx/evm/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";
import { request, testEnv, facilitator, NOW } from "./helpers/buyer-harness";
import { readMppSales } from "@/services/mpp-sales";
import { inspectPurchase } from "@/services/purchase-inspection";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { manifestAccepts, pennyPageTiersUsdc, publicationFamilyForPath, tipFromPaid, atomicToUsdc } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { nativeCheckoutGuide, nativePublicationsEnabled } from "@/lib/purchase-capabilities";
import { nativeOfferAdvertised } from "@/lib/mpp-checkout-capability";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { decodeBase64Json } from "@/lib/base64-json";
import { getAddress } from "viem";

/**
 * NATIVE PUBLICATIONS (2026-09-19). The almanac's pages, the gazette's
 * issues, the zodiac archive and Open for Business sell over x402 at
 * their family's tiers with no shelf item behind them, and the MPP plan
 * named that as the lane's remaining gap: menu products are not the
 * entire store. A publication door now offers the same tiers natively
 * on the same unpaid GET, settles after the page is prepared the way
 * the x402 gate does, retains the page on the record for recovery, and
 * books the sale in the native ledger under its family, beside the
 * per-item rows. The doors Worker never fronts these paths, so this is
 * the store's answer alone.
 */
installLaborAdmissionHarness();
const BASE = "https://scvd.store";
const PAGE = `/almanac/${ALMANAC_ENTRIES[0]!.slug}`;
const month = NOW.toISOString().slice(0, 7);
const ledger = () => testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const pennyTiers = () => manifestAccepts(testEnv, pennyPageTiersUsdc()).filter(row => row.network === BASE_NETWORK);
const meta = (challenge: Challenge.Challenge) => challenge.opaque ? PaymentRequest.deserialize(challenge.opaque) : challenge.meta;

let buyer = charge({ account: privateKeyToAccount(generatePrivateKey()), authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
const native = () => Fetch.from({ methods: [buyer], fetch: async (input, init) => {
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

it("an almanac page quotes the penny tiers natively beside x402, bound to the page and the key; an index is not a door", async () => {
  expect(publicationFamilyForPath(PAGE)).toBe("almanac");
  expect(nativeOfferAdvertised(testEnv, PAGE, "GET")).toBe(true);
  expect(nativeOfferAdvertised(testEnv, "/almanac", "GET"), "the index sells nothing").toBe(false);
  expect(nativeOfferAdvertised(testEnv, "/open-for-business/2026-W38", "GET")).toBe(true);
  expect(nativeOfferAdvertised(testEnv, "/gazette/issue-3", "GET")).toBe(true);
  expect(nativeOfferAdvertised(testEnv, "/zodiac/archive/aries/week-2", "GET")).toBe(true);
  const key = crypto.randomUUID();
  const quote = await request(PAGE, { headers: { "Idempotency-Key": key } });
  expect(quote.status).toBe(402);
  expect(quote.headers.get("PAYMENT-REQUIRED"), "x402 stays beside it").toBeTruthy();
  const challenges = Challenge.fromResponseList(quote);
  expect(challenges.map(challenge => challenge.request.amount)).toEqual(pennyTiers().map(row => row.amount));
  expect(challenges.map(challenge => challenge.request.amount)).toEqual(["10000", "20000", "50000"]);
  const digest = await httpArtifactDigest(`${BASE}${PAGE}`);
  for (const challenge of challenges) expect(meta(challenge)).toMatchObject({ purchase_key: key, request_digest: digest, _mppx_scope: PAGE });
  // The x402 offer and the native list quote the same amounts.
  const required = decodeBase64Json(quote.headers.get("PAYMENT-REQUIRED")!) as { accepts: Array<{ network: string; amount: string }> };
  expect(required.accepts.filter(row => row.network === BASE_NETWORK).map(row => row.amount)).toEqual(challenges.map(challenge => challenge.request.amount));
});

it("the stock client buys the page natively: markdown, receipt, recovery handle, the ledger's family row, and the same credential again is the same page", async () => {
  const response = await native()(`${BASE}${PAGE}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/markdown");
  expect(Receipt.deserialize(response.headers.get("Payment-Receipt")!)).toMatchObject({ method: "evm", status: "success" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const markdown = await response.text();
  expect(markdown).toContain(ALMANAC_ENTRIES[0]!.title);
  expect(facilitator.settleCalls).toBe(1);
  const recovery = decodeBase64Json(response.headers.get("Purchase-Recovery")!) as { purchase_id: string; status_token: string };
  expect(recovery.purchase_id).toMatch(/^[a-f0-9]{64}$/);
  expect(recovery.status_token).toBeTruthy();

  // The record: a publication sale, no item, the page retained, the minimum paid, no tip.
  const record = JSON.parse((await purchaseIntentStore(testEnv, recovery.purchase_id).existingPurchase())!) as PurchaseIntent;
  expect(record).toMatchObject({ state: "settled", path: PAGE, door: "http", publication: { minimum_usdc: 0.01, content_type: "text/markdown; charset=utf-8" } });
  expect(record.item).toBeUndefined();
  expect(record.publication!.markdown).toBe(markdown);
  expect(record.payment).toMatchObject({ paidUsdc: 0.01, tipUsdc: 0 });
  expect(record.mpp).toMatchObject({ house: false, accounted: true });

  // The native ledger books it under the family, beside the shelf's per-item rows.
  const sale = JSON.parse((await ledger().readMppSale(recovery.purchase_id))!) as Record<string, unknown>;
  expect(sale).toMatchObject({ item: "almanac", amount: "10000", house: false });
  const totals = await readMppSales(testEnv);
  expect(totals).toMatchObject({ organic: 1, house: 0, organic_amount_atomic: "10000" });
  expect(totals.by_item).toEqual({ almanac: { organic: 1, house: 0, organic_amount_atomic: "10000", house_amount_atomic: "0" } });
  const inspected = await inspectPurchase(testEnv, recovery.purchase_id);
  expect(inspected.body.purchase).toMatchObject({ protocol: "mpp", path: PAGE, accounting_check: "confirmed", ledger: { state: "matched", sale: { item: "almanac" } } });

  // The same signed credential again: the retained page, no second settle.
  const header = (await (async () => {
    const quote = await request(PAGE);
    const [minimum] = Challenge.fromResponseList(quote);
    return buyer.createCredential({ challenge: minimum as never, context: {} });
  })());
  const again = await request(PAGE, { headers: { Authorization: header } });
  expect(again.status).toBe(200);
  expect(await again.text()).toBe(markdown);
  expect(again.headers.get("Paid-Retry")).toBe("true");
  expect(facilitator.settleCalls).toBe(1);
});

it("a tipped tier on a page books the excess as a tip on the record and the whole amount in the ledger", async () => {
  const key = crypto.randomUUID();
  const quote = await request(PAGE, { headers: { "Idempotency-Key": key } });
  const patron = Challenge.fromResponseList(quote)[2]!;
  const header = await buyer.createCredential({ challenge: patron as never, context: {} });
  const paid = await request(PAGE, { headers: { Authorization: header, "Idempotency-Key": key } });
  expect(paid.status).toBe(200);
  expect(facilitator.settleCalls).toBe(1);
  const recovery = decodeBase64Json(paid.headers.get("Purchase-Recovery")!) as { purchase_id: string };
  const record = JSON.parse((await purchaseIntentStore(testEnv, recovery.purchase_id).existingPurchase())!) as PurchaseIntent;
  const paidUsdc = atomicToUsdc(patron.request.amount as string);
  expect(paidUsdc).toBe(0.05);
  expect(record.payment).toMatchObject({ paidUsdc, tipUsdc: tipFromPaid(paidUsdc, 0.01) });
  expect(record.payment!.tipUsdc).toBe(0.04);
  expect(await readMppSales(testEnv)).toMatchObject({ organic_amount_atomic: "50000" });
});

it("a page that is not on the shelf sells nothing natively, and the disabled lane quotes no challenge", async () => {
  const missing = await request("/almanac/no-such-page-ever");
  expect(missing.status).toBe(404);
  expect(missing.headers.get("WWW-Authenticate")).toBeNull();
  delete testEnv.MPP_CHECKOUT_ENABLED;
  const quote = await request(PAGE);
  expect(quote.status).toBe(402);
  expect(quote.headers.get("PAYMENT-REQUIRED"), "x402 is unchanged").toBeTruthy();
  expect(quote.headers.get("WWW-Authenticate") ?? "").not.toMatch(/^Payment /);
  expect(nativePublicationsEnabled(testEnv)).toBe(false);
});

it("discovery names the publication lane: the guide's clause and the OpenAPI descriptor on the page operations", async () => {
  expect(nativePublicationsEnabled(testEnv)).toBe(true);
  expect(nativeCheckoutGuide(testEnv)).toMatch(/publication pages carry the same lane/);
  const openapi = await (await request("/openapi.json")).json<{ paths: Record<string, { get: { "x-payment-info": { protocols: unknown[] } } }> }>();
  for (const path of ["/almanac/{slug}", "/open-for-business/{week}", PAGE]) {
    const info = openapi.paths[path]?.get["x-payment-info"];
    expect(info, path).toBeDefined();
    expect(info!.protocols, path).toEqual([{ x402: {} }, { mpp: { method: "evm", intent: "charge", currency: getAddress(pennyTiers()[0]!.asset) } }]);
  }
  delete testEnv.MPP_CHECKOUT_ENABLED;
  const disabled = await (await request("/openapi.json")).json<{ paths: Record<string, { get: { "x-payment-info": { protocols: unknown[] } } }> }>();
  expect(disabled.paths["/almanac/{slug}"]!.get["x-payment-info"].protocols).toEqual([{ x402: {} }]);
});
