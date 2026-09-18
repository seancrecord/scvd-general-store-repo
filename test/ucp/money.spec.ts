import { describe, expect, it } from "vitest";
import {
  isCentExact,
  toAtomicUsdc,
  toUcpUsdPrice,
  UcpPriceNotRepresentable,
} from "@/lib/ucp/money";
import { MENU_ITEMS } from "@/store/menu";
import { commerceFor } from "@/store/commerce";

/**
 * THE ONE GUARD THAT MATTERS MOST HERE.
 *
 * Four items on this shelf cost less than a cent. Every plausible
 * accident in a price conversion — Math.round, toFixed(2) — publishes
 * a figure the till would not charge. These tests exist so that a
 * refactor which introduces one fails in CI rather than in somebody
 * else's directory.
 */
describe("UCP money", () => {
  it("converts cent-exact prices through the atomic amount, not through usdc * 100", () => {
    // 0.99 * 100 is 99.00000000000001 in IEEE-754. The naive check
    // would reject a real price; this one must not.
    expect(toUcpUsdPrice(0.99)).toEqual({ amount: 99, currency: "USD" });
    expect(toUcpUsdPrice(0.49)).toEqual({ amount: 49, currency: "USD" });
    expect(toUcpUsdPrice(0.1)).toEqual({ amount: 10, currency: "USD" });
    expect(toUcpUsdPrice(0.05)).toEqual({ amount: 5, currency: "USD" });
    expect(toUcpUsdPrice(0.25)).toEqual({ amount: 25, currency: "USD" });
    expect(toUcpUsdPrice(150)).toEqual({ amount: 15_000, currency: "USD" });
    expect(toUcpUsdPrice(1500)).toEqual({ amount: 150_000, currency: "USD" });
  });

  it("throws on every sub-cent price rather than rounding it", () => {
    for (const usdc of [0.001, 0.004, 0.005, 0.006, 0.0001, 0.019]) {
      expect(isCentExact(usdc)).toBe(false);
      expect(() => toUcpUsdPrice(usdc)).toThrow(UcpPriceNotRepresentable);
    }
  });

  it("never rounds a sub-cent price to zero or to a cent", () => {
    // The two wrong answers, named, so the assertion cannot be
    // satisfied by producing either of them.
    for (const usdc of [0.001, 0.004, 0.005, 0.006]) {
      let produced: unknown;
      try {
        produced = toUcpUsdPrice(usdc);
      } catch {
        produced = undefined;
      }
      expect(produced).toBeUndefined();
    }
  });

  it("keeps the settlement amount at USDC's six decimals", () => {
    expect(toAtomicUsdc(5)).toBe("5000000");
    expect(toAtomicUsdc(0.004)).toBe("4000");
    expect(toAtomicUsdc(0.99)).toBe("990000");
  });

  it("agrees with the commerce table about which shelf items are representable", () => {
    for (const item of MENU_ITEMS) {
      const commerce = commerceFor(item.id);
      expect(commerce, `no commerce row for ${item.id}`).toBeDefined();
      expect(
        isCentExact(item.price_usdc),
        `${item.id} at $${item.price_usdc} is marked ${commerce!.visibility}`,
      ).toBe(commerce!.visibility === "core");
    }
  });
});
