import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { railOf, recordSettlement } from "@/lib/metrics";
import { BASE_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { readRailCounters } from "@/services/rails";
import { computeStats, storefrontLedgerLine } from "@/services/stats";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * These are COUNTERS: they accumulate, and this file's storage does not
 * roll back between tests. Each test starts from a swept meter so it is
 * asserting on its own settles rather than on the sum of everything
 * that ran before it — the first cut of this file passed in isolation
 * and failed in order, which is the more useful failure to have had.
 */
async function sweepTheMeter(): Promise<void> {
  // EVERY month, not just this one: these tests write July counters to
  // exercise the single-rail deduction, and a sweep scoped to the
  // current month left them standing for the next test to trip over.
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
  await testEnv.COUNTERS.delete(KV_KEYS.railMeterStart);
  await testEnv.COUNTERS.delete(KV_KEYS.railSplit);
}

beforeEach(sweepTheMeter);

/**
 * THE RAIL METER AT THE TILL, and the hole it was built to close.
 *
 * The storefront's Base/Solana split first read the rail off the
 * certificates, which was fine for everything that mints one — and
 * PENNY PAGES MINT NONE. The Almanac, the Gazette's issues and the
 * zodiac archive take real money through the same gate and issue no
 * artifact by design, so each sale landed in a third bucket on the
 * front of the store reading "unattributed", which next to a page
 * advertising exactly two chains looks like a third chain nobody can
 * name or like money that went missing.
 *
 * The keeper's question was the right one: won't it just happen again?
 * On the certificate design, yes — every future shelf that mints
 * nothing reopens it. So the measurement moved to recordSettlement,
 * which is the call that PRODUCES the organic count. These tests hold
 * that property: not "the rail is recorded" but "the rail is recorded
 * wherever the sale is counted", which is what makes the hole
 * un-reopenable.
 */
describe("the rail is recorded where the sale is counted", () => {
  it("books a rail for a penny page, which mints no certificate at all", async () => {
    // /almanac/:slug is gated at a cent and issues no artifact. Under
    // the old design this sale was invisible to the split forever.
    await recordSettlement(testEnv, "/almanac/the-first-week", {
      paidUsdc: 0.01,
      minimumUsdc: 0.01,
      payer: "0x9999999999999999999999999999999999999999",
      network: SOLANA_NETWORK,
    });

    const counts = await readRailCounters(testEnv);
    expect(counts.solana).toBe(1);
    expect(counts.base).toBe(0);
  });

  it("counts the rail on the same call that counts the sale", async () => {
    // The property that closes the hole for good: any settle counted as
    // organic has passed through here, so it has a rail. A future shelf
    // that mints nothing cannot reintroduce the gap, because minting is
    // not what this depends on.
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      payer: "0x9999999999999999999999999999999999999999",
      network: BASE_NETWORK,
    });
    const stats = await computeStats(testEnv);
    const rail = stats.organic_by_rail;
    expect(rail, "a settle with a rail produced no split").toBeTruthy();
    expect(rail!.base + rail!.solana + rail!.rail_not_recorded).toBe(
      stats.organic_settlements,
    );
    expect(rail?.rail_not_recorded).toBe(0);
  });

  it("keeps house rails off the public split", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      houseHeader: testEnv.HOUSE_SECRET,
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      network: BASE_NETWORK,
    });
    const counts = await readRailCounters(testEnv);
    // Family doesn't make the paper — on this counter as on every other.
    expect(counts.base).toBe(0);
    expect(counts.solana).toBe(0);
  });

  it("stamps the seam once and never moves it", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      network: BASE_NETWORK,
    });
    const first = await testEnv.COUNTERS.get(KV_KEYS.railMeterStart);
    expect(first).toBeTruthy();

    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      network: SOLANA_NETWORK,
    });
    // The seam is what stops the certificate walk. Moving it forward
    // would drag sales the till has already counted back into the cert
    // side and count them twice.
    expect(await testEnv.COUNTERS.get(KV_KEYS.railMeterStart)).toBe(first);
  });

  it("records no rail rather than a guessed one when the facilitator names none", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
    });
    const counts = await readRailCounters(testEnv);
    expect(counts.base + counts.solana + counts.other).toBe(0);
    // Same rule as an absent payer: an absence is recorded as an
    // absence. Defaulting to Base would put a number on the front of
    // the store that nobody observed.
    expect(await testEnv.COUNTERS.get(KV_KEYS.railMeterStart)).toBeNull();
  });

  it("reads the two live networks and refuses to invent a third", () => {
    expect(railOf(BASE_NETWORK)).toBe("base");
    expect(railOf(SOLANA_NETWORK)).toBe("solana");
    expect(railOf(undefined)).toBeNull();
    // An unrecognised network is its own answer, not a silent Base.
    expect(railOf("cosmos:something")).toBe("other");
  });
});

