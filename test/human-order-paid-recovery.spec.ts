import { beforeAll, beforeEach, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ kind: "none", hits: 0, paid: false, orderId: "" }));
vi.mock("@/services/certificates", async (original) => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault.paid && fault.kind === "mint") { fault.hits++; throw new Error("fixture mint unavailable"); }
    return actual.mintCertificate(...args);
  } };
});
vi.mock("@/lib/kv-retry", async (original) => {
  const actual = await original<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const key = String(args[1]);
    const stage = key.startsWith("order:") ? "order" : key.startsWith("inventory:") ? "inventory" : key === "open_labor_index" ? "queue" : "other";
    if (fault.paid && stage === "order") fault.orderId = key.slice("order:".length);
    if (fault.paid && fault.kind === `${stage}-before`) { fault.hits++; throw new Error("fixture write failure"); }
    const saved = await actual.kvPut(...args);
    if (fault.paid && fault.kind === `${stage}-after`) { fault.hits++; throw new Error("fixture lost acknowledgement"); }
    return saved;
  } };
});
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { completeOrder, getOrder, remainingInventory } from "@/services/orders";
import { getMenuItem } from "@/store";
import { installBuyerHarness, items, shelves, baseline, call, request, object, sourceEnv, testEnv, facilitator, type Obj } from "./helpers/buyer-harness";
import { evmPayment, evmValid } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";
installBuyerHarness();
let transfers: Obj[] = [];
let callbacks = 0;
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "buyer-fixture.example" && url.pathname === "/callback") {
      callbacks++;
      return new Response("fixture callback failure", { status: 500 });
    }
    if (url.pathname.endsWith("/x402/verify")) {
      facilitator.verifyCalls++;
      const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
      const isValid = await evmValid(wire, body.paymentRequirements as ChallengeRequirement);
      return Response.json({ isValid, payer: object(object(wire.payload).authorization).from });
    }
    const response = await inner(input, init);
    if (url.pathname.endsWith("/x402/settle")) {
      const receipt = object(await response.clone().json());
      const wire = object(object(JSON.parse(String(init?.body))).paymentPayload);
      if (receipt.success) {
        receipt.payer = object(object(wire.payload).authorization).from;
        transfers.push(receipt); fault.paid = true;
      }
      return Response.json(receipt, { status: response.status, headers: response.headers });
    }
    return response;
  });
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "artifactStage") return async (...args: Parameters<typeof inner.artifactStage>) => {
          if (args[1] === "response" && args[2] !== undefined && fault.kind === "response-before") {
            fault.hits++; throw new Error("fixture response checkpoint failure");
          }
          const saved = await inner.artifactStage(...args);
          if (args[1] === "response" && args[2] !== undefined && fault.kind === "response-after") {
            fault.hits++; throw new Error("fixture response checkpoint acknowledgement lost");
          }
          return saved;
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...args: unknown[]) => Reflect.apply(member, inner, args) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { transfers = []; callbacks = 0; fault.kind = "none"; fault.hits = 0; fault.paid = false; fault.orderId = ""; });

