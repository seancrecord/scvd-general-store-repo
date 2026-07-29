import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CHEAP_DOOR_MAX_USDC, MENU_ITEMS } from "@/store";
import { CHEAP_DOOR_ITEM_IDS } from "@/store/copy/practice-counter";

/**
 * LEAD WITH THE CHEAP DOOR.
 *
 * The one persona with observed traffic is a client-builder scanning
 * for the smallest number they can settle without asking a human. Until
 * 2026-07-29 the catalog buried it: a $15 human witness sat sixth, and
 * settlement_attestation — the CHEAPEST ITEM IN THE STORE at $0.004 —
 * sat eighth, behind it.
 *
 * Every list the store controls reads from MENU_ITEMS, so this is one
 * array and four surfaces. These tests keep it that way, because the
 * next item added to a file will otherwise land wherever the file
 * happened to put it.
 */
describe("the cheap door leads", () => {
  it("puts no item over a dollar ahead of one under it", () => {
    const firstExpensive = MENU_ITEMS.findIndex(
      (item) => item.price_usdc > CHEAP_DOOR_MAX_USDC,
    );
    const lastCheap = MENU_ITEMS.reduce(
      (last, item, index) =>
        item.price_usdc <= CHEAP_DOOR_MAX_USDC ? index : last,
      -1,
    );
    expect(
      lastCheap,
      "an item over a dollar is sitting in front of the cheap door",
    ).toBeLessThan(firstExpensive);
  });

  it("opens on the cheapest thing in the store", () => {
    const cheapest = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
    expect(MENU_ITEMS[0]?.price_usdc).toBe(cheapest);
  });

  it("orders the cheap door cheapest first", () => {
    const cheap = MENU_ITEMS.filter(
      (item) => item.price_usdc <= CHEAP_DOOR_MAX_USDC,
    ).map((item) => item.price_usdc);
    expect(cheap).toEqual([...cheap].sort((a, b) => a - b));
  });

  it("keeps the whole shelf, having only reordered it", () => {
    // A reorder that drops an item is a retirement nobody approved.
    expect(new Set(MENU_ITEMS.map((item) => item.id)).size).toBe(
      MENU_ITEMS.length,
    );
    for (const id of ["hello", "small_blessing", "app_gutcheck", "luckies"]) {
      expect(MENU_ITEMS.some((item) => item.id === id), id).toBe(true);
    }
  });

  it("lists every under-a-dollar item on the practice counter's own door", () => {
    // /try curates its list by hand and had missed the cheapest item in
    // the store — which is also the one whose buyer is that page's exact
    // reader.
    const underADollar = MENU_ITEMS.filter(
      (item) => item.price_usdc < CHEAP_DOOR_MAX_USDC,
    ).map((item) => item.id);
    const missing = underADollar.filter(
      (id) => !CHEAP_DOOR_ITEM_IDS.includes(id),
    );
    expect(missing, "the practice counter is hiding a cheap item").toEqual([]);
  });

  it("reaches llms.txt and menu.json in the same order", async () => {
    const guide = await (
      await SELF.fetch("https://scvd.store/llms.txt")
    ).text();
    const first = MENU_ITEMS[0];
    const dear = MENU_ITEMS[MENU_ITEMS.length - 1];
    expect(first && dear).toBeTruthy();
    expect(
      guide.indexOf(`  ${first?.id},`),
      "llms.txt does not lead with the cheap door",
    ).toBeLessThan(guide.indexOf(`  ${dear?.id},`));

    const menu = (await (
      await SELF.fetch("https://scvd.store/menu.json")
    ).json()) as { items: { id: string }[] };
    expect(menu.items[0]?.id).toBe(first?.id);
  });

  it("puts the practice counter ahead of the menu in llms.txt", async () => {
    // The audience that reads this document top to bottom is the one
    // audience we have actually seen. Serve them before the catalogue.
    const guide = await (
      await SELF.fetch("https://scvd.store/llms.txt")
    ).text();
    expect(guide.indexOf("## Practicing on us")).toBeLessThan(
      guide.indexOf("## The menu"),
    );
  });
});
