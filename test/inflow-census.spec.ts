import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  INFLOW_ADDRESS_CEILING,
  INFLOW_SPAN_BUDGET,
  INFLOW_WINDOW_BLOCKS,
  SPAN_CONCURRENCY,
  addressFacts,
  advertisedEvmAddresses,
  inQuotedBand,
  readInflowCensus,
  spansFor,
  watchList,
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

function round(
  payTos: string[][],
  offer?: { networks?: string[]; min_usdc?: number; max_usdc?: number },
): WardRound {
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
      offer: {
        networks: offer?.networks ?? ["eip155:8453"],
        schemes: ["exact"],
        pay_to,
        ...(offer?.min_usdc !== undefined ? { min_usdc: offer.min_usdc } : {}),
        ...(offer?.max_usdc !== undefined ? { max_usdc: offer.max_usdc } : {}),
      },
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
  /** One sender per entry in receivedBy; defaults to a single payer. */
  sentBy?: string[];
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
          : (options.receivedBy ?? []).map((address, index) => ({
              transactionHash: `0x${"1".repeat(64)}`,
              topics: [
                `0x${"d".repeat(64)}`,
                topicOf(
                  options.sentBy?.[index] ??
                    "0x1111111111111111111111111111111111111111",
                ),
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
    // Driven through the budget rather than through a lucky head:
    // at the shipped budget of 120 spans Polygon reaches its window,
    // which is the whole point of raising it from 40.
    stubChain({ head: 1_000_000, receivedBy: [] });
    const census = await readInflowCensus(testEnv, new Date(), { spanBudget: 4 });
    const polygon = census!.windows.find((w) => w.chain === "Polygon");
    expect(polygon!.truncated).toBe(true);
  });

  it("the shipped budget actually covers the window on the slower chain", async () => {
    // The defect this replaced: 40 spans x 500 blocks stopped Polygon
    // at 20,000 of a 43,200-block window while Base got all of it.
    await seed(round([[ADDR_A]]));
    stubChain({ head: 1_000_000, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    for (const window of census!.windows) {
      expect(window.truncated, `${window.chain} still cannot reach its window`).toBe(false);
      expect(window.blocks).toBe(43_200);
    }
  });

  it("watches every advertised address — the ceiling does not bind at real sizes", async () => {
    // The first live reading watched 300 of 448 because a constant
    // capped it, and the 148 it dropped were the same 148 every week.
    // eth_getLogs ORs the whole list at one topic position, so the
    // cap was guarding a cost that did not exist.
    const many = Array.from({ length: 448 }, (_, index) => [
      `0x${index.toString(16).padStart(40, "0")}`,
    ]);
    await seed(round(many));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_checked).toBe(448);
    expect(census!.addresses_advertised).toBe(448);
    expect(census!.addresses_capped).toBe(false);
  });

  it("above the ceiling it ROTATES rather than dropping the same tail forever", () => {
    const advertised = Array.from(
      { length: INFLOW_ADDRESS_CEILING + 500 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
    ).sort();
    const w35 = watchList(advertised, "2026-W35");
    const w36 = watchList(advertised, "2026-W36");
    expect(w35.length).toBe(INFLOW_ADDRESS_CEILING);
    expect(w36.length).toBe(INFLOW_ADDRESS_CEILING);
    // Different weeks watch different slices — the whole point. A
    // fixed slice would make these identical and leave a permanent
    // hole, which is what the first version shipped.
    expect(w35).not.toEqual(w36);
    // And every address is reachable across weeks rather than being
    // structurally invisible.
    const union = new Set([...w35, ...w36]);
    expect(union.size).toBeGreaterThan(INFLOW_ADDRESS_CEILING);
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

/**
 * THE FOUR DEFECTS THE FIRST LIVE READING SHOWED, one case each.
 *
 * 2026-08-28: the instrument built to catch caption-versus-computation
 * published "153 of 300 advertised addresses" under a caption naming
 * 448, unioned a full Base window with a half-length Polygon one as a
 * rate, gave a transfer total with no way to tell one busy wallet from
 * many, and printed a block count that disagreed with its own
 * endpoints. These are the guards that would have caught each.
 */
describe("the caption names the denominator the number used", () => {
  it("states the watched count, not the advertised count, when they differ", async () => {
    const advertised = Array.from(
      { length: INFLOW_ADDRESS_CEILING + 10 },
      (_, index) => [`0x${index.toString(16).padStart(40, "0")}`],
    );
    await seed(round(advertised));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_capped).toBe(true);
    // The caption must carry the number the count was computed over.
    expect(census!.what_this_counts).toContain(
      `of ${census!.addresses_checked}`,
    );
    // And it must not silently present the bigger number as the base.
    expect(census!.what_this_counts).toContain("rotates week to week");
  });

  it("the caption's figures are the reading's figures, always", async () => {
    await seed(round([[ADDR_A], [ADDR_B], [ADDR_C]]));
    stubChain({ head: 500, receivedBy: [ADDR_A] });
    const census = await readInflowCensus(testEnv);
    expect(census!.what_this_counts).toContain(
      `${census!.addresses_received} of ${census!.addresses_checked}`,
    );
  });
});

describe("unequal windows are a floor, never a rate", () => {
  it("marks the reading unequal when one chain was cut short", async () => {
    await seed(round([[ADDR_A]]));
    // Far past the window, so Polygon's 500-block span runs out of
    // budget while Base's 2,000-block span does not.
    stubChain({ head: 1_000_000, receivedBy: [] });
    const census = await readInflowCensus(testEnv, new Date(), { spanBudget: 4 });
    expect(census!.windows_equal).toBe(false);
    // And the two chains really did cover different amounts of chain.
    expect(new Set(census!.windows.map((w) => w.blocks)).size).toBe(2);
  });

  it("is equal only when every chain reached the same window", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.windows_equal).toBe(true);
    expect(new Set(census!.windows.map((w) => w.blocks)).size).toBe(1);
  });

  it("reports what each chain saw on its own, not only the union", async () => {
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({ head: 500, receivedBy: [ADDR_A] });
    const census = await readInflowCensus(testEnv);
    for (const window of census!.windows) {
      expect(typeof window.received).toBe("number");
      expect(typeof window.transfers).toBe("number");
    }
    // The union can never be less than any single chain's count.
    for (const window of census!.windows) {
      expect(census!.addresses_received).toBeGreaterThanOrEqual(window.received);
    }
  });
});

describe("a transfer total cannot tell one busy wallet from many", () => {
  it("publishes the shape beside the volume", async () => {
    await seed(round([[ADDR_A], [ADDR_B], [ADDR_C]]));
    // One address takes eight transfers; two take one each. The
    // total alone (10) reads identically to ten modest doors.
    stubChain({
      head: 500,
      receivedBy: [
        ADDR_A, ADDR_A, ADDR_A, ADDR_A, ADDR_A, ADDR_A, ADDR_A, ADDR_A,
        ADDR_B,
        ADDR_C,
      ],
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_received).toBe(3);
    expect(census!.distribution.max_transfers).toBeGreaterThanOrEqual(8);
    expect(census!.distribution.median_transfers).toBeLessThan(
      census!.distribution.max_transfers,
    );
    expect(census!.distribution.top_decile_share_pct).toBeGreaterThanOrEqual(50);
    // Words follow facts: a concentrated reading says so in prose.
    expect(census!.what_this_is_not).toContain("facilitator wallets in the list");
  });

  it("says nothing about concentration when there is nothing to say", async () => {
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    expect(census!.distribution.top_decile_share_pct).toBeNull();
    expect(census!.what_this_is_not).not.toContain("facilitator wallets in the list");
  });
});

describe("the block count agrees with the blocks beside it", () => {
  it("blocks is exactly the inclusive span its own endpoints name", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 90_000, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    for (const window of census!.windows) {
      if (window.unread) continue;
      expect(
        window.blocks,
        `${window.chain} printed a block count its own endpoints contradict`,
      ).toBe(window.to_block - window.from_block + 1);
    }
  });

  it("holds on a walk that reaches its window and one that is cut short", async () => {
    for (const head of [500, 1_000_000]) {
      await seed(round([[ADDR_A]]));
      stubChain({ head, receivedBy: [] });
      const census = await readInflowCensus(testEnv);
      for (const window of census!.windows) {
        if (window.unread) continue;
        expect(window.blocks).toBe(window.to_block - window.from_block + 1);
      }
      vi.unstubAllGlobals();
    }
  });
});

/**
 * ADAPTIVE SPLITTING — why there is no sample any more.
 *
 * The old cap dropped 148 of 448 addresses because a provider MIGHT
 * refuse a list that long. The answer to "might refuse" is to ask and
 * bisect on refusal, not to decide in advance which third of the
 * market goes unwatched forever.
 */
describe("a provider that refuses a long list costs calls, not coverage", () => {
  /** Refuses any getLogs whose address list exceeds `limit`. */
  function stubPickyChain(limit: number, receivedBy: string[]): { calls: () => number } {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const request = JSON.parse(init?.body ?? "{}") as {
          method?: string;
          params?: Array<{ topics?: unknown[] }>;
        };
        if (request.method === "eth_blockNumber") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1f4" }),
          );
        }
        if (request.method === "eth_getLogs") {
          calls += 1;
          const wanted = (request.params?.[0]?.topics?.[2] ?? []) as string[];
          if (wanted.length > limit) {
            return new Response("too many addresses", { status: 400 });
          }
          const logs = receivedBy
            .filter((address) => wanted.includes(topicOf(address)))
            .map((address) => ({
              transactionHash: `0x${"1".repeat(64)}`,
              topics: [
                `0x${"d".repeat(64)}`,
                topicOf("0x1111111111111111111111111111111111111111"),
                topicOf(address),
              ],
              data: "0x64",
              blockNumber: "0x1f4",
            }));
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: logs }),
          );
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }),
    );
    return { calls: () => calls };
  }

  it("bisects until the provider answers, and loses no address", async () => {
    const addresses = Array.from(
      { length: 120 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
    );
    await seed(round(addresses.map((address) => [address])));
    // Two recipients, one of them in the far tail — the half a fixed
    // sorted slice would have thrown away.
    const stub = stubPickyChain(40, [addresses[3]!, addresses[119]!]);
    const census = await readInflowCensus(testEnv);

    expect(census!.addresses_checked).toBe(120);
    expect(census!.addresses_received).toBe(2);
    for (const window of census!.windows) {
      expect(window.addresses_unread, `${window.chain} lost addresses`).toBe(0);
    }
    // It cost extra calls, which is the trade: calls are cheap and
    // recoverable, a permanently unwatched tail is neither.
    expect(stub.calls()).toBeGreaterThan(2);
  });

  /*
   * DELIBERATELY THE SLOW PATH, and given room to be slow. Every
   * refused read pays the transport layer's own endpoint walk and
   * backoff before it comes back, so proving a chain unreadable costs
   * real seconds. That is the honest cost of establishing "we could
   * not see this" rather than printing a zero, and MAX_HARD_REFUSALS
   * is what stops it being unbounded. The generous timeout here is
   * the test admitting what the path costs, not hiding it.
   */
  it("a chunk that will not answer even split is counted as OUR gap", async () => {
    const addresses = Array.from(
      { length: 60 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
    );
    await seed(round(addresses.map((address) => [address])));
    // Refuses everything, at every chunk size.
    stubPickyChain(0, []);
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_received).toBe(0);
    for (const window of census!.windows) {
      expect(
        window.addresses_unread,
        "a total refusal must show as unread addresses, never as a clean zero",
      ).toBeGreaterThan(0);
      expect(window.unread, "an abandoned chain must say it was abandoned").toBeTruthy();
    }
    // And it stopped rather than grinding every chunk of every span.
    for (const window of census!.windows) {
      expect(window.calls).toBeLessThanOrEqual(8);
    }
  }, 30_000);
});