for (const id of ["aura_walk", "the_collab"]) for (const door of ["http", "mcp"] as const) {
  for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const point of ["order-before", "order-after", "inventory-before", "inventory-after", "queue-before", "queue-after", "response-before", "response-after"]) {
    it(`${id} ${door} ${network} ${point}: resumes one paid order without erasing completed work`, async () => {
      const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!, menu = getMenuItem(id)!;
      const canary = `SCVD-E2E-${crypto.randomUUID()}-${"x".repeat(100)}`;
      const args = { ...baseline(item), detail: canary, purpose: "SCVD-E2E human-order recovery", callback_url: "https://buyer-fixture.example/callback" };
      const quote = await call(item, door, args, tool);
      expect(quote.quote, JSON.stringify(quote.body)).toBe(true);
      const payment = btoa(JSON.stringify(await evmPayment(quote.offers.find(o => o.network === network)!)));
      const send = (input = args) => call(item, door, input, tool, payment);
      fault.kind = point;
      const first = await send();
      expect(first.charged).toBe(true);
      expect(fault.hits).toBeGreaterThan(0);
      expect(transfers).toHaveLength(1);
      const orderId = fault.orderId;
      expect(orderId).toMatch(/^ord_/);
      fault.kind = "none";
      // Even a missing KV publication must leave the durable work recoverable.
      const pending = await getOrder(testEnv, orderId);
      expect(pending).toMatchObject({ detail: canary, status: "queued" });
      const finished = `Answer to ${canary}`;
      await completeOrder(testEnv, orderId, finished);
      const wrong = await send({ ...args, detail: `${canary}-changed` });
      expect(wrong.quote).toBe(false);
      expect(wrong.body.order_id).toBeUndefined();
      for (const retry of await Promise.all([send(), send()])) {
        expect(retry.protocolError, JSON.stringify(retry.body)).toBe(false);
        expect(retry.status).toBe(200);
        expect(retry.settles).toBe(0);
        expect(retry.body).toMatchObject({ order_id: orderId, status: "completed", deliverable: finished });
        const checked = object(await (await request(String(retry.body.order_url))).json());
        expect(checked).toMatchObject({ order_id: orderId, status: "completed", deliverable: finished });
        const certId = retry.body.cert_id ?? object(retry.body.certificate).cert_id;
        expect(object(await (await request(`/api/verify/${String(certId)}`)).json()).valid).toBe(true);
      }
      const toolPoll = object(await (await request("/mcp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 902, method: "tools/call",
          params: { name: "check_order", arguments: { order_id: orderId } } }),
      })).json());
      const pollResult = object(toolPoll.result);
      expect(pollResult.isError).not.toBe(true);
      const content = pollResult.content as { text: string }[];
      expect(JSON.parse(content[0]!.text)).toMatchObject({ order_id: orderId, status: "completed", deliverable: finished });
      expect((await getOrder(testEnv, orderId))?.detail).toBe(canary);
      expect((await getOrder(testEnv, orderId))?.webhook).toContain("HTTP 500");
      expect(callbacks).toBe(1);
      expect(await remainingInventory(testEnv, menu)).toBe(menu.weekly_inventory! - 1);
      expect((await send()).body.order_id).toBe(orderId);
      expect(transfers).toHaveLength(1);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(1);
      expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).toBeNull();
    });
  }
}

for (const door of ["http", "mcp"] as const) for (const network of [BASE_NETWORK, POLYGON_NETWORK]) {
  it(`${door} ${network}: retains the paid human SLA when the catalog changes before order creation`, async () => {
    const item = items.find(i => i.id === "aura_walk")!, tool = shelves(item)[0]!, menu = getMenuItem(item.id)!;
    const args = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()}` };
    const quote = await call(item, door, args, tool);
    expect(quote.quote).toBe(true);
    const payment = btoa(JSON.stringify(await evmPayment(quote.offers.find(o => o.network === network)!)));
    const paidAt = new Date().toISOString();
    fault.kind = "mint";
    expect((await call(item, door, args, tool, payment)).charged).toBe(true);
    expect(fault.hits).toBeGreaterThan(0);
    fault.kind = "none";
    const originalSla = menu.sla_hours;
    try {
      menu.sla_hours = 1;
      vi.setSystemTime(new Date(Date.now() + 1000));
      const recovered = await call(item, door, args, tool, payment);
      expect(recovered.protocolError, JSON.stringify(recovered.body)).toBe(false);
      const order = await getOrder(testEnv, String(recovered.body.order_id));
      expect(order?.sla_hours).toBe(originalSla);
      expect(order?.created_at).toBe(paidAt);
      expect(order?.detail).toBe(args.detail);
      expect(transfers).toHaveLength(1);
    } finally { menu.sla_hours = originalSla; }
  });
}
