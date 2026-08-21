import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POLYGON_EVM, TRANSFER_TOPIC, POLYGON_USDC } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  POLYGON_RECONCILE_CURSOR_KEY,
  POLYGON_RECONCILE_LAST_RESULT_KEY,
  runChainReconciliation,
} from "@/services/chain-reconciliation";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE THIRD RAIL'S BANK WALK (parity ruling, 2026-08-21). Real money
 * settles on Polygon — the first dollar landed the same day this walk
 * was built — and before it, the rail's incoming transfers were the
 * unwatched half of the books: nothing read the chain side, so a
 * payment the pipeline never recorded was invisible to every
 * instrument the store has. Same walk as Base, one chain parameter;
 * these tests pin that the parameter actually separates the rails.
 */

const PAY_TO = "0xdd350976b8cffc65938c0464d39a2c78be079bd0";
const pad = (address: string) =>
  `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

function stubPolygonChain(options: { inflows: unknown[] }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as {
        method?: string;
        params?: Array<{ topics?: unknown[] }>;
      };
      let result: unknown = null;
      if (body.method === "eth_blockNumber") {
        result = "0x3f0f5d00";
      } else if (body.method === "eth_getLogs") {
        const topics = body.params?.[0]?.topics ?? [];
        // topics[2] filled = inflow query (transfers TO the till);
        // topics[1] filled with the till = the sentinel's outflow read.
        result = topics[2] ? options.inflows : [];
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("the Polygon bank walk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips itself with the reason stated while the rail is not configured", async () => {
    const bare = { ...testEnv, POLYGON_PAY_TO: undefined } as Env;
    const result = await runChainReconciliation(bare, { chain: POLYGON_EVM });
    expect(result.ran).toBe(false);
    expect(result.failed).toBeUndefined();
    expect(result.reason).toContain("POLYGON_PAY_TO");
    const recorded = await testEnv.COUNTERS.get(
      POLYGON_RECONCILE_LAST_RESULT_KEY,
    );
    expect(recorded).toBeTruthy();
  });

  it("walks its own cursor, never Base's", async () => {
    const withRail = { ...testEnv, POLYGON_PAY_TO: PAY_TO } as Env;
    const baseCursorBefore = await testEnv.COUNTERS.get(
      KV_KEYS.reconcileCursor,
    );
    stubPolygonChain({ inflows: [] });
    const result = await runChainReconciliation(withRail, {
      chain: POLYGON_EVM,
    });
    expect(result.ran).toBe(true);
    const polygonCursor = await testEnv.COUNTERS.get(
      POLYGON_RECONCILE_CURSOR_KEY,
    );
    expect(polygonCursor).toBeTruthy();
    // The Base cursor did not move on a Polygon pass — the one
    // confusion that would quietly cross the rails' books.
    expect(await testEnv.COUNTERS.get(KV_KEYS.reconcileCursor)).toBe(
      baseCursorBefore,
    );
  });

  it("finds a Polygon payment no certificate names", async () => {
    const withRail = { ...testEnv, POLYGON_PAY_TO: PAY_TO } as Env;
    await testEnv.COUNTERS.delete(POLYGON_RECONCILE_CURSOR_KEY);
    stubPolygonChain({
      inflows: [
        {
          transactionHash:
            "0x1d78fdc7531cd447d47b3c5e53a6e0d1080da8124bd8047710987e535229b7c1",
          address: POLYGON_USDC,
          topics: [
            TRANSFER_TOPIC,
            pad("0x843b544bf5f0aa6cbf13e94563874878c98cc4a7"),
            pad(PAY_TO),
          ],
          data: `0x${(500000n).toString(16).padStart(64, "0")}`,
          blockNumber: "0x3f0f5c43",
        },
      ],
    });
    const result = await runChainReconciliation(withRail, {
      chain: POLYGON_EVM,
    });
    expect(result.ran).toBe(true);
    expect(result.transfers_seen).toBeGreaterThanOrEqual(1);
    expect(
      (result.orphans ?? []).some(
        (orphan) =>
          orphan.tx_hash ===
          "0x1d78fdc7531cd447d47b3c5e53a6e0d1080da8124bd8047710987e535229b7c1",
      ),
    ).toBe(true);
  });
});

/**
 * ONE READ OF THE DRAWER FOR BOTH RAILS. The certificate scan is
 * capped at 2,000 keys and its answer does not depend on the chain,
 * so two EVM walks in the same cron tick asking separately is that
 * scan bought twice an hour for one fact — about 1.5M wasted KV reads
 * a month, which on this platform is a line on an invoice. The shared
 * runner is what keeps the third rail from doubling the bill.
 */
describe("both EVM walks, one certificate read", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the drawer once and still walks both rails", async () => {
    const { runEvmReconciliations } = await import(
      "@/services/chain-reconciliation"
    );
    const withRails = {
      ...testEnv,
      POLYGON_PAY_TO: PAY_TO,
      PAY_TO_ADDRESS: PAY_TO,
    } as Env;
    let certListCalls = 0;
    const realList = testEnv.PATRONS.list.bind(testEnv.PATRONS);
    const spied = {
      ...withRails,
      PATRONS: {
        ...testEnv.PATRONS,
        list: (options?: KVNamespaceListOptions) => {
          if (String(options?.prefix ?? "").startsWith("cert")) {
            certListCalls += 1;
          }
          return realList(options);
        },
      },
    } as unknown as Env;
    stubPolygonChain({ inflows: [] });
    const result = await runEvmReconciliations(spied);
    // Both walks reported — neither swallowed by the other.
    expect(result.base).toBeTruthy();
    expect(result.polygon).toBeTruthy();
    // The drawer was listed for ONE walk's worth, not two.
    expect(certListCalls).toBeLessThanOrEqual(1);
  });
});
