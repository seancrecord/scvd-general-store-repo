import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { NEVER_AUTO_RENEWS, priceLine } from "@/services/menu-markdown";
import { priceTiersUsdc } from "@/lib/payments";

const BASE = "https://scvd.store";

/**
 * ONE PRICE, THREE REPRESENTATIONS (2026-09-21).
 *
 * An agent review of the store read the HTML shelf against menu.json
 * and reported two defects at the door, both of them about the one
 * fact on the page a buyer acts on.
 *
 * THE GARBLED CLAUSE. Three surfaces printed the settlement unit by
 * appending " USDC" to the END of `priceLine`, which ends in the
 * store-wide never-renews sentence — so every item page and the whole
 * price list read "...there is no mechanism that could USDC". The
 * machine fields were intact throughout; only the prose an agent
 * reads to confirm terms was gibberish, which is the worst possible
 * place for it. The unit now rides with the amount and the callers
 * ask for it rather than gluing it on, so the defect cannot come back
 * by someone adding a fourth caller — but the shape of the mistake is
 * cheap to assert directly, so it is asserted directly.
 *
 * THE PARITY GAP. The shelf printed prices as prose only and carried
 * no structured data of its own, so a scraper comparing HTML against
 * JSON had to parse an English sentence, and the review concluded six
 * items were unpriced when in fact all thirty-five were priced. The
 * figures now ride as attributes and as schema.org offers. This file
 * is the check the review asked for: every item renders a price in
 * every representation, and the representations agree.
 */

async function text(path: string, accept: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: accept } });
  expect(response.status, path).toBe(200);
  return response.text();
}

function jsonLdNodes(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]!) as unknown,
  );
}

describe("the price never reads as gibberish", () => {
  it("never ends the price sentence with a bare currency code", () => {
    /*
     * The exact shape of the reported defect: the never-renews clause
     * is the last thing priceLine says, so anything appended after it
     * lands mid-sentence.
     */
    for (const item of MENU_ITEMS) {
      for (const line of [priceLine(item), priceLine(item, { currency: true })]) {
        expect(line, item.id).not.toContain(`${NEVER_AUTO_RENEWS} USDC`);
        expect(line, item.id).toContain(NEVER_AUTO_RENEWS);
        expect(line.trimEnd(), item.id).toMatch(/could$/);
      }
    }
  });

  it("puts the unit beside the amount when a surface asks for one", () => {
    for (const item of MENU_ITEMS) {
      expect(priceLine(item, { currency: true }), item.id).toContain(
        `$${item.price_usdc} USDC`,
      );
      // And leaves it off entirely when nobody asked.
      expect(priceLine(item), item.id).not.toContain("USDC");
    }
  });

  it("serves item pages whose prose price is a whole sentence", async () => {
    /*
     * Spot-checked end to end on the two items the review named, plus
     * a term item and a pay-what-it-deserves item, because the four
     * take different branches through the price phrasing.
     */
    for (const id of ["spot_check", "small_blessing", "conformance_watch", "luckies"]) {
      const html = await text(`/menu/${id}`, "text/html");
      expect(html, id).not.toContain("could USDC");
      expect(html, id).not.toContain("mechanism that could USDC");
    }
  });

  it("leaves no surface anywhere printing the broken clause", async () => {
    for (const path of ["/menu", "/pricing", "/menu/daily_fortune", "/menu/the_confession"]) {
      expect(await text(path, "text/html"), path).not.toContain("could USDC");
    }
  });
});

describe("price parity across representations", () => {
  it("prices every item on the HTML shelf, as prose and as data", async () => {
    const html = await text("/menu", "text/html");
    for (const item of MENU_ITEMS) {
      const row = new RegExp(`<div class="menu-item" data-item="${item.id}"[^>]*>`).exec(html);
      expect(row, item.id).not.toBeNull();
      expect(row![0], item.id).toContain(`data-price-usdc="${item.price_usdc}"`);
      expect(row![0], item.id).toContain(
        `data-price-tiers-usdc="${priceTiersUsdc(item).join(",")}"`,
      );
      expect(row![0], item.id).toContain(`data-pricing="${item.pricing}"`);
      expect(row![0], item.id).toContain(`data-cadence="${item.cadence}"`);
      // The prose price is still there beside the data — the review
      // read the page as a person would, and found nothing.
      expect(html, item.id).toContain(`$${item.price_usdc}`);
    }
  });

  it("carries the same figures in the shelf's schema.org offers", async () => {
    const html = await text("/menu", "text/html");
    const list = jsonLdNodes(html).find(
      (node) => (node as { "@type"?: string })["@type"] === "ItemList",
    ) as { itemListElement: Array<{ item: { name: string; offers: Record<string, unknown> } }> };
    expect(list, "the shelf publishes an ItemList").toBeTruthy();
    expect(list.itemListElement).toHaveLength(MENU_ITEMS.length);

    for (const [index, item] of MENU_ITEMS.entries()) {
      const offer = list.itemListElement[index]!.item.offers;
      expect(list.itemListElement[index]!.item.name, item.id).toBe(item.name);
      if (item.pricing === "fixed") {
        expect(offer["price"], item.id).toBe(String(item.price_usdc));
      } else {
        // A floor is a floor: never published as a flat `price`.
        expect(offer["price"], item.id).toBeUndefined();
        expect(
          (offer["priceSpecification"] as { minPrice: string }).minPrice,
          item.id,
        ).toBe(String(item.price_usdc));
      }
    }
  });

  it("agrees with menu.json item for item", async () => {
    const shelf = (await (
      await SELF.fetch(`${BASE}/menu.json`, { headers: { Accept: "application/json" } })
    ).json()) as { items: Array<Record<string, unknown>> };

    for (const item of MENU_ITEMS) {
      const entry = shelf.items.find((candidate) => candidate["id"] === item.id);
      expect(entry, item.id).toBeTruthy();
      expect(entry!["price_usdc"], item.id).toBe(item.price_usdc);
      expect(entry!["price_tiers_usdc"], item.id).toEqual(priceTiersUsdc(item));
    }
  });

  it("agrees with the item page's own offer", async () => {
    for (const id of ["daily_fortune", "the_confession", "coffees_for_closers",
                      "signature_agent_card", "context_anchor", "conformance_watch"]) {
      const item = MENU_ITEMS.find((candidate) => candidate.id === id);
      expect(item, id).toBeTruthy();
      const offer = jsonLdNodes(await text(`/menu/${id}`, "text/html"))
        .map((node) => (node as { offers?: Record<string, unknown> }).offers)
        .find(Boolean) as Record<string, unknown>;
      expect(offer, id).toBeTruthy();
      const quoted =
        offer["price"] ??
        (offer["priceSpecification"] as { minPrice?: string } | undefined)?.minPrice;
      expect(quoted, id).toBe(String(item!.price_usdc));
    }
  });
});
