import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";
import { encodeBase58 } from "@/lib/base58";
import { SOLANA_NETWORK } from "@/lib/payments";
import { lookupIdempotent, storeIdempotent } from "@/lib/idempotency";
import { installBuyerHarness, items, shelves, baseline, call, object, request, testEnv, sourceEnv, facilitator, type Obj } from "./helpers/buyer-harness";
import { initializeSol, solPayment, solFacts, solBuyer, solFeePayer, associated } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
let ledger = new Set<string>(), rejectRebroadcast = false, rejectVerification = false;
let payerOverride: string | null | undefined;
beforeAll(async () => {
  await initializeSol();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/supported")) {
      const body = object(await (await inner(input, init)).json());
      for (const kind of body.kinds as Obj[]) if (String(kind.network).startsWith("solana:")) kind.extra = { ...object(kind.extra), feePayer: solFeePayer };
      return Response.json(body);
    }
    if (!/\/x402\/(verify|settle)$/.test(url.pathname)) return inner(input, init);
    const body = object(JSON.parse(String(init?.body ?? "{}"))), wire = object(body.paymentPayload);
    const offer = object(body.paymentRequirements) as unknown as ChallengeRequirement;
    const verifying = url.pathname.endsWith("/verify");
    if (verifying) facilitator.verifyCalls++; else facilitator.settleCalls++;
    const facts = await solFacts(wire);
    let reason = !facts.valid ? "signature_invalid" : facts.mint !== offer.asset ? "wrong_token" :
      facts.recipientAccount !== encodeBase58(await associated(offer.payTo, offer.asset)) ? "wrong_recipient" :
      facts.amount !== BigInt(offer.amount) ? "wrong_amount" : facts.feePayer !== offer.extra?.feePayer ? "wrong_fee_payer" : "";
    if (verifying && rejectVerification) reason = "verification_unavailable";
    const payer = payerOverride === undefined ? facts.payer : payerOverride;
    if (verifying) return Response.json({ isValid: !reason, ...(reason ? { invalidReason: reason } : {}), ...(payer !== null ? { payer } : {}) });
    if (!reason && rejectRebroadcast && ledger.has(facts.tx)) reason = "already_processed";
    if (!reason) ledger.add(facts.tx);
    return Response.json({ success: !reason, ...(reason ? { errorReason: reason } : {}),
      payer: facts.payer, network: SOLANA_NETWORK, transaction: facts.tx });
  });
});
beforeEach(() => { ledger = new Set(); rejectRebroadcast = false; rejectVerification = false; payerOverride = undefined; });
afterEach(() => vi.restoreAllMocks());

const idOf = (body: Obj) => body.cert_id ?? object(body.certificate).cert_id;
async function purchase(id: string, door: string, args: Obj, payment: Obj, key: string) {
  const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!;
  if (door === "http") return (await call(item, "http", args, tool, btoa(JSON.stringify(payment)), key)).body;
  const raw = object(await (await request(door === "mcp" ? "/mcp" : "/mcp?payment=tool-result", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: tool.name, arguments: { item_id: id, ...args },
        _meta: { "x402/payment": payment, "x402/idempotency-key": key } },
    }),
  })).json());
  return Object.keys(object(raw.error)).length ? object(object(raw.error).data) : object(object(raw.result).structuredContent);
}

