import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  cheapestListingUsdc,
  findLookalike,
  knownSettlementHashes,
  readSkippedRanges,
  recordDeliveredSettlement,
  reconcileAgainstChain,
  runChainReconciliation,
  RECONCILE_BLOCK_SPAN,
  RECONCILE_MAX_SPAN,
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
  await testEnv.COUNTERS.delete(KV_KEYS.reconcileSkippedRanges);
  const certs = await testEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
  for (const key of certs.keys) await testEnv.PATRONS.delete(key.name);
  // The delivered-settlement rows persist across tests like any KV row.
  const delivered = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.settledDeliveryPrefix,
  });
  for (const key of delivered.keys) await testEnv.COUNTERS.delete(key.name);
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

  it("unions the delivered-settlement rows — the shelves that mint nothing", async () => {
    // The penny pages' side of the books: no certificate exists, only
    // the row the gate wrote when the goods went out.
    await putCert("cert_a", "0xaabbcc");
    await recordDeliveredSettlement(testEnv, "0xPennyPage01");
    const { hashes } = await knownSettlementHashes(testEnv);
    expect(hashes.has("0xaabbcc")).toBe(true);
    expect(hashes.has("0xpennypage01")).toBe(true);
    expect(hashes.size).toBe(2);
  });
});

describe("the reconciliation false positive (penny pages)", () => {
  it("a delivered penny sale is NOT paged as possibly-undelivered money", async () => {
    /**
     * The case this fix exists for: an Almanac page sold at $0.01 —
     * above the store's cheapest listing, so classified possible_sale
     * — delivered its markdown and minted no certificate. Before the
     * delivered-settlement rows, this walk flagged that money as an
     * orphan and paged the keeper about a page that was served.
     */
    await recordDeliveredSettlement(testEnv, "0xAlmanacSale");
    const result = await reconcileAgainstChain(
      envWith(
        rpcFetch({
          logs: [
            // $0.01 in atomic units, straight off the chain.
            { tx: "0xalmanacsale", from: "0x4444", units: 10_000n, block: HEAD - 4 },
          ],
        }),
      ),
    );
    expect(result.ran).toBe(true);
    expect(result.transfers_seen).toBe(1);
    expect(result.orphans).toEqual([]);
  });

  it("money with NO delivery row still flags — the record cannot blind the walk", async () => {
    // A settle whose delivery died writes no row (the gate records at
    // the 2xx, not at settle), so the walk still catches it.
    const result = await reconcileAgainstChain(
      envWith(
        rpcFetch({
          logs: [
            { tx: "0xdiedserving", from: "0x5555", units: 10_000n, block: HEAD - 4 },
          ],
        }),
      ),
    );
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans![0]!.tx_hash).toBe("0xdiedserving");
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

describe("the hole the clamp tears (problem ledger #22)", () => {
  /**
   * When the cursor falls more than RECONCILE_MAX_SPAN behind the
   * head, the clamp discards the gap — and the walk only ever goes
   * forward, so nothing revisits it. Bounding the pass is right; the
   * defect was the SILENCE: the pass returned ran:true and every
   * surface downstream reported a clean sweep over a range that was
   * never read. A hole cannot be detected after the fact, so it is
   * recorded and alerted at the last moment it is knowable at all.
   */
  const FAR_BEHIND = HEAD - RECONCILE_MAX_SPAN - 5000;

  it("records the hole with exact bounds before the cursor moves past it", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.reconcileCursor, String(FAR_BEHIND));
    const result = await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    expect(result.ran).toBe(true);
    // The pass itself is clamped to the floor, as before.
    expect(result.from_block).toBe(HEAD - RECONCILE_MAX_SPAN);
    // The discarded range is named on the result, exactly.
    expect(result.skipped).toEqual({
      from_block: FAR_BEHIND + 1,
      to_block: HEAD - RECONCILE_MAX_SPAN - 1,
      blocks: 4999,
      recorded_at: expect.any(String) as unknown as string,
    });
    // And in KV, where a coverage claim can cite it after the cursor
    // has moved on and nothing else remembers the range existed.
    const record = await readSkippedRanges(testEnv);
    expect(record.total_ranges).toBe(1);
    expect(record.total_blocks).toBe(4999);
    expect(record.ranges[0]!.from_block).toBe(FAR_BEHIND + 1);
    expect(record.ranges[0]!.to_block).toBe(HEAD - RECONCILE_MAX_SPAN - 1);
  });

  it("pages the keeper with the range and the back-fill instruction", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.reconcileCursor, String(FAR_BEHIND));
    await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    const alert = (await listAlerts(testEnv, 50)).find((a) =>
      a.detail.includes("SKIPPED BLOCKS"),
    );
    expect(alert).toBeDefined();
    expect(alert!.detail).toContain(String(FAR_BEHIND + 1));
    expect(alert!.detail).toContain(String(HEAD - RECONCILE_MAX_SPAN - 1));
    expect(alert!.detail).toContain("back-fill");
  });

  it("a cursor merely behind — within the span — tears no hole", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.reconcileCursor,
      String(HEAD - RECONCILE_MAX_SPAN + 10),
    );
    const result = await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    expect(result.ran).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect((await readSkippedRanges(testEnv)).total_ranges).toBe(0);
  });

  it("a failed pass records no hole — the record moves with the cursor or not at all", async () => {
    /**
     * If the hole were recorded before the read succeeded, a failing
     * hour would file the same hole again on every retry. The record
     * rides the clean-read seam beside the cursor: a failed pass
     * writes neither, and the next clean pass records the recomputed
     * hole exactly once.
     */
    await testEnv.COUNTERS.put(KV_KEYS.reconcileCursor, String(FAR_BEHIND));
    const failed = await reconcileAgainstChain(
      envWith(rpcFetch({ fail: "logs" })),
    );
    expect(failed.ran).toBe(false);
    expect((await readSkippedRanges(testEnv)).total_ranges).toBe(0);
    expect(await testEnv.COUNTERS.get(KV_KEYS.reconcileCursor)).toBe(
      String(FAR_BEHIND),
    );

    const clean = await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    expect(clean.skipped).toBeDefined();
    expect((await readSkippedRanges(testEnv)).total_ranges).toBe(1);
  });

  it("accumulates holes with exact totals, and the next healthy pass tears none", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.reconcileCursor, String(FAR_BEHIND));
    await reconcileAgainstChain(envWith(rpcFetch({ logs: [] })));
    // The chain leaps ahead again — a second outage past the line.
    const head2 = HEAD + RECONCILE_MAX_SPAN + 10_000;
    await reconcileAgainstChain(envWith(rpcFetch({ logs: [], head: head2 })));
    const record = await readSkippedRanges(testEnv);
    expect(record.total_ranges).toBe(2);
    expect(record.total_blocks).toBe(
      record.ranges.reduce((sum, range) => sum + range.blocks, 0),
    );
    // Recovery at normal lag adds nothing to the ledger of holes.
    const after = await reconcileAgainstChain(
      envWith(rpcFetch({ logs: [], head: head2 + 100 })),
    );
    expect(after.skipped).toBeUndefined();
    expect((await readSkippedRanges(testEnv)).total_ranges).toBe(2);
  });
});

