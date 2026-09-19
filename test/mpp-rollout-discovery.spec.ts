import { publicationFamilyForPath } from "@/lib/payments";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { Challenge } from "mppx";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { app } from "@/index";
import type { Env } from "@/types";
import { storeGuideText } from "@/routes/llms";
import { COMPACT_CATALOG_BUDGET_BYTES } from "@/store/reader-limits";
import { compactItemContract } from "@/lib/buyer-contract";
import { getMenuItem, MENU_ITEMS } from "@/store";
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
  // The UCP row is the shelf's, carried once at the document root (x-scvd-ucp), never per operation;
  // the MCP and WebMCP rows are item-independent and ride once at the root too (2026-09-19).
  expect(operation['x-scvd-payment-capabilities']).toEqual(contract.payment_capabilities.filter((row: { protocol: string; transport: string }) => row.protocol !== "ucp" && row.transport === "http"));
  expect(doc['x-scvd-native-checkout']).toEqual({ mcp: page.native_mcp_checkout, webmcp: page.native_webmcp_checkout });
  expect(storeGuideText(bindings.STORE_BASE_URL, bindings)).toContain("Native MPP checkout: HTTP GET");
});
it("omits native claims when disabled or incomplete, and every shelf item carries one at its own minimum when enabled", () => {
  for (const config of [{ ...bindings, MPP_CHECKOUT_ENABLED: "false" }, { ...bindings, MPP_CHALLENGE_KEY: undefined }, { ...bindings, COUNTER_LEDGER: undefined }]) {
    const item = compactItemContract(getMenuItem("context_anchor")!, bindings.STORE_BASE_URL, config) as unknown as Record<string, any>;
    expect(item.payment_capabilities?.some((row: { protocol: string }) => row.protocol === "mpp") ?? false).toBe(false);
    expect(storeGuideText(bindings.STORE_BASE_URL, config)).not.toContain("Native MPP checkout: HTTP GET");
  }
  // THE WHOLE STORE (2026-09-18): another product, another minimum, the same lane.
  const other = compactItemContract(getMenuItem("trust_profile")!, bindings.STORE_BASE_URL, bindings) as unknown as Record<string, any>;
  const native = other.payment_capabilities?.find((row: { protocol: string }) => row.protocol === "mpp");
  expect(native).toMatchObject({ transport: "http", method: "GET", path: "/api/buy/trust_profile", network: "eip155:8453",
    amount_atomic: String(Math.round(getMenuItem("trust_profile")!.price_usdc * 1_000_000)) });
  expect(storeGuideText(bindings.STORE_BASE_URL, bindings)).toContain("every one of the");
});


afterEach(() => vi.restoreAllMocks());
it("directory metadata matches native HTTP challenges and every enabled shelf door without changing x402", async () => {
  installFacilitatorMock();
  const enabled = await request("/openapi.json");
  const disabled = await request("/openapi.json", { ...bindings, MPP_CHECKOUT_ENABLED: "false" });
  for (const id of ["context_anchor", "trust_profile"]) {
    const path = `/api/buy/${id}`;
    const ctx = createExecutionContext();
    const quote = await app.fetch(new Request(`https://scvd.store${path}`), bindings, ctx);
    await waitOnExecutionContext(ctx);
    expect(quote.status).toBe(402);
    const challenge = Challenge.deserialize(quote.headers.get("WWW-Authenticate")!);
    const info = enabled.paths[path].get['x-payment-info'];
    expect(info.protocols).toEqual([
      ...disabled.paths[path].get['x-payment-info'].protocols,
      { mpp: { method: challenge.method, intent: challenge.intent, currency: challenge.request.currency } },
    ]);
    const native = enabled.paths[path].get['x-scvd-payment-capabilities'].find((row: { protocol: string }) => row.protocol === "mpp");
    expect(native.asset.toLowerCase()).toBe(String(challenge.request.currency).toLowerCase());
    expect(native.amount_atomic).toBe(challenge.request.amount);
  }
  expect(storeGuideText(bindings.STORE_BASE_URL, bindings)).not.toContain("not a native MPP discovery declaration");
  const shelfPaths = new Set(MENU_ITEMS.map(item => `/api/buy/${item.id}`));
  for (const [path, methods] of Object.entries(enabled.paths) as Array<[string, Record<string, Record<string, any>>]>) {
    for (const [method, operation] of Object.entries(methods)) {
      const info = operation['x-payment-info'];
      const legacy = disabled.paths[path][method]['x-payment-info'];
      // A shelf door, or a publication door (native publications, 2026-09-19): the
      // template's braces stand for any page, the family matcher decides.
      const publicationDoor = publicationFamilyForPath(path.replace(/\{[a-z_]+\}/g, "x")) !== undefined;
      expect(info?.protocols?.some((row: Record<string, unknown>) => 'mpp' in row) ?? false, `${method} ${path}`).toBe(method === 'get' && (shelfPaths.has(path) || publicationDoor));
      // Every pre-existing price, input and x402 offer field remains equivalent.
      if (info) expect({ ...info, protocols: legacy.protocols }, `${method} ${path}`).toEqual(legacy);
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
    for (const item of MENU_ITEMS) {
      expect(doc.paths[`/api/buy/${item.id}`].get['x-payment-info'].protocols).toEqual([{ x402: {} }]);
    }
    for (const path of ["/almanac/{slug}", "/open-for-business/{week}"]) {
      expect(doc.paths[path].get['x-payment-info'].protocols, path).toEqual([{ x402: {} }]);
    }
  }
});
