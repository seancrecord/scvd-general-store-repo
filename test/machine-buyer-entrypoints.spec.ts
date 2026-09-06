import { COMPACT_CATALOG_BUDGET_BYTES, SINGLE_ITEM_TOOL_BUDGET_BYTES } from "@/store/reader-limits";
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { DEFAULT_PROTOCOL, LATEST_PROTOCOL } from "@/routes/mcp";
import { isRecord } from "@/types";
import { installFacilitatorMock, TEST_TRANSACTION } from "./helpers/facilitator-mock";
import { buildPaymentSignature, type ChallengeRequirement } from "./helpers/payment";

const BASE = "https://scvd.store";
const obj = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => { facilitator = installFacilitatorMock(); });

async function rpc(path: string, method: string, params: Record<string, unknown> = {}, modern = false) {
  const response = await SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(modern ? {
      "MCP-Protocol-Version": LATEST_PROTOCOL, "Mcp-Method": method,
      ...(typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
    } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {
      ...params, ...(modern ? { _meta: {
        "io.modelcontextprotocol/protocolVersion": LATEST_PROTOCOL,
        "io.modelcontextprotocol/clientInfo": { name: "buyer-contract-spec", version: "1" },
        "io.modelcontextprotocol/clientCapabilities": {}, ...obj(params._meta),
      } } : {}),
    } }),
  });
  return { status: response.status, body: obj(await response.json()) };
}

describe("all MCP readers get the revision they speak", () => {
  for (const path of ["/mcp", "/mcp/verifier", "/mcp/docs", "/mcp.md"]) {
    it(`${path} supports modern discovery/list and preserves legacy negotiation`, async () => {
      const discovered = obj((await rpc(path, "server/discover", {}, true)).body.result);
      const listed = obj((await rpc(path, "tools/list", {}, true)).body.result);
      expect(discovered.resultType).toBe("complete");
      expect(discovered.supportedVersions).toContain(LATEST_PROTOCOL);
      expect(listed.resultType).toBe("complete");
      expect(listed.cacheScope).toBe("public");
      expect(listed.ttlMs).toBeGreaterThan(0);
      expect(obj(obj(listed._meta)["io.modelcontextprotocol/serverInfo"]).name).toBeTruthy();
      const legacy = obj((await rpc(path, "initialize", { protocolVersion: LATEST_PROTOCOL })).body.result);
      expect(legacy.protocolVersion).toBe(DEFAULT_PROTOCOL);
      expect(legacy.resultType).toBeUndefined();
    });
  }
});

