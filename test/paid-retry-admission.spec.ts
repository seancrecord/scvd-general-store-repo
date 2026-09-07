import { beforeAll, beforeEach, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ mint: false, hits: 0 }));
vi.mock("@/services/certificates", async (original) => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault.mint) { fault.hits++; throw new Error("fixture mint failure"); }
    return actual.mintCertificate(...args);
  } };
});
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { getOrder, remainingInventory } from "@/services/orders";
import { setShutter } from "@/services/shutter";
import { MENU_ITEMS, getMenuItem } from "@/store";
import { installBuyerHarness, items, shelves, baseline, call, request, object, testEnv, sourceEnv, facilitator, type Obj } from "./helpers/buyer-harness";
import { evmPayment, evmValid, initializeSol, solPayment, solFacts, solFeePayer } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";
installBuyerHarness();
let transfers = 0;
beforeAll(async () => {
  await initializeSol();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/supported")) {
      const body = object(await (await inner(input, init)).json());
      for (const kind of body.kinds as Obj[]) if (kind.network === SOLANA_NETWORK) kind.extra = { ...object(kind.extra), feePayer: solFeePayer };
      return Response.json(body);
    }
    if (!/\/x402\/(verify|settle)$/.test(url.pathname)) return inner(input, init);
    const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
    const offer = body.paymentRequirements as ChallengeRequirement;
    const sol = offer.network === SOLANA_NETWORK ? await solFacts(wire) : null;
    const payer = sol?.payer ?? object(object(wire.payload).authorization).from;
    if (url.pathname.endsWith("/verify")) {
      facilitator.verifyCalls++;
      return Response.json({ isValid: sol ? sol.valid : await evmValid(wire, offer), payer });
    }
    const receipt = object(await (await inner(input, init)).json());
    if (receipt.success) transfers++;
    return Response.json({ ...receipt, payer, ...(sol ? { transaction: sol.tx } : {}) });
  });
});
beforeEach(() => { fault.mint = false; fault.hits = 0; transfers = 0; });
type Door = "http" | "mcp" | "mcp-standard";
type Closure = "shutter" | "inventory" | "capacity";
async function close(id: string, kind: Closure) {
  const item = getMenuItem(id)!;
  if (kind === "shutter") return setShutter(testEnv, true);
  if (kind === "inventory") {
    await sourceEnv.COUNTERS.put(KV_KEYS.inventory(item.id, currentWeekKey()), String(item.weekly_inventory));
    expect(await remainingInventory(testEnv, item)).toBe(0);
    return;
  }
  for (let i = 0; i < item.weekly_inventory!; i++) {
    const id = `fixture_capacity_${i}`;
    await sourceEnv.ORDERS.put(KV_KEYS.order(id), JSON.stringify({ order_id: id, item_id: item.id, status: "queued", created_at: new Date().toISOString(), sla_hours: item.sla_hours }));
  }
  await sourceEnv.ORDERS.delete(KV_KEYS.openLaborIndex);
}
async function send(id: string, door: Door, args: Obj, payment?: Obj, key?: string) {
  const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!;
  if (door === "http") return call(item, "http", args, tool, payment ? btoa(JSON.stringify(payment)) : undefined, key);
  const raw = object(await (await request(door === "mcp" ? "/mcp" : "/mcp?payment=tool-result", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {
      name: tool.name, arguments: { item_id: item.id, ...args }, ...(payment ? { _meta: { "x402/payment": payment, "x402/idempotency-key": key } } : {}),
    } }),
  })).json());
  const result = object(raw.result), error = object(raw.error);
  return { quote: error.code === 402 || Array.isArray(object(result.structuredContent).accepts), protocolError: Object.keys(error).length > 0 || result.isError === true,
    body: Object.keys(error).length ? object(error.data) : object(result.structuredContent) };
}
const certId = (body: Obj) => body.cert_id ?? object(body.certificate).cert_id;
for (const { id } of MENU_ITEMS.filter(item => item.fulfillment === "human_queue" && !item.stocked))
for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const closure of (door === "http" ? ["shutter", "inventory", "capacity"] : ["shutter"]) as Closure[]) {
    for (const recovery of [false, true]) for (const network of recovery ? [BASE_NETWORK, POLYGON_NETWORK] : [BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]) {
      it(`${id} ${door} ${closure} ${network} ${recovery ? "interrupted" : "cached"}: paid retrieval survives admission closing`, async () => {
        const item = items.find(i => i.id === id)!;
        const args = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()}` }, key = recovery ? undefined : crypto.randomUUID();
        const quote = await call(item, "mcp", args, shelves(item)[0]!);
        expect(quote.quote).toBe(true);
        const offer = quote.offers.find(o => o.network === network)!;
        const sign = () => network === SOLANA_NETWORK ? solPayment(offer) : evmPayment(offer);
        const payment = await sign();
        fault.mint = recovery;
        const first = await send(id, door, args, payment, key);
        if (recovery) { expect(first.body.charged).toBe(true); expect(fault.hits).toBe(1); }
        else { expect(first.protocolError, JSON.stringify(first.body)).toBe(false); expect(certId(first.body)).toBeTruthy(); }
        expect(transfers).toBe(1);
        fault.mint = false;
        await close(id, closure);
        const replay = await send(id, door, args, payment, key);
        expect(replay.protocolError, JSON.stringify(replay.body)).toBe(false);
        expect(replay.body.order_id).toBeTruthy();
        if (!recovery) expect(certId(replay.body)).toBe(certId(first.body));
        expect(transfers).toBe(1);
        const order = object(await (await request(String(replay.body.order_url))).json());
        expect(order.order_id).toBe(replay.body.order_id);
        expect((await getOrder(testEnv, String(replay.body.order_id)))?.detail).toBe(args.detail);
        expect(object(await (await request(`/api/verify/${certId(replay.body)}`)).json()).valid).toBe(true);
        // Fresh valid payment cannot use the retry lane to purchase closed labor.
        const unpaid = await send(id, door, args);
        expect(unpaid.protocolError).toBe(true);
        expect(unpaid.quote).toBe(false);
        const fresh = await send(id, door, args, await sign(), crypto.randomUUID());
        expect(fresh.protocolError).toBe(true);
        expect(fresh.quote).toBe(false);
        if (closure !== "capacity") expect(fresh.body.charged).toBe(false);
        expect(certId(fresh.body)).toBeUndefined();
        expect(transfers).toBe(1);
        // A changed brief and a forged signature never disclose the saved good.
        expect(certId((await send(id, door, { ...args, detail: `${args.detail}-changed` }, payment, key)).body)).toBeUndefined();
        const forged = structuredClone(payment);
        if (network === SOLANA_NETWORK) object(forged.payload).transaction = object((await solPayment(offer, { unrelatedSignature: true })).payload).transaction;
        else object(forged.payload).signature = `0x${"00".repeat(65)}`;
        const invalid = await send(id, door, args, forged, key);
        expect(certId(invalid.body)).toBeUndefined();
        expect(invalid.quote).toBe(false);
        expect(transfers).toBe(1);
        expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
      });
    }
  }
}
