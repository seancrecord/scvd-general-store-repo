import { describe, expect, it } from "vitest";
import {
  commerceFor,
  commerceItemIds,
  coreCommerceItems,
  requireCommerce,
} from "@/store/commerce";
import { MENU_ITEMS } from "@/store/menu";

/**
 * The commerce table is coverage in both directions: an item with no
 * row cannot be projected, and a row with no item is a SKU some
 * directory may still be holding after the shelf moved on.
 */
describe("shelf commerce metadata", () => {
  it("carries a row for every active shelf item", () => {
    for (const item of MENU_ITEMS) {
      expect(commerceFor(item.id), `missing commerce row: ${item.id}`).toBeDefined();
    }
  });

  it("carries no row for anything that is not on the shelf", () => {
    const shelved = new Set(MENU_ITEMS.map((item) => item.id));
    for (const id of commerceItemIds()) {
      expect(shelved.has(id), `commerce row for absent item: ${id}`).toBe(true);
    }
  });

  it("holds the shelf including Research Comparison", () => {
    // Not a magic number: a change to this count is a change to the
    // shelf, and it should be visible in the diff that makes it.
    expect(MENU_ITEMS.length).toBe(36);
    expect(commerceItemIds().length).toBe(MENU_ITEMS.length);
    expect(commerceFor("research_comparison")).toMatchObject({
      sku: "SCVD-RESEARCH-COMPARISON", license_policy: "artifact", visibility: "core",
    });
  });

  it("gives every item a unique, uppercase, SCVD-prefixed SKU", () => {
    const seen = new Set<string>();
    for (const item of MENU_ITEMS) {
      const { sku } = requireCommerce(item);
      expect(sku).toMatch(/^SCVD-[A-Z0-9-]+$/);
      expect(seen.has(sku), `duplicate SKU: ${sku}`).toBe(false);
      seen.add(sku);
    }
  });

  it("excludes exactly the four sub-cent items from the core catalog", () => {
    const excluded = MENU_ITEMS.filter(
      (item) => requireCommerce(item).visibility !== "core",
    ).map((item) => item.id);
    expect(excluded.sort()).toEqual([
      "settlement_attestation",
      "settlement_reconciliation",
      "small_blessing",
      "spot_check",
    ]);
    expect(coreCommerceItems().length).toBe(MENU_ITEMS.length - 4);
  });

  it("gives every item at least one category and one tag", () => {
    for (const item of MENU_ITEMS) {
      const commerce = requireCommerce(item);
      expect(commerce.categories.length, item.id).toBeGreaterThan(0);
      expect(commerce.tags.length, item.id).toBeGreaterThan(0);
    }
  });
});
