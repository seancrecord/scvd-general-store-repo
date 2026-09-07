import { env } from "cloudflare:test";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { settlementExplorer } from "@/lib/payment-networks";
import { acceptedNetworks, manifestAccepts, railAccepts } from "@/lib/payments";
import { railOf, recordSettlement, metricsMonth } from "@/lib/metrics";
import { readRailCounters } from "@/services/rails";
import { computeNetStatement } from "@/services/net-statement";
import { ARBITRUM_EVM, EVM_CHAINS } from "@/lib/base-rpc";
import { runChainReconciliation } from "@/services/chain-reconciliation";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
const receiver = "0x3333333333333333333333333333333333333333";
const baseEnv = { ...env, POLYGON_PAY_TO: undefined, SOLANA_PAY_TO: undefined } as unknown as Env;
const enabled = { ...baseEnv, ARBITRUM_PAY_TO: receiver, WORLD_PAY_TO: receiver };
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-06T12:00:00Z")); });
afterAll(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("additional checkout rails are explicitly enabled and independently accounted", () => {
  it("offers Arbitrum and World only with their own recipient setting", () => {
    expect(acceptedNetworks(baseEnv)).toEqual(["eip155:8453"]);
    expect(acceptedNetworks(enabled)).toEqual(["eip155:8453", "eip155:42161", "eip155:480"]);
    expect(railAccepts(enabled, [0.01]).map(offer => offer.network)).toEqual(acceptedNetworks(enabled));
    expect(acceptedNetworks({ ...enabled, ARBITRUM_PAY_TO: "bad", WORLD_PAY_TO: "bad" })).toEqual(["eip155:8453"]);
  });
  it("quotes Circle's assets with the correct chain-specific signing domains", () => {
    const accepts = manifestAccepts(enabled, [0.01]);
    expect(accepts.find(offer => offer.network === "eip155:42161")).toMatchObject({ asset: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", amount: "10000", extra: { name: "USD Coin", version: "2" } });
    expect(accepts.find(offer => offer.network === "eip155:480")).toMatchObject({ asset: "0x79a02482a880bce3f13e09da970dc34db4cd24d1", amount: "10000", extra: { name: "USDC", version: "2" } });
  });
  it("never books the new networks as Base", async () => {
    const month = metricsMonth();
    for (const [network, key] of [["eip155:42161", "arbitrum"], ["eip155:480", "world"]]) {
      expect(railOf(network)).toBe(key);
      for (const prefix of ["rail", "revrail", "railh", "revrailh"]) await baseEnv.COUNTERS.delete(KV_KEYS.metric(month, prefix, key!));
      await recordSettlement(baseEnv, "/api/buy/hello", { network, paidUsdc: 0.01, minimumUsdc: 0.01 });
      const counts = await readRailCounters(baseEnv) as unknown as Record<string, number>;
      expect(counts[key!]).toBe(1);
      const statement = await computeNetStatement(baseEnv) as unknown as Record<string, { months: { booked_usdc: number }[] }>;
      expect(statement[key!]!.months[0]!.booked_usdc).toBe(0.01);
    }
  });
  it("does not reuse Base's receiving wallet for an unconfigured Arbitrum walk", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await runChainReconciliation(baseEnv, { chain: ARBITRUM_EVM });
    expect(result.ran).toBe(false);
    expect(result.failed).toBeUndefined();
    expect(result.reason).toContain("ARBITRUM_PAY_TO");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("has a chain reader for World so receipts and bank reconciliation can be checked", () => {
    expect(EVM_CHAINS.find(chain => chain.caip2 === "eip155:480")).toMatchObject({ key: "world", usdc: "0x79a02482a880bce3f13e09da970dc34db4cd24d1" });
  });
});

describe("the SDK-backed gate can quote, deliver and receipt both new rails", () => {
  it("preserves the selected network all the way into the receipt and certificate", async () => {
    const { installFacilitatorMock } = await import("./helpers/facilitator-mock");
    const { decodePaymentRequired, buildPaymentSignature } = await import("./helpers/payment");
    const { app } = await import("@/index");
    const facilitator = installFacilitatorMock({ uniqueTransactions: true });
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const response = await original(input, init);
      if (url.endsWith("/x402/supported")) {
        const body = await response.json() as { kinds: unknown[] };
        body.kinds.push(...["eip155:42161", "eip155:480"].map(network => ({ x402Version: 2, scheme: "exact", network })));
        return Response.json(body);
      }
      if (url.endsWith("/x402/settle") && response.ok) {
        const request = JSON.parse(String(init?.body)) as { paymentPayload: { accepted: { network: string } } };
        const network = request.paymentPayload.accepted.network;
        return Response.json({ ...await response.json() as object, network });
      }
      return response;
    });
    const url = "https://scvd.store/api/buy/hello";
    const quote = await app.request(url, {}, enabled);
    expect(quote.status).toBe(402);
    const requirements = decodePaymentRequired(quote);
    expect(requirements.accepts.map(offer => offer.network)).toEqual(acceptedNetworks(enabled));
    for (const network of ["eip155:42161", "eip155:480"]) {
      const offer = requirements.accepts.find(offer => offer.network === network)!;
      expect(offer).toBeDefined();
      const paid = await app.request(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(offer) } }, enabled);
      expect(paid.status).toBe(200);
      const receipt = JSON.parse(atob(paid.headers.get("PAYMENT-RESPONSE")!)) as { network: string };
      expect(receipt.network).toBe(network);
      const body = await paid.json() as { certificate: { network: string; cert_id: string } };
      expect(body.certificate.network).toBe(network);
      const html = await (await app.request(`https://scvd.store/api/verify/${body.certificate.cert_id}`, { headers: { Accept: "text/html" } }, enabled)).text();
      expect(html).toContain(network === "eip155:480" ? "https://worldscan.org/tx/" : "https://arbiscan.io/tx/");
      const rpc = async (meta?: Record<string, unknown>) => {
        const response = await app.request("https://scvd.store/mcp?item_id=hello&payment=tool-result", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "buy_hello", arguments: {}, ...(meta ? { _meta: meta } : {}) } }),
        }, enabled);
        const body = await response.json() as { error?: unknown; result: { isError?: boolean; structuredContent: { accepts?: typeof requirements.accepts; cert_id?: string }; _meta: Record<string, { network?: string }> } };
        expect(body.error).toBeUndefined();
        return body.result;
      };
      const mcpQuote = await rpc();
      const mcpOffer = mcpQuote.structuredContent.accepts!.find(entry => entry.network === network)!;
      expect(mcpOffer).toBeDefined();
      const meta = { "x402/payment": JSON.parse(atob(buildPaymentSignature(mcpOffer))), "x402/idempotency-key": `rail-test-${crypto.randomUUID()}` };
      const before = facilitator.settleCalls;
      const first = await rpc(meta);
      const replay = await rpc(meta);
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent.cert_id).toBeTruthy();
      expect(replay.structuredContent.cert_id).toBe(first.structuredContent.cert_id);
      expect(first._meta["x402/payment-response"]?.network).toBe(network);
      expect(replay._meta["x402/payment-response"]).toEqual(first._meta["x402/payment-response"]);
      expect(facilitator.settleCalls - before).toBe(1);

    }
  });
});


it("never routes a receipt from another or unknown chain to Base", () => {
  expect(settlementExplorer("eip155:137", "0xabc")).toBe("https://polygonscan.com/tx/0xabc");
  expect(settlementExplorer("solana", "abc")).toBe("https://solscan.io/tx/abc");
  expect(settlementExplorer("eip155:99999", "0xabc")).toBeNull();
  expect(settlementExplorer(undefined, "0xabc")).toBe("https://basescan.org/tx/0xabc");
});