/**
 * THE CLOCK, WHICH THE SPAN BUDGET DID NOT COVER.
 *
 * 2026-08-28, second evening: the keeper opened the page and it never
 * finished loading. Raising the span budget to 120 fixed coverage and
 * created a latency defect — ~109 getLogs walked strictly one after
 * another is a minute of round trips inside one pageview. The
 * subrequest ceiling had been sized; the clock had not.
 *
 * Spans now go out six at a time in ORDERED batches. Ordered is the
 * load-bearing word: firing them all at once would be faster and
 * would let a walk cut short report a window with holes in it — a
 * from/to pair claiming blocks nobody read, which is the defect this
 * file had just finished removing.
 */
describe("the spans are decided by arithmetic, before any I/O", () => {
  it("covers the window with no gap and no overlap", () => {
    const head = 1_000_000;
    const spans = spansFor(head, INFLOW_WINDOW_BLOCKS, 500, INFLOW_SPAN_BUDGET);
    expect(spans[0]!.to).toBe(head);
    for (let i = 0; i < spans.length - 1; i += 1) {
      expect(
        spans[i]!.from,
        "a gap or an overlap between spans is a window claiming blocks nobody read",
      ).toBe(spans[i + 1]!.to + 1);
    }
    const lowest = spans[spans.length - 1]!.from;
    expect(lowest).toBe(head - INFLOW_WINDOW_BLOCKS + 1);
  });

  it("stops at the span budget rather than running past it", () => {
    const spans = spansFor(1_000_000, INFLOW_WINDOW_BLOCKS, 500, 4);
    expect(spans.length).toBe(4);
  });

  it("never walks below genesis on a young chain", () => {
    const spans = spansFor(500, INFLOW_WINDOW_BLOCKS, 2000, INFLOW_SPAN_BUDGET);
    expect(spans[spans.length - 1]!.from).toBe(0);
    expect(spans[0]!.to).toBe(500);
  });
});

