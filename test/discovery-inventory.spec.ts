import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_INVENTORY_VERSION,
  inventoryCandidates,
  inventoryOrigin,
} from "@/discovery";
import { OWNED_DISCOVERY_SURFACES } from "@/discovery/self-surfaces";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const ABOUT = "https://shop.example";
const AT = "2026-08-24T20:43:00Z";
const CLOCK = "injected-test-clock";

/**
 * FREE INVENTORY — productize, unpaid door, no wrap/passport needed.
 * Candidate paths are OWNED_DISCOVERY_SURFACES. The join is the
 * instrument we already sell pointed at us. No scores.
 */

function catalogFetch(
  bodies: Record<string, { status?: number; body: string }>,
): typeof fetch {
  return async (input) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = new URL(href).pathname;
    const row = bodies[path];
    if (!row) return new Response("", { status: 404 });
    return new Response(row.body, { status: row.status ?? 200 });
  };
}

const AGREEING = {
  "/menu.json": {
    body: JSON.stringify({
      store: { name: "Example Shop" },
      items: [
        {
          id: "hello",
          buy_url: `${ABOUT}/api/buy/hello`,
        },
      ],
    }),
  },
  "/.well-known/x402.json": {
    body: JSON.stringify({
      serviceName: "Example Shop",
      resources: [{ resourceUrl: `${ABOUT}/api/buy/hello` }],
    }),
  },
};

describe("the inventory door documents itself", () => {
  it("GET names the candidate paths from the owned inventory, not a second list", async () => {
    const json = (await (
      await SELF.fetch(`${BASE}/api/discovery/${DISCOVERY_INVENTORY_VERSION}`)
    ).json()) as {
      version: string;
      candidate_paths: string[];
      signed: boolean;
    };
    expect(json.version).toBe("v1");
    expect(json.signed).toBe(false);
    expect(json.candidate_paths).toEqual(
      OWNED_DISCOVERY_SURFACES.map((surface) => surface.path),
    );
    expect(inventoryCandidates()).toBe(OWNED_DISCOVERY_SURFACES);
  });
});

describe("the inventory door refuses what the probe law refuses", () => {
  it("rejects a missing url, a private address, and this store", async () => {
    const missing = await SELF.fetch(`${BASE}/api/discovery/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    const loopback = await SELF.fetch(`${BASE}/api/discovery/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://127.0.0.1/" }),
    });
    expect(loopback.status).toBe(400);
    expect(await loopback.text()).toContain("private");

    const self = await SELF.fetch(`${BASE}/api/discovery/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${BASE}/menu.json` }),
    });
    expect(self.status).toBe(400);
    expect(await self.text()).toContain("own hostname");
  });
});

describe("the inventory join is the instrument pointed outward", () => {
  it("agreeing catalogs return unsigned agree, with hashes and no score", async () => {
    const result = await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch(AGREEING),
    });
    expect(result.status).toBe(200);
    if (!("artifact" in result.body)) throw new Error("expected inventory");
    expect(result.body.artifact).toBe("discovery_inventory");
    expect(result.body.about).toBe(ABOUT);
    expect(result.body.at).toBe(AT);
    expect(result.body.clock).toBe(CLOCK);
    expect(result.body.signed).toBe(false);
    expect(result.body.derived.verdict).toBe("agree");
    expect(result.body.disagreements).toEqual([]);
    expect(result.body.not_checked).toContain("same_operator");
    const menu = result.body.surfaces.find((row) => row.id === "menu_json");
    expect(menu?.observed).toBe(true);
    expect(menu?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(menu?.claims["route_identity"]).toEqual(["hello"]);
    expect(JSON.stringify(result.body)).not.toMatch(
      /score|confidence|rating|rank/i,
    );
  });

  it("a planted extra x402 route is a conflict — the join can fire", async () => {
    const planted = {
      ...AGREEING,
      "/.well-known/x402.json": {
        body: JSON.stringify({
          serviceName: "Example Shop",
          resources: [
            { resourceUrl: `${ABOUT}/api/buy/hello` },
            { resourceUrl: `${ABOUT}/api/buy/planted_inventory` },
          ],
        }),
      },
    };
    const result = await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch(planted),
    });
    expect(result.status).toBe(200);
    if (!("artifact" in result.body)) throw new Error("expected inventory");
    expect(result.body.derived.verdict).toBe("conflict");
    expect(
      result.body.disagreements.some(
        (row) =>
          row.kind === "route_identity" &&
          row.only_right.includes("planted_inventory"),
      ),
    ).toBe(true);
  });

  it("one lonely catalog is not_observed, not a silent agree", async () => {
    const result = await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch({
        "/menu.json": AGREEING["/menu.json"]!,
      }),
    });
    expect(result.status).toBe(200);
    if (!("artifact" in result.body)) throw new Error("expected inventory");
    expect(result.body.derived.verdict).toBe("not_observed");
    expect(result.body.disagreements).toEqual([]);
  });
});