describe("dust and the address-poisoning profile (live case, 2026-08-04)", () => {
  /**
   * 0.00003 USDC arrived from 0x843bc0df…88a4a7 — an address ground
   * to mimic CV's 0x843b544b…C98cc4a7 (same leading and trailing
   * characters). The alert said "fulfil or refund by hand", which is
   * exactly wrong: refunding dust is interacting with the lure. A
   * transfer below the cheapest listing cannot be a purchase, so it
   * must never ride the undelivered-sale alert.
   */
  const POISONER = "0x843bc0df0bd43bcf1939224bee9ef3623b88a4a7";
  const CV_WALLET = "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7";

  it("classifies a sub-price transfer as dust, never a lost sale", async () => {
    const result = await reconcileAgainstChain(
      envWith(
        rpcFetch({
          logs: [{ tx: "0xdust", from: POISONER, units: 30n, block: HEAD - 2 }],
        }),
      ),
    );
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans![0]!.classification).toBe("dust");
    // 30 atomic units is 0.00003 USDC — far under the shelf floor.
    expect(result.orphans![0]!.usdc).toBeLessThan(cheapestListingUsdc());
  });

  it("names the mimicked counterparty, and never accuses the real one", () => {
    expect(findLookalike(POISONER, [CV_WALLET])).toBe(CV_WALLET);
    // The genuine wallet is itself, not a lookalike of itself.
    expect(findLookalike(CV_WALLET, [CV_WALLET])).toBeNull();
    // An unrelated stranger matches nobody.
    expect(
      findLookalike("0x9f00000000000000000000000000000000000abc", [CV_WALLET]),
    ).toBeNull();
  });

  it("pages DO-NOT-TOUCH for dust instead of fulfil-or-refund", async () => {
    await runChainReconciliation(
      envWith(
        rpcFetch({
          logs: [{ tx: "0xpoison", from: POISONER, units: 30n, block: HEAD - 2 }],
        }),
      ),
    );
    const alert = (await listAlerts(testEnv, 50)).find((a) =>
      a.detail.includes("0xpoison"),
    );
    expect(alert).toBeDefined();
    expect(alert!.condition).toBe("chain_dust");
    expect(alert!.detail).toContain("DO NOT refund");
    expect(alert!.detail).toContain("MIMICS");
    // The instruction that must never reach a poisoning lure.
    expect(alert!.detail).not.toContain("refund by hand");
  });

  it("a sale-sized orphan keeps the fulfil-or-refund instruction", async () => {
    await runChainReconciliation(
      envWith(
        rpcFetch({
          logs: [
            { tx: "0xrealsale", from: "0x7777", units: 5_000_000n, block: HEAD - 2 },
          ],
        }),
      ),
    );
    const alert = (await listAlerts(testEnv, 50)).find((a) =>
      a.detail.includes("0xrealsale"),
    );
    expect(alert).toBeDefined();
    expect(alert!.condition).toBe("undelivered_sale");
    expect(alert!.detail).toContain("fulfil or refund by hand");
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