describe("a reading that runs out of clock says so", () => {
  it("reports the budget, not a silent short window", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 1_000_000, receivedBy: [] });
    const census = await readInflowCensus(testEnv, new Date(), { timeBudgetMs: 0 });
    for (const window of census!.windows) {
      expect(window.truncated).toBe(true);
      expect(window.unread).toContain("budget ran out");
    }
    // A reading that saw nothing is a floor, never a rate.
    expect(census!.windows_equal).toBe(false);
    expect(census!.addresses_received).toBe(0);
  });
});

describe("spans go out in parallel, but bounded", () => {
  it("runs more than one at a time and never more than the batch", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const request = JSON.parse(init?.body ?? "{}") as { method?: string };
        if (request.method === "eth_blockNumber") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xf4240" }),
          );
        }
        if (request.method === "eth_getLogs") {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] }),
          );
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }),
    );
    await seed(round([[ADDR_A]]));
    await readInflowCensus(testEnv);
    expect(peak, "the spans are still walking one at a time").toBeGreaterThan(1);
    expect(
      peak,
      "more in flight than the batch allows — the ordered-batch guarantee is gone",
    ).toBeLessThanOrEqual(SPAN_CONCURRENCY);
  }, 30_000);
});

/**
 * THE SHARPENING (2026-08-28, after the second live reading).
 *
 * That reading said 52% of advertised addresses received USDC, and
 * one address took 4,876 of 11,404 transfers. Both true; together
 * they say the instrument was measuring WALLET ACTIVITY, not
 * payments. These are the three distinctions that make it answer the
 * question it was built for — every one of them derived from the
 * round's own record rather than guessed about anybody's wallet.
 */
