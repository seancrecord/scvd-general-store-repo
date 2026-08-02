import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  knownSettlementHashes,
  reconcileAgainstChain,
  runChainReconciliation,
  RECONCILE_BLOCK_SPAN,
} from "@/services/chain-reconciliation";
import { KV_KEYS } from "@/lib/kv-keys";
import { listAlerts } from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE BANK RECONCILIATION (problem ledger #4) — the only instrument in
 * this store that does not depend on our own writes.
 *
 * The delivery audit catches a handler that died after settlement,
 * because we wrote the intent row first. It is blind to the case where
 * OUR OWN WRITES are what failed. This walks the other side of the
 * books — USDC arriving at the wallet, straight off Base — so no
 * failure of ours can hide a payment from it.
 *
 * Tested against a fake RPC, for the same reason the anchor submitter
 * is: the property being proved is that a chain answer we do not
 * control cannot damage us or be silently misread, and a real node
 * cannot be asked to return nonsense on demand.
 */

const PAY_TO = "0x1111111111111111111111111111111111111111";
const HEAD = 30_000_000;

function rpcFetch(handlers: {
  head?: number;
  logs?: Array<{ tx: string; from: string; units: bigint; block: number }>;
  fail?: "head" | "logs";
}): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { method: string };
    if (body.method === "eth_blockNumber") {
      if (handlers.fail === "head") {
        return { ok: false, status: 500 } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          result: `0x${(handlers.head ?? HEAD).toString(16)}`,
        }),
      } as unknown as Response;
    }
    if (body.method === "eth_getLogs") {
      if (handlers.fail === "logs") {
        return { ok: false, status: 429 } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          result: (handlers.logs ?? []).map((entry) => ({
            transactionHash: entry.tx,
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              `0x${entry.from.replace(/^0x/, "").padStart(64, "0")}`,
              `0x${PAY_TO.replace(/^0x/, "").padStart(64, "0")}`,
            ],
            data: `0x${entry.units.toString(16).padStart(64, "0")}`,
            blockNumber: `0x${entry.block.toString(16)}`,
          })),
        }),
      } as unknown as Response;
    }
    throw new Error(`unexpected RPC ${body.method}`);
  }) as unknown as typeof fetch;
}

function envWith(fetchImpl: typeof fetch): Env {
  vi.stubGlobal("fetch", fetchImpl);
  return { ...testEnv, PAY_TO_ADDRESS: PAY_TO } as Env;
}

async function clear(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.reconcileCursor);
  const certs = await testEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
  for (const key of certs.keys) await testEnv.PATRONS.delete(key.name);
}

beforeEach(clear);
afterEach(() => vi.unstubAllGlobals());

async function putCert(certId: string, settlementTx?: string): Promise<void> {
  await testEnv.PATRONS.put(
    KV_KEYS.cert(certId),
    JSON.stringify({
      certificate: {
        cert_id: certId,
        item: "hello",
        patron_number: 1,
        date: "2026-08-02",
        ...(settlementTx ? { settlement_tx: settlementTx } : {}),
      },
      signature: "aa",
      public_key: "bb",
    }),
  );
}

describe("the known-settlement set", () => {
  it("collects settlement hashes from certificates, lowercased", async () => {
    await putCert("cert_a", "0xAABBCC");
    await putCert("cert_b", "0xddeeff");
    await putCert("cert_c");
    const { hashes } = await knownSettlementHashes(testEnv);
    expect(hashes.has("0xaabbcc")).toBe(true);
    expect(hashes.has("0xddeeff")).toBe(true);
    expect(hashes.size).toBe(2);
  });
});

