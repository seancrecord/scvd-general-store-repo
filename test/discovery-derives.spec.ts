import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { acceptedNetworks } from "@/lib/payments";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * ONE SPEC WALKS EVERY DISCOVERY SURFACE (task #79; rule 44's
 * standing form). The surfaces all DERIVE from MENU_ITEMS and
 * acceptedNetworks today — this spec is what keeps that true, by
 * asserting agreement on the SERVED documents rather than trusting
 * the derivation to stay wired. The facts checked are the ones where
 * drift is a customer-facing lie:
 *
 *   PRESENCE — every shelf item appears on every catalog surface,
 *   and no surface advertises a door the shelf does not hold.
 *   PRICE — the number a buyer sees is the same number everywhere.
 *   RAILS — every advertised accepts entry names a rail the till
 *   actually accepts, and every accepted rail is advertised.
 *
 * The X-PAYMENT correction (2026-08-26) is the cautionary tale this
 * spec generalizes: call sites were read and mistaken for behaviour.
 * Here the BEHAVIOUR is read — the documents as served — so a future
 * surface that quietly stops deriving fails in CI, not in a
 * reporter's transcript.
 */

interface MenuDoc {
  items: Array<{ id: string; price_usdc: number; price_tiers_usdc: number[] }>;
}
interface X402Doc {
  resources: Array<{
    resource: string;
    price_usdc_options?: number[];
    accepts?: Array<{ network: string }>;
  }>;
}
interface OpenApiDoc {
  paths: Record<string, unknown>;
}

let menu: MenuDoc;
let x402: X402Doc;
let openapi: OpenApiDoc;

beforeAll(async () => {
  menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as MenuDoc;
  x402 = (await (
    await SELF.fetch(`${BASE}/.well-known/x402.json`)
  ).json()) as X402Doc;
  openapi = (await (
    await SELF.fetch(`${BASE}/openapi.json`)
  ).json()) as OpenApiDoc;
});

function buyResource(id: string) {
  return x402.resources.find((entry) =>
    entry.resource.endsWith(`/api/buy/${id}`),
  );
}

describe("presence: every shelf item on every surface, no ghost doors", () => {
  it("menu.json and x402.json each carry every MENU_ITEM", () => {
    for (const item of MENU_ITEMS) {
      expect(
        menu.items.find((entry) => entry.id === item.id),
        `menu.json: ${item.id}`,
      ).toBeDefined();
      expect(buyResource(item.id), `x402.json: ${item.id}`).toBeDefined();
    }
  });

  it("openapi.json declares every buy door, and no buy door the shelf lacks", () => {
    const shelf = new Set(MENU_ITEMS.map((item) => `/api/buy/${item.id}`));
    const declared = Object.keys(openapi.paths).filter((path) =>
      path.startsWith("/api/buy/"),
    );
    for (const path of shelf) {
      expect(declared, `openapi missing ${path}`).toContain(path);
    }
    for (const path of declared) {
      // A door advertised with nothing behind it is the no-402 defect
      // pointed at ourselves.
      expect(shelf.has(path), `openapi declares ghost door ${path}`).toBe(true);
    }
  });
});

describe("price: the number a buyer sees is the same number everywhere", () => {
  it("menu tiers start at the item's own price, and x402 offers the same set", () => {
    for (const item of MENU_ITEMS) {
      const menuItem = menu.items.find((entry) => entry.id === item.id)!;
      expect(
        Math.min(...menuItem.price_tiers_usdc),
        `menu min for ${item.id}`,
      ).toBe(item.price_usdc);
      const resource = buyResource(item.id)!;
      expect(
        resource.price_usdc_options,
        `x402 tiers for ${item.id}`,
      ).toEqual(menuItem.price_tiers_usdc);
    }
  });
});

describe("rails: advertised is accepted and accepted is advertised", () => {
  it("every accepts entry names an accepted rail, and every rail appears", () => {
    const accepted = new Set(acceptedNetworks(testEnv));
    for (const item of MENU_ITEMS) {
      const resource = buyResource(item.id)!;
      const advertised = new Set(
        (resource.accepts ?? []).map((entry) => entry.network),
      );
      for (const network of advertised) {
        expect(accepted.has(network), `${item.id} advertises ${network}`).toBe(
          true,
        );
      }
      for (const network of accepted) {
        expect(
          advertised.has(network),
          `${item.id} misses accepted rail ${network}`,
        ).toBe(true);
      }
    }
  });
});
