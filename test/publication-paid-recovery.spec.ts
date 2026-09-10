import { publicationConfirmation } from "./helpers/publication-confirmation";
import { reconcilePurchase } from "@/services/purchase-reconciliation";
import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { atomicToUsdc, getPaymentStack } from "@/lib/payments";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers } from "./helpers/labor-admission";
import { NOW, object, request, sourceEnv, testEnv } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";
import { decodePaymentRequired } from "./helpers/payment";

installLaborAdmissionHarness();
let gone = false, changed = false, fault = "", hits = 0;
vi.mock("@/services/settlement-records", async load => {
  const actual = await load<typeof import("@/services/settlement-records")>();
  return { ...actual, recordDeliveredSettlement: async (...args: Parameters<typeof actual.recordDeliveredSettlement>) => {
    await actual.recordDeliveredSettlement(...args);
    if (fault === "response") { hits++; throw new Error("fixture response lost after settlement"); }
  } };
});
vi.mock("@/services/zodiac", async load => {
  const actual = await load<typeof import("@/services/zodiac")>();
  return { ...actual, seasonEntry: (...args: Parameters<typeof actual.seasonEntry>) => gone ? undefined : actual.seasonEntry(...args),
    renderEntryMarkdown: (...args: Parameters<typeof actual.renderEntryMarkdown>) => changed ? "WRONG EDITION" : actual.renderEntryMarkdown(...args) };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "beginPurchase") return async (...a: Parameters<typeof inner.beginPurchase>) => {
          if (fault === "capture") { hits++; throw new Error("fixture purchase unavailable"); }
          const result = await inner.beginPurchase(...a);
          if (fault === "capture-after") { hits++; throw new Error("fixture purchase acknowledgement lost"); }
          return result;
        };
        if (method === "updatePurchase") return async (...a: Parameters<typeof inner.updatePurchase>) => {
          if (fault === "confirmation" && a[0].state === "settled") { hits++; throw new Error("fixture confirmation write unavailable"); }
          return inner.updatePurchase(...a);
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { gone = false; changed = false; fault = ""; hits = 0; vi.setSystemTime(NOW); });
async function purchase(rail: number, shelf: string, withTip = false) {
  const id = crypto.randomUUID(), markdown = `# SCVD-E2E-${id}\n\n👁 é & ? quotes \"\"\n${"exact page\n".repeat(100)}`;
  const key = shelf === "almanac" ? KV_KEYS.almanacEntry(id) : KV_KEYS.gazetteIssue(999999);
  const row = shelf === "almanac" ? { slug: id, title: id, teaser: id, date: NOW.toISOString(), markdown }
    : { issue_number: 999999, title: id, date: NOW.toISOString(), markdown, contributors: [], tip_ids: [], signature: "fixture", public_key: "fixture" };
  if (shelf !== "zodiac") await sourceEnv.ORDERS.put(key, JSON.stringify(row));
  const index = object(await (await request("/zodiac/archive?view=compact")).json());
  const zodiac = (index.pages as Record<string, unknown>[])[0]!;
  const path = shelf === "almanac" ? `/almanac/${id}` : shelf === "gazette" ? "/gazette/issue-999999" : String(zodiac.buy_url);
  const quote = await request(path); expect(quote.status).toBe(402);
  const network = laborNetworks()[rail]!;
  const offers = decodePaymentRequired(quote).accepts.filter(a => a.network === network).sort((a, b) => Number(a.amount) - Number(b.amount));
  const offer = offers[withTip ? offers.length - 1 : 0]!;
  const minimum = atomicToUsdc(offers[0]!.amount);
  expect(offer).toBeDefined();
  const payment = await signLabor(offer);
  const identity = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, payment);
  return { path, network, payment, markdown, minimum, stub: purchaseIntentStore(sourceEnv, identity.id),
    send: (url = path, idempotencyKey?: string) => request(url, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) } }),
    change: async (markdown = "WRONG EDITION") => { changed = true; if (shelf !== "zodiac") await sourceEnv.ORDERS.put(key, JSON.stringify({ ...row, markdown })); },
    remove: async () => { gone = true; if (shelf !== "zodiac") await sourceEnv.ORDERS.delete(key); } };
}
async function status(p: Awaited<ReturnType<typeof purchase>>) {
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  expect(record).not.toBeNull();
  const response = await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } });
  expect(response.status).toBe(200);
  return { record, body: object(await response.json()) };
}
for (const [rail] of laborNetworks().entries()) for (const shelf of ["almanac", "gazette", "zodiac"]) {
  it(`${shelf} rail ${rail}: retains exact paid page, receipt and private pickup after edits and deletion`, async () => {
    const p = await purchase(rail, shelf), first = await p.send();
    expect(first.status).toBe(200);
    const markdown = await first.text(), receipt = first.headers.get("PAYMENT-RESPONSE");
    if (shelf !== "zodiac") expect(markdown).toBe(p.markdown);
    const recoveryHeader = first.headers.get("Purchase-Recovery"); expect(recoveryHeader).toBeTruthy();
    const recovery = object(JSON.parse(atob(recoveryHeader!)));
    const saved = await status(p);
    expect(saved.body).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "delivered" });
    expect(object(object(saved.body.fulfillment).publication_response).markdown).toBe(markdown);
    expect(recovery.status_token).toBe(saved.record.token);
    await p.change();
    let again = await p.send(); expect(again.status).toBe(200); expect(await again.text()).toBe(markdown);
    await p.remove();
    again = await p.send(p.path, crypto.randomUUID());
    expect(again.status).toBe(200); expect(await again.text()).toBe(markdown);
    expect(again.headers.get("PAYMENT-RESPONSE")).toBe(receipt);
    expect(again.headers.get("Purchase-Recovery")).toBe(recoveryHeader);
    expect(await runDurableObjectAlarm(p.stub)).toBe(true);
    expect((await status(p)).body.delivery_state).toBe("delivered");
    expect(transfers).toBe(1);
    expect((await request(p.path)).status).toBe(404);
    const mismatch = await p.send(`${p.path}?different=input`);
    expect(mismatch.status).not.toBe(200); expect(object(await mismatch.json()).code).toBe("purchase_input_mismatch");
    expect((await request(`/api/purchase-status/${saved.record.id}`)).status).toBe(404);
  });
  it(`${shelf} rail ${rail}: failed capture never submits payment`, async () => {
    const p = await purchase(rail, shelf); fault = "capture";
    const failed = await p.send(); expect(failed.status).toBe(503);
    expect(object(await failed.json()).settlement_attempted).toBe(false);
    expect(hits).toBe(1); expect(transfers).toBe(0); expect(await p.stub.existingPurchase()).toBeNull();
    fault = ""; expect((await p.send()).status).toBe(200); expect(transfers).toBe(1);
  });
  it(`${shelf} rail ${rail}: concurrent duplicate requests settle once`, async () => {
    const p = await purchase(rail, shelf), responses = await Promise.all([p.send(), p.send()]);
    expect(responses.some(r => r.status === 200)).toBe(true); expect(transfers).toBe(1);
    await p.remove(); expect((await p.send()).status).toBe(200); expect(transfers).toBe(1);
  });
}

