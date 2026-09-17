import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { expect, it } from "vitest";
import { app } from "@/index";
import type { Env } from "@/types";
import { storeGuideText } from "@/routes/llms";
import { COMPACT_CATALOG_BUDGET_BYTES } from "@/store/reader-limits";
import { compactItemContract } from "@/lib/buyer-contract";
import { getMenuItem } from "@/store";
// Discovery documents have heterogeneous JSON schema fields; test-only any lets assertions inspect their wire shape.
const bindings = { ...env, MPP_CHECKOUT_ENABLED: "true", MPP_CHALLENGE_KEY: "test-only-key" } as unknown as Env;
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
