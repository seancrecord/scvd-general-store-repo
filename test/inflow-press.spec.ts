import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  publishInflowWeek,
  readInflowPulse,
  stashRenderedReading,
} from "@/services/inflow-pulse";
import { readInflowCensus } from "@/services/inflow-census";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE PRESS (rule 30), and the two things it refuses.
 *
 * The census was readable for a day and published nothing, because
 * nobody had built this button — not because anyone ruled against it.
 * Now that it exists, the interesting tests are the REFUSALS: a
 * public weekly tally is a much higher bar than an admin screen, and
 * a reading that cannot support a share must not reach one however
 * carefully its caption is worded.
 */

const ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function round(): WardRound {
  return {
    week: "2026-W35",
    at: "2026-08-29T00:00:00.000Z",
    listed_resources: 1,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [
      {
        host: "door.example",
        url: "https://door.example/api/x",
        verdict: "ready",
        failed: [],
        advisories: [],
        offer: {
          networks: ["eip155:8453"],
          schemes: ["exact"],
          pay_to: [ADDR],
          min_usdc: 0.0001,
          max_usdc: 1,
        },
      },
    ],
  } as unknown as WardRound;
}

/** A chain that answers a head low enough that one span closes the
 * window, so both rails cover the same blocks. */
function stubQuietChains(): void {
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
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] }));
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
    }),
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await testEnv.COUNTERS.delete(KV_KEYS.inflowPulse);
  await testEnv.COUNTERS.delete(KV_KEYS.inflowPending);
});

/** Stand in for the keeper opening the admin door and reading it. */
async function reads(at: Date = new Date()): Promise<void> {
  const reading = await readInflowCensus(testEnv, at);
  if (reading) await stashRenderedReading(testEnv, reading, at);
}

describe("the press publishes, by hand and only by hand", () => {
  it("lands the week and serves it back", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    stubQuietChains();
    await reads(new Date("2026-08-29T10:00:00Z"));
    const result = await publishInflowWeek(testEnv, new Date("2026-08-29T10:05:00Z"));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const pulse = await readInflowPulse(testEnv);
    expect(pulse.weeks.length).toBe(1);
    expect(pulse.weeks[0]!.week).toBe("2026-W35");
    // The walk is the keeper's read; the stamp is his press. The two
    // are different moments and the row keeps both.
    expect(pulse.weeks[0]!.observed_at).toBe("2026-08-29T10:00:00.000Z");
    expect(pulse.weeks[0]!.published_at).toBe("2026-08-29T10:05:00.000Z");
  });

  it("REFUSES to publish a number nobody looked at", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    stubQuietChains();
    // No admin read: straight to the press.
    const result = await publishInflowWeek(testEnv);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal).toContain("read the week before publishing");
    expect((await readInflowPulse(testEnv)).weeks).toEqual([]);
  });

  it("REFUSES a reading left on screen too long", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    stubQuietChains();
    await reads(new Date("2026-08-29T10:00:00Z"));
    // A tab left open overnight must not publish yesterday's chain.
    const result = await publishInflowWeek(testEnv, new Date("2026-08-30T09:00:00Z"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal).toContain("stale");
  });

  it("is idempotent per week, and the replacement is visible", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    stubQuietChains();
    await reads(new Date("2026-08-29T09:59:00Z"));
    const first = await publishInflowWeek(testEnv, new Date("2026-08-29T10:00:00Z"));
    await reads(new Date("2026-08-29T17:59:00Z"));
    const second = await publishInflowWeek(testEnv, new Date("2026-08-29T18:00:00Z"));
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok && second.replaced).toBe(true);
    const pulse = await readInflowPulse(testEnv);
    expect(pulse.weeks.length, "a re-press must replace, never append").toBe(1);
    expect(pulse.weeks[0]!.published_at).toBe("2026-08-29T18:00:00.000Z");
  });

  it("publishes NOTHING on its own — an unpressed store has an empty tally", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    stubQuietChains();
    const pulse = await readInflowPulse(testEnv);
    expect(pulse.weeks).toEqual([]);
  });
});

describe("what the press refuses", () => {
  it("refuses a reading whose chains were not walked over the same window", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    // A head far past the window: with a real span budget Polygon
    // needs many more calls than Base, and a stub that answers a head
    // this high leaves the two rails covering different amounts.
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
          // Polygon's span is narrow enough that a slow answer starves
          // it; refuse outright so the walk is cut short.
          return new Response("nope", { status: 500 });
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }),
    );
    await reads();
    const result = await publishInflowWeek(testEnv);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal).toMatch(/floor and not a rate|unread|looked at/);
    expect((await readInflowPulse(testEnv)).weeks).toEqual([]);
  });

  it("refuses when there is no round at all, inventing nothing", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    stubQuietChains();
    await reads();
    const result = await publishInflowWeek(testEnv);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal).toContain("read the week before publishing");
  });
});

describe("the published week stays T1", () => {
  it("carries no address, host or sender", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    stubQuietChains();
    await reads();
    await publishInflowWeek(testEnv);
    const serialized = JSON.stringify(await readInflowPulse(testEnv)).toLowerCase();
    expect(serialized).not.toContain(ADDR.toLowerCase());
    expect(serialized).not.toContain("door.example");
  });
});