for (const [rail] of laborNetworks().entries()) for (const shelf of ["almanac", "gazette", "zodiac"]) {
  for (const failure of ["lost-answer", "confirmation"]) it(`${shelf} rail ${rail}: ${failure} preserves the original page for confirmed recovery`, async () => {
    const p = await purchase(rail, shelf), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      receipt ??= await settle(...args);
      if (failure === "lost-answer") throw new TypeError("fixture lost settlement answer");
      return receipt;
    });
    fault = failure;
    try {
      const first = await p.send();
      const saved = await status(p);
      expect(saved.body.charged).toBeNull(); expect(saved.body.fulfillment).toBeUndefined();
      expect(saved.record.publication?.markdown).toBeTypeOf("string");
      if (failure === "confirmation") { expect(first.status).toBe(200); expect(hits).toBe(1); }
      else { expect(object(await first.json()).charged).toBeNull(); }
      await p.remove();
      const retry = object(await (await p.send()).json());
      expect(retry).toMatchObject({ charged: null, charged_again: false });
      expect(object(retry.recovery).status_token).toBe(saved.record.token);
      expect(transfers).toBe(1);
      // Retain the mock's actual settlement result, not invented chain evidence.
      // Chain confirmation itself has separate EVM/Solana reconciliation tests.
      if (!receipt?.success) throw new Error("Fixture payment missing");
      fault = "";
      await p.stub.updatePurchase({ state: "settled", payment: { paidUsdc: atomicToUsdc(saved.record.terms.amount), tipUsdc: 0,
        transaction: receipt.transaction, network: p.network, payer: saved.record.payer, settleHeaders: receipt.headers } });
      expect(await runDurableObjectAlarm(p.stub)).toBe(true);
      const recovered = await status(p);
      expect(recovered.body).toMatchObject({ charged: true, delivery_state: "delivered" });
      expect(object(object(recovered.body.fulfillment).publication_response).markdown).toBe(saved.record.publication?.markdown);
      const replay = await p.send(); expect(replay.status).toBe(200);
      expect(await replay.text()).toBe(saved.record.publication?.markdown); expect(transfers).toBe(1);
    } finally { spy.mockRestore(); }
  });
}
it("a lost capture acknowledgement leaves an unresolved record, never a second settlement", async () => {
  const p = await purchase(0, "almanac"); fault = "capture-after";
  expect((await p.send()).status).toBe(503); expect(transfers).toBe(0); expect(hits).toBe(1);
  fault = ""; await p.remove();
  const retry = object(await (await p.send()).json());
  expect(retry).toMatchObject({ charged: null, charged_again: false });
  expect(object(retry.recovery).status_token).toBeTypeOf("string"); expect(transfers).toBe(0);
});
it("a removed page after quote refuses a first payment before settlement", async () => {
  const p = await purchase(0, "almanac"); await p.remove();
  expect((await p.send()).status).toBe(404); expect(transfers).toBe(0);
  expect(await p.stub.existingPurchase()).toBeNull();
});
it("same-key cached publication responses preserve their private recovery handle", async () => {
  const p = await purchase(0, "almanac"), key = crypto.randomUUID();
  const first = await p.send(p.path, key), recovery = first.headers.get("Purchase-Recovery");
  expect(recovery).toBeTruthy(); await p.remove();
  const again = await p.send(p.path, key);
  expect(again.status).toBe(200); expect(again.headers.get("Purchase-Recovery")).toBe(recovery);
  expect(transfers).toBe(1);
});

