import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, Credential, PaymentRequest, Receipt } from "mppx";
import { Fetch } from "mppx/client";
import { charge } from "mppx/evm/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";
import { request, testEnv, facilitator, NOW, object } from "./helpers/buyer-harness";
import { readMppSales } from "@/services/mpp-sales";
import { inspectPurchase } from "@/services/purchase-inspection";
import { getCertificate } from "@/services/certificates";
import { manifestAccepts, priceTiersUsdc, tipFromPaid, atomicToUsdc } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { createMppEvmAdapter } from "@/lib/mpp-evm-adapter";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { mintNativeChallenge } from "@/lib/mpp-challenge-mint";
import { nativeCheckoutGuide, purchaseCapabilities } from "@/lib/purchase-capabilities";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { MCP_CREDENTIAL_META_KEY, MCP_PAYMENT_REQUIRED_META_KEY, MCP_RECEIPT_META_KEY } from "@/lib/mpp-mcp-keys";
import { getMenuItem } from "@/store";
import type { Certificate } from "@/types";
import type { PaymentRequirements } from "@x402/core/types";

/**
 * NATIVE TIPS (2026-09-19). The x402 offer on a pay-what-it-deserves
 * door has always been three accepts per network: the minimum, then
 * two tiers above it, and anything paid above the minimum is booked as
 * a tip on the same entitlement (lib/payments.ts, tipFromPaid). The
 * native lane offered one challenge, the minimum, on every door. It now
 * offers one challenge per tier in one WWW-Authenticate header (RFC
 * 9110 §11.6.1, which the SDK's client reads as a list), minimum first
 * so a stock client that takes the first candidate pays what it always
 * paid; a buyer who signs a higher tier's challenge tips, and the store
 * books the excess the way it books an x402 tip. The MCP door carries
 * the same list in its challenges array; the doors Worker mints the
 * same bytes. A credential naming an amount no tier offers is refused
 * before settlement even when its challenge id is genuine, because the
 * tier list, not the HMAC alone, is what the store agreed to sell at.
 */
installLaborAdmissionHarness();
const BASE = "https://scvd.store";
const PWID = "luckies";
const FIXED = "hello";
const month = NOW.toISOString().slice(0, 7);
const ledger = () => testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
/** The Base rows of the x402 offer, in tier order: what the native lane must mirror. */
const baseTiers = (id: string) => manifestAccepts(testEnv, priceTiersUsdc(getMenuItem(id)!)).filter(row => row.network === BASE_NETWORK);
const shelfFor = (id: string) => mcpToolCatalog(BASE).find(tool => tool.itemId === id || tool.itemIds?.includes(id))!.name;
const meta = (challenge: Challenge.Challenge) => challenge.opaque ? PaymentRequest.deserialize(challenge.opaque) : challenge.meta;

/** A fresh buyer per test: the stock client's nonce derives from the challenge id, and the clock is frozen. */
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

it("a pay-what-it-deserves door offers one challenge per tier, minimum first, all bound to one key; a fixed door offers one", async () => {
  const tiers = baseTiers(PWID);
  expect(tiers.map(row => row.amount)).toEqual(["990000", "1980000", "4950000"]);
  const key = crypto.randomUUID();
  const quote = await request(`/api/buy/${PWID}`, { headers: { "Idempotency-Key": key } });
  expect(quote.status).toBe(402);
  const challenges = Challenge.fromResponseList(quote);
  expect(challenges.map(challenge => challenge.request.amount)).toEqual(tiers.map(row => row.amount));
  expect(new Set(challenges.map(challenge => challenge.id)).size, "three distinct challenge ids").toBe(3);
  const digest = await httpArtifactDigest(`${BASE}/api/buy/${PWID}`);
  for (const challenge of challenges) {
    expect(challenge).toMatchObject({ method: "evm", intent: "charge", realm: "scvd.store" });
    expect(meta(challenge)).toMatchObject({ purchase_key: key, request_digest: digest });
  }
  expect(quote.headers.get("PAYMENT-REQUIRED"), "x402's own tiers stay beside it").toBeTruthy();
  // The doors Worker mints the same list, byte for byte, under the same clock and key.
  expect(await mintNativeChallenge(testEnv, `${BASE}/api/buy/${PWID}`, key)).toBe(quote.headers.get("WWW-Authenticate"));
  // A fixed-price door still offers exactly one.
  const fixed = await request(`/api/buy/${FIXED}`);
  expect(Challenge.fromResponseList(fixed)).toHaveLength(1);
});

it("the stock client pays the minimum by default, and the sale carries no tip", async () => {
  const response = await native()(`${BASE}/api/buy/${PWID}`);
  expect(response.status).toBe(200);
  expect(facilitator.settleCalls).toBe(1);
  const certificate = (await response.json<Record<string, unknown>>()).certificate as Certificate;
  expect(certificate.item).toBe(PWID);
  expect(certificate.paid_usdc).toBe(getMenuItem(PWID)!.price_usdc);
  expect(certificate.tip_usdc).toBeUndefined();
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1, organic_amount_atomic: baseTiers(PWID)[0]!.amount });
});

