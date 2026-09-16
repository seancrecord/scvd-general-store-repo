import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { discoveryPriceHint } from "@/routes/openapi";

/**
 * THE DISCOVERY SHAPE THREE INDEXERS SHARE, 2026-09-11, RESPELLED
 * 2026-09-16.
 *
 * A scanner operator wrote in that his index counted zero paid
 * operations on this store. It reads `x-payment-info.protocols` as an
 * array of protocol objects and ignores the `protocol` string the
 * store had published. That array is AgentCash's discovery spec,
 * adopted by x402scan and read by mppscan, so every paid operation
 * carries it beside the older string.
 *
 * The array alone was not enough, and the way it failed is why the
 * `price` assertions below are as fussy as they are. `@agentcash/
 * discovery` (read at v1.7.5) decides WHICH PARSER reads this whole
 * block from `typeof x-payment-info.price`: an object goes to the
 * structured parser, which keeps `protocols` as written; a string
 * goes to the legacy parser, which keeps only protocol entries that
 * are THEMSELVES strings and drops `[{ x402: {} }]` on the floor. So
 * a flat price hint beside a correct protocols array reads as a paid
 * door declaring no payment protocol — which is what x402scan
 * reported on 2026-09-16, once per operation at each of two layers.
 * The flat keys are pinned ABSENT here, not merely unasserted: their
 * return is the silent failure.
 */
describe("x-payment-info carries the shared discovery shape", () => {
  it("every paid operation declares protocols: [{ x402: {} }] and a structured USD price", async () => {
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
      // The legacy flat spelling is what silently disabled the array.
      expect(info.pricingMode, where).toBeUndefined();
      expect(info.minPrice, where).toBeUndefined();
      expect(info.maxPrice, where).toBeUndefined();
      expect(info.currency, where).toBeUndefined();
      const price = info.price as Record<string, string>;
      expect(typeof price, where).toBe("object");
      expect(price.currency, where).toBe("USD");
      const tiers = info.price_usdc as number[];
      if (tiers.length === 1) {
        expect(price.mode, where).toBe("fixed");
        expect(Number(price.amount), where).toBe(tiers[0]);
      } else {
        expect(price.mode, where).toBe("dynamic");
        expect(Number(price.min), where).toBe(Math.min(...tiers));
        expect(Number(price.max), where).toBe(Math.max(...tiers));
      }
    }
  });

  it("prints decimal strings, never exponent notation or trailing zeros", () => {
    expect(discoveryPriceHint([0.005])).toEqual({ price: { mode: "fixed", amount: "0.005", currency: "USD" } });
    expect(discoveryPriceHint([0.001])).toEqual({ price: { mode: "fixed", amount: "0.001", currency: "USD" } });
    expect(discoveryPriceHint([1])).toEqual({ price: { mode: "fixed", amount: "1", currency: "USD" } });
    expect(discoveryPriceHint([0.25, 0.05, 1])).toEqual({
      price: { mode: "dynamic", min: "0.05", max: "1", currency: "USD" },
    });
    // Duplicate tiers are one tier.
    expect(discoveryPriceHint([0.05, 0.05])).toEqual({ price: { mode: "fixed", amount: "0.05", currency: "USD" } });
  });
});
