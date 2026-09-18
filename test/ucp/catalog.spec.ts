import { describe, expect, it } from "vitest";
import {
  catalogPolicies,
  lookupItem,
  searchCatalog,
  ucpCatalog,
  ucpProduct,
} from "@/lib/ucp/catalog";
import { priceTiersUsdc } from "@/lib/payments";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";
import { getMenuItem, MENU_ITEMS } from "@/store/menu";
import { variantGid } from "@/lib/ucp/ids";

const BASE = "https://scvd.store";

describe("UCP catalog projection", () => {
  const catalog = ucpCatalog(BASE);

  it("projects every core shelf item and nothing else", () => {
    expect(catalog.length).toBe(coreCommerceItems().length);
    const ids = new Set(catalog.map((product) => product.id));
    for (const item of coreCommerceItems()) {
      expect(ids.has(`gid://scvd.store/Product/${item.id}`), item.id).toBe(true);
    }
  });

  it("quotes every price as an integer number of USD minor units", () => {
    for (const product of catalog) {
      for (const variant of product.variants) {
        expect(variant.price.currency).toBe("USD");
        expect(Number.isInteger(variant.price.amount), variant.sku).toBe(true);
        expect(variant.price.amount).toBeGreaterThan(0);
      }
      expect(Number.isInteger(product.price_range.min.amount)).toBe(true);
      expect(Number.isInteger(product.price_range.max.amount)).toBe(true);
    }
  });

  it("never writes USDC into a field specified to hold a currency code", () => {
    const json = JSON.stringify(catalog);
    expect(json).not.toContain('"currency":"USDC"');
    // The token is still named — on the settlement block, where it belongs.
    expect(json).toContain('"asset_symbol":"USDC"');
  });

  it("carries the exact atomic USDC beside every commercial price", () => {
    for (const product of catalog) {
      for (const variant of product.variants) {
        const settlement = (
          variant.metadata["store.scvd"] as Record<string, any>
        ).settlement;
        expect(settlement.decimals).toBe(6);
        expect(Number(settlement.amount_atomic)).toBe(
          Number(settlement.amount_usdc) * 1e6,
        );
        // The two representations must describe the same money.
        expect(Number(settlement.amount_usdc) * 100).toBeCloseTo(
          variant.price.amount,
          6,
        );
      }
    }
  });

  it("gives every variant a unique id and a unique SKU", () => {
    const ids = new Set<string>();
    const skus = new Set<string>();
    for (const product of catalog) {
      for (const variant of product.variants) {
        expect(ids.has(variant.id), variant.id).toBe(false);
        expect(skus.has(variant.sku), variant.sku).toBe(false);
        ids.add(variant.id);
        skus.add(variant.sku);
      }
    }
  });

  it("projects pay-what-it-deserves items as the exact tiers the till offers", () => {
    const pwid = coreCommerceItems().filter(
      (item) => item.pricing === "pay_what_it_deserves",
    );
    expect(pwid.map((item) => item.id).sort()).toEqual([
      "certificate_of_patronage",
      "graffiti_on_a_train",
      "luckies",
      "the_collab",
    ]);
    for (const item of pwid) {
      const tiers = priceTiersUsdc(item);
      const product = ucpProduct(item, BASE);
      expect(product.variants.length).toBe(tiers.length);
      product.variants.forEach((variant, index) => {
        // Derived from priceTiersUsdc, never from a second tier table.
        expect(variant.price.amount).toBe(Math.round(tiers[index]! * 100));
        expect(variant.id).toBe(variantGid(item.id, index));
        const tier = (
          variant.metadata["store.scvd"] as Record<string, any>
        ).tier;
        expect(tier.same_deliverable_as_other_tiers).toBe(true);
        expect(tier.above_minimum_is_a_tip).toBe(true);
      });
    }
  });

  it("puts The Collab at $300 / $600 / $1,500 and a lucky at $0.99 / $1.98 / $4.95", () => {
    const collab = ucpProduct(getMenuItem("the_collab")!, BASE);
    expect(collab.variants.map((v) => v.price.amount)).toEqual([
      30_000, 60_000, 150_000,
    ]);
    expect(collab.variants.map((v) => v.sku)).toEqual([
      "SCVD-THE-COLLAB-T1",
      "SCVD-THE-COLLAB-T2",
      "SCVD-THE-COLLAB-T5",
    ]);
    const lucky = ucpProduct(getMenuItem("luckies")!, BASE);
    expect(lucky.variants.map((v) => v.price.amount)).toEqual([99, 198, 495]);
  });

  it("does not turn a settlement chain into a product variant", () => {
    for (const product of catalog) {
      for (const variant of product.variants) {
        for (const rail of ["base", "polygon", "arbitrum", "world", "solana"]) {
          expect(variant.sku.toLowerCase(), variant.sku).not.toContain(rail);
          expect(variant.id.toLowerCase(), variant.id).not.toContain(`/${rail}`);
        }
      }
    }
  });

  it("carries each item's real input schema by reference, not a retyped copy", () => {
    for (const item of coreCommerceItems()) {
      const product = ucpProduct(item, BASE);
      const inputs = (
        product.metadata["store.scvd"] as Record<string, any>
      ).inputs;
      const schema = buyInputSchema(item);
      expect(inputs.required).toEqual(schema.required ?? []);
      expect(inputs.properties).toEqual(Object.keys(schema.properties ?? {}));
      expect(inputs.schema_url).toBe(
        `${BASE}/ucp/schemas/items/${item.id}.input.json`,
      );
    }
  });

  it("states the term and that nothing renews, for every term item", () => {
    const terms = coreCommerceItems().filter((item) => item.cadence === "term");
    expect(terms.length).toBeGreaterThan(0);
    const policies = catalogPolicies(ucpCatalog(BASE), BASE);
    for (const item of terms) {
      const index = coreCommerceItems().findIndex((row) => row.id === item.id);
      const policy = policies.find(
        (row) =>
          row.type === "store.scvd.policy.service_term" &&
          row.applies_to?.includes(`$.products[${index}]`),
      );
      expect(policy, item.id).toBeDefined();
      expect(policy!.term_days).toBe(item.term_days);
      expect(policy!.auto_renews).toBe(false);
    }
  });

  it("gives every product a license policy and never invents a default", () => {
    // Policies ride the RESPONSE with a JSONPath target, which is
    // where common/types/policy.json puts them and therefore where a
    // platform reads them. They were on the product until the
    // conformance gate read the schema.
    const products = ucpCatalog(BASE);
    const policies = catalogPolicies(products, BASE);
    products.forEach((product, index) => {
      const itemId = (product.metadata["store.scvd"] as Record<string, any>)
        .item_id as string;
      const license = policies.find(
        (row) =>
          row.type === "store.scvd.policy.license" &&
          row.applies_to?.includes(`$.products[${index}]`),
      );
      expect(license, itemId).toBeDefined();
      expect(license!.class).toBe(
        requireCommerce(getMenuItem(itemId)!).license_policy,
      );
      // The class is settled; the wording is not, and the wire says so
      // until the keeper's ruling replaces it.
      expect(license!.status).toBe("draft");
      // A description is an object, not a string: the schema says so.
      expect(typeof (license!.description as any).plain).toBe("string");
    });
  });

  it("says a catalog row is not a reservation on the capped and gated items", () => {
    for (const id of ["aura_walk", "the_collab"]) {
      const product = ucpProduct(getMenuItem(id)!, BASE);
      expect(product.variants[0]!.availability.weekly_inventory).toBe(
        getMenuItem(id)!.weekly_inventory,
      );
      expect(product.variants[0]!.availability.decided_at).toBe("checkout");
    }
    const window = ucpProduct(getMenuItem("window_pick")!, BASE);
    expect(
      window.variants[0]!.availability.buyer_specific_eligibility,
    ).toContain("per wallet");
  });

  it("treats only image samples as catalog media", () => {
    for (const item of coreCommerceItems()) {
      const product = ucpProduct(item, BASE);
      if (product.media) {
        for (const entry of product.media) {
          expect(entry.url, item.id).toMatch(/\.(png|jpg|jpeg|webp|svg)$/i);
        }
      }
      // A JSON report specimen is carried, but not as renderable media.
      if (item.sample_url?.endsWith(".json")) {
        expect(product.media).toBeUndefined();
        const specimen = (
          product.metadata["store.scvd"] as Record<string, any>
        ).specimen;
        expect(specimen.url).toBe(`${BASE}${item.sample_url}`);
      }
    }
  });

  it("refuses to project a sub-cent item rather than rounding it", () => {
    for (const id of [
      "spot_check",
      "settlement_attestation",
      "settlement_reconciliation",
      "small_blessing",
    ]) {
      expect(() => ucpProduct(getMenuItem(id)!, BASE), id).toThrow();
    }
  });

  it("looks an item up by gid, handle, SKU and plain item id alike", () => {
    const item = getMenuItem("service_audit")!;
    const sku = requireCommerce(item).sku;
    for (const identifier of [
      "service_audit",
      "service-audit",
      sku,
      "gid://scvd.store/Product/service_audit",
      "gid://scvd.store/Variant/service_audit",
    ]) {
      expect(lookupItem(identifier)?.id, identifier).toBe("service_audit");
    }
    // A tier SKU resolves to its product.
    expect(lookupItem("SCVD-THE-COLLAB-T5")?.id).toBe("the_collab");
    expect(lookupItem("no-such-thing")).toBeUndefined();
  });

  it("ranks a structured match above a lucky word in prose", () => {
    const results = searchCatalog(BASE, "x402 endpoint audit", 10);
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((product) =>
      (product.metadata["store.scvd"] as Record<string, unknown>).item_id,
    );
    expect(ids).toContain("service_audit");
  });

  it("keeps the sub-cent shelf out of search results entirely", () => {
    const results = searchCatalog(BASE, "settlement", 50);
    const ids = results.map((product) =>
      (product.metadata["store.scvd"] as Record<string, unknown>).item_id,
    );
    expect(ids).not.toContain("settlement_attestation");
    expect(ids).not.toContain("settlement_reconciliation");
    expect(ids).toContain("attestation_bundle");
  });

  it("uses the same item ids the rest of the store publishes", () => {
    for (const product of catalog) {
      const itemId = (product.metadata["store.scvd"] as Record<string, unknown>)
        .item_id as string;
      expect(MENU_ITEMS.some((item) => item.id === itemId)).toBe(true);
      expect(product.url).toBe(`${BASE}/menu/${itemId}`);
    }
  });
});
