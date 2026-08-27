import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { priceLine } from "@/services/menu-markdown";
import { escapeHtml } from "@/lib/sanitize";

const BASE = "https://scvd.store";

/**
 * GET /menu — THE SHELF INDEX, and the parent the item pages never had.
 *
 * The till work gave every item a real HTML page, which left ~25
 * browsable product pages with no browsable index above them: a
 * person on /menu/hello had nothing to climb back to, and /menu — a
 * URL people guess — answered 404. The keeper voted for an index page
 * over the absence, and this file holds what that page promises:
 * derived from the shelf, one link per item, and honest about where
 * the till actually is.
 */

async function indexHtml(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/menu`, {
    headers: { Accept: "text/html" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/html");
  return response.text();
}

describe("the shelf index", () => {
  it("lists every item on the menu, priced from the menu", async () => {
    /*
     * DERIVED, BOTH FACTS. The link set is compared against MENU_ITEMS
     * and the price text against the same priceLine the markdown
     * dialect renders — so an item added tomorrow is on this page
     * tomorrow, and a price cannot read differently here than it does
     * one surface over.
     */
    const html = await indexHtml();
    expect(MENU_ITEMS.length).toBeGreaterThan(10);
    for (const item of MENU_ITEMS) {
      expect(html, item.id).toContain(`href="/menu/${item.id}"`);
      expect(html, item.id).toContain(escapeHtml(item.name));
      expect(html, item.id).toContain(escapeHtml(priceLine(item)));
    }
  });

  it("carries no till of its own, and says where the till is", async () => {
    /*
     * THE RULE 53 POSITION, HELD RATHER THAN IMPLIED. The index links;
     * the item pages sell. Twenty-five pay-buttons with their input
     * fields on one page is a wall, not a till — so the island the
     * till mounts from must NOT appear here, and the page must say in
     * prose that each item's page carries one. If somebody later
     * decides the index should sell directly, this test is where that
     * decision surfaces for review instead of sliding in.
     */
    const html = await indexHtml();
    expect(html).not.toContain("scvd-till-shelf");
    expect(html).not.toContain("/till.js");
    expect(html.toLowerCase()).toContain("till");
  });

  it("redirects a machine caller to the catalog instead of duplicating it", async () => {
    /*
     * /menu.json is the machine shape and there is exactly one of it.
     * A bare fetch here gets a 301 to the real catalog — the same
     * treatment conventional.ts gives every other guessed URL — never
     * a second copy of the JSON to keep honest.
     */
    const response = await SELF.fetch(`${BASE}/menu`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`${BASE}/menu.json`);
  });

  it("treats the trailing slash as the same door", async () => {
    const response = await SELF.fetch(`${BASE}/menu/`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('href="/menu/hello"');
  });

  it("declares itself canonically and sits in the sitemap above its children", async () => {
    const html = await indexHtml();
    expect(html).toContain(`<link rel="canonical" href="${BASE}/menu">`);

    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(xml).toContain(`<loc>${BASE}/menu</loc>`);
    // Still beside, not instead of, the item pages.
    expect(xml).toContain(`<loc>${BASE}/menu/hello</loc>`);
  });

  it("keeps the item pages themselves untouched", async () => {
    // The index is a new door, not a rearrangement: /menu/:id still
    // negotiates exactly as the till work left it.
    const response = await SELF.fetch(`${BASE}/menu/hello`);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["id"]).toBe("hello");
  });
});
