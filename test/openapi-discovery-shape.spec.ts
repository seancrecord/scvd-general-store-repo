import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { discoveryPriceHint } from "@/routes/openapi";

/**
 * THE DISCOVERY SHAPE THREE INDEXERS SHARE, 2026-09-11.
 *
 * A scanner operator wrote in that his index counted zero paid
 * operations on this store. It reads `x-payment-info.protocols` as an
 * array of protocol objects and ignores the `protocol` string the
 * store had published. That array is AgentCash's discovery spec,
 * adopted by x402scan and read by mppscan, so every paid operation
 * now carries it beside the older string. This pins the array, the
 * flat price hint next to it, and that the hint is derived from the
 * same tiers as the accepts rather than typed a second time.
 */
describe("x-payment-info carries the shared discovery shape", () => {
  it("every paid operation declares protocols: [{ x402: {} }] and a USD price hint", async () => {
    const response = await SELF.fetch("https://scvd.store/openapi.json");
    expect(response.status).toBe(200);
    const doc = (await response.json()) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const paid: Array<[string, Record<string, unknown>]> = [];
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (op && typeof op === "object" && "x-payment-info" in op) {
          paid.push([`${method.toUpperCase()} ${path}`, op["x-payment-info"] as Record<string, unknown>]);
        }
      }
    }
    expect(paid.length).toBeGreaterThan(0);
    for (const [where, info] of paid) {
      expect(info.protocols, where).toEqual([{ x402: {} }]);
      // The older string stays for the readers that learned it.
      expect(info.protocol, where).toBe("x402");
      expect(info.currency, where).toBe("USD");
      const tiers = info.price_usdc as number[];
      if (tiers.length === 1) {
        expect(info.pricingMode, where).toBe("fixed");
        expect(Number(info.price), where).toBe(tiers[0]);
      } else {
        expect(info.pricingMode, where).toBe("dynamic");
        expect(Number(info.minPrice), where).toBe(Math.min(...tiers));
        expect(Number(info.maxPrice), where).toBe(Math.max(...tiers));
      }
    }
  });

  it("prints decimal strings, never exponent notation or trailing zeros", () => {
    expect(discoveryPriceHint([0.005])).toEqual({ pricingMode: "fixed", price: "0.005", currency: "USD" });
    expect(discoveryPriceHint([0.001])).toEqual({ pricingMode: "fixed", price: "0.001", currency: "USD" });
    expect(discoveryPriceHint([1])).toEqual({ pricingMode: "fixed", price: "1", currency: "USD" });
    expect(discoveryPriceHint([0.25, 0.05, 1])).toEqual({
      pricingMode: "dynamic",
      minPrice: "0.05",
      maxPrice: "1",
      currency: "USD",
    });
    // Duplicate tiers are one tier.
    expect(discoveryPriceHint([0.05, 0.05])).toEqual({ pricingMode: "fixed", price: "0.05", currency: "USD" });
  });
});
