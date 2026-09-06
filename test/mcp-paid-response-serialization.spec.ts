import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { LATEST_PROTOCOL } from "@/routes/mcp";
import { installBuyerHarness, items, shelves, call, signature, request, object, sourceEnv, facilitator, type Obj } from "./helpers/buyer-harness";

installBuyerHarness();
let transfers: Obj[] = [];
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await inner(input, init);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/settle")) {
      const receipt = object(await response.clone().json());
      if (receipt.success) transfers.push(receipt);
    }
    return response;
  });
});
beforeEach(() => { transfers = []; });

for (const network of [BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]) {
  for (const profile of ["legacy", "tool-result"]) for (const stage of ["tool", "rpc", "modern"]) {
    for (const cached of network === SOLANA_NETWORK ? [false] : [false, true]) {
      it(`${network} ${profile} ${stage} ${cached ? "cached" : "new"}: encoding failure tells the truth about payment`, async () => {
        const item = items.find(i => i.id === "context_anchor")!, tool = shelves(item)[0]!;
        const summary = `SCVD-E2E-encoding-${crypto.randomUUID()}`;
        const offers = (await call(item, "mcp", { summary }, tool)).offers;
        const offer = offers.find(o => o.network === network)!;
        expect(offer).toBeTruthy();
        const payment = signature(offer), key = crypto.randomUUID();
        const body = JSON.stringify({ jsonrpc: "2.0", id: 778, method: "tools/call", params: {
          name: tool.name, arguments: { item_id: item.id, summary }, _meta: {
            "x402/payment": payment, "x402/idempotency-key": key,
            ...(stage === "modern" ? { "io.modelcontextprotocol/protocolVersion": LATEST_PROTOCOL,
              "io.modelcontextprotocol/clientInfo": { name: "buyer-fixture", version: "1" } } : {}),
          },
        } });
        const send = () => request(profile === "legacy" ? "/mcp" : "/mcp?payment=tool-result", {
          method: "POST", body, headers: { "Content-Type": "application/json",
            ...(stage === "modern" ? { "MCP-Protocol-Version": LATEST_PROTOCOL,
              "Mcp-Method": "tools/call", "Mcp-Name": tool.name } : {}),
          },
        });
        let originalGood: Obj | undefined;
        if (cached) originalGood = object(object(object(await (await send()).json()).result).structuredContent);
        const stringify = JSON.stringify, responseJson = Response.json;
        let hits = 0;
        const trip = () => { expect(transfers.length).toBeGreaterThan(0); hits++; throw new Error("fixture paid response encoding failure"); };
        const textSpy = vi.spyOn(JSON, "stringify").mockImplementation((value: unknown, replacer?: unknown, space?: string | number) => {
          const v = object(value), result = object(v.result);
          if (stage === "tool" && typeof v.cert_id === "string" && "deliverable" in v) trip();
          if (stage === "modern" && result.resultType && object(result.structuredContent).cert_id) trip();
          return Reflect.apply(stringify, JSON, [value, replacer, space]) as string;
        });
        const rpcSpy = vi.spyOn(Response, "json").mockImplementation((value, init) => {
          if (stage === "rpc" && object(object(object(value).result).structuredContent).cert_id) trip();
          return responseJson(value, init);
        });
        let failed: Response;
        try { failed = await send(); } finally { textSpy.mockRestore(); rpcSpy.mockRestore(); }
        expect(hits).toBeGreaterThan(0);
        expect(failed.status).toBe(200);
        const raw = object(await failed.json());
        const failure = profile === "legacy" ? object(object(raw.error).data) : object(object(raw.result).structuredContent);
        expect(failure).toMatchObject({ code: "delivery_failed", charged: true, transaction: transfers[0]!.transaction });
        if (profile === "tool-result") expect(object(raw.result).isError).toBe(true);
        expect(JSON.stringify(raw).toLowerCase()).not.toContain("no charge");
        if (!cached) expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).not.toBeNull();
        // Solana same-payment retrieval is a separate open finding; this
        // regression must not hide that gap by asserting only its charge state.
        if (network !== SOLANA_NETWORK) {
          const before = facilitator.settleCalls;
          const recovered = object(object(object(await (await send()).json()).result).structuredContent);
          expect(recovered.cert_id).toBeTruthy();
          const verified = object(await (await request(`/api/verify/${recovered.cert_id}`)).json());
          expect(verified.valid).toBe(true);
          expect(object(verified.certificate).settlement_tx).toBe(transfers[0]!.transaction);
          expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
          if (originalGood) expect(recovered.cert_id).toBe(originalGood.cert_id);
          const artifact = object(await (await request(String(recovered.anchor_url))).json());
          expect(object(artifact.anchor).summary).toBe(summary);
          expect(facilitator.settleCalls).toBe(before);
          expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(String(transfers[0]!.transaction)))).toBeNull();
        }
        expect(transfers).toHaveLength(1);
      });
    }
  }
}
