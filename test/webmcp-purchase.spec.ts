import { searchCatalog } from "@/routes/catalog";
import purchaseSource from "../webmcp/purchase.js";
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
    // The native lane (2026-09-18): the quote carries the challenge, the
    // completion takes the credential, and the receipt comes back.
    expect(source).toContain('"payment_challenge"');
    expect(source).toContain('"signed_credential"');
    expect(source).toContain('"payment_receipt"');
  });
  it("serves the same payment module tested in Node, byte for byte", async () => {
    // Until 2026-09-19 this checked that one line was present; the till's
    // guard (test/browser-till.spec.ts) compares the bytes, and the module
    // carrying buyer payment decisions deserves no weaker a check.
    const response = await SELF.fetch("https://scvd.store/webmcp-purchase.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("javascript");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe(purchaseSource);
  });
  it("describes the quote handoff and delivery before a browser agent calls", () => {
    const tools: Array<{ name: string; outputSchema?: { type: string; properties: Record<string, unknown> } }> = webmcpPurchaseTools();
    const quote = tools.find(tool => tool.name === "quote_store_purchase")?.outputSchema;
    const complete = tools.find(tool => tool.name === "complete_store_purchase")?.outputSchema;
    expect(quote).toMatchObject({ type: "object", properties: {
      quote_id: { type: "string" }, payment_required: { type: "object" },
      idempotency_key: { type: "string" }, payment_sent: { const: false },
    } });
    expect(quote?.properties.payment_challenge).toMatchObject({ type: ["object", "null"], properties: { header: { type: "string" }, id: { type: "string" }, request: { type: "object" } } });
    expect(complete).toMatchObject({ type: "object", properties: {
      status: { type: "integer" }, body: {}, payment_response: {}, payment_receipt: { type: ["string", "null"] },
      purchase_recovery: { type: ["string", "null"] },
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
