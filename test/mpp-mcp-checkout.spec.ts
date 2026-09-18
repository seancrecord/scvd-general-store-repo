import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, Credential, Mcp } from "mppx";
import { charge } from "mppx/evm/client";
import { McpClient } from "mppx/mcp/client";
import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";
import { request, testEnv, facilitator, NOW, object } from "./helpers/buyer-harness";
import { readMppSales } from "@/services/mpp-sales";
import { inspectPurchase } from "@/services/purchase-inspection";
import { certificateProtocol, inspectNativeCertificate } from "@/services/certificate-accounting";
import { getCertificate } from "@/services/certificates";
import { nativeCheckoutGuide, purchaseCapabilities } from "@/lib/purchase-capabilities";
import { MCP_CREDENTIAL_META_KEY, MCP_PAYMENT_REQUIRED_META_KEY, MCP_RECEIPT_META_KEY } from "@/lib/mpp-mcp-keys";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { manifestAccepts, priceTiersUsdc } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { getMenuItem } from "@/store";
import type { Certificate } from "@/types";

/**
 * THE MCP DOOR, NATIVELY (2026-09-18). The HTTP door has carried a real
 * MPP challenge beside its x402 offer since the pilot; this holds the
 * same lane on tools/call, in the wire shape the MPP SDK's own MCP
 * transport defines, and proves it with the stock MCP SDK client wrapped
 * by the stock MPP client — no hand-rolled envelope on the buying side.
 * Both dialects are walked: the legacy 402-error envelope by hand, and
 * the tool-result profile through the stock client. Every sale is read
 * back through the native ledger, the inspection and the classifier,
 * the way test/mpp-whole-store.spec.ts reads the HTTP door's.
 */
installLaborAdmissionHarness();
const BASE = "https://scvd.store";
/**
 * A fresh buyer per test. The stock client derives the authorization
 * nonce from the challenge id, and under a frozen clock every test mints
 * the same challenge for the same arguments, so one buyer across tests
 * would be recognised as the owner of an earlier test's purchase and
 * handed it back through the recovery lane, correctly and without charge.
 */
