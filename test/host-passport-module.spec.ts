import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { inventoryOrigin } from "@/discovery";
import { DISCOVERY_COHERENCE_CLASS } from "@/discovery/diff-observation";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const JOINED = "https://joined.example";
const ONLY = "https://inventoried-only.example";
const LONELY = "https://lonely-host.example";
const AT = "2026-08-24T21:34:00Z";
const CLOCK = "injected-test-clock";

/**
 * OTHER-HOST PASSPORT MODULE — cite a join we already stored.
 * GET does not fetch. A lonely catalog is not cited. Inventory
 * without a census row still does not earn a public name.
 */

const testEnv = env as unknown as Env;

function catalogFetch(
  about: string,
  extraRoute?: string,
): typeof fetch {
  return async (input) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = new URL(href).pathname;
    if (path === "/menu.json") {
      return new Response(
        JSON.stringify({
          store: { name: "Joined Shop" },
          items: [{ id: "hello", buy_url: `${about}/api/buy/hello` }],
        }),
      );
    }
    if (path === "/.well-known/x402.json") {
      const resources = [{ resourceUrl: `${about}/api/buy/hello` }];
      if (extraRoute) {
        resources.push({ resourceUrl: `${about}/api/buy/${extraRoute}` });
      }
      return new Response(
        JSON.stringify({
          serviceName: "Joined Shop",
          resources,
        }),
      );
    }
    return new Response("", { status: 404 });
  };
}

async function seedReady(host: string): Promise<void> {
  const snapshot = {
    version: 1,
    sequence: 1,
    taken_at: "2026-08-19T17:00:00.000Z",
    previous_digest: null,
    source: "ward_round",
    week: "2026-W34",
    round: {
      week: "2026-W34",
      at: "2026-08-19T17:00:00.000Z",
      listed_resources: 1,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: [
        {
          host,
          url: `https://${host}/api/x`,
          verdict: "ready",
          failed: [],
          advisories: [],
        },
      ],
    },
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}000000001`,
    JSON.stringify({
      snapshot,
      digest: "0".repeat(64),
      signature: "0".repeat(128),
      public_key: "0".repeat(64),
    }),
  );
}

async function clearModules(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.hostDiscoveryModulePrefix,
  });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
}

async function passportOf(host: string): Promise<{
  status: number;
  body: {
    payload?: {
      modules: Array<{
        id: string;
        derived: string;
        evidence_hash: string;
        not_checked: string[];
      }>;
    };
    reason?: string;
  };
}> {
  const response = await SELF.fetch(`${BASE}/passport/${host}`, {
    headers: { Accept: "application/json" },
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      payload?: {
        modules: Array<{
          id: string;
          derived: string;
          evidence_hash: string;
          not_checked: string[];
        }>;
      };
      reason?: string;
    },
  };
}

describe("a census passport cites a join we already stored", () => {
  beforeEach(async () => {
    await clearModules();
  });

  it("stays empty until a join is stored, then cites agree, then conflict", async () => {
    await seedReady("joined.example");
    const before = await passportOf("joined.example");
    expect(before.status).toBe(200);
    expect(before.body.payload?.modules).toEqual([]);

    await inventoryOrigin({
      rawUrl: JOINED,
      env: testEnv,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch(JOINED),
    });
    const agreed = await passportOf("joined.example");
    expect(agreed.status).toBe(200);
    const module = agreed.body.payload?.modules[0];
    expect(module?.id).toBe(DISCOVERY_COHERENCE_CLASS);
    expect(module?.derived).toBe("agree");
    expect(module?.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(module?.not_checked).toContain("same_operator");
    expect(JSON.stringify(module)).not.toMatch(/score|confidence|rating|rank/i);

    await inventoryOrigin({
      rawUrl: JOINED,
      env: testEnv,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch(JOINED, "planted_host_module"),
    });
    const conflicted = await passportOf("joined.example");
    expect(conflicted.body.payload?.modules[0]?.derived).toBe("conflict");
    expect(conflicted.body.payload?.modules[0]?.evidence_hash).not.toBe(
      module?.evidence_hash,
    );
  });

  it("does not cite a lonely catalog, and inventory alone does not earn a name", async () => {
    await seedReady("lonely-host.example");
    await inventoryOrigin({
      rawUrl: LONELY,
      env: testEnv,
      at: AT,
      clock: CLOCK,
      fetchImpl: async (input) => {
        const href =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const path = new URL(href).pathname;
        if (path === "/menu.json") {
          return new Response(
            JSON.stringify({
              store: { name: "Lonely" },
              items: [{ id: "hello", buy_url: `${LONELY}/api/buy/hello` }],
            }),
          );
        }
        return new Response("", { status: 404 });
      },
    });
    const lonely = await passportOf("lonely-host.example");
    expect(lonely.status).toBe(200);
    expect(lonely.body.payload?.modules).toEqual([]);

    await inventoryOrigin({
      rawUrl: ONLY,
      env: testEnv,
      at: AT,
      clock: CLOCK,
      fetchImpl: catalogFetch(ONLY),
    });
    const unnamed = await passportOf("inventoried-only.example");
    expect(unnamed.status).toBe(404);
    expect(unnamed.body.reason).toBe("never-observed");
  });
});
