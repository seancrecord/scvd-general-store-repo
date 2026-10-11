import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getMenuItem } from "@/store";
import { EVIDENCE_PILOT } from "@/store/evidence-pilot";

const BASE = "https://scvd.store";
async function read(path: string, accept = "application/json") {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: accept } });
  expect(response.status).toBe(200);
  return response;
}

describe("larger work has an outcome and a path from the small checks", () => {
  it("keeps inexpensive starters before a separate larger-work section", async () => {
    const html = await (await read("/", "text/html")).text();
    expect(html).toContain('id="larger-work"');
    expect(html.indexOf('class="shelf-grid"')).toBeLessThan(html.indexOf('id="larger-work"'));
    for (const id of ["shopping-audit", "review-report", "custom-review"]) {
      expect(html).toContain(`/operators#${id}`);
    }
  });

  it("gives people and agents the same decision, deliverable, limits and terms", async () => {
    const json = await (await read("/operators")).json() as {
      offer_paths: { id: string; title: string; when: string; why: string; outcome: string; limits: string; price: string; price_amount?: number; currency?: string; free_first: { url: string }; next_step: { url: string; method: string } }[];
    };
    expect(json.offer_paths).toBeDefined();
    const html = await (await read("/operators", "text/html")).text();
    const markdown = await (await read("/operators", "text/markdown")).text();
    for (const offer of json.offer_paths) {
      for (const field of [offer.title, offer.when, offer.why, offer.outcome, offer.limits, offer.price]) {
        expect(field.length).toBeGreaterThan(0);
        expect(html).toContain(field);
        expect(markdown).toContain(field);
      }
      expect(offer.free_first.url).toMatch(/^https:\/\/scvd.store\//);
      expect(offer.next_step.method).toBe("GET");
    }
    const audit = json.offer_paths.find(o => o.id === "shopping-audit")!;
    expect(audit.price_amount).toBe(getMenuItem("aura_walk")!.price_usdc);
    expect(audit.currency).toBe("USDC");
    expect(audit.next_step.url).toBe(`${BASE}/menu/aura_walk`);
    const pilot = json.offer_paths.find(o => o.id === "review-report")!;
    expect(pilot.price_amount).toBe(EVIDENCE_PILOT.price_usd);
    expect(pilot.currency).toBe(EVIDENCE_PILOT.currency);
    expect(pilot.price).toContain("invoiced after delivery");
    const custom = json.offer_paths.find(o => o.id === "custom-review")!;
    expect(custom.price_amount).toBeUndefined();
    expect(custom.price).toContain("quote");
  });

  it("offers relevant next work across listing formats and the shared MCP catalog lookup", async () => {
    for (const path of ["/menu/spot_check", "/menu/spot_check?view=compact", "/api/catalog/v1?item_id=spot_check"]) {
      expect(await (await read(path)).text()).toContain("/operators#endpoint-watch");
    }
    for (const accept of ["text/html", "text/markdown"]) {
      expect(await (await read("/menu/service_audit", accept)).text()).toContain("/operators#shopping-audit");
    }
    const hello = await (await read("/menu/hello?view=compact")).text();
    expect(hello).not.toContain("/operators#");
    for (const path of ["/api/preflight/v3", "/llms.txt"]) {
      expect(await (await read(path)).text()).toContain("/operators#shopping-audit");
    }
  });
});
