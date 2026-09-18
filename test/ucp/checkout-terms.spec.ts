import { describe, expect, it } from "vitest";
import { priceTiersUsdc } from "@/lib/payments";
import {
  CHECKOUT_TTL_SECONDS,
  canTransition,
  checkoutExpiry,
  isExpired,
  isTerminal,
  assertTransition,
  InvalidCheckoutTransition,
  type CheckoutStatus,
} from "@/lib/ucp/checkout/state";
import {
  LICENSE_TERMS_VERSION,
  MAX_CHECKOUT_LINES,
  UnknownVariant,
  checkoutTerms,
  lineTerms,
  resolveVariant,
  termsDigest,
  type PaymentTerms,
} from "@/lib/ucp/checkout/terms";
import { variantGid } from "@/lib/ucp/ids";
import { getMenuItem } from "@/store/menu";

/**
 * THE TIER MUST BE CHOSEN, NEVER INFERRED.
 *
 * This is the failure the whole terms snapshot exists to prevent: on a
 * shelf with three exact amounts per pay-what-it-deserves item, a
 * verifier that reads the tier off the amount lets one tier's
 * legitimate price buy another tier's goods.
 */
describe("a variant id decides the price; the price never decides the variant", () => {
  it("re-derives each tier's amount from the till's own tiers", () => {
    const collab = getMenuItem("the_collab")!;
    const tiers = priceTiersUsdc(collab);
    tiers.forEach((usdc, index) => {
      const resolved = resolveVariant(variantGid("the_collab", index));
      expect(resolved.usdc).toBe(usdc);
      expect(resolved.tierIndex).toBe(index);
    });
    expect(tiers).toEqual([300, 600, 1500]);
  });

  it("refuses a tiered item named without a tier, rather than selling the cheapest", () => {
    // Guessing the minimum would sell somebody the smallest thing on
    // an ambiguous request, and they would have no way to know.
    expect(() => resolveVariant("gid://scvd.store/Variant/the_collab")).toThrow(
      UnknownVariant,
    );
    expect(() => resolveVariant("gid://scvd.store/Variant/luckies")).toThrow(
      UnknownVariant,
    );
  });

  it("refuses a tier on an item that has none", () => {
    expect(() =>
      resolveVariant("gid://scvd.store/Variant/service_audit/tier-2"),
    ).toThrow(UnknownVariant);
  });

  it("refuses a tier index the item does not offer", () => {
    expect(() =>
      resolveVariant("gid://scvd.store/Variant/the_collab/tier-4"),
    ).toThrow(UnknownVariant);
    expect(() =>
      resolveVariant("gid://scvd.store/Variant/the_collab/tier-0"),
    ).toThrow(UnknownVariant);
  });

  it("refuses a sub-cent item, which has no catalog variant to sell", () => {
    for (const id of ["spot_check", "small_blessing"]) {
      expect(() => resolveVariant(variantGid(id)), id).toThrow(UnknownVariant);
    }
  });

  it("refuses anything that is not one of this store's variant ids", () => {
    for (const bad of [
      "service_audit",
      "SCVD-SERVICE-AUDIT",
      "gid://scvd.store/Product/service_audit",
      "gid://evil.example/Variant/service_audit",
      "gid://scvd.store/Variant/../../etc/passwd",
      "",
    ]) {
      expect(() => resolveVariant(bad), bad).toThrow(UnknownVariant);
    }
  });

  it("freezes the tier, its SKU and the licence version into the line", () => {
    const line = lineTerms(variantGid("the_collab", 2), 1);
    expect(line.variant_id).toBe("gid://scvd.store/Variant/the_collab/tier-3");
    expect(line.sku).toBe("SCVD-THE-COLLAB-T5");
    expect(line.tier_index).toBe(2);
    expect(line.unit_price).toEqual({ amount: 150_000, currency: "USD" });
    expect(line.unit_amount_atomic).toBe("1500000000");
    expect(line.license.class).toBe("joint_work");
    expect(line.license.version).toBe(LICENSE_TERMS_VERSION);
    expect(line.license.status).toBe("draft");
  });

  it("canonicalises the variant id it was handed", () => {
    // Whatever spelling arrived, the checkout stores the store's own.
    const line = lineTerms("gid://scvd.store/Variant/service_audit", 1);
    expect(line.variant_id).toBe("gid://scvd.store/Variant/service_audit");
    expect(line.sku).toBe("SCVD-SERVICE-AUDIT");
    expect(line.tier_index).toBeUndefined();
  });

  it("refuses a quantity that is not a positive whole number", () => {
    for (const quantity of [0, -1, 1.5, Number.NaN, Number.MAX_VALUE]) {
      expect(() => lineTerms(variantGid("hello"), quantity), `${quantity}`).toThrow();
    }
  });

  it("sells one line at a time, because this shelf has no cart", () => {
    expect(MAX_CHECKOUT_LINES).toBe(1);
  });
});

