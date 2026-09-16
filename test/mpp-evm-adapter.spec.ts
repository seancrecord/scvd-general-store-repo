import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, Credential, Receipt } from "mppx";
import { Fetch } from "mppx/client";
import { charge } from "mppx/evm/client";
import { privateKeyToAccount } from "viem/accounts";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { createMppEvmAdapter, MppSettlementEvidenceUnavailable, type MppEvmTerms } from "@/lib/mpp-evm-adapter";
import { manifestAccepts, priceTiersUsdc } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { getMenuItem } from "@/store";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { beginVerifiedPurchaseIntent, purchaseIntentStore } from "@/services/purchase-intent";
import { x402PurchasePayment } from "@/lib/purchase-payment";
import type { Env } from "@/types";

type ClientChallenge = Parameters<ReturnType<typeof charge>["createCredential"]>[0]["challenge"];
const bindings = env as unknown as Env;
// Public disposable fixture key. No network client, balance or live submission.
const buyer = privateKeyToAccount(`0x${"07".repeat(32)}`);
const other = privateKeyToAccount(`0x${"08".repeat(32)}`);
const now = new Date("2026-09-16T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function fixture(change: Partial<MppEvmTerms> = {}) {
  const item = getMenuItem("context_anchor")!;
  const terms = manifestAccepts(bindings, priceTiersUsdc(item)).find(row => row.network === BASE_NETWORK)! as PaymentRequirements;
  const scope = `/api/buy/${item.id}`;
  const request = "summary=SCVD-E2E-qualified-native-MPP";
  const config: MppEvmTerms = { secretKey: "fixture-mpp-challenge-key-not-a-live-secret", realm: "scvd.store", scope,
    terms, requestDigest: await httpArtifactDigest(`https://scvd.store${scope}?${request}`),
    purchaseKey: crypto.randomUUID(), verify: vi.fn(async () => ({ isValid: true, payer: buyer.address })), ...change };
  const adapter = createMppEvmAdapter(config);
  const { challenge, header: challengeHeader } = await adapter.challenge();
  const client = charge({ account: buyer, authorization: { name: "USD Coin", version: "2" },
    networks: [8453], maxAtomicAmount: terms.amount });
  const header = await client.createCredential({ challenge: challenge as ClientChallenge, context: {} });
  const success: SettleResponse = { success: true, network: terms.network, payer: buyer.address, transaction: `0x${"ab".repeat(32)}` };
  return { config, adapter, client, challenge, challengeHeader, header, terms, request, success };
}

it("stock client signs a Worker-issued challenge; validation does not submit", async () => {
  const f = await fixture();
  expect(Challenge.deserialize(f.challengeHeader)).toMatchObject({ method: "evm", intent: "charge", realm: "scvd.store",
    request: { amount: f.terms.amount, currency: expect.any(String), recipient: expect.any(String) } });
  const validated = await f.adapter.validate(f.header);
  expect(f.config.verify).toHaveBeenCalledTimes(1);
  expect(validated.payment).toMatchObject({ protocol: "mpp", method: "evm/charge", network: BASE_NETWORK,
    amount_atomic: f.terms.amount, payer: buyer.address.toLowerCase(), asset: f.terms.asset, recipient: f.terms.payTo });
  expect(validated.payload.accepted).toEqual(f.terms);
  expect(JSON.stringify(validated.payment)).not.toContain(String(Credential.deserialize<{ signature: string }>(f.header).payload.signature));
  const submit = vi.fn(async () => f.success);
  const paid = await f.adapter.broadcast(f.header, submit);
  expect(f.config.verify).toHaveBeenCalledTimes(2);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith(validated.payload, f.terms);
  expect(paid.result).toBe(f.success);
  expect(Receipt.deserialize(paid.header!)).toMatchObject({ method: "evm", status: "success", reference: f.success.transaction });
});

for (const field of ["amount", "currency", "recipient", "scope", "request_digest", "purchase_key", "expires", "realm"] as const) {
  it(`rejects a client-signed challenge with tampered ${field} before the facilitator`, async () => {
    const f = await fixture();
    const challenge = structuredClone(f.challenge);
    if (field === "amount") challenge.request.amount = "1";
    else if (field === "currency" || field === "recipient") challenge.request[field] = other.address;
    else if (field === "expires") challenge.expires = new Date(now.getTime() + 600_000).toISOString();
    else if (field === "realm") challenge.realm = "another.store";
    else {
      challenge.meta = { ...challenge.meta, [field === "scope" ? "_mppx_scope" : field]: "changed" };
      // The credential carries opaque on the wire; meta is the decoded view.
      delete challenge.opaque;
    }
    const header = await f.client.createCredential({ challenge: challenge as ClientChallenge, context: {} });
    await expect(f.adapter.validate(header)).rejects.toBeDefined();
    expect(f.config.verify).not.toHaveBeenCalled();
  });
}

for (const field of ["nonce", "from", "to", "value", "source", "signature", "type"] as const) {
  it(`refuses malformed authorization ${field} without settlement`, async () => {
    const f = await fixture();
    const credential = Credential.deserialize<Record<string, unknown>>(f.header);
    if (field === "source") credential.source = `did:pkh:eip155:8453:${other.address}`;
    else credential.payload[field] = field === "nonce" ? `0x${"11".repeat(32)}` :
      field === "from" || field === "to" ? other.address : field === "value" ? "1" : field === "type" ? "transaction" : "0x";
    const submit = vi.fn(async () => f.success);
    await expect(f.adapter.broadcast(Credential.serialize(credential), submit)).rejects.toBeDefined();
    expect(submit).not.toHaveBeenCalled();
    expect(f.config.verify).not.toHaveBeenCalled();
  });
}

