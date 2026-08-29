import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { priceLabel } from "@/lib/price-label";
import { MENU_ITEMS } from "@/store";
import { FEATURED_SHELVES } from "@/store/copy/storefront";

const BASE = "https://scvd.store";

/**
 * THE FRONT OF THE BUILDING HAS TO AGREE WITH THE MENU BEHIND IT.
 *
 * The keeper spotted this from a screenshot: the cheap door reorder on
 * 2026-07-29 reached menu.json, llms.txt, skill.md and the MCP tool
 * list, and never reached the storefront — because the six shelves on
 * the sign were a hand-written copy list with their own typed prices
 * and their own order, related to the menu by nothing but care.
 *
 * All six prices were still correct when he noticed, which is luck
 * rather than a property: nothing would have failed if one had moved.
 * Same class as the skill bundle's "twenty-one items" and llms.txt's
 * "five of them", both deleted the same week. The keeper's ink stays —
 * his shelf names and his lines are rule 7 — and only the two things
 * that can silently go wrong are derived.
 */
describe("the six shelves on the sign", () => {
  it("name items that are actually on the menu", () => {
    for (const shelf of FEATURED_SHELVES) {
      expect(
        MENU_ITEMS.some((item) => item.id === shelf.id),
        `the storefront advertises "${shelf.name}" (${shelf.id}), which is not on the menu`,
      ).toBe(true);
    }
  });

  it("show the menu's price, not a typed copy of it", async () => {
    const page = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    for (const shelf of FEATURED_SHELVES) {
      const item = MENU_ITEMS.find((entry) => entry.id === shelf.id);
      expect(item).toBeTruthy();
      const expected = priceLabel(item!);
      expect(
        page,
        `the storefront does not show ${shelf.id} at ${expected}`,
      ).toContain(`<span class="shelf-price">${expected}</span>`);
    }
  });

  it("stand in the same order the rest of the store uses", async () => {
    const page = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    const shown = [...page.matchAll(/<span class="shelf-name">([^<]+)</g)].map(
      (match) => match[1],
    );
    const expected = [...FEATURED_SHELVES]
      .sort(
        (a, b) =>
          MENU_ITEMS.findIndex((item) => item.id === a.id) -
          MENU_ITEMS.findIndex((item) => item.id === b.id),
      )
      .map((shelf) => shelf.name);
    expect(shown).toEqual(expected);
  });

  it("gives the menu's floor item a card at all", () => {
    // The keeper caught this from the live page (2026-08-28): the
    // sign led with the half-cent blessing while the menu's actual
    // floor — spot_check at a tenth of a cent, the number every
    // surface advertises as CHEAPEST_ON_THE_SHELF — had no card. The
    // ordering test below can only order the cards that exist; this
    // one says the cheapest thing on the menu must BE a card, whatever
    // it is this week. Derived, so a future floor item fails here the
    // day it lands, not the day somebody notices.
    const floor = [...MENU_ITEMS].sort(
      (a, b) => a.price_usdc - b.price_usdc,
    )[0]!;
    expect(
      FEATURED_SHELVES.some((shelf) => shelf.id === floor.id),
      `the menu's cheapest item (${floor.id} at $${floor.price_usdc}) has no shelf card on the sign`,
    ).toBe(true);
  });

  it("puts the cheapest thing first, like every other surface", async () => {
    // The whole point of the reorder: an agent scanning for the
    // smallest number it can settle without asking a human should not
    // have to read past a $25 phone call to find a half-cent blessing.
    const page = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    const shown = [...page.matchAll(/<span class="shelf-name">([^<]+)</g)].map(
      (match) => match[1],
    );
    const cheapest = [...FEATURED_SHELVES]
      .map((shelf) => ({
        shelf,
        price:
          MENU_ITEMS.find((item) => item.id === shelf.id)?.price_usdc ??
          Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.price - b.price)[0];
    expect(shown[0]).toBe(cheapest?.shelf.name);
  });
});

describe("the way prices are written", () => {
  it("keeps the keeper's typography as a rule, not as instances", () => {
    const bless = MENU_ITEMS.find((item) => item.id === "small_blessing");
    const hello = MENU_ITEMS.find((item) => item.id === "hello");
    const anchor = MENU_ITEMS.find((item) => item.id === "context_anchor");
    const lucky = MENU_ITEMS.find((item) => item.id === "luckies");
    // Half a cent earns its fraction; whole dollars lose the .00; a
    // pay-what-it-deserves floor takes the plus that says so.
    //
    // The lucky's floor moved from $5 to $0.99 on 2026-08-28 (under
    // the stock client's ceiling), which makes it a BETTER worked
    // example than it was: it now shows a floor keeping its cents AND
    // taking the plus, where before it only showed the plus. The rule
    // itself is swept in the test below; these are its instances.
    expect(priceLabel(bless!)).toBe("½¢");
    expect(priceLabel(hello!)).toBe("$0.50");
    expect(priceLabel(anchor!)).toBe("$1");
    expect(priceLabel(lucky!)).toBe("$0.99+");
  });

  it("never prints a floor as though it were the price", () => {
    for (const item of MENU_ITEMS) {
      if (item.pricing !== "fixed") {
        expect(
          priceLabel(item).endsWith("+"),
          `${item.id} is ${item.pricing} and reads as a fixed price`,
        ).toBe(true);
      }
    }
  });
});
