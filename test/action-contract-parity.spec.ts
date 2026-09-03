import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * ONE CONTRACT PER ITEM, EVERY SURFACE (F28, 2026-09-03). An agent
 * choosing a paid action reads whichever surface it lands on: the item
 * page, menu.json, the Offer in the JSON-LD, or the 402 itself. This
 * holds them to each other for every item on the shelf: the glance
 * lines on the page are the glance lines in menu.json, word for word;
 * the Offer's price is the menu's price; and the 402's cheapest accept
 * is that price in atomic USDC. A surface that drifts fails here.
 */
type Glance = Record<string, string>;
type MenuJson = { items: { id: string; price_usdc: number; at_a_glance: Glance }[] };

function decodePaymentRequired(header: string): { accepts: { amount: string }[] } {
  const raw = header.trim();
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  return JSON.parse(atob(padded)) as { accepts: { amount: string }[] };
}

describe("the action contract is one contract on every surface", () => {
  it("the glance on the page is the glance in menu.json, and the price is the price on the 402", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as MenuJson;
    expect(menu.items.length).toBe(MENU_ITEMS.length);
    for (const item of menu.items) {
      const page = await (await SELF.fetch(`${BASE}/menu/${item.id}`, { headers: { Accept: "text/html" } })).text();
      const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const text = unescape(page);
      for (const key of ["attests", "input", "output", "cryptography", "verify", "price_and_fulfilment", "does_not_attest"]) {
        const value = item.at_a_glance[key];
        expect(value, `${item.id}: menu.json at_a_glance lacks ${key}`).toBeTruthy();
        expect(text, `${item.id}: the page does not print the ${key} line menu.json carries`).toContain(value!);
      }
      // The Offer in the page's JSON-LD prices the item as the menu does.
      const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
      // A fixed-price item carries price; a pay-what-it-deserves item carries lowPrice or minPrice.
      const offers = JSON.stringify(blocks).match(/"(?:price|lowPrice|minPrice)":"?([0-9.]+)"?/g) ?? [];
      expect(offers.length, `${item.id}: no Offer price in the JSON-LD`).toBeGreaterThan(0);
      expect(offers.some((o) => Number(o.replace(/[^0-9.]/g, "")) === item.price_usdc), `${item.id}: Offer price disagrees with the menu`).toBe(true);
      // The 402's cheapest accept is the menu price in atomic USDC.
      const door = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      if (door.status === 402) {
        const header = door.headers.get("payment-required");
        expect(header, `${item.id}: 402 without PAYMENT-REQUIRED`).toBeTruthy();
        const amounts = decodePaymentRequired(header!).accepts.map((a) => Number(a.amount));
        expect(Math.min(...amounts), `${item.id}: the 402's cheapest accept is not the menu price`).toBe(Math.round(item.price_usdc * 1_000_000));
      }
    }
  });
});
