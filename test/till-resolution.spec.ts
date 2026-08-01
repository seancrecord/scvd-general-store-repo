import { describe, expect, it } from "vitest";
import { priceTiersUsdc, tipFromPaid, usdcToAtomic } from "@/lib/payments";
import { MENU_ITEMS } from "@/store";

/**
 * THE TILL'S ARITHMETIC AT THE TILL'S RESOLUTION.
 *
 * Found in the 2026-08-01 scale walk: tier and tip rounding were both
 * cent-resolution on a shelf whose floor price is $0.004. Latent only
 * because every sub-cent item happens to be fixed-price — the menu's
 * composition was the sole guard on the money math, and nothing
 * enforced it. The day a sub-cent shelf went pay-what-it-deserves,
 * its tiers would have collapsed to $0.00 and its tips would have
 * booked zero one side of a half-cent and a full cent the other —
 * and the inflating side is the one rule 13 exists to make impossible.
 */
describe("money math survives every price the menu can carry", () => {
  it("keeps every tier of every item settleable and distinct", () => {
    for (const item of MENU_ITEMS) {
      const tiers = priceTiersUsdc(item);
      for (const tier of tiers) {
        expect(tier, `${item.id} offers a $0 tier`).toBeGreaterThan(0);
        expect(
          Number(usdcToAtomic(tier)),
          `${item.id} tier ${tier} is below atomic USDC`,
        ).toBeGreaterThan(0);
      }
      expect(new Set(tiers).size, `${item.id} has colliding tiers`).toBe(
        tiers.length,
      );
    }
  });

  it("books a tip at USDC resolution, not cent resolution", () => {
    // The two directions cent rounding got wrong: 0.004 above minimum
    // vanished, 0.005 above minimum doubled. Both must book exactly.
    expect(tipFromPaid(0.008, 0.004)).toBe(0.004);
    expect(tipFromPaid(0.01, 0.005)).toBe(0.005);
    // And a hypothetical sub-cent PWID shelf keeps distinct tiers.
    const tiers = priceTiersUsdc({
      ...MENU_ITEMS[0]!,
      price_usdc: 0.004,
      pricing: "pay_what_it_deserves",
    });
    expect(tiers).toEqual([0.004, 0.008, 0.02]);
  });

  it("changes nothing for the menu as it stands today", () => {
    // The fix must be invisible at current prices: every live tier is
    // cent-clean, so old and new rounding agree everywhere real.
    for (const item of MENU_ITEMS) {
      if (item.pricing !== "pay_what_it_deserves") {
        continue;
      }
      for (const tier of priceTiersUsdc(item)) {
        expect(Math.round(tier * 100) / 100).toBe(tier);
      }
    }
  });
});
