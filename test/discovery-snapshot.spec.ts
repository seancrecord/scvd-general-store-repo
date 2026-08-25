import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { inventoryOrigin } from "@/discovery";
import { compareCatalogSnapshots } from "@/discovery/snapshot";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const ABOUT = "https://drift.example";
const FIRST = "2026-08-24T21:20:00Z";
const SECOND = "2026-08-24T21:21:00Z";
const CLOCK = "injected-test-clock";

/**
 * SNAPSHOT — the next inventory names what moved. Not a watch.
 * First look has nothing to compare. A planted extra x402 route
 * is a hash change and a claim change, not a score.
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
      store: { name: "Drift Shop" },
      items: [{ id: "hello", buy_url: `${ABOUT}/api/buy/hello` }],
    }),
  },
  "/.well-known/x402.json": {
    body: JSON.stringify({
      serviceName: "Drift Shop",
      resources: [{ resourceUrl: `${ABOUT}/api/buy/hello` }],
    }),
  },
};

const PLANTED = {
  ...AGREEING,
  "/.well-known/x402.json": {
    body: JSON.stringify({
      serviceName: "Drift Shop",
      resources: [
        { resourceUrl: `${ABOUT}/api/buy/hello` },
        { resourceUrl: `${ABOUT}/api/buy/planted_drift` },
      ],
    }),
  },
};

async function clearSnapshots(): Promise<void> {
  const listed = await (
    env as unknown as Env
  ).COUNTERS.list({ prefix: KV_KEYS.discoverySnapshotPrefix });
  await Promise.all(
    listed.keys.map((key) =>
      (env as unknown as Env).COUNTERS.delete(key.name),
    ),
  );
}

describe("a second inventory names what moved", () => {
  beforeEach(async () => {
    await clearSnapshots();
  });

  it("first look has nothing to compare; the same catalogs again are unchanged", async () => {
    const first = await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: FIRST,
      clock: CLOCK,
      fetchImpl: catalogFetch(AGREEING),
    });
    expect(first.status).toBe(200);
    if (!("artifact" in first.body)) throw new Error("expected inventory");
    expect(first.body.compared_to).toBeNull();

    const second = await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: SECOND,
      clock: CLOCK,
      fetchImpl: catalogFetch(AGREEING),
    });
    expect(second.status).toBe(200);
    if (!("artifact" in second.body)) throw new Error("expected inventory");
    expect(second.body.compared_to).toEqual({
      previous_at: FIRST,
      previous_verdict: "agree",
      verdict: "agree",
      verdict_changed: false,
      surfaces_appeared: [],
      surfaces_disappeared: [],
      surfaces_hash_changed: [],
      claim_changes: [],
    });
  });

  it("a planted extra x402 route is named as a hash and claim change", async () => {
    await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: FIRST,
      clock: CLOCK,
      fetchImpl: catalogFetch(AGREEING),
    });
    const second = await inventoryOrigin({
      rawUrl: ABOUT,
      env: env as unknown as Env,
      at: SECOND,
      clock: CLOCK,
      fetchImpl: catalogFetch(PLANTED),
    });
    expect(second.status).toBe(200);
    if (!("artifact" in second.body)) throw new Error("expected inventory");
    const compared = second.body.compared_to;
    expect(compared?.verdict_changed).toBe(true);
    expect(compared?.previous_verdict).toBe("agree");
    expect(compared?.verdict).toBe("conflict");
    expect(compared?.surfaces_hash_changed).toContain("x402_catalog");
    expect(
      compared?.claim_changes.some(
        (row) =>
          row.surface === "x402_catalog" &&
          row.kind === "route_identity" &&
          row.only_current.includes("planted_drift"),
      ),
    ).toBe(true);
    expect(JSON.stringify(second.body)).not.toMatch(
      /score|confidence|rating|rank/i,
    );
  });

  it("compare itself names a disappeared hash without a live fetch", () => {
    const previous = {
      about: ABOUT,
      at: FIRST,
      verdict: "agree" as const,
      surfaces: [
        {
          id: "menu_json",
          path: "/menu.json",
          observed: true,
          sha256: "aa".repeat(32),
          claims: { route_identity: ["hello"] },
        },
      ],
    };
    const current = {
      about: ABOUT,
      at: SECOND,
      verdict: "not_observed" as const,
      surfaces: [
        {
          id: "menu_json",
          path: "/menu.json",
          observed: false,
          claims: {},
        },
      ],
    };
    const compared = compareCatalogSnapshots(previous, current);
    expect(compared.surfaces_disappeared).toEqual(["menu_json"]);
    expect(compared.verdict_changed).toBe(true);
    expect(compared.claim_changes).toEqual([
      {
        surface: "menu_json",
        kind: "route_identity",
        only_previous: ["hello"],
        only_current: [],
      },
    ]);
  });
});
