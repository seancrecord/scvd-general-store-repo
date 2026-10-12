import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const METHODS = new Set(["get", "put", "post", "delete", "patch", "head", "options", "trace"]);
type Operation = { tags?: string[]; operationId: string };
type Document = {
  tags?: { name: string; description: string }[];
  paths: Record<string, Record<string, Operation>>;
};
async function contract(): Promise<Document> {
  return (await SELF.fetch("https://scvd.store/openapi.json")).json();
}

describe("OpenAPI navigation by caller task", () => {
  it("groups every operation under a declared, described tag", async () => {
    const doc = await contract();
    expect(doc.tags?.length).toBeGreaterThan(1);
    const declared = new Set(doc.tags!.map(tag => tag.name));
    for (const tag of doc.tags!) expect(tag.description.length).toBeGreaterThan(10);
    const used = new Set<string>();
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (!METHODS.has(method)) continue;
        expect(op.tags?.length, `${method} ${path}`).toBe(1);
        for (const tag of op.tags!) {
          expect(declared.has(tag), `${path}: undeclared ${tag}`).toBe(true);
          used.add(tag);
        }
      }
    }
    expect(used).toEqual(declared);
  });

  it("separates buying, checking, delivery recovery and public evidence", async () => {
    const { paths } = await contract();
    for (const [path, method, tag] of [
      ["/api/buy/hello", "get", "Purchases"],
      ["/api/preflight/v1", "post", "Verification"],
      ["/api/before-you-pay/v1", "post", "Verification"],
      ["/api/order/{order_id}", "get", "Orders and refunds"],
      ["/api/refund/{refund_id}", "get", "Orders and refunds"],
      ["/api/purchase-status/{purchase_id}", "get", "Orders and refunds"],
      ["/corpus.json", "get", "Evidence"],
      ["/api/catalog/v1", "get", "Catalog"],
      ["/api/trade/sandbox/check", "post", "Trade"],
      ["/.well-known/api-catalog", "get", "Discovery"],
      ["/rights", "get", "Store policies"],
    ]) expect(paths[path!]![method!]!.tags, path).toEqual([tag]);
  });
});