describe("what the round already knew about each address", () => {
  it("counts DISTINCT doors, so shared is a fact and not a guess", () => {
    // ADDR_A advertised by two doors, ADDR_B by one.
    const facts = addressFacts(round([[ADDR_A], [ADDR_A, ADDR_B]]));
    expect(facts.get(ADDR_A)!.hosts).toBe(2);
    expect(facts.get(ADDR_B)!.hosts).toBe(1);
  });

  it("does not inflate the host count when one door repeats an address", () => {
    const one = round([[ADDR_A, ADDR_A]]);
    expect(addressFacts(one).get(ADDR_A)!.hosts).toBe(1);
  });

  it("records which rails the doors actually quoted", () => {
    const facts = addressFacts(
      round([[ADDR_A]], { networks: ["eip155:137"] }),
    );
    expect([...facts.get(ADDR_A)!.chains]).toEqual(["polygon"]);
  });

  it("widens the band to the cheapest and dearest across advertising doors", () => {
    const facts = addressFacts(round([[ADDR_A]], { min_usdc: 0.05, max_usdc: 2 }));
    expect(facts.get(ADDR_A)!.min_usdc).toBe(0.05);
    expect(facts.get(ADDR_A)!.max_usdc).toBe(2);
  });
});

describe("a transfer is compared against the ask it supposedly answers", () => {
  const band = { hosts: 1, chains: new Set<string>(), min_usdc: 0.05, max_usdc: 2 };

  it("accepts an amount inside the quoted range", () => {
    expect(inQuotedBand(0.05, band)).toBe(true);
    expect(inQuotedBand(1, band)).toBe(true);
    expect(inQuotedBand(2, band)).toBe(true);
  });

  it("rejects the treasury movement that the old count could not see", () => {
    expect(inQuotedBand(40_000, band)).toBe(false);
    expect(inQuotedBand(0.0001, band)).toBe(false);
  });

  it("refuses to judge an address whose doors quoted no USDC price", () => {
    // No price, no band, no claim — never a silent pass.
    expect(inQuotedBand(1, { hosts: 1, chains: new Set() })).toBe(false);
    expect(inQuotedBand(1, undefined)).toBe(false);
  });
});

