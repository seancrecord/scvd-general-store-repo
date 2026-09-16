import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import type { PaymentRequirements } from "@x402/core/types";
import { beginPurchaseIntent, beginVerifiedPurchaseIntent, lookupVerifiedPurchase, purchaseIdentity,
  purchaseIntentStore, purchaseProtocol, purchaseStatus, readPurchaseStatus, type PurchaseIntent } from "@/services/purchase-intent";
import { mppEvmPurchasePayment, x402PurchasePayment, settlementPurchaseIdentity, type PurchasePayment } from "@/lib/purchase-payment";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { BASE_USDC } from "@/lib/base-rpc";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const payer = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
afterEach(() => vi.useRealTimers());
async function fixture(network: `${string}:${string}` = "eip155:8453") {
  const terms: PaymentRequirements = { scheme: "exact", network, asset: BASE_USDC,
    amount: "1000", payTo: recipient, maxTimeoutSeconds: 300, extra: {} };
  const authorization = { from: payer, to: recipient, value: terms.amount,
    nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`, validAfter: "0", validBefore: "2000000000" };
  const wire = { x402Version: 2, accepted: terms, payload: { authorization, signature: "fixture-not-a-live-signature" } };
  // Synthetic verified adapters: these exercise shared admission, not cryptographic verification.
  const x402 = await x402PurchasePayment(terms, payer, wire);
  const mpp = await mppEvmPurchasePayment(terms, payer, authorization, await sha256Hex("synthetic-mpp-proof"));
  const input = { path: "/api/buy/luckies", door: "http" as const, request: "note=original", terms };
  return { terms, authorization, wire, x402, mpp, input };
}
function identity(payment: PurchasePayment) {
  return { id: payment.identity, payer: payment.payer, network: payment.network };
}
async function lookup(payment: PurchasePayment, input: { path: string; door: "http" | "mcp"; request: string }, key?: string) {
  const digest = input.door === "http" ? await httpArtifactDigest(`https://scvd.store${input.path}?${input.request}`)
    : await sha256Hex(jcsCanonicalize(JSON.parse(input.request)));
  return lookupVerifiedPurchase(bindings, identity(payment), { path: input.path, door: input.door, digest },
    key ? { surface: input.path, key } : undefined);
}
async function complete(record: PurchaseIntent) {
  await runInDurableObject(purchaseIntentStore(bindings, record.id), async (_instance, state) => {
    await state.storage.put("purchase", { ...record, state: "settled", payment: {
      paidUsdc: 0.001, tipUsdc: 0, network: record.terms.network, payer: record.payer, transaction: "fixture-original-tx", settleHeaders: {},
    }, delivery: { good: "the original result" } });
  });
}

it("retains historical payment IDs and ignores a visitor's protocol label", async () => {
  const f = await fixture();
  const expected = await sha256Hex(jcsCanonicalize({ network: f.terms.network, payer,
    identity: f.authorization.nonce.toLowerCase() }));
  expect(f.x402.identity).toBe(expected);
  expect(f.mpp.identity).toBe(expected);
  expect(await purchaseIdentity(f.terms.network, payer, f.wire)).toEqual({ id: expected, payer });
  expect((await x402PurchasePayment(f.terms, payer, { ...f.wire, protocol: "mpp" })).protocol).toBe("x402");
});

it("the existing x402 entry point writes versioned exact-asset facts and no credential", async () => {
  const f = await fixture();
  const record = await beginPurchaseIntent(bindings, { ...f.input, payer, payload: f.wire });
  expect(record).toMatchObject({ version: 2, id: f.x402.identity, payment_context: {
    protocol: "x402", method: "exact", network: f.terms.network, asset: BASE_USDC, amount_atomic: "1000", recipient, payer,
  } });
  expect(record.request_digest).toBe(await httpArtifactDigest(`https://scvd.store/?${f.input.request}`));
  expect(JSON.stringify(record)).not.toContain("fixture-not-a-live-signature");
  expect(purchaseStatus(record).payment_protocol).toBe("x402");
});

it("competing protocols cannot admit the same authorization twice or relabel its record", async () => {
  const f = await fixture();
  const outcomes = await Promise.allSettled([f.x402, f.mpp].map(payment => beginVerifiedPurchaseIntent(bindings, { ...f.input, payment })));
  expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
  const record = JSON.parse((await purchaseIntentStore(bindings, f.x402.identity).existingPurchase())!) as PurchaseIntent;
  expect(["x402", "mpp"]).toContain(purchaseProtocol(record));
  const before = JSON.stringify(record);
  await expect(beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: f.mpp })).rejects.toBeDefined();
  expect(await purchaseIntentStore(bindings, record.id).existingPurchase()).toBe(before);
});

it("unknown settlement holds a keyed purchase across protocols and EVM rails", async () => {
  const f = await fixture(), alternate = await fixture("eip155:137"), key = crypto.randomUUID();
  const idempotency = { surface: f.input.path, key };
  const original = await beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: f.x402, idempotency });
  await expect(beginVerifiedPurchaseIntent(bindings, { ...alternate.input, payment: alternate.mpp, idempotency })).rejects.toBeDefined();
  expect(await purchaseIntentStore(bindings, alternate.mpp.identity).existingPurchase()).toBeNull();
  expect(await lookup(alternate.mpp, alternate.input, key)).toMatchObject({ kind: "pending", body: {
    purchase_id: original.id, payment_protocol: "x402", charged: null, settlement_attempted: false,
  } });
  await complete(original);
  expect(await lookup(alternate.mpp, alternate.input, key)).toMatchObject({ kind: "complete", delivery: { good: "the original result" } });
});

