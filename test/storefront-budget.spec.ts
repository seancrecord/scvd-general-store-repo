import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { renderStorefront } from "@/pages/storefront-page";
import { MENU_ITEMS } from "@/store";
import { checkoutMethod } from "@/lib/purchase-capabilities";
import { SPEC_RETURNS, SPEC_WHY_USE } from "@/store/spec";
import type { Env } from "@/types";
import { productionShape } from "./helpers/production-shape";
// The live reader owns this budget; importing it keeps the two checks in agreement.
// @ts-expect-error The read-only Node battery is JavaScript without declarations.
import { FRONT_DOOR_BYTE_BUDGET } from "../scripts/lib/doors.mjs";

const BASE = "https://scvd.store";
const paymentConfig = productionShape(env as unknown as Env);
function page(): string {
  return renderStorefront({
    base: BASE, paymentConfig, weekNote: "A measured week.", bellCount: 999999,
    recordWeeks: 999, recordTruncated: false, patronCount: 999,
    guestbook: Array.from({ length: 5 }, (_, i) => ({
      id: String(i), name: "A visitor", message: "A retained visitor note. ".repeat(10),
      date: "2026-10-13T12:00:00.000Z",
    })),
  });
}
type Node = Record<string, unknown>;
function blocks(html: string): Node[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]!) as Node);
}

describe("the homepage reader budget", () => {
  it("fits the live reader's byte budget with every checkout rail and a populated wall", () => {
    expect(new TextEncoder().encode(page()).byteLength).toBeLessThanOrEqual(FRONT_DOOR_BYTE_BUDGET);
  });

  it("joins every organization offer to its full product terms without dropping discovery facts", () => {
    const nodes = blocks(page());
    const organization = nodes.find(node => node["@type"] === "Organization")!;
    const shelf = nodes.find(node => node["@type"] === "ItemList")!;
    const products = (shelf.itemListElement as { item: Node }[]).map(entry => entry.item);
    const offers = organization.makesOffer as Node[];
    expect(products).toHaveLength(MENU_ITEMS.length);
    expect(offers).toHaveLength(MENU_ITEMS.length);
    for (const item of MENU_ITEMS) {
      const product = products.find(node => node.url === BASE + "/menu/" + item.id)!;
      const terms = product.offers as Node;
      const reference = offers.find(node => node["@id"] === terms["@id"]);
      expect(terms["@id"]).toBe(BASE + "/menu/" + item.id + "#offer");
      expect(reference).toBeDefined();
      expect(reference!.name).toBe(item.name);
      expect(reference!.description).toBe(SPEC_WHY_USE[item.id] ?? SPEC_RETURNS[item.id] ?? item.description);
      expect(product.description).toBe(item.description);
      expect(terms.price).toBe(String(item.price_usdc));
      expect(terms.acceptedPaymentMethod).toBe(checkoutMethod(paymentConfig));
      expect(terms.url).toBe(product.url);
      expect(terms.availability).toBeTruthy();
      expect((terms.hasMerchantReturnPolicy as Node)["@type"]).toBe("MerchantReturnPolicy");
      expect((terms.shippingDetails as Node)["@type"]).toBe("OfferShippingDetails");
    }
  });
});