describe("a standard x402 MCP reader can see the quote without interpreting prose", () => {
  it("describes the selected payment profile consistently", async () => {
    const result = obj((await rpc("/mcp?payment=tool-result", "tools/list")).body.result);
    expect(JSON.stringify(result)).not.toContain("error.data");
  });

  it("offers an explicit standard profile while preserving the old RPC error", async () => {
    const params = { name: "buy_simple", arguments: { item_id: "small_blessing" } };
    const legacy = (await rpc("/mcp", "tools/call", params)).body;
    expect(obj(legacy.error).code).toBe(402);
    const standard = (await rpc("/mcp?payment=tool-result", "tools/call", params)).body;
    expect(standard.error).toBeUndefined();
    const result = obj(standard.result);
    expect(result.isError).toBe(true);
    const challenge = obj(result.structuredContent);
    expect(challenge.x402Version).toBe(2);
    expect(Array.isArray(challenge.accepts)).toBe(true);
    const text = obj((result.content as unknown[])[0]).text;
    expect(JSON.parse(String(text))).toEqual(challenge);
    expect(facilitator.settleCalls).toBe(0);
  });

  it("returns the actual settlement receipt and replays goods without charging twice", async () => {
    const path = "/mcp?view=compact&item_id=small_blessing&payment=tool-result";
    const params = { name: "buy_small_blessing", arguments: {} };
    const quote = obj((await rpc(path, "tools/call", params)).body.result);
    const accepted = (obj(quote.structuredContent).accepts as ChallengeRequirement[])[0]!;
    const key = `buyer-contract-${crypto.randomUUID()}`;
    const paid = () => rpc(path, "tools/call", { ...params, _meta: {
      "x402/payment": JSON.parse(atob(buildPaymentSignature(accepted))),
      "x402/idempotency-key": key,
    } }, true);
    const before = facilitator.settleCalls;
    const first = obj((await paid()).body.result);
    const replay = obj((await paid()).body.result);
    const receipt = obj(obj(first._meta)["x402/payment-response"]);
    expect(receipt.success).toBe(true);
    expect(receipt.transaction).toBe(TEST_TRANSACTION);
    expect(receipt.network).toBe(accepted.network);
    expect(obj(replay.structuredContent).cert_id).toBe(obj(first.structuredContent).cert_id);
    expect(obj(first.structuredContent).cert_id).toBeTruthy();
    expect(obj(replay._meta)["x402/payment-response"]).toEqual(receipt);
    expect(JSON.stringify(first)).not.toContain("scvd_cached_payment_response");
    expect(facilitator.settleCalls - before).toBe(1);
  });

  it("marks failed settlement as an error rather than successful goods", async () => {
    const path = "/mcp?item_id=small_blessing&payment=tool-result";
    const params = { name: "buy_small_blessing", arguments: {} };
    const quote = obj((await rpc(path, "tools/call", params)).body.result);
    const accepted = (obj(quote.structuredContent).accepts as ChallengeRequirement[])[0]!;
    facilitator.settleShouldFail = true;
    try {
      const result = obj((await rpc(path, "tools/call", { ...params, _meta: {
        "x402/payment": buildPaymentSignature(accepted),
      } })).body.result);
      expect(result.isError).toBe(true);
      expect(obj(result.structuredContent)).toMatchObject({
        code: "payment_declined", charged: false, payment_state: "not_settled",
      });
      expect(obj(obj(result.structuredContent).payment_declined).reason).toBeTruthy();
      expect(obj(result.structuredContent).accepts).toBeUndefined();
      expect(obj(result._meta)["x402/payment-required"]).toBeUndefined();
      expect(JSON.parse(String(obj((result.content as unknown[])[0]).text))).toEqual(result.structuredContent);
      expect(obj(result.structuredContent).cert_id).toBeUndefined();
      expect(obj(result._meta)["x402/payment-response"]).toBeUndefined();
    } finally {
      facilitator.settleShouldFail = false;
    }
  });

  it("keeps malformed and declined payments in the standard quote envelope", async () => {
    const path = "/mcp?payment=tool-result";
    const params = { name: "buy_simple", arguments: { item_id: "small_blessing" } };
    const before = { verify: facilitator.verifyCalls, settle: facilitator.settleCalls };
    const malformed = obj((await rpc(path, "tools/call", { ...params, _meta: {
      "x402/payment": "not-base64-payment",
    } })).body.result);
    expect(malformed.isError).toBe(true);
    expect(obj(malformed.structuredContent).x402Version).toBe(2);
    expect(facilitator.verifyCalls).toBe(before.verify);
    const accepted = (obj(malformed.structuredContent).accepts as ChallengeRequirement[])[0]!;
    facilitator.verifyShouldFail = true;
    try {
      const refused = obj((await rpc(path, "tools/call", { ...params, _meta: {
        "x402/payment": buildPaymentSignature(accepted),
      } })).body.result);
      expect(refused.isError).toBe(true);
      expect(obj(refused.structuredContent).x402Version).toBe(2);
      expect(JSON.parse(String(obj((refused.content as unknown[])[0]).text))).toEqual(refused.structuredContent);
      expect(facilitator.settleCalls).toBe(before.settle);
    } finally {
      facilitator.verifyShouldFail = false;
    }
  });
});

describe("repair and discovery do not depend on reading prose", () => {
  it("names missing inputs and their location on both paid doors before verification", async () => {
    const before = facilitator.verifyCalls;
    const http = await SELF.fetch(`${BASE}/api/buy/settlement_attestation`, {
      headers: { "PAYMENT-SIGNATURE": "present-but-not-a-payment" },
    });
    expect(http.status).toBe(400);
    const httpBody = obj(await http.json());
    const mcp = obj(obj((await rpc("/mcp", "tools/call", {
      name: "buy_observation", arguments: { item_id: "settlement_attestation" },
    })).body.error).data);
    for (const [data, location] of [[httpBody, "query"], [mcp, "arguments"]] as const) {
      expect(data.charged).toBe(false);
      expect(data.required_params).toEqual(["tx_hash"]);
      expect(data.issues).toEqual([{ field: "tx_hash", code: "required", location }]);
      expect(String(data.input_contract_url)).toContain("?view=compact");
    }
    expect(facilitator.verifyCalls).toBe(before);
  });

  it("links to bounded discovery from text, manifest and task atlas", async () => {
    const guide = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(guide).toContain("/menu.json?view=compact");
    const manifest = obj(await (await SELF.fetch(`${BASE}/.well-known/mcp.json`)).json());
    expect(manifest.compact_catalog_url).toBe(`${BASE}/menu.json?view=compact`);
    expect(JSON.stringify(manifest.payment_profiles)).toContain("payment=tool-result");
    const atlas = obj(await (await SELF.fetch(`${BASE}/atlas.json`)).json());
    const paid = obj(atlas.doors).paid as Record<string, unknown>[];
    expect(paid.length).toBe(MENU_ITEMS.length);
    expect(paid.every(row => typeof row.input_contract_url === "string")).toBe(true);
  });
});

