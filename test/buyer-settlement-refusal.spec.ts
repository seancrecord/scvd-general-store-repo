import { afterEach, expect, it } from "vitest";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { MENU_ITEMS } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";
import { installBuyerHarness, items, shelves, baseline, call, signature, request, object, facilitator, sourceEnv } from "./helpers/buyer-harness";

installBuyerHarness();
afterEach(() => { facilitator.settleShouldFail = false; });

for (const { id } of MENU_ITEMS) {
  for (const network of [BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]) {
    for (const profile of ["legacy", "tool-result"]) {
      it(`${id} ${network} ${profile}: the buyer receives the actual settlement refusal`, async () => {
        const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!, args = baseline(item);
        const offers = (await call(item, "mcp", args, tool)).offers;
        const offer = offers.find(o => o.network === network)!;
        expect(offer).toBeTruthy();
        facilitator.settleShouldFail = true;
        const v = facilitator.verifyCalls, s = facilitator.settleCalls;
        const http = await call(item, "http", args, undefined, signature(offer), crypto.randomUUID());
        const response = await request(profile === "legacy" ? "/mcp" : "/mcp?payment=tool-result", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: tool.name, arguments: { item_id: id, ...args },
              _meta: { "x402/payment": signature(offer), "x402/idempotency-key": crypto.randomUUID() } },
          }),
        });
        expect(facilitator.verifyCalls - v).toBe(2);
        expect(facilitator.settleCalls - s).toBe(2);
        expect(http.status).toBe(402);
        const raw = object(await response.json()), result = object(raw.result), body = object(result.structuredContent);
        expect(result.isError).toBe(true);
        expect(body).toMatchObject({ code: "payment_declined", charged: false, payment_state: "not_settled",
          payment_declined: { reason: "insufficient_funds" } });
        expect(http.body).toMatchObject({ code: body.code, charged: body.charged, payment_state: body.payment_state,
          payment_declined: body.payment_declined });
        expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
        expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(0);
      });
    }
  }
}

it("discovery describes settlement refusals as tool errors", async () => {
  const raw = object(await (await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} }),
  })).json());
  const tool = (object(raw.result).tools as Record<string, unknown>[]).find(t => t.name === shelves(items[0]!)[0]!.name)!;
  const refusal = (tool.errors as Record<string, unknown>[]).find(e => e.code === "payment_declined");
  expect(refusal).toMatchObject({ charged: false, tool_result: true });
  expect(refusal?.jsonrpc).toBeUndefined();
});
