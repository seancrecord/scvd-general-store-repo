import { afterEach, expect, it, vi } from "vitest";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK, getPaymentStack } from "@/lib/payments";
import { KV_KEYS } from "@/lib/kv-keys";
import { installBuyerHarness, items, shelves, call, signature, request, object, testEnv, sourceEnv } from "./helpers/buyer-harness";

installBuyerHarness();
afterEach(() => vi.restoreAllMocks());

for (const network of [BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]) {
  for (const door of ["http", "mcp", "mcp-standard"] as const) {
    for (const failure of ["throw", "transport", "named-transaction"] as const) {
      it(`${network} ${door} ${failure}: a lost settlement answer never claims no charge`, async () => {
        const item = items.find(i => i.id === "context_anchor")!, tool = shelves(item)[0]!;
        const summary = `SCVD-E2E-unknown-${crypto.randomUUID()}`;
        const offers = (await call(item, "mcp", { summary }, tool)).offers;
        const payment = signature(offers.find(o => o.network === network)!);
        const key = crypto.randomUUID();
        const stack = await getPaymentStack(testEnv);
        const original = stack.httpServer.processSettlement.bind(stack.httpServer);
        let transaction = "", landed = 0, attempts = 0;
        vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
          attempts++;
          // Let the local processor settle once, then lose its answer. The
          // harness's chain reader sees no event yet: absence cannot prove no debit.
          if (!transaction) {
            const result = await original(...args);
            expect(result.success).toBe(true);
            if (result.success) { transaction = result.transaction; landed++; }
          }
          if (failure === "throw") throw new TypeError("fixture lost settlement acknowledgement");
          return { success: false, headers: {}, network: args[1].network, transaction: failure === "named-transaction" ? transaction : "",
            errorReason: failure === "transport" ? "Facilitator settle failed (502): fixture" : "invalid_payload",
            response: { status: 402, headers: {}, body: { error: "fixture settlement failure" } },
          };
        });
        const send = () => door === "http"
          ? request(`${item.buy_url}?${new URLSearchParams({ summary })}`, { headers: { "PAYMENT-SIGNATURE": payment, "Idempotency-Key": key } })
          : request(door === "mcp" ? "/mcp" : "/mcp?payment=tool-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: tool.name, arguments: { item_id: item.id, summary },
              _meta: { "x402/payment": payment, "x402/idempotency-key": key } },
          }) });
        for (let retry = 0; retry < 2; retry++) {
          const response = await send(), raw = object(await response.json());
          const body = door === "http" ? raw : door === "mcp" ? object(object(raw.error).data) : object(object(raw.result).structuredContent);
          expect(attempts).toBeGreaterThan(0);
          expect(landed).toBe(1);
          expect(body).toMatchObject({ code: "settlement_unknown", charged: null, payment_state: "unknown", network });
          expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
          expect(body.accepts).toBeUndefined();
          expect(body.payment_declined).toBeUndefined();
          const recovery = object(body.recovery);
          expect(recovery.recorded).toBe(true);
          expect(typeof recovery.reference).toBe("string");
          expect(await sourceEnv.COUNTERS.get(String(recovery.reference))).not.toBeNull();
          expect(String(recovery.retry)).toContain("do not sign a new payment");
          expect(JSON.stringify(raw).toLowerCase()).not.toMatch(/no charge|no money moved/);
          if (door === "http") expect(response.status).toBe(503);
          if (door === "mcp-standard") expect(object(raw.result).isError).toBe(true);
        }
        expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
      });
    }
  }
}

it("publishes the unknown settlement state through both discovery contracts", async () => {
  const { BUY_REFUSAL_CODES, MCP_REFUSAL_CODES } = await import("@/store/surface-contract");
  for (const codes of [BUY_REFUSAL_CODES, MCP_REFUSAL_CODES]) {
    expect(codes.find(entry => String(entry.code) === "settlement_unknown")).toMatchObject({ charged: null });
  }
});
