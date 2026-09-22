import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { freshness } from "@/lib/freshness";

const BASE = "https://scvd.store";

/**
 * TWO THINGS AN AGENT REVIEW ASKED US NOT TO LOSE (2026-09-21).
 *
 * Both were filed as polish, and neither is a bug today. They are
 * here because "don't lose this in a refactor" is a request for a
 * test — a property nobody is checking is a property that survives
 * only as long as everyone happens to remember it.
 */

async function json(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  expect(response.status, path).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * "Keep the as_of / checked_at distinction in menu.json — 'serving a
 * page is not the same as having verified what is on it' is exactly
 * the kind of honesty agents need. Don't lose it in a refactor."
 *
 * The refactor that loses it does not delete a field. It notices two
 * timestamps that are nearly always within a day of each other and
 * collapses them into one, which reads as tidying and is in fact the
 * store starting to claim it checked today because it answered today.
 * So the assertion is that they remain two fields with two meanings,
 * and that the sentence explaining why is still served beside them.
 */
describe("the freshness block keeps its two timestamps apart", () => {
  it("serves as_of and checked_at as separate fields, with the reason", async () => {
    const menu = await json("/menu.json");

    expect(typeof menu["as_of"], "menu.json lost as_of").toBe("string");
    expect(typeof menu["checked_at"], "menu.json lost checked_at").toBe("string");

    // A date, and a moment. Collapsing them would make these one type.
    expect(menu["as_of"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(menu["checked_at"]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(menu["as_of"], "as_of became a copy of checked_at").not.toBe(menu["checked_at"]);
  });

  it("keeps the sentence that says why they differ", async () => {
    /*
     * The note is the honesty, not the fields. Two undocumented
     * timestamps are a puzzle; these two with this sentence are a
     * claim about what the store does and does not know.
     */
    const block = freshness();
    expect(block.note).toContain("serving a page is not the same as having verified");
    expect(block.note).toContain("as_of");
    expect(block.note).toContain("checked_at");
  });

  it("never lets as_of drift into the future of the response", async () => {
    /*
     * as_of is the newest date anything was checked BY HAND. A value
     * after checked_at would mean the catalog was verified after it
     * was served, which is the one reading the pair cannot have.
     */
    const menu = await json("/menu.json");
    expect(
      String(menu["as_of"]) <= String(menu["checked_at"]).slice(0, 10),
      "as_of is later than the response that carried it",
    ).toBe(true);
  });
});

/**
 * "Name drift: the homepage 'on the shelves' subset and /menu use
 * slightly different names for some items. IDs are canonical and
 * stable (good) — just make sure display names stay close enough that
 * an agent matching on names doesn't mismatch."
 *
 * Checked against the live store when this was written: all thirty-five
 * display names appear verbatim on the front page, so there is no
 * drift to repair. The guard is for the next edit — copy is the part
 * of a store that gets rewritten casually, and an agent that matched
 * an item by name yesterday should still find it today.
 */
describe("an item is called the same thing wherever it is named", () => {
  it("uses the shelf's own display name wherever a machine reads one", async () => {
    /*
     * WHERE THE COMPARISON HAS TO HAPPEN, and the first draft of this
     * test got it wrong in an instructive way.
     *
     * Comparing the two pages' raw bytes reported drift on
     * "Coffee's for Closers": the front page writes the apostrophe
     * literally, /menu writes it as &#39;. Both are correct — the
     * front page names its items inside JSON-LD, where an apostrophe
     * is an ordinary character in a JSON string, and /menu names them
     * in HTML text, where it is escaped. A byte comparison across
     * those two contexts compares escaping, not names, and would have
     * reported a defect that does not exist.
     *
     * So each surface is read in its own dialect: the front page's
     * JSON-LD parsed as JSON, the shelf's HTML compared as escaped
     * HTML. That is also where the review's concern actually lives —
     * an agent matching an item by name reads the structured data, not
     * the prose.
     */
    const home = await (await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })).text();
    const shelf = await (
      await SELF.fetch(`${BASE}/menu`, { headers: { Accept: "text/html" } })
    ).text();

    const named = new Map<string, Set<string>>();
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const entry of node) collect(entry);
        return;
      }
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      const url = record["url"];
      if (typeof url === "string" && url.includes("/menu/") && typeof record["name"] === "string") {
        const id = url.slice(url.lastIndexOf("/") + 1);
        named.set(id, (named.get(id) ?? new Set()).add(record["name"]));
      }
      for (const value of Object.values(record)) collect(value);
    };
    for (const block of home.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      collect(JSON.parse(block[1]!));
    }

    expect(named.size, "the front page's structured data names no shelf items").toBe(
      MENU_ITEMS.length,
    );

    const escapeHtmlText = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    for (const item of MENU_ITEMS) {
      // The shelf, in HTML's dialect.
      expect(shelf, `${item.id} is not named on /menu`).toContain(escapeHtmlText(item.name));
      // The front page, in JSON's.
      expect(
        [...(named.get(item.id) ?? [])],
        `${item.id} is called something else in the front page's structured data`,
      ).toEqual([item.name]);
    }
  });

  it("links every mention by id, so a mismatch cannot cost a purchase", async () => {
    /*
     * The real protection is that names are never the identifier. Both
     * pages address an item by its id in the href, so even if copy
     * drifts, an agent following a link lands on the right door.
     */
    const home = await (await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })).text();
    for (const id of [...home.matchAll(/href="\/menu\/([a-z0-9_]+)"/g)].map((match) => match[1])) {
      expect(
        MENU_ITEMS.some((item) => item.id === id),
        `the front page links /menu/${id}, which is not on the shelf`,
      ).toBe(true);
    }
  });
});
