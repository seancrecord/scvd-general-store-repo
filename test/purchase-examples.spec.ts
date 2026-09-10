import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store/menu";
import { buyInputExample } from "@/lib/bazaar-discovery";

it("every product offers a reachable preview of the stated kind", async () => {
  for (const item of MENU_ITEMS) {
    expect(item.sample_url, item.id).toBeTruthy();
    const response = await SELF.fetch(`https://scvd.store${item.sample_url}`);
    expect(response.status, item.id).toBe(200);
    if (item.sample_kind === "delivery_outline") {
      const body = await response.json() as { of_item: string; preview_kind: string; sample: { full_artifact_provided: boolean; request: { arguments: unknown }; response_outline: { status?: string; signature: string } } };
      expect(body.of_item).toBe(item.id);
      expect(body.preview_kind).toBe("delivery_outline");
      expect(body.sample.full_artifact_provided).toBe(false);
      expect(body.sample.request.arguments).toEqual(buyInputExample(item));
      expect(body.sample.response_outline.signature).not.toMatch(/^[0-9a-f]{128}$/);
      if (item.fulfillment === "human_queue") expect(body.sample.response_outline.status).toBe("queued");
    }
  }
});

it("the rack and item pages distinguish outlines from full specimens", async () => {
  const rack = await (await SELF.fetch("https://scvd.store/samples")).json() as { previews: { item: string; kind: string }[] };
  const menu = await (await SELF.fetch("https://scvd.store/menu.json")).json() as { items: { id: string; sample_kind: string }[] };
  for (const item of MENU_ITEMS) expect(menu.items.find(row => row.id === item.id)?.sample_kind).toBe(item.sample_kind ?? "unsigned_specimen");
  expect(rack.previews.map(row => row.item).sort()).toEqual(MENU_ITEMS.map(item => item.id).sort());
  const html = await (await SELF.fetch("https://scvd.store/menu/hello", { headers: { Accept: "text/html" } })).text();
  expect(html).toContain("Input/output example");
  expect(html).toContain("full_artifact_provided");
});
