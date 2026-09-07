import { SETTLEMENT_UNKNOWN_PREFIX } from "@/services/settlement-unknown";
import { KV_KEYS } from "@/lib/kv-keys";
import { beforeAll, expect, it, vi } from "vitest";
import { encodeBase58 } from "@/lib/base58";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, shelves, call, clean, request, object, testEnv, sourceEnv, facilitator, NOW, type Obj, type Reading } from "./helpers/buyer-harness";
import { evmPayment, evmValid, evmBuyer, recipient, initializeSol, solPayment, solFacts, solBuyer, solFeePayer, associated } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";

installBuyerHarness();
let receiptOverride: Obj | null = null;
let ledger = new Map<string, Obj>();
let verifyResponses: Obj[] = [];
beforeAll(async () => {
  await initializeSol();
  testEnv.PAY_TO_ADDRESS = recipient; testEnv.POLYGON_PAY_TO = recipient;
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/supported")) {
      const body = object(await (await inner(input, init)).json());
      for (const kind of body.kinds as Obj[]) if (String(kind.network).startsWith("solana:")) kind.extra = { ...object(kind.extra), feePayer: solFeePayer };
      return Response.json(body);
    }
    if (!/\/x402\/(verify|settle)$/.test(url.pathname)) return inner(input, init);
    const body = object(JSON.parse(String(init?.body ?? "{}"))), w = object(body.paymentPayload);
    const o = object(body.paymentRequirements) as unknown as ChallengeRequirement;
    const verifying = url.pathname.endsWith("/verify");
    if (verifying) facilitator.verifyCalls++; else facilitator.settleCalls++;
    let reason = "", payer = "", identity = "", tx = "";
    try {
      if (o.network.startsWith("solana:")) {
        const facts = await solFacts(w);
        payer = facts.payer; identity = facts.tx; tx = facts.tx;
        if (!facts.valid) reason = "signature_invalid";
        else if (facts.mint !== o.asset) reason = "wrong_token";
        else if (facts.recipientAccount !== encodeBase58(await associated(o.payTo, o.asset))) reason = "wrong_recipient";
        else if (facts.amount !== BigInt(o.amount)) reason = "wrong_amount";
        else if (facts.feePayer !== o.extra?.feePayer) reason = "wrong_fee_payer";
      } else {
        const a = object(object(w.payload).authorization);
        payer = String(a.from); identity = `${o.network}:${String(a.nonce)}`;
        if (!await evmValid(w, o)) reason = "signature_invalid";
        else if (String(a.to).toLowerCase() !== o.payTo.toLowerCase()) reason = "wrong_recipient";
        else if (a.value !== o.amount) reason = "wrong_amount";
        else if (Number(a.validBefore) <= Date.now() / 1000) reason = "authorization_expired";
        tx = String(ledger.get(identity)?.transaction ?? `0x${crypto.randomUUID().replace(/-/g, "").repeat(2)}`);
      }
    } catch { reason = "malformed_transaction"; }
    if (!verifying && !reason && ledger.has(identity) && !o.network.startsWith("solana:")) reason = "nonce_already_used";
    if (verifying) {
      const result = { isValid: !reason, ...(reason ? { invalidReason: reason } : {}), payer };
      verifyResponses.push(result); return Response.json(result);
    }
    if (!reason) ledger.set(identity, { transaction: tx, network: o.network, amount: o.amount, payer });
    const result = { success: !reason, ...(reason ? { errorReason: reason } : {}), transaction: tx, network: o.network, payer };
    return Response.json({ ...result, ...receiptOverride });
  });
});
const encode = (w: Obj) => btoa(JSON.stringify(w));
const idOf = (r: Reading) => r.body.cert_id ?? object(r.body.certificate).cert_id;
async function reset() { receiptOverride = null; ledger = new Map(); verifyResponses = []; vi.setSystemTime(NOW); await clean(); }