it("signing the patron tier's challenge tips: the excess is booked on the certificate, the ledger and the inspection", async () => {
  const key = crypto.randomUUID();
  const path = `/api/buy/${PWID}`;
  const quote = await request(path, { headers: { "Idempotency-Key": key } });
  const patron = Challenge.fromResponseList(quote)[2]!;
  const header = await buyer.createCredential({ challenge: patron as never, context: {} });
  const paid = await request(path, { headers: { Authorization: header, "Idempotency-Key": key } });
  expect(paid.status).toBe(200);
  expect(facilitator.settleCalls).toBe(1);
  expect(Receipt.deserialize(paid.headers.get("Payment-Receipt")!)).toMatchObject({ method: "evm", status: "success" });
  const body = await paid.json<Record<string, unknown>>();
  const certificate = body.certificate as Certificate;
  const paidUsdc = atomicToUsdc(patron.request.amount as string);
  expect(paidUsdc).toBe(4.95);
  expect(certificate.paid_usdc).toBe(paidUsdc);
  expect(certificate.tip_usdc).toBe(tipFromPaid(paidUsdc, getMenuItem(PWID)!.price_usdc));
  expect(certificate.tip_usdc).toBe(3.96);
  // The native ledger books what settled, the whole amount, on the item.
  const recovery = body.recovery as { purchase_id: string };
  const sale = JSON.parse((await ledger().readMppSale(recovery.purchase_id))!) as Record<string, unknown>;
  expect(sale).toMatchObject({ item: PWID, amount: patron.request.amount, house: false });
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1, organic_amount_atomic: patron.request.amount });
  const inspected = await inspectPurchase(testEnv, recovery.purchase_id);
  expect(inspected.body.purchase).toMatchObject({ protocol: "mpp", accounting_check: "confirmed", ledger: { state: "matched" } });
  // The same credential again is the same purchase, not a second tip.
  const again = await request(path, { headers: { Authorization: header, "Idempotency-Key": key } });
  expect(again.status).toBe(200);
  expect(facilitator.settleCalls).toBe(1);
});

it("an amount no tier offers is refused before settlement, even under a genuine challenge id", async () => {
  // Minted with the store's own key, realm, scope, digest and purchase
  // key, at three times the minimum: a valid HMAC for a price the shelf
  // never quoted. The HMAC is not the agreement; the tier list is.
  const key = crypto.randomUUID();
  const path = `/api/buy/${PWID}`;
  const [minimum] = baseTiers(PWID);
  const adapter = createMppEvmAdapter({ secretKey: testEnv.MPP_CHALLENGE_KEY!, realm: new URL(testEnv.STORE_BASE_URL).host,
    scope: path, requestDigest: await httpArtifactDigest(`${BASE}${path}`), purchaseKey: key,
    terms: { ...minimum!, amount: String(BigInt(minimum!.amount) * 3n) } as PaymentRequirements, verify: async () => ({ isValid: true }) });
  const { challenge } = await adapter.challenge();
  const header = await buyer.createCredential({ challenge: challenge as never, context: {} });
  const refused = await request(path, { headers: { Authorization: header, "Idempotency-Key": key } });
  expect(refused.status).toBe(402);
  expect(((await refused.json()) as { code: string; charged: boolean })).toMatchObject({ code: "mpp_verification_refused", charged: false });
  expect(facilitator.settleCalls).toBe(0);
  expect(facilitator.verifyCalls, "refused before the facilitator was asked").toBe(0);
});

it("the MCP door quotes every tier, and a credential for the generous tier settles with the tip", async () => {
  const rpc = async (params: Record<string, unknown>) => object(await (await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params }) })).json());
  const call = (meta?: Record<string, unknown>) => ({ name: shelfFor(PWID), arguments: { item_id: PWID }, ...(meta ? { _meta: meta } : {}) });
  const unpaid = object(object((await rpc(call())).error).data);
  const required = object(unpaid[MCP_PAYMENT_REQUIRED_META_KEY]) as { challenges: Challenge.Challenge[] };
  expect(required.challenges.map(challenge => challenge.request.amount)).toEqual(baseTiers(PWID).map(row => row.amount));
  const generous = required.challenges[1]!;
  const credential = Credential.deserialize(await buyer.createCredential({ challenge: generous as never, context: {} }));
  const paid = await rpc(call({ [MCP_CREDENTIAL_META_KEY]: credential }));
  expect(paid.error, JSON.stringify(paid.error)).toBeUndefined();
  const result = object(paid.result);
  expect(object(object(result._meta)[MCP_RECEIPT_META_KEY])).toMatchObject({ method: "evm", status: "success", challengeId: generous.id });
  expect(facilitator.settleCalls).toBe(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1, organic_amount_atomic: generous.request.amount });
  const goods = object(result.structuredContent);
  const certificate = (await getCertificate(testEnv, String(goods.cert_id)))!.certificate as Certificate;
  expect(certificate?.paid_usdc).toBe(atomicToUsdc(generous.request.amount as string));
  expect(certificate?.tip_usdc).toBe(tipFromPaid(atomicToUsdc(generous.request.amount as string), getMenuItem(PWID)!.price_usdc));
  expect(certificate?.tip_usdc).toBe(0.99);
});

it("the capability row and the payment guide name the tiers", () => {
  const rows = purchaseCapabilities(getMenuItem(PWID)!, testEnv);
  const http = rows.find(row => row.protocol === "mpp" && "transport" in row && row.transport === "http") as Record<string, unknown>;
  expect(http.amount_atomic).toBe(baseTiers(PWID)[0]!.amount);
  expect(http.tip_tiers_atomic).toEqual(baseTiers(PWID).map(row => row.amount));
  const fixed = purchaseCapabilities(getMenuItem(FIXED)!, testEnv).find(row => row.protocol === "mpp" && "transport" in row && row.transport === "http") as Record<string, unknown>;
  expect(fixed.tip_tiers_atomic).toBeUndefined();
  expect(nativeCheckoutGuide(testEnv)).toMatch(/tier/);
});