describe("walking the chain", () => {
  it("finds nothing to report when every transfer has a certificate", async () => {
    await putCert("cert_a", "0xdeadbeef");
    const result = await reconcileAgainstChain(
      envWith(
        rpcFetch({
          logs: [
            { tx: "0xdeadbeef", from: "0x2222", units: 10000n, block: HEAD - 5 },
          ],
        }),
      ),
    );
    expect(result.ran).toBe(true);
    expect(result.transfers_seen).toBe(1);
    expect(result.orphans).toEqual([]);
  });

  it("FLAGS money that arrived with no certificate naming it", async () => {
    // The case the delivery audit cannot see: our own records are
    // empty, so every instrument built from them reports a clean sweep.
    const result = await reconcileAgainstChain(
      envWith(
        rpcFetch({
          logs: [
            { tx: "0xorphan", from: "0x3333", units: 20_000_000n, block: HEAD - 3 },
          ],
        }),
      ),
    );
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans![0]!.tx_hash).toBe("0xorphan");
    expect(result.orphans![0]!.usdc).toBe(20);
  });

  it("matches case-insensitively, so a hash spelling is not a false alarm", async () => {
    await putCert("cert_a", "0xABCDEF");
    const result = await reconcileAgainstChain(
      envWith(
        rpcFetch({
          logs: [{ tx: "0xabcdef", from: "0x4444", units: 1n, block: HEAD - 1 }],
        }),
      ),
    );
    expect(result.orphans).toEqual([]);
  });
});

describe("it fails closed and never lies about having looked", () => {
  it("does not run without a receiving address", async () => {
    const result = await reconcileAgainstChain({
      ...testEnv,
      PAY_TO_ADDRESS: "",
    } as Env);
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("PAY_TO_ADDRESS");
  });

  it("reports an unreadable chain head as NOT RUN, not as clean", async () => {
    const result = await reconcileAgainstChain(
      envWith(rpcFetch({ fail: "head" })),
    );
    expect(result.ran).toBe(false);
    expect(result.orphans).toBeUndefined();
    expect(result.reason).toContain("chain head");
  });

  it("reports a failed log query as NOT RUN", async () => {
    const result = await reconcileAgainstChain(
      envWith(rpcFetch({ fail: "logs" })),
    );
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("chain query failed");
  });

  it("leaves the cursor alone when a pass fails, so the window is retried", async () => {
    /**
     * A reconciliation that advanced past a window it never actually
     * read would skip the exact blocks it failed on — worse than
     * falling behind, because nothing would ever look there again.
     */
    await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    const after = await testEnv.COUNTERS.get(KV_KEYS.reconcileCursor);
    expect(after).not.toBeNull();

    await reconcileAgainstChain(envWith(rpcFetch({ fail: "logs" })));
    expect(await testEnv.COUNTERS.get(KV_KEYS.reconcileCursor)).toBe(after);
  });
});

describe("the cursor", () => {
  it("starts near the head rather than at genesis", async () => {
    // Walking all of Base to find eight settlements would time out
    // forever and report nothing, which is worse than starting late.
    const result = await reconcileAgainstChain(
      envWith(rpcFetch({ logs: [] })),
    );
    expect(result.from_block).toBe(HEAD - RECONCILE_BLOCK_SPAN);
    expect(result.to_block).toBeLessThanOrEqual(HEAD);
  });

  it("advances so the next pass reads new blocks", async () => {
    await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    const first = Number(await testEnv.COUNTERS.get(KV_KEYS.reconcileCursor));
    const second = await reconcileAgainstChain(
      envWith(rpcFetch({ logs: [], head: HEAD + 500 })),
    );
    expect(second.from_block).toBe(first + 1);
  });

  it("says so rather than running when there are no new blocks", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.reconcileCursor, String(HEAD));
    const result = await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("no new blocks");
  });
});

describe("the cron pass", () => {
  it("pages the keeper with the hash, the payer and the money", async () => {
    await runChainReconciliation(
      envWith(
        rpcFetch({
          logs: [
            { tx: "0xpaged", from: "0x5555", units: 3_000_000n, block: HEAD - 2 },
          ],
        }),
      ),
    );
    const alert = (await listAlerts(testEnv, 50)).find((a) =>
      a.detail.includes("0xpaged"),
    );
    expect(alert).toBeDefined();
    // The claim that makes this different from every other instrument.
    expect(alert!.detail).toContain("The chain says we were paid");
    expect(alert!.detail).toContain("3 USDC");
  });

  it("stays quiet when the books agree", async () => {
    await putCert("cert_a", "0xquiet");
    const result = await runChainReconciliation(
      envWith(
        rpcFetch({
          logs: [{ tx: "0xquiet", from: "0x6666", units: 1n, block: HEAD - 1 }],
        }),
      ),
    );
    expect(result.orphans).toEqual([]);
  });
});