describe("the per-chain count gets a per-chain denominator", () => {
  it("does not count Base-only addresses against Polygon", async () => {
    // Both doors quote Base only. Polygon's denominator must be 0,
    // not 2 — the defect that made a rail nobody quoted look dead.
    await seed(round([[ADDR_A], [ADDR_B]], { networks: ["eip155:8453"] }));
    stubChain({ head: 500, receivedBy: [] });
    const census = await readInflowCensus(testEnv);
    const base = census!.windows.find((w) => w.chain === "Base")!;
    const polygon = census!.windows.find((w) => w.chain === "Polygon")!;
    expect(base.advertised_here).toBe(2);
    expect(polygon.advertised_here).toBe(0);
  });

  it("names money arriving on a rail the door never quoted", async () => {
    await seed(round([[ADDR_A]], { networks: ["eip155:8453"] }));
    // Its own stub: the shared one serves logs on the FIRST getLogs
    // only, so Base would eat them and Polygon would look quiet for
    // the wrong reason. Here every span answers, on both rails.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const request = JSON.parse(init?.body ?? "{}") as { method?: string };
        if (request.method === "eth_blockNumber") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1f4" }),
          );
        }
        if (request.method === "eth_getLogs") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: [
                {
                  transactionHash: `0x${"1".repeat(64)}`,
                  topics: [
                    `0x${"d".repeat(64)}`,
                    topicOf("0x1111111111111111111111111111111111111111"),
                    topicOf(ADDR_A),
                  ],
                  data: "0x64",
                  blockNumber: "0x1f4",
                },
              ],
            }),
          );
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }),
    );
    const census = await readInflowCensus(testEnv);
    const polygon = census!.windows.find((w) => w.chain === "Polygon")!;
    const base = census!.windows.find((w) => w.chain === "Base")!;
    // Base is where it said it takes money, and it did.
    expect(base.received_advertised).toBe(1);
    expect(base.received_unadvertised).toBe(0);
    // Polygon is money on a rail this door never quoted — an
    // observation worth having, and one the old shape could not make.
    expect(polygon.received_unadvertised).toBe(1);
    expect(polygon.received_advertised).toBe(0);
    expect(polygon.advertised_here).toBe(0);
  });
});

