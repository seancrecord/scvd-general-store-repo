import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { Challenge } from "mppx";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { app } from "@/index";
import type { Env } from "@/types";
import { storeGuideText } from "@/routes/llms";
import { COMPACT_CATALOG_BUDGET_BYTES } from "@/store/reader-limits";
import { compactItemContract } from "@/lib/buyer-contract";
import { getMenuItem } from "@/store";
// Discovery documents have heterogeneous JSON schema fields; test-only any lets assertions inspect their wire shape.
const bindings = { ...env, MPP_CHECKOUT_ENABLED: "true", MPP_CHALLENGE_KEY: "fixture-native-checkout-hmac-key-32bytes" } as unknown as Env;
async function request(path: string, config = bindings) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://scvd.store${path}`), config, ctx);
  await waitOnExecutionContext(ctx); return res.json() as Promise<Record<string, any>>;
}
it("advertises the enabled HTTP offer on its item and OpenAPI while preserving x402 discovery", async () => {
  const item = getMenuItem("context_anchor")!;
  const contract = compactItemContract(item, bindings.STORE_BASE_URL, bindings) as unknown as Record<string, any>;
  expect(new TextEncoder().encode(JSON.stringify(contract)).length).toBeLessThan(COMPACT_CATALOG_BUDGET_BYTES);
  expect(contract.payment_capabilities).toEqual(expect.arrayContaining([expect.objectContaining({ protocol: "mpp", transport: "http", network: "eip155:8453", currency: "USDC", amount_atomic: "1000000" })]));
  const menu = await request("/menu.json");
  expect(menu.items.find((row: { id: string }) => row.id === item.id).payment_capabilities).toEqual(contract.payment_capabilities);
  const page = await request("/menu.json?view=compact");
  expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThan(COMPACT_CATALOG_BUDGET_BYTES);
  const doc = await request("/openapi.json");
  const operation = doc.paths['/api/buy/context_anchor'].get;
  expect(operation['x-payment-info'].protocol).toBe("x402");
  expect(operation['x-scvd-payment-capabilities']).toEqual(contract.payment_capabilities);
  expect(storeGuideText(bindings.STORE_BASE_URL, bindings)).toContain("Native MPP checkout: HTTP GET");
});
it("omits native claims when disabled, incomplete or on another product", () => {
  for (const config of [{ ...bindings, MPP_CHECKOUT_ENABLED: "false" }, { ...bindings, MPP_CHALLENGE_KEY: undefined }, { ...bindings, COUNTER_LEDGER: undefined }]) {
    const item = compactItemContract(getMenuItem("context_anchor")!, bindings.STORE_BASE_URL, config) as unknown as Record<string, any>;
    expect(item.payment_capabilities?.some((row: { protocol: string }) => row.protocol === "mpp") ?? false).toBe(false);
    expect(storeGuideText(bindings.STORE_BASE_URL, config)).not.toContain("Native MPP checkout: HTTP GET");
  }
  const other = compactItemContract(getMenuItem("trust_profile")!, bindings.STORE_BASE_URL, bindings) as unknown as Record<string, any>;
  expect(other.payment_capabilities?.some((row: { protocol: string }) => row.protocol === "mpp") ?? false).toBe(false);
});


afterEach(() => vi.restoreAllMocks());
it("directory metadata matches the native HTTP challenge without changing the x402 contract", async () => {
  installFacilitatorMock();
  const ctx = createExecutionContext();
  const quote = await app.fetch(new Request("https://scvd.store/api/buy/context_anchor"), bindings, ctx);
  await waitOnExecutionContext(ctx);
  expect(quote.status).toBe(402);
  const challenge = Challenge.deserialize(quote.headers.get("WWW-Authenticate")!);
  const enabled = await request("/openapi.json");
  const disabled = await request("/openapi.json", { ...bindings, MPP_CHECKOUT_ENABLED: "false" });
  const info = enabled.paths['/api/buy/context_anchor'].get['x-payment-info'];
  const legacy = disabled.paths['/api/buy/context_anchor'].get['x-payment-info'];
  expect(info.protocols).toEqual([
    ...legacy.protocols,
    { mpp: { method: challenge.method, intent: challenge.intent, currency: challenge.request.currency } },
  ]);
  // Every pre-existing price, input and x402 offer field remains byte-for-byte equivalent.
  expect({ ...info, protocols: legacy.protocols }).toEqual(legacy);
  const native = enabled.paths['/api/buy/context_anchor'].get['x-scvd-payment-capabilities'].find((row: { protocol: string }) => row.protocol === "mpp");
  expect(native.asset.toLowerCase()).toBe(String(challenge.request.currency).toLowerCase());
  expect(native.amount_atomic).toBe(challenge.request.amount);
  expect(storeGuideText(bindings.STORE_BASE_URL, bindings)).not.toContain("not a native MPP discovery declaration");
  for (const [path, methods] of Object.entries(enabled.paths) as Array<[string, Record<string, Record<string, any>>]>) {
    for (const [method, operation] of Object.entries(methods)) {
      if (path === '/api/buy/context_anchor' && method === 'get') continue;
      expect(operation['x-payment-info']?.protocols?.some((row: Record<string, unknown>) => 'mpp' in row) ?? false, `${method} ${path}`).toBe(false);
    }
  }
});
it("directory metadata omits MPP when any checkout prerequisite is absent", async () => {
  for (const config of [
    { ...bindings, MPP_CHECKOUT_ENABLED: "false" },
    { ...bindings, MPP_CHALLENGE_KEY: undefined },
    { ...bindings, PAID_RECOVERIES: undefined },
    { ...bindings, COUNTER_LEDGER: undefined },
  ]) {
    const doc = await request("/openapi.json", config);
    expect(doc.paths['/api/buy/context_anchor'].get['x-payment-info'].protocols).toEqual([{ x402: {} }]);
  }
});
