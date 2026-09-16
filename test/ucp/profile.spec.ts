import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ARBITRUM_USDC, BASE_USDC, POLYGON_USDC, WORLD_USDC } from "@/lib/base-rpc";
import { SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { acceptedNetworks, basePayTo } from "@/lib/payment-networks";
import { usdcPaymentHandlers } from "@/lib/ucp/payments/usdc-x402";
import { UCP_VERSION } from "@/lib/ucp/version";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

describe("/.well-known/ucp", () => {
  it("serves a profile pinned to one dated UCP version", async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/ucp`);
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Record<string, any>;
    expect(profile.ucp.version).toBe(UCP_VERSION);
    expect(UCP_VERSION).toBe("2026-08-25");
    // Never "main", never "latest": a wire format that can change
    // under a deployed catalog without a commit here.
    expect(JSON.stringify(profile.ucp.version)).not.toContain("main");
  });

  it("advertises catalog search and lookup at a REST endpoint that answers", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    expect(profile.ucp.capabilities["dev.ucp.shopping.catalog.search"]).toBeDefined();
    expect(profile.ucp.capabilities["dev.ucp.shopping.catalog.lookup"]).toBeDefined();
    const endpoint = profile.ucp.services["dev.ucp.shopping"][0].endpoint;
    expect(endpoint).toBe(`${BASE}/ucp/v1`);
    const search = await SELF.fetch(`${endpoint}/catalog/search?q=audit`);
    expect(search.status).toBe(200);
  });

  it("does NOT advertise a capability this store has not built", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    const capabilities = Object.keys(profile.ucp.capabilities);
    expect(capabilities).not.toContain("dev.ucp.shopping.checkout");
    expect(capabilities).not.toContain("dev.ucp.shopping.order");
    // And an offer to transact is not made either.
    expect(profile.ucp.payment_handlers).toBeUndefined();
    expect(profile["store.scvd"].status.checkout).toBe("not implemented");
  });

  it("tells a reader that cannot use UCP how to actually pay", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    expect(profile["store.scvd"].how_to_actually_buy.http).toContain("/api/buy/");
    expect(profile["store.scvd"].how_to_actually_buy.mcp).toContain("/mcp");
  });

  it("puts every extension in the namespace this store owns, resolving to its own schemas", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    for (const [name, instances] of Object.entries(
      profile.ucp.capabilities as Record<string, any[]>,
    )) {
      if (name.startsWith("dev.ucp.")) continue;
      expect(name.startsWith("store.scvd."), name).toBe(true);
      for (const instance of instances) {
        expect(instance.schema, name).toContain(`${BASE}/ucp/schemas/`);
      }
    }
  });

  it("counts the shelf honestly, including what it left out and why", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    const catalog = profile["store.scvd"].catalog;
    expect(catalog.products_total).toBe(35);
    expect(catalog.products_in_ucp_catalog).toBe(31);
    expect(catalog.excluded.count).toBe(4);
    expect(catalog.excluded.reason).toContain("$0.001");
    expect(catalog.excluded.still_listed_at).toBe(`${BASE}/menu.json`);
  });
});

describe("the exact-USDC payment handler", () => {
  it("advertises only the rails the checkout itself has enabled", () => {
    const handlers = usdcPaymentHandlers(testEnv, BASE);
    expect(handlers.map((handler) => handler.config.network).sort()).toEqual(
      [...acceptedNetworks(testEnv)].sort(),
    );
    // A rail with no receiving wallet must not appear in a profile
    // while the till refuses it, whatever the environment configures.
    expect(handlers.length).toBe(acceptedNetworks(testEnv).length);
    expect(handlers[0]!.id).toBe("scvd-usdc-base");
    for (const handler of handlers) {
      expect(handler.config.pay_to, handler.id).toBeTruthy();
    }
  });

  it("emits the same asset strings the x402 quote carries, byte for byte", () => {
    const known = new Set([
      BASE_USDC,
      POLYGON_USDC,
      ARBITRUM_USDC,
      WORLD_USDC,
      SOLANA_USDC_MINT,
    ]);
    for (const handler of usdcPaymentHandlers(testEnv, BASE)) {
      expect(known.has(handler.config.asset), handler.config.asset).toBe(true);
    }
  });

  it("uses the store's one spelling of the receiving wallet", () => {
    const handler = usdcPaymentHandlers(testEnv, BASE)[0]!;
    expect(handler.config.pay_to).toBe(basePayTo(testEnv));
    // EIP-55, the spelling every other surface emits since 2026-09-12.
    expect(handler.config.pay_to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("publishes what settled means per rail instead of one borrowed number", () => {
    for (const handler of usdcPaymentHandlers(testEnv, BASE)) {
      expect(handler.config.finality.model).toBeTruthy();
      expect(handler.config.finality.accepted_at).toBeTruthy();
      expect(handler.config.decimals).toBe(6);
      expect(handler.config.scheme).toBe("exact");
      expect(handler.config.protocol).toBe("x402");
    }
    const spec = JSON.stringify(usdcPaymentHandlers(testEnv, BASE));
    expect(spec).not.toMatch(/confirmations?"\s*:\s*\d/);
  });
});