describe("sole-advertised is the number that means something", () => {
  it("splits the rate by exclusivity and leads the caption with the narrow one", async () => {
    // ADDR_A is shared (two doors), ADDR_B and ADDR_C are sole.
    await seed(
      round([[ADDR_A], [ADDR_A], [ADDR_B], [ADDR_C]], { min_usdc: 0.0001, max_usdc: 1 }),
    );
    stubChain({ head: 500, receivedBy: [ADDR_A, ADDR_A, ADDR_B] });
    const census = await readInflowCensus(testEnv);
    expect(census!.by_exclusivity.shared.watched).toBe(1);
    expect(census!.by_exclusivity.sole.watched).toBe(2);
    expect(census!.by_exclusivity.sole.received).toBe(1);
    // The caption must carry the narrow number, not only the broad one.
    expect(census!.what_this_counts).toContain("ONLY ONE DOOR ADVERTISED");
    expect(census!.what_this_counts).toContain(
      `${census!.by_exclusivity.sole.received} received`,
    );
  });
});

describe("the size of the money is counted, not just its existence", () => {
  it("bands the transfers and reports a median size", async () => {
    await seed(round([[ADDR_A]], { min_usdc: 0.0001, max_usdc: 1 }));
    // The stub sends data "0x64" = 100 atomic units = $0.0001.
    stubChain({ head: 500, receivedBy: [ADDR_A, ADDR_A] });
    const census = await readInflowCensus(testEnv);
    expect(census!.amounts.median_usdc).toBeCloseTo(0.0001, 6);
    expect(census!.amounts.under_1_usdc).toBe(census!.transfers_seen);
    expect(census!.amounts.over_100_usdc).toBe(0);
    // And those amounts sit inside the door's own quote.
    expect(census!.in_quoted_band.transfers).toBe(census!.transfers_seen);
    expect(census!.in_quoted_band.sole_addresses).toBe(1);
  });

  it("a transfer far outside the door's quote is not counted as an answer to it", async () => {
    // Door quotes $5-$5; the stub's transfers are $0.0001.
    await seed(round([[ADDR_A]], { min_usdc: 5, max_usdc: 5 }));
    stubChain({ head: 500, receivedBy: [ADDR_A] });
    const census = await readInflowCensus(testEnv);
    expect(census!.addresses_received).toBe(1);
    expect(
      census!.in_quoted_band.transfers,
      "a transfer nowhere near the ask must not count as paying it",
    ).toBe(0);
  });

  it("says out loud that a band is not a receipt", async () => {
    await seed(round([[ADDR_A]], { min_usdc: 0.0001 }));
    stubChain({ head: 500, receivedBy: [ADDR_A] });
    const census = await readInflowCensus(testEnv);
    expect(census!.what_this_is_not).toContain("BAND and not a receipt");
  });
});

/**
 * WHO SENT IT (defect 7, 2026-08-28).
 *
 * The third live reading returned 10,158 transfers, median size
 * $0.006, roughly three per address. That fits a low-volume
 * micropayment market and it fits address poisoning, which is
 * endemic on Base, and the two are indistinguishable in a transfer
 * count. The RPC has returned the sender all along; this reader
 * dropped it, exactly as it dropped the amount a build earlier.
 *
 * Four shapes, one field.
 */
