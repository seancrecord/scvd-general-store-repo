import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { RETIRED_ITEMS } from "@/store/retired";
import { searchCatalog } from "@/routes/catalog";
import { findMcpTool } from "@/lib/mcp-tools";
import { doors } from "@/lib/doors-app";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => { facilitator = installFacilitatorMock(); });

function object(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

async function rpc(path: string, name: string, args: Record<string, unknown>) {
  const response = await SELF.fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  return object(await response.json());
}

/** Follow only the returned recipe. Never carry a failed purchase's payment into it. */
async function follow(body: Record<string, unknown>, expectedItem?: string) {
  expect(body.charged).toBe(false);
  expect(body.retry_same_request).toBe(false);
  const step = object(body.next_step);
  expect(step.method).toBe("GET");
  expect(step.payment_required).toBe(false);
  const url = new URL(String(step.url));
  expect(url.origin).toBe(BASE);
  expect(url.pathname).not.toContain("/api/buy/");
  const before = [facilitator.verifyCalls, facilitator.settleCalls];
  const response = await SELF.fetch(url.toString(), { method: String(step.method) });
  expect(response.status).toBe(200);
  const listing = object(await response.json());
  if (expectedItem) expect(listing.id).toBe(expectedItem);
  else expect(Array.isArray(listing.items)).toBe(true);

  const mcp = object(step.mcp);
  const endpoint = new URL(String(mcp.url));
  expect(endpoint.origin).toBe(BASE);
  // The recipe must escape an invalid item-scoped MCP connection.
  expect(endpoint.searchParams.has("item_id")).toBe(false);
  const read = await rpc(endpoint.pathname + endpoint.search, String(mcp.tool), object(mcp.arguments));
  expect(read.error).toBeUndefined();
  const result = object(object(read.result).structuredContent);
  expect(result.matched).toBeGreaterThan(0);
  if (expectedItem) expect(object((result.items as unknown[])[0]).id).toBe(expectedItem);
  expect([facilitator.verifyCalls, facilitator.settleCalls]).toEqual(before);
}

describe("a rejected item lookup leads to a free, usable read", () => {
  it("publishes the repair fields and the catalog tool's unknown-item refusal", async () => {
    const doc = object(await (await SELF.fetch(`${BASE}/openapi.json`)).json());
    const schema = object(object(object(doc.components).schemas).Problem);
    const properties = object(schema.properties);
    expect(properties.retry_same_request).toBeDefined();
    expect(properties.next_step).toBeDefined();
    const errors = findMcpTool("find_in_catalog", BASE)!.errors;
    expect(errors?.some(error => error.code === "unknown_item")).toBe(true);
  });
  it.each(["/api/buy/no_such_item", "/menu/no_such_item", "/api/catalog/v1?item_id=no_such_item"])("recovers from %s without repeating the failed request", async path => {
    const before = [facilitator.verifyCalls, facilitator.settleCalls];
    const response = await SELF.fetch(`${BASE}${path}`, { headers: { "PAYMENT-SIGNATURE": "not-a-payment" } });
    expect(response.status).toBe(404);
    const body = object(await response.json());
    expect(body.code).toBe("unknown_item");
    await follow(body);
    expect([facilitator.verifyCalls, facilitator.settleCalls]).toEqual(before);
  });

  it("the small doors Worker returns the same repair without handing an unpaid lookup over", async () => {
    const environment = { ...env, STORE: { fetch: () => { throw new Error("unexpected handover"); } } } as unknown as Env;
    const response = await doors.fetch(new Request(`${BASE}/api/buy/no_such_item`), environment);
    expect(response.status).toBe(404);
    await follow(object(await response.json()));
  });

  it("every retirement points to a live successor contract, or the current catalog", async () => {
    for (const retired of RETIRED_ITEMS) {
      const successor = MENU_ITEMS.find(item => item.id === retired.folded_into);
      for (const prefix of ["/api/buy/", "/menu/"]) {
        const response = await SELF.fetch(`${BASE}${prefix}${retired.id}`);
        expect(response.status).toBe(410);
        const body = object(await response.json());
        expect(body.code).toBe("retired");
        await follow(body, successor?.id);
      }
    }
  });

  it.each(["/mcp", "/mcp?payment=tool-result"])("preserves catalog refusal data at %s", async path => {
    for (const [args, input] of [
      [{ item_id: "no_such_item" }, { itemId: "no_such_item" }],
      [{ max_price_usdc: -1 }, { maxPriceUsdc: -1 }],
    ] as const) {
      const message = await rpc(path, "find_in_catalog", args);
      const data = object(object(message.error).data);
      expect(data).toEqual(searchCatalog(BASE, input).body);
      await follow(data);
    }
  });

  it("escapes an unknown item-scoped MCP connection", async () => {
    const message = await rpc("/mcp?item_id=no_such_item&view=compact", "buy_simple", { item_id: "no_such_item" });
    await follow(object(object(message.error).data));
  });

  it("points a wrong-shelf buyer to the existing item's free contract", async () => {
    const message = await rpc("/mcp", "buy_simple", { item_id: "spot_check", summary: "private input" });
    const data = object(object(message.error).data);
    expect(data.code).toBe("wrong_shelf");
    expect(JSON.stringify(data.next_step)).not.toContain("private input");
    await follow(data, "spot_check");
  });

  it("retired and unknown MCP purchase ids carry a walkable repair", async () => {
    for (const id of ["no_such_item", "phantom_check"]) {
      const message = await rpc("/mcp", "buy_simple", { item_id: id });
      await follow(object(object(message.error).data), id === "phantom_check" ? "context_anchor" : undefined);
    }
  });

  it("input refusals point to their contract without copying buyer input or payment", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation?agent_name=private-name`, { headers: { "PAYMENT-SIGNATURE": "private-payment" } });
    expect(response.status).toBe(400);
    const body = object(await response.json());
    expect(body.issues).toEqual([{ field: "tx_hash", code: "required", location: "query" }]);
    expect(JSON.stringify(body.next_step)).not.toMatch(/private-name|private-payment/);
    await follow(body, "settlement_attestation");
    const message = await rpc("/mcp", "buy_observation", { item_id: "settlement_attestation" });
    await follow(object(object(message.error).data), "settlement_attestation");
  });
});