describe("a sale from the single-rail weeks can only have been Base", () => {
  it("places a pre-Solana sale nothing else recorded, without a block explorer", async () => {
    // A penny page sold in July: real money, no certificate, and no rail
    // counter because the till did not write them yet. Under the two
    // -ledger design this was unplaceable forever. It never was: the
    // Solana door was not built until 2026-08-04, so in July this store
    // was physically incapable of taking anything but Base.
    await testEnv.COUNTERS.put("metric:2026-07:paid:almanac:the-first-week", "1");
    await testEnv.COUNTERS.put(
      KV_KEYS.railSplit,
      JSON.stringify({
        base: 0,
        solana: 0,
        unknown: 0,
        placed_before_second_rail: 0,
        truncated: false,
        computed_at: new Date().toISOString(),
      }),
    );

    const stats = await computeStats(testEnv);
    expect(stats.organic_settlements).toBe(1);
    expect(stats.organic_by_rail?.base).toBe(1);
    expect(stats.organic_by_rail?.rail_not_recorded).toBe(0);
  });

  it("never counts a July sale twice when a certificate already placed it", async () => {
    await testEnv.COUNTERS.put("metric:2026-07:paid:hello", "1");
    await testEnv.COUNTERS.put(
      KV_KEYS.railSplit,
      JSON.stringify({
        base: 1,
        solana: 0,
        unknown: 0,
        // The certificates already account for that July sale. The
        // deduction must add nothing on top of it, or one purchase
        // becomes two on the front of the store.
        placed_before_second_rail: 1,
        truncated: false,
        computed_at: new Date().toISOString(),
      }),
    );

    const stats = await computeStats(testEnv);
    expect(stats.organic_by_rail?.base).toBe(1);
    expect(stats.organic_by_rail?.rail_not_recorded).toBe(0);
  });

  it("claims nothing about the month the second rail opened", async () => {
    // 2026-08 contains both single-rail days and two-rail days, and the
    // paid counters are monthly. Claiming the whole month for Base
    // would be a guess dressed as a deduction, so the month is left
    // alone and an unplaced August sale stays unplaced.
    const { monthsBeforeSecondRail, SECOND_RAIL_OPENED } = await import(
      "@/services/rails"
    );
    expect(monthsBeforeSecondRail()).toContain("2026-07");
    expect(monthsBeforeSecondRail()).not.toContain(
      SECOND_RAIL_OPENED.slice(0, 7),
    );
  });
});

describe("the shopfront says what happened to the record, not to the money", () => {
  it("never uses the word that read as a missing payment", () => {
    const line = storefrontLedgerLine({
      operating_since: "2026-07-22",
      settled_purchases_total: 92,
      organic_settlements: 6,
      house_settlements: 85,
      reclassified_house: 0,
      pre_meter_settlements: 1,
      artifacts_issued: 89,
      organic_by_rail: {
        base: 3,
        solana: 2,
        rail_not_recorded: 1,
        computed_at: "2026-08-06T00:00:00.000Z",
      },
      computed_at: "2026-08-06T00:00:00.000Z",
    });
    expect(line).toBe(
      "6 organic sales — 3 on Base, 2 on Solana, 1 from before we logged the rail.",
    );
  });
});
