import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillSkippedRange,
  readSkippedRanges,
  recordDeliveredSettlement,
  unreadBlocks,
  type SkippedRangesRecord,
} from "@/services/chain-reconciliation";
import { renderReconciliationPage } from "@/pages/admin/reconciliation-page";
import { BASE_EVM } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import { listAlerts } from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE HOLE BACK-FILL (2026-09-04). Seven holes from the August RPC
 * stall sat on the books page as a permanent alarm with no way to
 * close them: the walk only goes forward, and nothing in the store
 * could read a skipped range after the fact. These hold what makes
 * the button honest — it reads by the hourly walk's own orphan rule,
 * it moves its own progress only past blocks actually read, it
 * refuses any range the ledger did not record, and the ledger's
 * totals never shrink: total_blocks says what was skipped, and the
 * back-filled counters say how much of it was read since.
 */

const PAY_TO = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";

interface FakeLog {
  tx: string;
  from: string;
  units: bigint;
  block: number;
}

/** A node that answers eth_getLogs by the REQUESTED block range. */
function rpcFetch(logs: FakeLog[], failAtFrom?: number): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      method: string;
      params?: Array<{ fromBlock?: string; toBlock?: string; topics?: unknown[] }>;
    };
    if (body.method !== "eth_getLogs") {
      return { ok: true, json: async () => ({ result: null }) } as unknown as Response;
    }
    const filter = body.params?.[0] ?? {};
    const from = Number.parseInt(filter.fromBlock ?? "0x0", 16);
    const to = Number.parseInt(filter.toBlock ?? "0x0", 16);
    if (failAtFrom !== undefined && from === failAtFrom) {
      return { ok: false, status: 429 } as unknown as Response;
    }
    // Two topics = the till sentinel (outflows): nothing left the till.
    if (Array.isArray(filter.topics) && filter.topics.length === 2) {
      return { ok: true, json: async () => ({ result: [] }) } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({
        result: logs
          .filter((entry) => entry.block >= from && entry.block <= to)
          .map((entry) => ({
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
  }) as unknown as typeof fetch;
}

function envWith(fetchImpl: typeof fetch): Env {
  vi.stubGlobal("fetch", fetchImpl);
  return { ...testEnv, PAY_TO_ADDRESS: PAY_TO } as Env;
}

const SPAN = BASE_EVM.logSpan;
const HOLE = { from_block: 49_785_036, to_block: 49_785_036 + 3 * SPAN - 1 };

async function seedLedger(extra: Partial<SkippedRangesRecord> = {}): Promise<void> {
  const record: SkippedRangesRecord = {
    ranges: [
      {
        ...HOLE,
        blocks: HOLE.to_block - HOLE.from_block + 1,
        recorded_at: "2026-08-11T10:30:41.720Z",
      },
    ],
    total_ranges: 1,
    total_blocks: HOLE.to_block - HOLE.from_block + 1,
    ...extra,
  };
  await testEnv.COUNTERS.put(KV_KEYS.reconcileSkippedRanges, JSON.stringify(record));
}

async function clear(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.reconcileSkippedRanges);
  for (const prefix of ["alert:", "alerts:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

describe("the hole back-fill reads a skipped range after the fact", () => {
  beforeEach(clear);
  afterEach(() => vi.unstubAllGlobals());

  it("closes a hole in one press, pages the orphan, and never shrinks the totals", async () => {
    await seedLedger();
    const orphanBlock = HOLE.from_block + SPAN + 7;
    const e = envWith(
      rpcFetch([
        { tx: "0xorphan", from: BUYER, units: 1_000_000n, block: orphanBlock },
        { tx: "0xoutside", from: BUYER, units: 1_000_000n, block: HOLE.to_block + 1 },
      ]),
    );
    const result = await backfillSkippedRange(e, { ...HOLE, now: new Date("2026-09-04T22:00:00Z") });
    expect(result.ran).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.read_from).toBe(HOLE.from_block);
    expect(result.read_to).toBe(HOLE.to_block);
    // Only the transfer INSIDE the hole is seen; the one past its
    // edge belongs to the walk, not to this read.
    expect(result.transfers_seen).toBe(1);
    expect(result.orphans.map((row) => row.tx_hash)).toEqual(["0xorphan"]);

    const record = await readSkippedRanges(e);
    expect(record.total_blocks).toBe(3 * SPAN);
    expect(record.backfilled_blocks).toBe(3 * SPAN);
    expect(record.backfilled_ranges).toBe(1);
    expect(unreadBlocks(record)).toBe(0);
    expect(record.ranges[0]!.backfill?.completed_at).toBe("2026-09-04T22:00:00.000Z");
    expect(record.ranges[0]!.backfill?.orphans).toBe(1);

    const alerts = await listAlerts(e, 20);
    expect(
      alerts.some(
        (row) => row.condition === "undelivered_sale" && row.detail.includes("0xorphan"),
      ),
    ).toBe(true);
  });

  it("a transfer a certificate already names is not an orphan", async () => {
    await seedLedger();
    await recordDeliveredSettlement(testEnv, "0xDelivered");
    const e = envWith(
      rpcFetch([{ tx: "0xdelivered", from: BUYER, units: 1_000_000n, block: HOLE.from_block + 1 }]),
    );
    const result = await backfillSkippedRange(e, HOLE);
    expect(result.transfers_seen).toBe(1);
    expect(result.orphans).toEqual([]);
  });

  it("a larger hole takes two presses, and progress moves only past blocks actually read", async () => {
    await seedLedger();
    const e = envWith(
      rpcFetch([
        { tx: "0xfirst", from: BUYER, units: 1_000_000n, block: HOLE.from_block + 1 },
        { tx: "0xlast", from: BUYER, units: 1_000_000n, block: HOLE.to_block - 1 },
      ]),
    );
    const first = await backfillSkippedRange(e, { ...HOLE, maxSpans: 2 });
    expect(first.ran).toBe(true);
    expect(first.complete).toBe(false);
    expect(first.read_to).toBe(HOLE.from_block + 2 * SPAN - 1);
    expect(first.remaining).toBe(SPAN);
    expect(first.transfers_seen).toBe(1);
    let record = await readSkippedRanges(e);
    expect(record.backfilled_blocks).toBe(2 * SPAN);
    expect(record.backfilled_ranges ?? 0).toBe(0);
    expect(unreadBlocks(record)).toBe(SPAN);
    expect(record.ranges[0]!.backfill?.completed_at).toBeUndefined();

    const second = await backfillSkippedRange(e, { ...HOLE, maxSpans: 2 });
    expect(second.complete).toBe(true);
    expect(second.read_from).toBe(HOLE.from_block + 2 * SPAN);
    expect(second.transfers_seen).toBe(1);
    record = await readSkippedRanges(e);
    expect(record.backfilled_blocks).toBe(3 * SPAN);
    expect(record.backfilled_ranges).toBe(1);
    // The ledger's cumulative counts hold both presses.
    expect(record.ranges[0]!.backfill?.transfers_seen).toBe(2);
    expect(record.ranges[0]!.backfill?.orphans).toBe(2);
  });

  it("a span that fails ends the press with everything before it kept", async () => {
    await seedLedger();
    const e = envWith(rpcFetch([], HOLE.from_block + SPAN));
    const result = await backfillSkippedRange(e, HOLE);
    expect(result.ran).toBe(true);
    expect(result.failed).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.read_to).toBe(HOLE.from_block + SPAN - 1);
    expect(result.remaining).toBe(2 * SPAN);
    const record = await readSkippedRanges(e);
    expect(record.backfilled_blocks).toBe(SPAN);
    expect(record.ranges[0]!.backfill?.read_to).toBe(HOLE.from_block + SPAN - 1);
  });

  it("a press that reads nothing writes nothing", async () => {
    await seedLedger();
    const e = envWith(rpcFetch([], HOLE.from_block));
    const result = await backfillSkippedRange(e, HOLE);
    expect(result.ran).toBe(false);
    expect(result.failed).toBe(true);
    const record = await readSkippedRanges(e);
    expect(record.backfilled_blocks ?? 0).toBe(0);
    expect(record.ranges[0]!.backfill).toBeUndefined();
  });

  it("refuses a range the ledger never recorded, and a hole already closed", async () => {
    await seedLedger();
    const e = envWith(rpcFetch([]));
    const stranger = await backfillSkippedRange(e, {
      from_block: HOLE.from_block + 1,
      to_block: HOLE.to_block,
    });
    expect(stranger.ran).toBe(false);
    expect(stranger.reason).toContain("not a hole on record");

    await backfillSkippedRange(e, HOLE);
    const again = await backfillSkippedRange(e, HOLE);
    expect(again.ran).toBe(false);
    expect(again.complete).toBe(true);
    expect(again.reason).toContain("already back-filled");
    // A second press cannot double-count the ledger.
    const record = await readSkippedRanges(e);
    expect(record.backfilled_blocks).toBe(3 * SPAN);
    expect(record.backfilled_ranges).toBe(1);
  });
});

describe("the books page shows the hole's state and the button that closes it", () => {
  function pageWith(record: SkippedRangesRecord): string {
    return renderReconciliationPage(
      {
        settles: null,
        chain: {
          baseCursor: "50000000",
          baseSkipped: record,
          polygonCursor: null,
          polygonLastResult: null,
          solanaLastOk: null,
          solanaLastResult: null,
        },
        deliveries: null,
        alerts: [],
        alarmsLastRead: null,
        notes: [],
      } as unknown as Parameters<typeof renderReconciliationPage>[0],
      new Date("2026-09-04T22:00:00Z"),
    );
  }
  const range = {
    ...HOLE,
    blocks: 3 * SPAN,
    recorded_at: "2026-08-11T10:30:41.720Z",
  };

  it("an unread hole is ATTENTION with a back-fill button", () => {
    const html = pageWith({ ranges: [range], total_ranges: 1, total_blocks: 3 * SPAN });
    expect(html).toContain("still NEVER read");
    expect(html).toContain("Back-fill this hole");
    expect(html).toContain(`name="from_block" value="${HOLE.from_block}"`);
  });

  it("a closed hole is PASS and stays listed as history", () => {
    const html = pageWith({
      ranges: [
        {
          ...range,
          backfill: {
            started_at: "2026-09-04T22:00:00.000Z",
            updated_at: "2026-09-04T22:00:00.000Z",
            read_to: HOLE.to_block,
            transfers_seen: 2,
            orphans: 0,
            cert_scan_truncated: false,
            completed_at: "2026-09-04T22:00:00.000Z",
          },
        },
      ],
      total_ranges: 1,
      total_blocks: 3 * SPAN,
      backfilled_blocks: 3 * SPAN,
      backfilled_ranges: 1,
    });
    expect(html).toContain("all back-filled");
    expect(html).toContain("BACK-FILLED");
    expect(html).not.toContain("Back-fill this hole");
  });

  it("a hole mid-way is still ATTENTION, with a continue button", () => {
    const html = pageWith({
      ranges: [
        {
          ...range,
          backfill: {
            started_at: "2026-09-04T22:00:00.000Z",
            updated_at: "2026-09-04T22:00:00.000Z",
            read_to: HOLE.from_block + SPAN - 1,
            transfers_seen: 0,
            orphans: 0,
            cert_scan_truncated: false,
          },
        },
      ],
      total_ranges: 1,
      total_blocks: 3 * SPAN,
      backfilled_blocks: SPAN,
    });
    expect(html).toContain("still NEVER read");
    expect(html).toContain("Continue the back-fill");
  });
});
