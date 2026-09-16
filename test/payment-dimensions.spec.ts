import { describe, expect, it } from "vitest";
import { paymentRollup, purchaseHeadline } from "@/lib/settlement-accounting";
import { paymentRollupHtml } from "@/pages/payment-rollup";

describe("payment dimensions remain independent as sources are added", () => {
  it("counts each purchase once while grouping a shared currency across protocols", () => {
    const result = paymentRollup([
      { protocol: "x402", currency: "USDC", organic: 90, house: 4 },
      { protocol: "MPP", currency: "USDC", organic: 10, house: 3 },
      { protocol: "MPP", currency: "EUR", organic: 1, house: 0 },
    ], [{ name: "Base", purchases: 80 }, { name: "Other", purchases: 21 }]);
    expect(result.organic_purchases).toBe(101);
    expect(result.by_protocol).toEqual([{ name: "x402", purchases: 90 }, { name: "MPP", purchases: 11 }]);
    expect(result.by_currency).toEqual([{ name: "USDC", purchases: 100 }, { name: "EUR", purchases: 1 }]);
    expect(purchaseHeadline(result)).toBe("101 organic purchases — 90 via x402, 11 via MPP.");
  });

  it("withholds a network split that does not add up", () => {
    expect(paymentRollup([{ protocol: "x402", currency: "USDC", organic: 10, house: 0 }], [
      { name: "Base", purchases: 11 },
    ]).by_network).toBeNull();
  });

  it("escapes source labels on both public and admin surfaces", () => {
    const sources = [{ protocol: '<script>alert(1)</script>', currency: '<img src=x>', organic: 1, house: 2 }];
    const html = paymentRollupHtml(paymentRollup(sources, null), sources);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Network breakdown unavailable');
  });
});