for (const [rail] of laborNetworks().entries()) for (const shelf of ["almanac", "gazette", "zodiac"]) {
  it(`${shelf} rail ${rail}: a response failure after settlement cannot lose the page`, async () => {
    const p = await purchase(rail, shelf); fault = "response";
    expect((await p.send()).status).toBe(500); expect(hits).toBe(1); expect(transfers).toBe(1);
    fault = ""; await p.remove();
    const recovered = await status(p);
    expect(recovered.body).toMatchObject({ charged: true, delivery_state: "delivered" });
    const again = await p.send(); expect(again.status).toBe(200);
    expect(await again.text()).toBe(recovered.record.publication?.markdown); expect(transfers).toBe(1);
    const rpc = object(await (await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_purchase",
        arguments: { purchase_id: recovered.record.id, status_token: recovered.record.token } } }) })).json());
    expect(object(object(rpc.result).structuredContent)).toEqual(recovered.body);
    expect(transfers).toBe(1);
  });
}
for (const shelf of ["almanac", "gazette"]) it(`${shelf}: an empty published body cannot settle`, async () => {
  const p = await purchase(0, shelf); await p.change(" \n\t");
  const failed = await p.send(); expect(failed.status).toBe(503);
  expect(object(await failed.json())).toMatchObject({ code: "publication_unavailable", charged: false, settlement_attempted: false });
  expect(transfers).toBe(0); expect(await p.stub.existingPurchase()).toBeNull();
});

for (const [rail] of laborNetworks().entries()) it(`rail ${rail}: original page price survives a tipped purchase`, async () => {
  const p = await purchase(rail, "almanac", true);
  expect((await p.send()).status).toBe(200);
  const saved = await status(p);
  expect(atomicToUsdc(saved.record.terms.amount)).toBeGreaterThan(p.minimum);
  expect(object(saved.record.publication).minimum_usdc).toBe(p.minimum);
  const confirmation = publicationConfirmation(saved.record, p.payment, saved.record.payment!.transaction);
  try {
    const recovered = await reconcilePurchase(testEnv, { ...saved.record, state: "unknown", payment: undefined });
    expect(confirmation.calls).toContain(p.network.startsWith("eip155:") ? "eth_getTransactionReceipt" : "getTransaction");
    expect(recovered.payment?.paidUsdc).toBe(saved.record.payment?.paidUsdc);
    expect(recovered.payment?.tipUsdc).toBeCloseTo(atomicToUsdc(saved.record.terms.amount) - p.minimum, 6);
  } finally { confirmation.spy.mockRestore(); }
});
