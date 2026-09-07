import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPaymentStack, SOLANA_NETWORK } from "@/lib/payments";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { encodeBase58 } from "@/lib/base58";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { getOrder, completeOrder } from "@/services/orders";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, sendLabor, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, testEnv, sourceEnv, NOW, type Obj } from "./helpers/buyer-harness";
import { solPayment, solFacts, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let chain: { wire: Obj; sent: Obj; transaction: string; defect?: string; paged?: boolean; calls: string[] } | null = null;
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = object(init?.body ? JSON.parse(String(init.body)) : null);
    // Model the facilitator adding its fee-payer signature; the buyer's signed
    // message is unchanged. All keys/transactions are disposable local fixtures.
    if (chain && /\/x402\/(verify|settle)$/.test(String(input)) && object(object(body.paymentPayload).payload).transaction === object(chain.sent.payload).transaction) {
      return inner(input, { ...init, body: JSON.stringify({ ...body, paymentPayload: chain.wire }) });
    }
    if (!chain || !["getGenesisHash", "getSignaturesForAddress", "getTransaction"].includes(String(body.method))) return inner(input, init);
    chain.calls.push(String(body.method));
    const { wire, transaction, defect } = chain, params = body.params as unknown[];
    if (defect === "rpc") throw new Error("fixture RPC outage");
    let result: unknown;
    if (body.method === "getGenesisHash") result = defect === "chain" ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1" : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    else if (body.method === "getSignaturesForAddress") {
      expect(params[0]).toBe(solBuyer);
      expect(params[1]).toMatchObject({ commitment: "finalized", limit: 10 });
      const row = (signature: string) => ({ signature, slot: 1000, blockTime: NOW.getTime() / 1000,
        err: defect === "failed" ? { InstructionError: [0, "fixture"] } : null,
        confirmationStatus: defect === "unfinalized" ? "confirmed" : "finalized" });
      const older = object(params[1]).before;
      result = defect === "missing" ? [] : chain.paged && !older
        ? Array.from({ length: 10 }, (_, i) => row(encodeBase58(new Uint8Array(64).fill(i + 1)))) : [row(transaction)];
    } else {
      expect(params[1]).toEqual({ commitment: "finalized", encoding: "base64", maxSupportedTransactionVersion: 0 });
      const offer = object(wire.accepted), amount = BigInt(String(offer.amount));
      const balance = (accountIndex: number, owner: string, value: bigint) => ({ accountIndex,
        owner, mint: defect === "mint" ? solBuyer : offer.asset,
        uiTokenAmount: { amount: value.toString(), decimals: defect === "decimals" ? 9 : 6 } });
      let bytes = Uint8Array.from(atob(String(object(wire.payload).transaction)), c => c.charCodeAt(0));
      if (defect === "message") bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
      if (chain.paged && params[0] !== transaction) {
        bytes = bytes.slice(); bytes.fill(1, 129 + 20, 129 + 25);
        const n = Array.from({ length: 10 }, (_, i) => encodeBase58(new Uint8Array(64).fill(i + 1))).indexOf(String(params[0]));
        bytes.fill(n + 1, 1, 65);
      }
      result = defect === "unindexed" ? null : { slot: defect === "slot" ? 1001 : 1000,
        transaction: [defect === "malformed" ? "!!!" : btoa(String.fromCharCode(...bytes)), "base64"],
        meta: { err: defect === "receipt-failed" ? { InstructionError: [0, "fixture"] } : null,
          preTokenBalances: [balance(2, solBuyer, amount + 500n), balance(3, String(offer.payTo), 100n)],
          postTokenBalances: [balance(2, defect === "payer" ? "unrelated" : solBuyer, 500n),
            balance(3, defect === "recipient" ? "unrelated" : String(offer.payTo), 100n + amount + (defect === "amount" ? 1n : 0n))] } };
      if (defect === "balances") delete object(object(result).meta).preTokenBalances;
      if (defect === "txid") object(result).transaction = [String(object(chain.sent.payload).transaction), "base64"];
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
});
beforeEach(() => { chain = null; vi.setSystemTime(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

async function interrupted(id = "context_anchor", door: LaborDoor = "http", versioned = false) {
  const item = items.find(i => i.id === id)!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}-🧾-e\u0301`;
  const args = { [id === "context_anchor" ? "summary" : "detail"]: canary, purpose: "Original Solana purchase" };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === SOLANA_NETWORK)!;
  const wire = await solPayment(offer, { versioned }), facts = await solFacts(wire);
  expect(facts.valid).toBe(true);
  const bytes = Uint8Array.from(atob(String(object(wire.payload).transaction)), c => c.charCodeAt(0));
  bytes.fill(0, 1, 65);
  const sent = { ...wire, payload: { transaction: btoa(String.fromCharCode(...bytes)) } };
  chain = { wire, sent, transaction: facts.tx, calls: [] };
  const stack = getPaymentStack(testEnv), original = stack.httpServer.processSettlement.bind(stack.httpServer);
  const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...a) => {
    const receipt = await original(...a);
    expect(receipt.success).toBe(true);
    expect(receipt.transaction).toBe(facts.tx);
    throw new Error("fixture loses response after confirmed settlement");
  });
  const key = crypto.randomUUID();
  const first = await sendLabor(id, door, args, sent, key);
  expect(first.refused).toBe(true);
  expect(first.body).toMatchObject({ charged: null, code: "settlement_unknown" });
  expect(spy).toHaveBeenCalledTimes(1);
  const purchaseId = await sha256Hex(jcsCanonicalize({ network: offer.network, payer: solBuyer, identity: sent.payload.transaction }));
  const stub = purchaseIntentStore(testEnv, purchaseId);
  const record = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(record.state).toBe("unknown");
  const read = async () => object(await (await request(`/api/purchase-status/${purchaseId}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  return { stub, record, spy, read, canary, facts, retry: () => sendLabor(id, door, args, sent, key) };
}

for (const door of ["http", "mcp", "mcp-standard"] as const) for (const id of ["context_anchor", "the_collab"]) for (const versioned of [false, true]) {
  it(`${door} ${id} ${versioned ? "v0" : "legacy"}: lost acknowledgement recovers the original co-signed Solana purchase`, async () => {
    const f = await interrupted(id, door, versioned);
    expect((await f.retry()).body).toMatchObject({ charged: null, code: "settlement_unknown" });
    // Shelf and quote expire before the chain lookup; paid work is still owed.
    await sourceEnv.COUNTERS.delete(KV_KEYS.keeperLastSeen);
    vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
    expect(await runDurableObjectAlarm(f.stub)).toBe(true);
    const status = await f.read();
    expect(status).toMatchObject({ charged: true, payment_state: "settled", transaction: f.facts.tx });
    expect(JSON.stringify(f.record)).not.toContain(String(object(chain!.sent.payload).transaction));
    const good = object(status.fulfillment), cert = object(good.certificate);
    expect(cert).toMatchObject({ network: SOLANA_NETWORK, settlement_tx: f.facts.tx, purpose: "Original Solana purchase" });
    expect(object(await (await request(String(good.verify_url))).json()).valid).toBe(true);
    if (id === "context_anchor") {
      expect(status.delivery_state).toBe("delivered");
      const anchor = object(await (await request(String(good.anchor_url))).json());
      expect(object(anchor.anchor).summary).toBe(f.canary);
    } else {
      const orderId = String(good.order_id);
      expect(await getOrder(testEnv, orderId)).toMatchObject({ detail: f.canary, created_at: f.record.created_at });
      await completeOrder(testEnv, orderId, `Reply to ${f.canary}`);
      expect(await f.read()).toMatchObject({ delivery_state: "delivered", fulfillment: { order_id: orderId, deliverable: `Reply to ${f.canary}` } });
    }
    expect(await runDurableObjectAlarm(f.stub)).toBe(false);
    expect(f.spy).toHaveBeenCalledTimes(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  });
}

for (const defect of ["rpc", "chain", "unfinalized", "missing", "failed", "unindexed", "slot", "message", "mint", "payer", "recipient", "amount", "decimals", "balances", "malformed", "receipt-failed", "txid"]) {
  it(`${defect}: leaves money unknown and scheduled until exact finalized evidence becomes available`, async () => {
    const f = await interrupted();
    chain!.defect = defect;
    expect(await runDurableObjectAlarm(f.stub)).toBe(true);
    expect(await f.read()).toMatchObject({ charged: null, payment_state: "unknown" });
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
    expect(await runInDurableObject(f.stub, (_, state) => state.storage.getAlarm())).not.toBeNull();
    delete chain!.defect;
    expect(await runDurableObjectAlarm(f.stub)).toBe(true);
    expect(await f.read()).toMatchObject({ charged: true, delivery_state: "delivered" });
    expect(f.spy).toHaveBeenCalledTimes(1);
  });
}

it("pages past other transactions without confusing their equal-price transfers for the original purchase", async () => {
  const f = await interrupted();
  chain!.paged = true;
  expect(await runDurableObjectAlarm(f.stub)).toBe(true);
  expect(await f.read()).toMatchObject({ charged: null, payment_state: "unknown" });
  expect(JSON.parse((await f.stub.existingPurchase())!).reconciliation.before_signature).toBeTruthy();
  expect(await runDurableObjectAlarm(f.stub)).toBe(true);
  expect(await f.read()).toMatchObject({ charged: true, transaction: f.facts.tx, delivery_state: "delivered" });
  expect(f.spy).toHaveBeenCalledTimes(1);
});
