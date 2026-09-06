import { searchCatalog } from "@/routes/catalog";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { webmcpScript, webmcpPurchaseTools } from "@/routes/webmcp";

describe("WebMCP exposes an explicit quote and signed-payment retry", () => {
  it("registers compact purchase tools with a consequential payment annotation", () => {
    const source = webmcpScript();
    for (const tool of webmcpPurchaseTools()) expect(tool.description.length).toBeLessThan(500);
    expect(source).toContain('"name": "quote_store_purchase"');
    expect(source).toContain('"name": "complete_store_purchase"');
    expect(source).toContain('"consequentialHint": true');
    expect(source).toContain('"signed_payment"');
    expect(source).toContain('"quote_id"');
  });
  it("serves the same payment module tested in Node", async () => {
    const response = await SELF.fetch("https://scvd.store/webmcp-purchase.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("javascript");
    expect(await response.text()).toContain("export function createPurchaseBridge");
  });
  it("describes the quote handoff and delivery before a browser agent calls", () => {
    const tools: Array<{ name: string; outputSchema?: { type: string; properties: Record<string, unknown> } }> = webmcpPurchaseTools();
    const quote = tools.find(tool => tool.name === "quote_store_purchase")?.outputSchema;
    const complete = tools.find(tool => tool.name === "complete_store_purchase")?.outputSchema;
    expect(quote).toMatchObject({ type: "object", properties: {
      quote_id: { type: "string" }, payment_required: { type: "object" },
      idempotency_key: { type: "string" }, payment_sent: { const: false },
    } });
    expect(complete).toMatchObject({ type: "object", properties: {
      status: { type: "integer" }, body: {}, payment_response: {},
      idempotency_key: { type: "string" }, error: { type: "string" },
    } });
  });
});


it("the browser's item lookup returns the inputs needed before quoting", () => {
  const found = searchCatalog("https://scvd.store", { itemId: "service_audit" });
  const row = (found.body as { items: Record<string, unknown>[] }).items[0]!;
  expect(row.required_params).toContain("url");
  expect(row.input_schema).toBeDefined();
  expect(row.buy_url).toBe("https://scvd.store/api/buy/service_audit");
});