describe("a bounded catalog leads to a single-item tool with ordinary required fields", () => {
  it("keeps every one-item contract and tool bounded and isolates the selected item", async () => {
    for (const item of MENU_ITEMS) {
      const response = await SELF.fetch(`${BASE}/menu/${item.id}?view=compact`);
      const text = await response.text();
      expect(text.length, item.id).toBeLessThan(COMPACT_CATALOG_BUDGET_BYTES);
      const contract = obj(JSON.parse(text));
      const path = String(contract.mcp_url).replace(BASE, "");
      const listed = obj((await rpc(path, "tools/list")).body.result);
      const tools = listed.tools as Record<string, unknown>[];
      expect(tools).toHaveLength(1);
      expect(obj(tools[0]!.inputSchema).required ?? [], item.id).toEqual(buyInputSchema(item).required ?? []);
      expect(new TextEncoder().encode(JSON.stringify(listed)).length, item.id).toBeLessThan(SINGLE_ITEM_TOOL_BUDGET_BYTES);
      const wrong = await rpc(path, "tools/call", { name: "buy_simple", arguments: { item_id: "small_blessing" } });
      expect(obj(obj(wrong.body.error).data).code).toBe("unknown_tool");
    }
    for (const page of ["-1", "not-a-page", "999999", "0.5"]) {
      expect((await SELF.fetch(`${BASE}/menu.json?view=compact&page=${page}`)).status).toBe(400);
    }
  });

  it("pages the entire shelf without dropping items or repeating their full specs", async () => {
    let url: string | null = `${BASE}/menu.json?view=compact`;
    const seen: string[] = [];
    while (url) {
      const response = await SELF.fetch(url);
      const text = await response.text();
      expect(new TextEncoder().encode(text).length).toBeLessThan(COMPACT_CATALOG_BUDGET_BYTES);
      const page = obj(JSON.parse(text));
      expect(page.total).toBe(MENU_ITEMS.length);
      const items = page.items as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(8);
      for (const row of items) {
        const item = MENU_ITEMS.find(item => item.id === row.id)!;
        expect(row.required_params).toEqual(buyInputSchema(item).required ?? []);
        expect(row.cadence).toBe(item.cadence);
        expect(row.term_days).toBe(item.term_days);
        expect(row.pricing).toBe(item.pricing);
        expect(row.spec).toBeUndefined();
        expect(typeof row.mcp_url).toBe("string");
        seen.push(String(row.id));
      }
      expect(seen.length).toBeLessThanOrEqual(MENU_ITEMS.length);
      url = typeof page.next === "string" ? page.next : null;
    }
    expect(seen).toEqual(MENU_ITEMS.map(item => item.id));
  });

  it("a selected item exposes one buy tool with tx_hash required, not a shelf conditional", async () => {
    const listing = await SELF.fetch(`${BASE}/menu/settlement_attestation?view=compact`);
    const contract = obj(await listing.json());
    expect(contract.required_params).toEqual(["tx_hash"]);
    const listed = obj((await rpc(String(contract.mcp_url).replace(BASE, ""), "tools/list")).body.result);
    const tools = listed.tools as Record<string, unknown>[];
    expect(tools).toHaveLength(1);
    expect(obj(tools[0]!.inputSchema).required).toContain("tx_hash");
    expect(obj(tools[0]!.inputSchema).allOf).toBeUndefined();
    expect(new TextEncoder().encode(JSON.stringify(listed)).length).toBeLessThan(SINGLE_ITEM_TOOL_BUDGET_BYTES);
  });

  it("read_docs can return one compact item and refuses an unknown item", async () => {
    const result = obj((await rpc("/mcp/docs", "tools/call", { name: "read_docs", arguments: {
      name: "catalog", item_id: "settlement_attestation", view: "compact",
    } })).body.result);
    const contract = obj(result.structuredContent);
    expect(contract.id).toBe("settlement_attestation");
    expect(contract.required_params).toEqual(["tx_hash"]);
    const refused = await rpc("/mcp/docs", "tools/call", { name: "read_docs", arguments: {
      name: "catalog", item_id: "invented-item", view: "compact",
    } });
    expect(obj(refused.body.error).code).toBe(-32602);
  });
});


it("distinguishes the evidence network from the payment network", async () => {
  const response = await SELF.fetch(`${BASE}/menu/the_statement?view=compact`);
  const body = obj(await response.json());
  const checkout = obj(body.checkout);
  expect(checkout.payment_network_source).toBe("PAYMENT-REQUIRED.accepts[].network");
  expect(checkout.input_network_note).toContain("does not select the payment network");
});
