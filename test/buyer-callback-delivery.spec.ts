import { env, SELF } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { completeOrder, getOrder } from "@/services/orders";
import { writeManagedOrder } from "@/services/managed-orders";
import { KV_KEYS } from "@/lib/kv-keys";
import { findMcpTool } from "@/lib/mcp-tools";
import type { Env, OrderRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const NOW = new Date("2026-09-05T12:00:00Z");
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {};
async function seed(managed: boolean, callback_url?: string) {
  const order: OrderRecord = { order_id: `ord_${crypto.randomUUID().replace(/-/g, "")}`, item_id: "the_collab", item_name: "The Collab",
    status: "queued", created_at: NOW.toISOString(), sla_hours: 168, paid_usdc: 1, tip_usdc: 0,
    patron_number: 1, cert_id: "cert_callback_fixture", ...(callback_url === undefined ? {} : { callback_url }),
    ...(managed ? { managed_order: true } : {}) };
  if (managed) await writeManagedOrder(testEnv, order);
  else await testEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
  return order;
}
async function poll(order: OrderRecord) {
  const http = object(await (await SELF.fetch(`${BASE}/api/order/${order.order_id}`)).json());
  const rpc = object(await (await SELF.fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_order", arguments: { order_id: order.order_id } } }) })).json());
  expect(object(rpc.result).structuredContent).toEqual(http);
  return http;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
for (const managed of [false, true]) {
  for (const callback of ["http://buyer.example/hook", "https://[::1]/hook", "https://169.254.169.254/hook", "https://SCVD.STORE./hook", "https://user:pass@buyer.example/hook"]) {
    it(`${managed ? "managed" : "legacy"}: retained unsafe callback is refused at dispatch (${callback})`, async () => {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
      const order = await seed(managed, callback), wire = vi.fn(async () => new Response("ok"));
      vi.stubGlobal("fetch", wire);
      const done = await completeOrder(testEnv, order.order_id, "the original goods");
      expect(wire).not.toHaveBeenCalled();
      expect(done?.webhook).toMatch(/not attempted.*refused/);
      const status = await poll(order);
      expect(status).toMatchObject({ status: "completed", deliverable: "the original goods", webhook: done?.webhook,
        callback: { requested: true, result: done?.webhook, automatic_retries: false, redirects: "not_followed", retrieve: `${BASE}/api/order/${order.order_id}` } });
    });
  }
  for (const status of [301, 302, 303, 307, 308]) for (const location of ["https://169.254.169.254/hook", "https://other.example/next"]) {
    it(`${managed ? "managed" : "legacy"}: HTTP ${status} cannot forward goods to ${location}`, async () => {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
      const order = await seed(managed, "https://buyer.example/hook");
      const reached: string[] = [], bodies: unknown[] = [];
      // Model fetch's redirect behavior, not only its response. Without manual
      // mode this fixture follows Location and records the leaked second body.
      vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        reached.push(String(url)); bodies.push(init?.body);
        if (init?.redirect !== "manual") { reached.push(location); bodies.push(init?.body); return new Response("received"); }
        return new Response(null, { status, headers: { Location: location } });
      });
      const done = await completeOrder(testEnv, order.order_id, "private original goods");
      expect(reached).toEqual(["https://buyer.example/hook"]);
      expect(JSON.parse(String(bodies[0]))).toMatchObject({ order_id: order.order_id, deliverable: "private original goods" });
      expect(done?.webhook).toContain(`HTTP ${status}; redirect not followed`);
      expect((await getOrder(testEnv, order.order_id))?.webhook).toBe(done?.webhook);
      const result = await poll(order);
      expect(result.deliverable).toBe("private original goods");
      expect(object(result.callback)).toMatchObject({ result: done?.webhook, automatic_retries: false });
      expect(reached).toHaveLength(1);
    });
  }
  for (const response of [204, 500, "unreachable"] as const) it(`${managed ? "managed" : "legacy"}: exposes ${response} outcome without resending on polling`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
    const order = await seed(managed, "https://buyer.example/hook");
    const wire = vi.fn(async () => { if (response === "unreachable") throw new Error("fixture network failure"); return new Response(null, { status: response }); });
    vi.stubGlobal("fetch", wire);
    const pending = await poll(order);
    expect(object(pending.callback)).toMatchObject({ result: null, automatic_retries: false });
    const done = await completeOrder(testEnv, order.order_id, "the goods");
    expect(done?.webhook).toMatch(response === 204 ? /delivered/ : response === 500 ? /HTTP 500/ : /unreachable/);
    const body = await poll(order); await poll(order);
    expect(body).toMatchObject({ status: "completed", deliverable: "the goods", webhook: done?.webhook });
    expect(object(body.callback)).toMatchObject({ result: done?.webhook, automatic_retries: false });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it(`${managed ? "managed" : "legacy"}: an omitted callback creates no delivery claim or request`, async () => {
    const order = await seed(managed), wire = vi.fn(async () => new Response("ok")); vi.stubGlobal("fetch", wire);
    await completeOrder(testEnv, order.order_id, "the goods");
    const body = await poll(order);
    expect(body.deliverable).toBe("the goods"); expect(body.callback).toBeUndefined(); expect(body.webhook).toBeUndefined();
    expect(wire).not.toHaveBeenCalled();
  });
}
it("both discovery doors advertise the recorded callback outcome and no retry policy", async () => {
  const tool = findMcpTool("check_order", BASE)!;
  const fields = object(tool.outputSchema?.properties);
  expect(object(fields.callback).properties).toMatchObject({ automatic_retries: { const: false }, redirects: { const: "not_followed" } });
  const doc = object(await (await SELF.fetch(`${BASE}/openapi.json`)).json());
  const path = object(object(doc.paths)["/api/order/{order_id}"]);
  const response = object(object(object(path.get).responses)["200"]);
  const schema = object(object(object(response.content)["application/json"]).schema);
  expect(object(schema.properties).callback).toEqual(fields.callback);
});
