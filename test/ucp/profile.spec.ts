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
    // POST, because the pinned REST contract says POST.
    const search = await SELF.fetch(`${endpoint}/catalog/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "audit" }),
    });
    expect(search.status).toBe(200);
    /*
     * A UCP-defined capability resolves to UCP's own schema, not to a
     * copy on this origin: the store vendors those files to validate
     * itself, it does not claim authorship of them.
     */
    for (const name of [
      "dev.ucp.shopping.catalog.search",
      "dev.ucp.shopping.catalog.lookup",
    ]) {
      expect(profile.ucp.capabilities[name][0].schema).toContain(
        "https://ucp.dev/schemas/",
      );
    }
  });

  it("advertises exactly what it serves: catalog, checkout, order and the inputs extension, and no more", async () => {
    /*
     * The suite runs with UCP checkout OPEN (vitest.config.ts), so
     * checkout and order are declared — and the same switch that
     * declares them is what makes Complete settle
     * (test/ucp/launch.spec.ts holds the closed half). Nothing else
     * is declared: no cart, no fulfillment, no identity linking, none
     * of the capabilities the shelf does not have.
     */
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    expect(Object.keys(profile.ucp.capabilities).sort()).toEqual([
      "dev.ucp.shopping.catalog.lookup",
      "dev.ucp.shopping.catalog.search",
      "dev.ucp.shopping.checkout",
      "dev.ucp.shopping.order",
      "store.scvd.shopping.inputs",
    ]);
    expect(profile["store.scvd"].status.checkout).toBe("live");
    /*
     * payment_handlers IS declared, and that was a correction rather
     * than a reversal of intent. The business schema requires it, so
     * omitting it produced an invalid profile rather than a cautious
     * one. Open, the instances are the rails a checkout is quoted on
     * and the note says they are drivable; closed, every rail the till
     * settles on is still declared, truthfully, as not drivable.
     */
    expect(Object.keys(profile.ucp.payment_handlers)).toEqual([
      "store.scvd.payment.usdc",
    ]);
    expect(profile["store.scvd"].payment_handler_note.drivable_through_ucp).toBe(
      true,
    );
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
