import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  INFLOW_ADDRESS_CAP,
  advertisedEvmAddresses,
  readInflowCensus,
} from "@/services/inflow-census";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE INFLOW CENSUS, T1 (the keeper's ruling 2026-08-28).
 *
 * The store filed every door's payTo for eight days under a comment
 * calling inflows the first honest signal of whether anyone PAYS an
 * ask, and never read them. This is the reader — and the tests that
 * keep it inside the ruling it was built under.
 *
 * The load-bearing one is the last: T1 is counts, no addresses, no
 * hosts. A reading that leaks either is not a T1 reading, whatever
 * its caption says, so the test walks the whole serialized artifact
 * for both rather than trusting the shape.
 */

const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ADDR_C = "0xcccccccccccccccccccccccccccccccccccccccc";

function round(payTos: string[][]): WardRound {
  return {
    week: "2026-W35",
    at: "2026-08-26T00:00:00.000Z",
    listed_resources: payTos.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: payTos.map((pay_to, index) => ({
      host: `door-${index}.example`,
      url: `https://door-${index}.example/api/x`,
      verdict: "ready",
      failed: [],
      advisories: [],
      offer: { networks: ["eip155:8453"], schemes: ["exact"], pay_to },
    })),
  } as unknown as WardRound;
}

async function seed(value: WardRound): Promise<void> {
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(value));
}

const topicOf = (address: string): string =>
  `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

/**
 * A chain that answers a head and returns the given recipients on the
 * FIRST getLogs of each chain, nothing after. `head` small enough
 * that the window closes in one span keeps the stub honest.
 */
function stubChain(options: {
  head: number;
  receivedBy?: string[];
  failHead?: boolean;
  failLogs?: boolean;
}): void {
  let served = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const request = JSON.parse(init?.body ?? "{}") as { method?: string };
      if (request.method === "eth_blockNumber") {
        if (options.failHead) return new Response("down", { status: 503 });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: `0x${options.head.toString(16)}`,
          }),
        );
      }
      if (request.method === "eth_getLogs") {
        if (options.failLogs) return new Response("down", { status: 503 });
        const logs = served
          ? []
          : (options.receivedBy ?? []).map((address) => ({
              transactionHash: `0x${"1".repeat(64)}`,
              topics: [
                `0x${"d".repeat(64)}`,
                topicOf("0x1111111111111111111111111111111111111111"),
                topicOf(address),
              ],
              data: "0x64",
              blockNumber: `0x${options.head.toString(16)}`,
            }));
        served = true;
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: logs }),
        );
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the addresses the round advertised", () => {
  it("dedupes across doors and ignores anything not an EVM address", () => {
    const advertised = advertisedEvmAddresses(
      round([[ADDR_A, ADDR_B], [ADDR_A], ["seller.eth"], ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]]),
    );
    expect(advertised).toEqual([ADDR_A, ADDR_B]);
  });
});

describe("the reading counts recipients, with its denominators", () => {
  it("counts distinct addresses that received, not transfers", async () => {
    await seed(round([[ADDR_A], [ADDR_B], [ADDR_C]]));
    // Two transfers, both to the same address: one recipient.
    stubChain({ head: 500, receivedBy: [ADDR_A, ADDR_A] });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_checked).toBe(3);
    expect(census!.addresses_received).toBe(1);
    expect(census!.transfers_seen).toBeGreaterThanOrEqual(2);
  });

  it("a quiet window is a zero WITH its denominator, never a bare zero", async () => {
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_received).toBe(0);
    expect(census!.addresses_checked).toBe(2);
    // And the zero refuses to read as "nobody paid".
    expect(census!.what_this_is_not).toContain("not evidence that nobody paid");
  });

  it("reports the window each chain actually covered", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.windows.length).toBe(2);
    for (const window of census!.windows) {
      expect(window.blocks).toBeGreaterThan(0);
      expect(window.to_block).toBe(500);
    }
  });

  it("a chain that will not answer is OUR gap on the record, never a zero", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 500, failHead: true });
    const census = await readInflowCensus(testEnv);
    for (const window of census!.windows) {
      expect(window.unread, "an unread chain must say so").toBeTruthy();
      expect(window.blocks).toBe(0);
    }
    // The count is still zero — but the window says we never looked,
    // which is the difference between a quiet chain and a blind one.
    expect(census!.addresses_received).toBe(0);
  });

  it("says when the span budget cut the walk short of its window", async () => {
    await seed(round([[ADDR_A]]));
    // A head far past the window forces Polygon's 500-block span to
    // run out of budget before it covers a day.
    stubChain({ head: 1_000_000, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    const polygon = census!.windows.find((w) => w.chain === "Polygon");
    expect(polygon!.truncated).toBe(true);
  });

  it("says when the address cap bound, rather than checking a subset silently", async () => {
    const many = Array.from({ length: INFLOW_ADDRESS_CAP + 5 }, (_, index) => [
      `0x${index.toString(16).padStart(40, "0")}`,
    ]);
    await seed(round(many));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_capped).toBe(true);
    expect(census!.addresses_checked).toBe(INFLOW_ADDRESS_CAP);
    expect(census!.addresses_advertised).toBeGreaterThan(INFLOW_ADDRESS_CAP);
  });
});

describe("T1 is counts, no addresses, no hosts — walked, not assumed", () => {
  it("leaks no advertised address and no host into the reading", async () => {
    await seed(round([[ADDR_A], [ADDR_B], [ADDR_C]]));
    stubChain({ head: 500, receivedBy: [ADDR_A, ADDR_B] });
    const census = await readInflowCensus(testEnv);
    const serialized = JSON.stringify(census).toLowerCase();
    for (const address of [ADDR_A, ADDR_B, ADDR_C]) {
      expect(serialized, `${address} leaked into a T1 reading`).not.toContain(
        address.toLowerCase(),
      );
    }
    expect(serialized).not.toContain("door-0.example");
    expect(serialized).not.toContain(".example");
  });

  it("says what it counts and what it is not, on the reading itself", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 500, receivedBy: [ADDR_A] });
    const census = await readInflowCensus(testEnv);
    // Received, never sold.
    expect(census!.what_this_counts).toContain("RECEIVED");
    expect(census!.what_this_is_not).toContain("Not sales");
    expect(census!.what_this_is_not).toContain("shared or facilitator wallet");
  });

  it("answers null when there is no round to read, inventing nothing", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    stubChain({ head: 500 });
    expect(await readInflowCensus(testEnv)).toBeNull();
  });
});
