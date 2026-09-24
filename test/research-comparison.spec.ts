import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { mcpToolCatalog, purchaseTool } from "@/lib/mcp-tools";
import { comparisonUrls } from "@/lib/research-comparison-terms";
import { buyerGuidance } from "@/lib/buyer-guidance";
import { buyInputExample } from "@/lib/bazaar-discovery";
import { purchaseInputFrom, queryArgs, toolArgs } from "@/lib/purchase-args";

it("lets a buyer discover and supply a set of research endpoints", () => {
  const item = MENU_ITEMS.find(row => row.id === "research_comparison");
  expect(item, "the comparison must be purchasable").toBeDefined();
  expect(buyInputSchema(item!).required).toContain("urls");
  expect(mcpToolCatalog("https://scvd.store").some(tool => tool.itemIds?.includes(item!.id))).toBe(true);
});

it("carries the same URL set through HTTP and MCP and describes the free live call correctly", () => {
  const item = MENU_ITEMS.find(row => row.id === "research_comparison")!;
  const example = buyInputExample(item);
  const viaMcp = purchaseInputFrom(item, toolArgs(example));
  const viaHttp = purchaseInputFrom(item, queryArgs(name => typeof example[name] === "string" ? example[name] as string : undefined));
  expect(viaMcp.comparisonUrls).toBe(example.urls);
  expect(viaHttp).toEqual(viaMcp);
  const examples = purchaseTool(item, "https://scvd.store").inputSchema.examples as Record<string, unknown>[];
  expect(comparisonUrls(examples[0]?.urls, "https://scvd.store")).toHaveLength(2);
  const guide = buyerGuidance(item, "https://scvd.store");
  expect(guide.free_alternative).toMatchObject({ method: "POST", url: "https://scvd.store/api/look/v1", body_template: { url: "{endpoint_url}" } });
  expect(guide.freshness).toBeUndefined();
  expect(guide.evidence.signs).toContain("observation.signed_payload");
});

it("is reachable through catalog search, its product page, OpenAPI and x402 discovery", async () => {
  const base = "https://scvd.store";
  for (const path of ["/api/catalog/v1?q=research", "/menu/research_comparison", "/openapi.json", "/.well-known/x402.json", "/llms-full.txt"]) {
    const response = await SELF.fetch(base + path);
    expect(response.status, path).toBe(200);
    expect(await response.text(), path).toContain("research_comparison");
  }
});