let method = charge({ account: privateKeyToAccount(generatePrivateKey()), authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
const month = NOW.toISOString().slice(0, 7);
const ledger = () => testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const atomicMinimum = (id: string) =>
  manifestAccepts(testEnv, priceTiersUsdc(getMenuItem(id)!)).find(row => row.network === BASE_NETWORK)!.amount;
const shelfFor = (id: string) => mcpToolCatalog(BASE).find(tool => tool.itemId === id || tool.itemIds?.includes(id))!.name;

/** One door per family the tool door sells, with the arguments its contract requires. */
const DOORS: Array<{ id: string; args: Record<string, string>; delivers: "certificate" | "order" }> = [
  { id: "hello", args: {}, delivers: "certificate" },
  { id: "spot_check", args: { host: "buyer-fixture.example" }, delivers: "certificate" },
  { id: "aura_walk", args: { url: "https://buyer-fixture.example/api/paid" }, delivers: "order" },
];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  facilitator.settleCalls = 0;
  facilitator.verifyCalls = 0;
  testEnv.MPP_CHECKOUT_ENABLED = "true";
  testEnv.MPP_CHALLENGE_KEY = "fixture-native-checkout-hmac-key";
  method = charge({ account: privateKeyToAccount(generatePrivateKey()), authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
  await ledger().reset();
  const keys = await testEnv.COUNTERS.list({ prefix: "mpp:" });
  for (const key of keys.keys) await testEnv.COUNTERS.delete(key.name);
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.useRealTimers();
  delete testEnv.MPP_CHECKOUT_ENABLED; delete testEnv.MPP_CHALLENGE_KEY;
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});

/** The legacy envelope, by hand: one JSON-RPC call to the real door. */
async function rpc(params: Record<string, unknown>, profile = ""): Promise<Record<string, unknown>> {
  const response = await request(`/mcp${profile}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params }) });
  return object(await response.json());
}
const toolCall = (id: string, args: Record<string, string>, meta?: Record<string, unknown>) =>
  ({ name: shelfFor(id), arguments: { item_id: id, ...args }, ...(meta ? { _meta: meta } : {}) });

/** The stock MCP SDK client over the real door, one JSON-RPC exchange per message. */
class DoorTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  constructor(private readonly url: string) {}
  async start() {}
  async send(message: JSONRPCMessage) {
    const response = await request(this.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
    if (response.status === 202) return;
    this.onmessage?.(await response.json() as JSONRPCMessage);
  }
  async close() { this.onclose?.(); }
}
async function stockClient(profile = "?payment=tool-result") {
  const client = new Client({ name: "mpp-stock-buyer", version: "1.0.0" });
  await client.connect(new DoorTransport(`/mcp${profile}`));
  return McpClient.wrap(client, { methods: [method] });
}

/** Every ledger the store keeps reads the same native sale. */
async function expectOneNativeSale(id: string, purchaseId: string, certId?: string) {
  const sale = JSON.parse((await ledger().readMppSale(purchaseId))!) as Record<string, unknown>;
  expect(sale).toMatchObject({ item: id, amount: atomicMinimum(id), house: false });
  const totals = await readMppSales(testEnv);
  expect(totals).toMatchObject({ organic: 1, house: 0, organic_amount_atomic: atomicMinimum(id) });
  expect(totals.by_item).toEqual({ [id]: { organic: 1, house: 0, organic_amount_atomic: atomicMinimum(id), house_amount_atomic: "0" } });
  const inspected = await inspectPurchase(testEnv, purchaseId);
  expect(inspected.body.purchase).toMatchObject({ protocol: "mpp", path: `/api/buy/${id}`, door: "mcp", accounting_check: "confirmed",
    ledger: { state: "matched", sale: { item: id } } });
  if (certId) {
    const certificate = (await getCertificate(testEnv, certId))!.certificate as Certificate;
    expect(await certificateProtocol(testEnv, certificate)).toBe("mpp");
    expect(await inspectNativeCertificate(testEnv, certificate)).toBe("matched");
  }
}

it("the three MCP metadata keys are the SDK's own, and discovery names them", () => {
  expect([MCP_CREDENTIAL_META_KEY, MCP_PAYMENT_REQUIRED_META_KEY, MCP_RECEIPT_META_KEY])
    .toEqual([Mcp.credentialMetaKey, Mcp.paymentRequiredMetaKey, Mcp.receiptMetaKey]);
  const rows = purchaseCapabilities(getMenuItem("hello")!, testEnv);
  expect(rows).toContainEqual(expect.objectContaining({ protocol: "mpp", transport: "mcp", method: "tools/call", amount_atomic: atomicMinimum("hello"),
    credential_meta_key: MCP_CREDENTIAL_META_KEY, challenge_key: MCP_PAYMENT_REQUIRED_META_KEY, receipt_meta_key: MCP_RECEIPT_META_KEY }));
  expect(nativeCheckoutGuide(testEnv)).toContain(`_meta['${MCP_CREDENTIAL_META_KEY}']`);
  delete testEnv.MPP_CHECKOUT_ENABLED;
  expect(purchaseCapabilities(getMenuItem("hello")!, testEnv).some(row => row.transport === "mcp")).toBe(false);
});

it("an unpaid tools/call quotes the native challenge beside the x402 terms, in both dialects, keyed alike", async () => {
  const legacy = await rpc(toolCall("hello", {}));
  const error = object(legacy.error);
  expect(error.code, "the x402 dialect is unchanged").toBe(402);
  const data = object(error.data);
  expect(data["x402/payment-required"], "x402 stays beside it").toBeTruthy();
  const required = object(data[MCP_PAYMENT_REQUIRED_META_KEY]);
  expect(required.httpStatus).toBe(402);
  const challenge = Challenge.Schema.parse((required.challenges as unknown[])[0]);
  expect(challenge).toMatchObject({ method: "evm", intent: "charge", realm: "scvd.store", request: { amount: atomicMinimum("hello") } });
  expect(object(challenge.meta).purchase_key, "the credential's key is the quoted retry key").toBe(object(data.idempotency).suggested_key);

  const standard = object((await rpc(toolCall("hello", {}), "?payment=tool-result")).result);
  expect(standard.isError).toBe(true);
  const meta = object(standard._meta);
  const offered = Challenge.Schema.parse((object(meta[MCP_PAYMENT_REQUIRED_META_KEY]).challenges as unknown[])[0]);
  expect(offered.request).toEqual(challenge.request);
  expect(object(offered.meta).purchase_key).toBe(meta["x402/idempotency-key"]);
  expect(facilitator.settleCalls).toBe(0);
});

it("hello: the legacy dialect buys with the SDK credential, books one native sale, and a retry returns the original", async () => {
  const quote = object(object(object((await rpc(toolCall("hello", {}))).error).data)[MCP_PAYMENT_REQUIRED_META_KEY]);
  const challenge = Challenge.Schema.parse((quote.challenges as unknown[])[0]);
  const credential = Credential.deserialize(await method.createCredential({ challenge: challenge as never, context: {} }));
  const paid = await rpc(toolCall("hello", {}, { [MCP_CREDENTIAL_META_KEY]: credential }));
  expect(paid.error, JSON.stringify(paid).slice(0, 400)).toBeUndefined();
  const result = object(paid.result);
  const goods = object(result.structuredContent);
  expect(goods.cert_id).toMatch(/^cert_[a-z0-9]+$/);
  expect(facilitator.settleCalls).toBe(1);
  const receipt = object(object(result._meta)[MCP_RECEIPT_META_KEY]);
  expect(receipt).toMatchObject({ method: "evm", status: "success", challengeId: challenge.id });
  const recovery = object(goods.recovery);
  expect(recovery.purchase_id).toMatch(/^[a-f0-9]{64}$/);
  await expectOneNativeSale("hello", String(recovery.purchase_id), String(goods.cert_id));

  // The same credential again: the original purchase, no second settle.
  const again = object((await rpc(toolCall("hello", {}, { [MCP_CREDENTIAL_META_KEY]: credential }))).result);
  const replayed = object(again.structuredContent);
  expect(replayed.cert_id).toBe(goods.cert_id);
  expect(replayed.charged_again).toBe(false);
  expect(object(object(again._meta)[MCP_RECEIPT_META_KEY]).challengeId, "the original receipt, never reconstructed").toBe(challenge.id);
  expect(facilitator.settleCalls).toBe(1);
  expect((await readMppSales(testEnv)).organic).toBe(1);
});

for (const door of DOORS.filter(row => row.id !== "hello")) {
  it(`${door.id}: the stock MCP client pays the tool-result profile and every ledger reads the sale`, async () => {
    const client = await stockClient();
    const result = await client.callTool({ name: shelfFor(door.id), arguments: { item_id: door.id, ...door.args } }) as Record<string, unknown>;
    expect(result.isError, JSON.stringify(result).slice(0, 400)).not.toBe(true);
    expect(facilitator.settleCalls).toBe(1);
    const goods = object(result.structuredContent);
    const receipt = object(result.receipt);
    expect(receipt).toMatchObject({ method: "evm", status: "success" });
    expect(receipt.challengeId).toMatch(/^[A-Za-z0-9_-]+$/);
    if (door.delivers === "order") expect(goods.order_id).toBeTruthy();
    else expect(goods.cert_id).toBeTruthy();
    const recovery = object(goods.recovery);
    await expectOneNativeSale(door.id, String(recovery.purchase_id), door.delivers === "certificate" ? String(goods.cert_id) : undefined);
  });
}

it("refuses before settlement: both credentials at once, a tampered challenge, and a credential minted for the HTTP door", async () => {
  const quote = object(object(object((await rpc(toolCall("hello", {}))).error).data)[MCP_PAYMENT_REQUIRED_META_KEY]);
  const challenge = Challenge.Schema.parse((quote.challenges as unknown[])[0]);
  const credential = Credential.deserialize(await method.createCredential({ challenge: challenge as never, context: {} }));

  const both = object((await rpc(toolCall("hello", {}, { [MCP_CREDENTIAL_META_KEY]: credential, "x402/payment": "eyJ4NDAyVmVyc2lvbiI6Mn0" }))).error);
  expect(both.code).toBe(-32602);
  expect(object(both.data)).toMatchObject({ code: "ambiguous_payment_credentials", charged: false });

  const cheaper = { ...challenge, request: { ...challenge.request, amount: "1" } };
  const tampered = Credential.deserialize(await method.createCredential({ challenge: cheaper as never, context: {} }));
  const refused = object((await rpc(toolCall("hello", {}, { [MCP_CREDENTIAL_META_KEY]: tampered }))).error);
  expect(refused.code).toBe(402);
  expect(object(refused.data)).toMatchObject({ code: "mpp_verification_refused", charged: false });
  expect(object(object(refused.data)[MCP_PAYMENT_REQUIRED_META_KEY]).challenges, "a fresh challenge rides beside the refusal").toHaveLength(1);

  const http = await request("/api/buy/hello");
  const httpChallenge = Challenge.deserialize(http.headers.get("WWW-Authenticate")!);
  const crossed = Credential.deserialize(await method.createCredential({ challenge: httpChallenge as never, context: {} }));
  const wrongDoor = object((await rpc(toolCall("hello", {}, { [MCP_CREDENTIAL_META_KEY]: crossed }))).error);
  expect(object(wrongDoor.data).code, "one door's challenge does not open the other").toBe("mpp_verification_refused");

  expect(facilitator.settleCalls).toBe(0);
  expect((await readMppSales(testEnv)).organic).toBe(0);
});

it("with the lane disabled, no native challenge is quoted and a credential is refused without charge", async () => {
  const quote = object(object(object((await rpc(toolCall("hello", {}))).error).data)[MCP_PAYMENT_REQUIRED_META_KEY]);
  const challenge = Challenge.Schema.parse((quote.challenges as unknown[])[0]);
  const credential = Credential.deserialize(await method.createCredential({ challenge: challenge as never, context: {} }));
  testEnv.MPP_CHECKOUT_ENABLED = "false";
  const unpaid = object(object((await rpc(toolCall("hello", {}))).error).data);
  expect(unpaid[MCP_PAYMENT_REQUIRED_META_KEY]).toBeUndefined();
  expect(unpaid["x402/payment-required"]).toBeTruthy();
  const standard = object(object((await rpc(toolCall("hello", {}), "?payment=tool-result")).result)._meta);
  expect(standard[MCP_PAYMENT_REQUIRED_META_KEY]).toBeUndefined();
  const refused = object((await rpc(toolCall("hello", {}, { [MCP_CREDENTIAL_META_KEY]: credential }))).error);
  expect(object(refused.data)).toMatchObject({ code: "mpp_checkout_unavailable", charged: false });
  expect(facilitator.settleCalls).toBe(0);
});
