import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_EVM, POLYGON_EVM } from "@/lib/base-rpc";
import { kvGet, kvGetJson, withKvRetry } from "@/lib/kv-retry";
import { runEvmReconciliations } from "@/services/chain-reconciliation";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE BLIP THAT PAGED THE KEEPER AT 4:31 IN THE AFTERNOON.
 *
 * 2026-08-21T20:31:38.446Z, P1, worker_health: "Chain reconciliation
 * failed: KV GET failed: 500 Internal Server Error". Cloudflare's KV
 * service returned a transient 500 to the hourly bank walk. Nothing in
 * the store's own data was wrong; nothing was mis-delivered; the Worker
 * itself was up and serving. One hour of the walk was simply skipped.
 *
 * TWO THINGS WERE OURS, THOUGH, and this file pins both.
 *
 * ONE — GET, not GET_BULK. The retry policy written 2026-08-04 covered
 * bulk reads and only bulk reads. Five single-key `.get()` calls in the
 * bank walk had no retry at all, on a platform whose own docs call a
 * 500 retryable. The policy now lives in lib/kv-retry.ts and covers
 * both shapes of read.
 *
 * TWO — the parity build's own regression, shipped the day before. The
 * shared certificate read that saved ~1.5M KV reads a month was written
 * straight-line, so one transient failure skipped BOTH EVM rails and
 * sent a single alert naming neither. The saving stays; the coupling
 * does not.
 */

const PAY_TO = "0xdd350976b8cffc65938c0464d39a2c78be079bd0";

describe("a transient KV 500", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is retried instead of taking down the caller", async () => {
    let calls = 0;
    const flaky = {
      get: async (_key: string) => {
        calls += 1;
        if (calls < 3) throw new Error("KV GET failed: 500 Internal Server Error");
        return "1234";
      },
    } as unknown as Env["COUNTERS"];
    expect(await kvGet(flaky, "reconcile_cursor")).toBe("1234");
    expect(calls).toBe(3);
  });

  it("still throws when it is not a blip, because a made-up cursor is worse", async () => {
    /*
     * The line the bulk policy already drew. Defaulting a failed cursor
     * read to "missing" would restart the walk from a fabricated block
     * and report that span as clean — a wrong number wearing a walk's
     * authority. Loud failure plus the next hourly pass is the honest
     * degradation.
     */
    const dead = {
      get: async () => {
        throw new Error("KV GET failed: 500 Internal Server Error");
      },
    } as unknown as Env["COUNTERS"];
    await expect(kvGet(dead, "reconcile_cursor")).rejects.toThrow(/500/);
  });

  it("covers the JSON shape too — the skipped-ranges record reads that way", async () => {
    let calls = 0;
    const flaky = {
      get: async () => {
        calls += 1;
        if (calls === 1) throw new Error("KV GET failed: 500 Internal Server Error");
        return { ranges: [], total_ranges: 0, total_blocks: 0 };
      },
    } as unknown as Env["COUNTERS"];
    const record = await kvGetJson<{ total_blocks: number }>(flaky, "skipped");
    expect(record?.total_blocks).toBe(0);
    expect(calls).toBe(2);
  });

  it("hands back the LAST error, not the first, so the detail is current", async () => {
    let calls = 0;
    await expect(
      withKvRetry(async () => {
        calls += 1;
        throw new Error(`attempt ${calls}`);
      }),
    ).rejects.toThrow("attempt 3");
  });
});

/**
 * THE COUPLING, UNDONE. Both walks still share one read of the
 * certificate drawer; neither depends on the other surviving.
 */
describe("one rail's bad hour", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not skip the other rail's books", async () => {
    const withRails = {
      ...testEnv,
      PAY_TO_ADDRESS: PAY_TO,
      POLYGON_PAY_TO: PAY_TO,
    } as Env;
    /*
     * Base's chain read dies; Polygon's answers. Before this fix the
     * throw escaped runEvmReconciliations and Polygon was never asked.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        if (String(url).includes("base")) {
          throw new Error("Network connection lost.");
        }
        const body = JSON.parse(init?.body ?? "{}") as { method?: string };
        const result =
          body.method === "eth_blockNumber" ? "0x3f0f5d00" : [];
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const result = await runEvmReconciliations(withRails);
    // Both rails REPORTED. The failing one says so rather than vanishing.
    expect(result.base).toBeTruthy();
    expect(result.polygon).toBeTruthy();
    // And the Polygon walk actually ran, which is the whole point.
    expect(result.polygon.ran).toBe(true);
  });

  it("survives the shared certificate read failing, by paying for it twice", async () => {
    /*
     * The saving is a saving, not a dependency. If the one shared read
     * blips, each walk falls back to reading the drawer itself —
     * dearer, and dearer beats blind.
     */
    const withRails = {
      ...testEnv,
      PAY_TO_ADDRESS: PAY_TO,
      POLYGON_PAY_TO: PAY_TO,
      PATRONS: {
        ...testEnv.PATRONS,
        list: async () => {
          throw new Error("KV GET failed: 500 Internal Server Error");
        },
      },
    } as unknown as Env;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { method?: string };
        const result =
          body.method === "eth_blockNumber" ? "0x3f0f5d00" : [];
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    // It must not throw out of the runner — that was the P1's shape.
    const result = await runEvmReconciliations(withRails);
    expect(result.base).toBeTruthy();
    expect(result.polygon).toBeTruthy();
  });

  it("names the rail in the page, because 'chain reconciliation' names neither", async () => {
    const sent: string[] = [];
    const withRails = {
      ...testEnv,
      PAY_TO_ADDRESS: PAY_TO,
      POLYGON_PAY_TO: PAY_TO,
      ALERT_EMAIL_TO: "keeper@example.com",
    } as Env;
    const alerts = await import("@/lib/alerts");
    vi.spyOn(alerts, "sendAlert").mockImplementation(async (_env, alert) => {
      sent.push(alert.detail);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network connection lost.");
      }),
    );
    await runEvmReconciliations(withRails);
    // Whatever else pages, at least one line says WHICH chain.
    expect(sent.some((detail) => /Base|Polygon/.test(detail))).toBe(true);
  });
});