it("a confirmed non-payment releases the key for another protocol", async () => {
  const f = await fixture(), alternate = await fixture(), idempotency = { surface: f.input.path, key: crypto.randomUUID() };
  const original = await beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: f.x402, idempotency });
  await purchaseIntentStore(bindings, original.id).updatePurchase({ state: "not_settled" });
  const next = await beginVerifiedPurchaseIntent(bindings, { ...alternate.input, payment: alternate.mpp, idempotency });
  expect(next.id).not.toBe(original.id);
  expect(purchaseProtocol(next)).toBe("mpp");
});

it("completed original goods remain recoverable after authorization expiry, with inputs and interface bound", async () => {
  const f = await fixture();
  const record = await beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: f.mpp });
  await complete(record);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2100000000 * 1000));
  expect(await lookup(f.x402, f.input)).toMatchObject({ kind: "complete", delivery: { good: "the original result" } });
  for (const input of [{ ...f.input, path: "/api/buy/another" }, { ...f.input, request: "note=changed" },
    { ...f.input, door: "mcp" as const, request: '{"note":"original"}' }]) {
    expect(await lookup(f.x402, input)).toMatchObject({ kind: "refused", body: { code: "purchase_input_mismatch", charged_again: false } });
  }
  expect(await purchaseIntentStore(bindings, record.id).readPurchase("wrong-token")).toBeNull();
});

it("legacy records recover as x402 without rewriting their stored bytes", async () => {
  const f = await fixture();
  const legacy: PurchaseIntent = { version: 1, id: f.x402.identity, token: "legacy-token", ...f.input, payer,
    created_at: "2026-09-01T00:00:00Z", state: "settled", payment: { paidUsdc: 0.001, tipUsdc: 0,
      payer, network: f.terms.network, transaction: "old-tx", settleHeaders: {} }, delivery: { good: "legacy original" } };
  const stub = purchaseIntentStore(bindings, legacy.id);
  await stub.beginPurchase(JSON.stringify(legacy));
  const before = await stub.existingPurchase();
  expect(purchaseProtocol(legacy)).toBe("x402");
  expect(await lookup(f.mpp, f.input)).toMatchObject({ kind: "complete", delivery: legacy.delivery });
  expect(await stub.existingPurchase()).toBe(before);
});

it("changed settlement terms are refused before any journal is created", async () => {
  for (const change of [{ amount: "999" }, { asset: recipient }, { payTo: payer }, { network: "eip155:137" as const }]) {
    const f = await fixture();
    await expect(beginVerifiedPurchaseIntent(bindings, { ...f.input, terms: { ...f.terms, ...change }, payment: f.mpp })).rejects.toBeDefined();
    expect(await purchaseIntentStore(bindings, f.mpp.identity).existingPurchase()).toBeNull();
  }
});

it("altering the payment identity cannot reopen the same authorization", async () => {
  const f = await fixture();
  const forged = { ...f.mpp, identity: "a".repeat(64) };
  await expect(beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: forged })).rejects.toBeDefined();
});

it("unknown record versions and inconsistent payment facts fail closed", async () => {
  const f = await fixture();
  const record = await beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: f.mpp });
  expect(() => purchaseProtocol({ ...record, version: 99 } as unknown as PurchaseIntent)).toThrow();
  expect(() => purchaseProtocol({ ...record, payment_context: undefined })).toThrow();
  expect(() => purchaseProtocol({ ...record, payment_context: { ...f.mpp, amount_atomic: "1" } })).toThrow();
  expect(() => purchaseProtocol({ ...record, payment_proof: "other-proof" })).toThrow();
});

it("identity normalization preserves EVM casing and Solana's case-sensitive owner", async () => {
  const a = await settlementPurchaseIdentity("eip155:8453", "0xAbCd", "0xAa", "authorization");
  expect(a).toEqual(await settlementPurchaseIdentity("eip155:8453", "0xabcd", "0xaa", "authorization"));
  const sol = await settlementPurchaseIdentity("solana:fixture", "AbCd", "YQ", "transaction");
  expect(sol).toEqual(await settlementPurchaseIdentity("solana:fixture", "AbCd", "YQ==", "transaction"));
  expect(sol.id).not.toBe((await settlementPurchaseIdentity("solana:fixture", "abcd", "YQ==", "transaction")).id);
});

it("private status returns an explicit unavailable result for corrupt protocol metadata", async () => {
  const f = await fixture();
  const record = await beginVerifiedPurchaseIntent(bindings, { ...f.input, payment: f.mpp });
  await runInDurableObject(purchaseIntentStore(bindings, record.id), async (_instance, state) => {
    await state.storage.put("purchase", { ...record, version: 3 });
  });
  expect(await readPurchaseStatus(bindings, record.id, record.token)).toMatchObject({ status: 503,
    body: { code: "purchase_status_unavailable", charged: null } });
});