for (const door of ["http", "mcp"] as const) {
  for (const badReceipt of [
    { transaction: "0OIl!" },
    { transaction: "2".repeat(64) },
    { transaction: "1".repeat(88) },
    { transaction: "" },
    { network: BASE_NETWORK },
  ]) {
    it(`${door}: malformed Solana receipt ${JSON.stringify(badReceipt)} preserves payment uncertainty and same-payment recovery`, async () => {
      await reset();
      const item = items.find(i => i.id === "daily_fortune")!;
      const tool = shelves(item)[0]!;
      const quote = await call(item, door, {}, tool);
      const offer = quote.offers.find(o => o.network === SOLANA_NETWORK)!;
      const key = String(object(quote.body.idempotency).suggested_key);
      const wire = encode(await solPayment(offer));
      receiptOverride = badReceipt;
      const failed = await call(item, door, {}, tool, wire, key);
      expect(ledger.size).toBe(1);
      expect(idOf(failed)).toBeUndefined();
      expect(failed.protocolError).toBe(true);
      expect(failed.quote).toBe(false);
      expect(failed.body).toMatchObject({
        code: "invalid_settlement_receipt", charged: null,
        payment_state: "unknown", network: SOLANA_NETWORK,
      });
      const recovery = object(failed.body.recovery);
      expect(typeof recovery.reference).toBe("string");
      const row = JSON.parse((await sourceEnv.COUNTERS.get(String(recovery.reference)))!);
      expect(row).toMatchObject({ state: "open", network: SOLANA_NETWORK });
      expect(row.transaction).toBeUndefined();
      const certs = await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
      expect(certs.keys).toHaveLength(0);

      receiptOverride = null;
      const submissions = facilitator.settleCalls;
      const retry = await call(item, door, {}, tool, wire, key);
      // A retained unknown purchase is not permission to resubmit to the
      // facilitator. The private status survives independently of its receipt.
      expect(retry.body).toMatchObject({ code: "settlement_unknown", charged: null });
      expect(object(retry.body.recovery).purchase_id).toBe(recovery.purchase_id);
      expect(facilitator.settleCalls).toBe(submissions);
      expect(ledger.size).toBe(1);
      const status = await request(String(recovery.status_url), { headers: { Authorization: `Bearer ${recovery.status_token}` } });
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({ payment_state: "unknown", charged: null });
    });
  }
}

for (const door of ["http", "mcp"] as const) {
  it(`${door}: failed reconciliation storage never becomes a no-charge promise`, async () => {
    await reset();
    const item = items.find(i => i.id === "daily_fortune")!, tool = shelves(item)[0]!;
    const offer = (await call(item, door, {}, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
    const wire = encode(await solPayment(offer));
    receiptOverride = { transaction: "0OIl!" };
    const original = testEnv.COUNTERS;
    testEnv.COUNTERS = new Proxy(original, {
      get(target, prop) {
        if (prop === "put") return (...args: Parameters<KVNamespace["put"]>) => {
          if (args[0].startsWith(SETTLEMENT_UNKNOWN_PREFIX)) return Promise.reject(new Error("injected reconciliation storage outage"));
          return target.put(...args);
        };
        const member = Reflect.get(target, prop);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });
    try {
      const failed = await call(item, door, {}, tool, wire, "receipt-storage-fault");
      expect(failed.protocolError).toBe(true);
      expect(ledger.size).toBe(1);
      expect(failed.body).toMatchObject({
        code: "invalid_settlement_receipt", charged: null, payment_state: "unknown",
        recovery: { recorded: false, reference: null },
      });
      expect(idOf(failed)).toBeUndefined();
    } finally { testEnv.COUNTERS = original; }
  });
}

it("standard MCP payment mode returns uncertainty without offering a new payment", async () => {
  await reset();
  const item = items.find(i => i.id === "daily_fortune")!, tool = shelves(item)[0]!;
  const offer = (await call(item, "mcp", {}, tool)).offers.find(o => o.network === SOLANA_NETWORK)!;
  const wire = await solPayment(offer);
  receiptOverride = { transaction: "0OIl!" };
  const response = await request("/mcp?payment=tool-result", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: tool.name, arguments: { item_id: item.id },
      _meta: { "x402/payment": wire, "x402/idempotency-key": "standard-uncertain-receipt" },
    } }),
  });
  const rpc = object(await response.json()), result = object(rpc.result);
  expect(ledger.size).toBe(1);
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ code: "invalid_settlement_receipt", charged: null, payment_state: "unknown" });
  expect(object(result._meta)["x402/payment-required"]).toBeUndefined();
  expect(object(result.structuredContent).accepts).toBeUndefined();
});

it("discovery distinguishes unknown settlement from a safe refusal", async () => {
  const listing = object(await (await request("/menu/daily_fortune")).json());
  const errors = listing.errors as Obj[];
  expect(errors.find(error => error.code === "invalid_settlement_receipt")).toMatchObject({ http: 503, charged: null });
});

it("discovery publishes the unknown-receipt code on MCP purchase tools", async () => {
  const response = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const tools = object(object(await response.json()).result).tools as Obj[];
  const buyTools = tools.filter(tool => String(tool.name).startsWith("buy_"));
  expect(buyTools.length).toBeGreaterThan(0);
  for (const tool of buyTools) {
    expect((tool.errors as Obj[]).find(error => error.code === "invalid_settlement_receipt")).toMatchObject({ jsonrpc: -32000, charged: null });
  }
});
