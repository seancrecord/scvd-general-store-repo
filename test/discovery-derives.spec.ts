import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { acceptedNetworks, manifestAccepts, railAccepts, SIGNING_WINDOW_SECONDS } from "@/lib/payments";
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
    accepts?: Array<{ network: string; maxTimeoutSeconds?: number }>;
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

/**
 * THE SIGNING WINDOW, ADVERTISED AND SERVED (added 2026-09-14).
 *
 * The fourth fact where drift is a customer-facing lie, and the one
 * this spec was missing on the day it was written: how long a signed
 * authorization stays good. `railAccepts` sets maxTimeoutSeconds on
 * every entry so that `@x402/core`'s `|| 300` can never bind (see
 * SIGNING_WINDOW_SECONDS); `manifestAccepts` then rebuilt the entry
 * field by field and dropped it, so every discovery surface served
 * accepts WITHOUT the window while the challenge served them with it.
 * A buyer pre-building a payment from `/.well-known/x402` had to
 * guess validBefore, or inherit the same library fallback we pinned
 * ourselves against.
 *
 * Two assertions on purpose. The first reads the SERVED document, in
 * this spec's own register: whatever else moves, what a buyer fetches
 * carries the ruled window. The second is the narrower pin on how the
 * bug happened — the manifest rebuilt entry by entry against the
 * till's own builder, which is the invariant manifestAccepts claims
 * in its docblock and the one that silently stopped holding. The
 * served challenge's own half of this is walked by
 * cross-surface-tier-a.spec.ts, which has the buyer harness.
 */
describe("signing window: discovery advertises the window the till serves", () => {
  it("every advertised accepts entry carries the ruled window", () => {
    for (const item of MENU_ITEMS) {
      const resource = buyResource(item.id)!;
      for (const entry of resource.accepts ?? []) {
        expect(
          entry.maxTimeoutSeconds,
          `${item.id} advertises ${entry.network} without a signing window`,
        ).toBe(SIGNING_WINDOW_SECONDS);
      }
    }
  });

  it("the manifest carries the window the till's own builder sets", () => {
    // The failure was not a wrong number, it was a DROPPED one:
    // manifestAccepts rebuilds each entry field by field, so a field
    // railAccepts sets is only advertised if someone remembered to
    // copy it. Compared entry by entry against the till's builder,
    // which is what payment-gate reads to write the real challenge.
    const tiers = [0.001, 0.5];
    const till = railAccepts(testEnv, tiers);
    const manifest = manifestAccepts(testEnv, tiers);
    expect(manifest.length).toBe(till.length);
    for (const [index, entry] of manifest.entries()) {
      const source = till[index]!;
      expect(entry.network, `entry ${index} order`).toBe(source.network);
      expect(
        entry.maxTimeoutSeconds,
        `entry ${index} (${entry.network}) lost the window`,
      ).toBe(source.maxTimeoutSeconds);
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