const PAYER_1 = "0x1111111111111111111111111111111111111111";
const PAYER_2 = "0x2222222222222222222222222222222222222222";
const PAYER_3 = "0x3333333333333333333333333333333333333333";

describe("a transfer count cannot tell a market from a spray", () => {
  it("counts distinct senders and the busiest one's share", async () => {
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({
      head: 500,
      receivedBy: [ADDR_A, ADDR_A, ADDR_A, ADDR_B],
      sentBy: [PAYER_1, PAYER_1, PAYER_1, PAYER_2],
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.senders.distinct).toBe(2);
    // Three of four transfers from one sender.
    expect(census!.senders.top_sender_share_pct).toBe(75);
  });

  it("a receiver funded entirely by one sender is counted as such", async () => {
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({
      head: 500,
      receivedBy: [ADDR_A, ADDR_A, ADDR_B],
      sentBy: [PAYER_1, PAYER_1, PAYER_2],
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.senders.single_sender_receivers).toBe(2);
    expect(census!.senders.median_senders_per_receiver).toBe(1);
    // And it says so, because half the receivers is the whole point.
    expect(census!.what_this_is_not).toContain("SINGLE sender");
  });

  it("many payers per receiver reads as a market, and says nothing alarming", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({
      head: 500,
      receivedBy: [ADDR_A, ADDR_A, ADDR_A],
      sentBy: [PAYER_1, PAYER_2, PAYER_3],
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.senders.distinct).toBe(3);
    expect(census!.senders.median_senders_per_receiver).toBe(3);
    expect(census!.senders.single_sender_receivers).toBe(0);
    expect(census!.what_this_is_not).not.toContain("SINGLE sender");
    expect(census!.what_this_is_not).not.toContain("shape of a spray");
  });

  it("one sender reaching many addresses is named as a spray, not as buyers", async () => {
    // Twelve doors, one sender hitting every one of them. In a
    // transfer count this is a healthy market; it is a duster.
    const many = Array.from({ length: 12 }, (_, index) =>
      `0x${(index + 10).toString(16).padStart(40, "0")}`,
    );
    await seed(round(many.map((address) => [address])));
    stubChain({
      head: 500,
      receivedBy: many,
      sentBy: many.map(() => PAYER_1),
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.senders.broadcasters).toBe(1);
    expect(census!.senders.broadcaster_share_pct).toBe(100);
    expect(census!.what_this_is_not).toContain("shape of a spray");
  });

  it("names money moving between advertised wallets rather than in from outside", async () => {
    // ADDR_B is itself an advertised payTo, and it is paying ADDR_A.
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({
      head: 500,
      receivedBy: [ADDR_A, ADDR_A],
      sentBy: [ADDR_B, ADDR_B],
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.senders.from_advertised).toBe(census!.transfers_seen);
    expect(census!.what_this_is_not).toContain("inside the advertised set");
  });

  it("still leaks no sender — T1 covers who paid as well as who was paid", async () => {
    await seed(round([[ADDR_A]]));
    stubChain({ head: 500, receivedBy: [ADDR_A], sentBy: [PAYER_2] });
    const census = await readInflowCensus(testEnv);
    const serialized = JSON.stringify(census).toLowerCase();
    expect(serialized, "a sender leaked into a T1 reading").not.toContain(
      PAYER_2.toLowerCase(),
    );
  });
});

describe("the caption stops claiming what the third reading disproved", () => {
  it("does not present sole-advertised as proof of a door's own till", async () => {
    await seed(round([[ADDR_A], [ADDR_B]]));
    stubChain({ head: 500, receivedBy: [ADDR_A] });
    const census = await readInflowCensus(testEnv);
    // The live data had the BUSIEST address sole-advertised, so the
    // old wording — "the one worth reading" — was an overclaim.
    expect(census!.what_this_counts).not.toContain("the one worth reading");
    expect(census!.what_this_counts).toContain("is still one door");
  });
});

/**
 * THE NARROWEST FIGURE (2026-08-28, after the fourth reading).
 *
 * Every broader number this instrument produces has an innocent
 * explanation that swallows it: 217 received is mostly wallet
 * activity; 6,640 in band is a wide band; half the receivers had
 * exactly one payer, which is dusting and self-funding. What is left
 * is sole-advertised addresses taking IN-BAND transfers from more
 * than one distinct payer — and the load-bearing detail is that the
 * payers are counted over the in-band transfers ONLY.
 */
describe("the narrowest figure the chain can produce", () => {
  it("counts payers over in-band transfers only, so dust cannot inflate a door", async () => {
    // ADDR_A: one in-band payer, plus two dust senders whose amounts
    // are nowhere near the quote. Naively that is three payers.
    await seed(round([[ADDR_A]], { min_usdc: 0.0001, max_usdc: 0.0002 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const request = JSON.parse(init?.body ?? "{}") as { method?: string };
        if (request.method === "eth_blockNumber") {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1f4" }),
          );
        }
        if (request.method === "eth_getLogs") {
          const row = (from: string, data: string) => ({
            transactionHash: `0x${"1".repeat(64)}`,
            topics: [`0x${"d".repeat(64)}`, topicOf(from), topicOf(ADDR_A)],
            data,
            blockNumber: "0x1f4",
          });
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: [
                row(PAYER_1, "0x64"), // $0.0001 — in band
                row(PAYER_2, "0x5f5e100"), // $100 — nowhere near the ask
                row(PAYER_3, "0x5f5e100"), // $100 — likewise
              ],
            }),
          );
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }),
    );
    const census = await readInflowCensus(testEnv);
    // Three senders overall, but only ONE of them answered the ask.
    expect(census!.senders.distinct).toBe(3);
    expect(
      census!.narrowest.multi_payer_in_band,
      "dust senders must not promote a one-customer door to multi-payer",
    ).toBe(0);
  });

  it("counts an address with two genuine in-band payers", async () => {
    await seed(round([[ADDR_A], [ADDR_B]], { min_usdc: 0.0001, max_usdc: 1 }));
    stubChain({
      head: 500,
      receivedBy: [ADDR_A, ADDR_A, ADDR_B],
      sentBy: [PAYER_1, PAYER_2, PAYER_3],
    });
    const census = await readInflowCensus(testEnv);
    // ADDR_A has two in-band payers; ADDR_B has one.
    expect(census!.narrowest.multi_payer_in_band).toBe(1);
    expect(census!.narrowest.median_payers).toBe(2);
    expect(census!.narrowest.watched).toBe(2);
  });

  it("excludes shared addresses, however many payers they have", async () => {
    // ADDR_A advertised by two doors — shared by construction, so it
    // cannot stand in for a door's own customers no matter who paid.
    await seed(round([[ADDR_A], [ADDR_A]], { min_usdc: 0.0001, max_usdc: 1 }));
    stubChain({
      head: 500,
      receivedBy: [ADDR_A, ADDR_A],
      sentBy: [PAYER_1, PAYER_2],
    });
    const census = await readInflowCensus(testEnv);
    expect(census!.narrowest.multi_payer_in_band).toBe(0);
  });

  it("says on itself that the narrowest figure is still not proof", async () => {
    await seed(round([[ADDR_A]], { min_usdc: 0.0001, max_usdc: 1 }));
    stubChain({ head: 500, receivedBy: [ADDR_A, ADDR_A], sentBy: [PAYER_1, PAYER_2] });
    const census = await readInflowCensus(testEnv);
    expect(census!.what_this_counts).toContain("NARROWEST OF ALL");
    expect(census!.what_this_counts).toContain("still not proof");
    expect(census!.what_this_counts).toContain("two wallets paying its own door");
  });
});