describe("the terms snapshot totals in both representations at once", () => {
  it("keeps cents and atomic USDC describing the same money", () => {
    const line = lineTerms(variantGid("service_audit"), 3);
    const terms = checkoutTerms({
      checkoutId: "chk_test",
      version: 1,
      lines: [line],
      expiresAt: "2026-09-16T12:00:00.000Z",
    });
    expect(terms.total).toEqual({ amount: 1500, currency: "USD" });
    expect(terms.total_amount_atomic).toBe("15000000");
    expect(Number(terms.total_amount_atomic)).toBe(terms.total.amount * 10_000);
    expect(terms.currency).toBe("USD");
  });
});

describe("the terms digest binds what settlement depends on, and nothing else", () => {
  const base: PaymentTerms = {
    checkout_id: "chk_abc",
    checkout_version: 1,
    network: "eip155:8453",
    asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    amount_atomic: "5000000",
    pay_to: "0x1111111111111111111111111111111111111111",
    expires_at: "2026-09-16T12:00:00.000Z",
  };

  it("is stable for identical terms", async () => {
    expect(await termsDigest(base)).toBe(await termsDigest({ ...base }));
  });

  it("moves when any field the payment depends on moves", async () => {
    const original = await termsDigest(base);
    const changes: Partial<PaymentTerms>[] = [
      { checkout_version: 2 },
      { amount_atomic: "5000001" },
      { network: "eip155:137" },
      { asset: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
      { pay_to: "0x2222222222222222222222222222222222222222" },
      { expires_at: "2026-09-16T12:00:01.000Z" },
      { checkout_id: "chk_other" },
    ];
    for (const change of changes) {
      expect(await termsDigest({ ...base, ...change }), JSON.stringify(change)).not.toBe(
        original,
      );
    }
  });

  it("reads one EVM address however it was cased, and never does that to Solana", async () => {
    // The 2026-09-12 lesson, applied one level up: an EVM address is
    // one identifier however it is spelled; base58 is case-significant.
    expect(
      await termsDigest({ ...base, pay_to: base.pay_to.toUpperCase().replace("0X", "0x") }),
    ).toBe(await termsDigest(base));

    const solana: PaymentTerms = {
      ...base,
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      pay_to: "11111111111111111111111111111111",
    };
    expect(await termsDigest({ ...solana, pay_to: "1111111111111111111111111111111z" })).not.toBe(
      await termsDigest(solana),
    );
  });
});

describe("the checkout lifecycle", () => {
  it("only reaches completed through complete_in_progress", () => {
    expect(canTransition("ready_for_complete", "completed")).toBe(false);
    expect(canTransition("ready_for_complete", "complete_in_progress")).toBe(true);
    expect(canTransition("complete_in_progress", "completed")).toBe(true);
  });

  it("lets a declined settlement go back to ready_for_complete, because no money moved", () => {
    expect(canTransition("complete_in_progress", "ready_for_complete")).toBe(true);
  });

  it("never leaves a terminal state", () => {
    for (const terminal of ["completed", "canceled"] as const) {
      expect(isTerminal(terminal)).toBe(true);
      for (const to of [
        "incomplete",
        "ready_for_complete",
        "complete_in_progress",
        "completed",
        "canceled",
      ] as CheckoutStatus[]) {
        expect(canTransition(terminal, to), `${terminal} -> ${to}`).toBe(false);
      }
      expect(() => assertTransition(terminal, "completed")).toThrow(
        InvalidCheckoutTransition,
      );
    }
  });

  it("expires on a window shorter than the protocol default, and says when", () => {
    // Six hours of a stranger's unfinished intent is most of a working
    // day of a two-a-week ceiling held by nobody.
    expect(CHECKOUT_TTL_SECONDS).toBeLessThan(6 * 3600);
    const created = Date.parse("2026-09-16T12:00:00.000Z");
    const expiry = checkoutExpiry(created);
    expect(expiry).toBe("2026-09-16T12:30:00.000Z");
    expect(isExpired(expiry, created)).toBe(false);
    expect(isExpired(expiry, created + CHECKOUT_TTL_SECONDS * 1000 - 1)).toBe(false);
    expect(isExpired(expiry, created + CHECKOUT_TTL_SECONDS * 1000)).toBe(true);
  });
});