it("binds valid server-issued challenges to the exact route, inputs, purchase key and terms", async () => {
  const f = await fixture();
  for (const change of [{ scope: "/api/buy/another" }, { realm: "another.store" },
    { requestDigest: "0".repeat(64) }, { purchaseKey: "another-purchase" },
    { terms: { ...f.terms, amount: String(BigInt(f.terms.amount) + 1n) } },
    { terms: { ...f.terms, payTo: other.address } }]) {
    const adapter = createMppEvmAdapter({ ...f.config, ...change });
    await expect(adapter.validate(f.header)).rejects.toBeDefined();
  }
  expect(f.config.verify).not.toHaveBeenCalled();
});

it("expires new settlement even if validation succeeded before preparation", async () => {
  const f = await fixture();
  await f.adapter.validate(f.header);
  vi.setSystemTime(new Date(Date.parse(f.challenge.expires!) + 1));
  const submit = vi.fn(async () => f.success);
  await expect(f.adapter.broadcast(f.header, submit)).rejects.toBeDefined();
  expect(submit).not.toHaveBeenCalled();
  expect(f.config.verify).toHaveBeenCalledTimes(1);
});

it("rechecks chain state and rejects a payer mismatch before submission", async () => {
  const verify = vi.fn().mockResolvedValueOnce({ isValid: true, payer: buyer.address })
    .mockResolvedValueOnce({ isValid: false });
  const f = await fixture({ verify });
  await f.adapter.validate(f.header);
  const submit = vi.fn(async () => f.success);
  await expect(f.adapter.broadcast(f.header, submit)).rejects.toThrow("verification refused");
  expect(submit).not.toHaveBeenCalled();
  verify.mockResolvedValue({ isValid: true, payer: other.address });
  await expect(f.adapter.validate(f.header)).rejects.toThrow("verification refused");
});

it("preserves unsuccessful settlement replies and unknown transport outcomes", async () => {
  const f = await fixture();
  const refused: SettleResponse = { success: false, errorReason: "fixture-refusal", network: BASE_NETWORK, transaction: "" };
  const result = await f.adapter.broadcast(f.header, async () => refused);
  expect(result).toEqual({ result: refused, receipt: null, header: null });
  const uncertain = new Error("fixture connection lost after submission");
  const submit = vi.fn(async () => { throw uncertain; });
  await expect(f.adapter.broadcast(f.header, submit)).rejects.toBe(uncertain);
  expect(submit).toHaveBeenCalledTimes(1);
});

it("does not mint a success receipt for mismatched or missing settlement evidence", async () => {
  const f = await fixture();
  for (const change of [{ transaction: "" }, { network: "eip155:137" as const }, { payer: other.address }, { amount: "1" }]) {
    await expect(f.adapter.broadcast(f.header, async () => ({ ...f.success, ...change }))).rejects.toBeInstanceOf(MppSettlementEvidenceUnavailable);
  }
});

it("snapshots issued terms so later caller mutation cannot change settlement", async () => {
  const f = await fixture();
  const original = structuredClone(f.terms);
  f.config.terms.amount = "999999999";
  f.config.terms.payTo = other.address;
  f.config.purchaseKey = "mutated";
  const validated = await f.adapter.validate(f.header);
  expect(validated.payload.accepted).toEqual(original);
});

it("real SDK credentials and x402 wrappers compete for one existing durable purchase", async () => {
  const f = await fixture();
  const { payment, payload } = await f.adapter.validate(f.header);
  const x402 = await x402PurchasePayment(f.terms, buyer.address, payload);
  expect(payment.identity).toBe(x402.identity);
  const outcomes = await Promise.allSettled([payment, x402].map(verified => beginVerifiedPurchaseIntent(bindings, {
    path: f.config.scope, door: "http", request: f.request, terms: f.terms, payment: verified,
    idempotency: { surface: f.config.scope, key: f.config.purchaseKey },
  })));
  expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(await purchaseIntentStore(bindings, payment.identity).existingPurchase()).not.toBeNull();
});

it("refuses unsupported methods, networks, assets and invalid amounts at configuration", async () => {
  const f = await fixture();
  for (const change of [{ scheme: "upto" }, { network: "eip155:137" }, { asset: other.address },
    { amount: "0" }, { amount: "0.1" }, { extra: { name: "Other", version: "2", assetTransferMethod: "eip3009" } }]) {
    expect(() => createMppEvmAdapter({ ...f.config, terms: { ...f.terms, ...change } as PaymentRequirements })).toThrow();
  }
});


it("a stock payment-aware fetch completes the HTTP challenge/credential/receipt round trip", async () => {
  const f = await fixture();
  const submit = vi.fn(async () => f.success);
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const authorization = request.headers.get("Authorization");
    if (!authorization) return new Response(null, { status: 402, headers: { "WWW-Authenticate": f.challengeHeader } });
    const verified = await f.adapter.validate(authorization);
    await beginVerifiedPurchaseIntent(bindings, { path: f.config.scope, door: "http", request: f.request,
      terms: f.terms, payment: verified.payment, idempotency: { surface: f.config.scope, key: f.config.purchaseKey } });
    const paid = await f.adapter.broadcast(authorization, submit);
    return Response.json({ fixture: "delivered" }, { headers: { "Payment-Receipt": paid.header! } });
  });
  const pay = Fetch.from({ methods: [f.client], fetch: transport });
  const response = await pay(`https://scvd.store${f.config.scope}?${f.request}`);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(await response.json()).toEqual({ fixture: "delivered" });
  expect(Receipt.fromResponse(response).reference).toBe(f.success.transaction);
});