for (const { id } of MENU_ITEMS) for (const door of ["http", "mcp", "mcp-standard"]) {
  for (const retry of ["same-payment", "fresh-payment", "already-processed"] as const) {
    it(`${id} ${door} ${retry}: returns the original Solana good without another settlement`, async () => {
      const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!;
      const purpose = `SCVD-E2E-Solana-replay-${crypto.randomUUID()}`, args = { ...baseline(item), purpose };
      const offer = (await call(item, "mcp", args, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
      expect(offer).toBeTruthy();
      const payment = await solPayment(offer), key = crypto.randomUUID();
      const original = await purchase(id, door, args, payment, key);
      expect(idOf(original), "initial purchase must deliver a certificate").toBeTruthy();
      expect(ledger.size).toBe(1);
      const before = facilitator.settleCalls, verifies = facilitator.verifyCalls;
      rejectRebroadcast = retry === "already-processed";
      const replay = await purchase(id, door, args, retry === "fresh-payment" ? await solPayment(offer) : payment, key);
      expect(facilitator.verifyCalls).toBe(verifies + 1);
      expect(facilitator.settleCalls, "replay must not ask the processor to settle again").toBe(before);
      expect(idOf(replay)).toBe(idOf(original));
      expect(ledger.size).toBe(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
      const verified = object(await (await request(`/api/verify/${idOf(replay)}`)).json());
      expect(verified.valid).toBe(true);
      expect(object(verified.certificate).purpose).toBe(purpose);
      expect(object(verified.certificate).settlement_tx).toBe([...ledger][0]);
    });
  }
}

for (const door of ["http", "mcp", "mcp-standard"]) {
  for (const badPayer of [null, "", "not a public key", "0x1111111111111111111111111111111111111111"]) {
    it(`${door}: a verified response with payer ${badPayer} cannot silently bypass idempotency`, async () => {
      const item = items.find(i => i.id === "hello")!, tool = shelves(item)[0]!;
      const offer = (await call(item, "mcp", {}, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
      const payment = await solPayment(offer), before = facilitator.settleCalls;
      payerOverride = badPayer;
      const body = await purchase(item.id, door, {}, payment, crypto.randomUUID());
      expect(body).toMatchObject({ code: "payment_identity_unavailable", charged: false });
      expect(facilitator.settleCalls).toBe(before);
      expect(ledger.size).toBe(0);
    });
  }
  it(`${door}: failed verification cannot retrieve an existing Solana purchase`, async () => {
    const item = items.find(i => i.id === "hello")!, tool = shelves(item)[0]!;
    const offer = (await call(item, "mcp", {}, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
    const payment = await solPayment(offer), key = crypto.randomUUID();
    const original = await purchase(item.id, door, {}, payment, key);
    const before = facilitator.settleCalls;
    rejectVerification = true;
    expect(idOf(await purchase(item.id, door, {}, payment, key))).toBeUndefined();
    expect(facilitator.settleCalls).toBe(before);
    rejectVerification = false;
    expect(idOf(await purchase(item.id, door, {}, payment, key))).toBe(idOf(original));
    expect(facilitator.settleCalls).toBe(before);
  });
}

it("cache keys preserve Solana public-key casing", async () => {
  const key = crypto.randomUUID(), surface = "/api/buy/hello";
  await storeIdempotent(testEnv, surface, solBuyer, key, { owner: solBuyer });
  expect(await lookupIdempotent(testEnv, surface, solBuyer.toLowerCase(), key)).toBeNull();
  expect((await lookupIdempotent(testEnv, surface, solBuyer, key))?.body.owner).toBe(solBuyer);
});


it("discovery publishes the safe identity refusal on HTTP listings", async () => {
  const listing = object(await (await request("/menu/hello")).json());
  expect((listing.errors as Obj[]).find(error => error.code === "payment_identity_unavailable"))
    .toMatchObject({ http: 503, charged: false });
});

it("discovery publishes the safe identity refusal on MCP purchase tools", async () => {
  const response = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const tools = object(object(await response.json()).result).tools as Obj[];
  const purchases = tools.filter(tool => String(tool.name).startsWith("buy_"));
  expect(purchases.length).toBeGreaterThan(0);
  for (const tool of purchases) expect((tool.errors as Obj[]).find(error => error.code === "payment_identity_unavailable"))
    .toMatchObject({ jsonrpc: -32000, charged: false });
});

for (const door of ["http", "mcp", "mcp-standard"]) {
  it(`${door}: another Solana signer cannot claim a purchase with unsigned payer metadata`, async () => {
    const item = items.find(i => i.id === "hello")!, tool = shelves(item)[0]!;
    const offer = (await call(item, "mcp", {}, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
    const key = crypto.randomUUID(), originalPayment = await solPayment(offer);
    const original = await purchase(item.id, door, {}, originalPayment, key);
    const buyerKey = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const otherPayment = await solPayment(offer, { buyerKey });
    object(otherPayment.payload).payer = solBuyer;
    object(otherPayment.payload).authorization = { from: solBuyer };
    otherPayment.payer = solBuyer;
    const other = await purchase(item.id, door, {}, otherPayment, key);
    expect(idOf(other)).toBeTruthy();
    expect(idOf(other)).not.toBe(idOf(original));
    expect(ledger.size).toBe(2);
    const before = facilitator.settleCalls;
    const [firstReplay, otherReplay] = await Promise.all([
      purchase(item.id, door, {}, originalPayment, key),
      purchase(item.id, door, {}, otherPayment, key),
    ]);
    expect(idOf(firstReplay)).toBe(idOf(original));
    expect(idOf(otherReplay)).toBe(idOf(other));
    expect(facilitator.settleCalls).toBe(before);
  });

  it(`${door}: an unrelated transaction signature cannot open the signer's purchase cache`, async () => {
    const item = items.find(i => i.id === "hello")!, tool = shelves(item)[0]!;
    const offer = (await call(item, "mcp", {}, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
    const key = crypto.randomUUID(), payment = await solPayment(offer);
    const original = await purchase(item.id, door, {}, payment, key), before = facilitator.settleCalls;
    const tampered = await solPayment(offer, { unrelatedSignature: true });
    expect(idOf(await purchase(item.id, door, {}, tampered, key))).toBeUndefined();
    expect(facilitator.settleCalls).toBe(before);
    expect(ledger.size).toBe(1);
    expect(idOf(await purchase(item.id, door, {}, payment, key))).toBe(idOf(original));
    expect(facilitator.settleCalls).toBe(before);
  });
}
