import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { roomHandles } from "@/pages/simple-page";

const BASE = "https://scvd.store";
const AS_A_BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * HANDLES A SCRIPT CAN HOLD — door 4 of the six-door reading.
 *
 * The lineup's complaint about browser automation is that the agent is
 * left inferring meaning from anonymous divs, and this store shipped
 * exactly that: every anchor point on every room was a style class,
 * and a style class is what a redesign moves. `class="paper"` is a
 * decision about ink, not a statement about what the room is.
 *
 * These hold the fix in place: the landmark carries a handle, the
 * handle derives from the URL rather than from copy, and the shelf
 * rows carry the same item ids the API and the till use.
 */
async function html(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: AS_A_BROWSER });
  expect(response.status, path).toBe(200);
  return response.text();
}

function mainTag(page: string): string {
  return /<main[^>]*>/.exec(page)?.[0] ?? "";
}

describe("every room hands an automation tool something to hold", () => {
  it("the storefront's main landmark names itself", async () => {
    expect(mainTag(await html("/"))).toContain('data-room="storefront"');
  });

  it("EVERY published HTML room hooks its landmark, derived from the sitemap", async () => {
    /*
     * The list comes off /sitemap.xml rather than being typed here, and
     * that is the whole point: a hand-written list only covers the
     * rooms somebody remembered. /porch renders its own HTML outside
     * both page helpers, so a hand-listed test passed while it shipped
     * bare — the sitemap-derived one fails until it is fixed, and will
     * do the same for the next room that renders its own markup.
     *
     * Markdown twins are skipped, not failed: a document with no
     * <main> has no landmark to hook, and asking it about one is a
     * category error rather than a finding.
     */
    const sitemap = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1]!.replace(BASE, ""))
      .filter((path) => path.startsWith("/"));
    expect(paths.length, "the sitemap should list rooms").toBeGreaterThan(20);

    /*
     * Fetched in parallel rather than one after another. The walk is
     * loopback I/O over every room in the sitemap, so it grew with the
     * store — 71 rooms by 2026-09-01 — and adding a room was enough to
     * push a sequential version past the default timeout. That is a
     * test that gets flakier the more the store ships, which is the
     * wrong direction for a guard meant to catch the NEXT room. Not one
     * assertion below changed.
     */
    const pages = await Promise.all(
      paths.map(async (path) => ({ path, page: await html(path) })),
    );
    const bare: string[] = [];
    let htmlRooms = 0;
    for (const { path, page } of pages) {
      if (!/<!doctype html|<html[\s>]/i.test(page)) continue;
      htmlRooms += 1;
      if (!/\sid="|\sdata-(?!cf-)[a-z-]+=/.test(mainTag(page))) bare.push(path);
    }
    expect(htmlRooms, "most rooms are HTML").toBeGreaterThan(20);
    expect(bare, `rooms with no handle on <main>: ${bare.join(", ")}`).toEqual([]);
  });

  it("the room name is the path, not the copy", async () => {
    for (const path of ["/conformance", "/corpus", "/criteria"]) {
      expect(mainTag(await html(path)), `${path}`).toContain(
        `data-room="${path.slice(1)}"`,
      );
    }
  });

  it("an item page names its room AND which item it landed on", async () => {
    const item = MENU_ITEMS[0]!;
    const tag = mainTag(await html(`/menu/${item.id}`));
    // The ROOM is the template a script targets; the ITEM is the
    // instance. A selector written against [data-room="menu"] keeps
    // working when the shelf gains an item.
    expect(tag).toContain('data-room="menu"');
    expect(tag).toContain(`data-item="${item.id}"`);
  });

  it("the shelf rows carry the ids the API uses, not display names", async () => {
    const page = await html("/menu");
    for (const item of MENU_ITEMS) {
      expect(page, `${item.id} row`).toContain(`data-item="${item.id}"`);
    }
  });
});

describe("the handles derive from the URL, which is the part that is a contract", () => {
  it("splits a path into room and item", () => {
    expect(roomHandles("/conformance")).toBe(' data-room="conformance"');
    expect(roomHandles("/menu/hello")).toBe(
      ' data-room="menu" data-item="hello"',
    );
    expect(roomHandles("/")).toBe(' data-room="storefront"');
  });

  it("gives no handle rather than a guessed one when there is no path", () => {
    // An unstable handle is worse than an absent one: absent fails
    // loudly at the selector, invented fails silently at the wrong
    // element. Deriving from a title would be deriving from copy.
    expect(roomHandles(undefined)).toBe("");
  });

  it("escapes what it puts in an attribute", () => {
    expect(roomHandles('/a"onload=x')).not.toContain('"onload=x');
  });
});
