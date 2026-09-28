import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getMenuItem } from "@/store/menu";
import { askedForTitle } from "@/store/copy/asked-for";
import { buyerLinks } from "@/lib/buyer-contract";

const BASE = "https://scvd.store";

describe("item answers survive content negotiation", () => {
  for (const id of ["service_audit", "settlement_attestation", "conformance_watch", "research_comparison"]) {
    it(`${id} gives markdown and JSON readers the same evidence contract as HTML`, async () => {
      const item = getMenuItem(id)!;
      const menu = await (await SELF.fetch(`${BASE}/menu.json`)).json() as {
        items: { id: string; at_a_glance: Record<string, string> }[];
      };
      const glance = menu.items.find((entry) => entry.id === id)!.at_a_glance;
      const markdown = await (await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: "text/markdown" } })).text();
      const json = await (await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: "application/json" } })).json() as { at_a_glance: Record<string, string> };
      expect.soft(json.at_a_glance).toEqual(glance);
      for (const value of Object.values(glance)) expect.soft(markdown).toContain(value);
      const noun = askedForTitle(id);
      if (noun) expect.soft(markdown).toContain(noun);
      expect.soft(markdown).toContain(buyerLinks(item, BASE).input_contract_url);
      expect.soft(markdown).toContain(buyerLinks(item, BASE).buy_url_template);
      expect.soft(markdown.indexOf("## At a glance")).toBeGreaterThan(0);
      expect.soft(markdown.indexOf("## At a glance")).toBeLessThan(markdown.indexOf(item.description));
      const html = await (await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: "text/html" } })).text();
      expect.soft(html.indexOf("<h2>At a glance</h2>")).toBeLessThan(html.indexOf('<p class="menu-desc">'));
    });
  }
});
