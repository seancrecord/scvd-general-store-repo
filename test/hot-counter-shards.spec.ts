import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  COUNTER_SHARDS,
  metricsMonth,
  readMonthLedger,
  recordChallengeIssued,
} from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE COUNTERS DID NOT SCALE WITH SUCCESS (task #87, the keeper's
 * reading of 2026-08-27, rung 2 of its own ladder).
 *
 * KV allows one write per second PER KEY. Two counters take a write
 * on essentially every 402 this store issues — `src402:<channel>`
 * and `d402:<day>` — so the whole store was capped near one
 * challenge per second before visitors started paying for the
 * contention. The failure direction is backwards: more traffic, more
 * lost increments. The KV-429 incident of 2026-08-27 was this shape
 * arriving early, and the retry that fixed it is a tourniquet, not a
 * ceiling.
 *
 * Rung 2, and deliberately no further: spread each hot counter over
 * COUNTER_SHARDS keys chosen at random per write, and sum the shards
 * at read. About ten times the headroom, no new service, and the read
 * contract does not move — every surface still asks for the same
 * totals. Rung 3 (Analytics Engine) is a roadmap row, not a patch,
 * and evidence rows stay in KV either way: they are the product.
 *
 * WHAT THIS SPEC HOLDS are the properties that make sharding safe
 * rather than clever: the writes actually spread; the totals do not
 * move — including totals that live partly in keys written before
 * sharding existed; and every read branch fed by a sharded write puts
 * the bucket back together, so a column reads as ONE channel and not
 * as ten with a tenth of the traffic each.
 */

async function clearMetrics(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.metricMonthPrefix(metricsMonth()),
  });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

beforeEach(clearMetrics);

async function keysOfKind(kind: string): Promise<string[]> {
  const prefix = KV_KEYS.metricMonthPrefix(metricsMonth());
  const listed = await testEnv.COUNTERS.list({ prefix: `${prefix}${kind}:` });
  return listed.keys.map((k) => k.name);
}

describe("the hot counters spread their writes", () => {
  it("writes one challenge counter across many keys, not one", async () => {
    expect(COUNTER_SHARDS).toBeGreaterThan(1);
    // Enough challenges that hitting only one shard is vanishingly
    // unlikely: with N shards, 60 draws land on >1 shard unless the
    // sharding is not happening at all.
    for (let i = 0; i < 60; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/hello", {
        userAgent: "shard-spec",
      });
    }
    const dayKeys = await keysOfKind("d402");
    expect(
      dayKeys.length,
      "the day counter is still one key — every 402 in the store contends for the same write",
    ).toBeGreaterThan(1);
    const channelKeys = await keysOfKind("src402");
    expect(channelKeys.length).toBeGreaterThan(1);
    // The per-item counter, sharded 2026-09-03: the key a burst on one
    // door contends for, and the one the CI log caught losing a write.
    const itemKeys = await keysOfKind("402");
    expect(
      itemKeys.length,
      "the item counter is still one key — every 402 at one door contends for the same write",
    ).toBeGreaterThan(1);
  }, 30_000);
});

describe("the totals do not move", () => {
  it("sums the shards back into the same number the ledger always reported", async () => {
    const challenges = 25;
    for (let i = 0; i < challenges; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/hello", {
        userAgent: "shard-spec",
      });
    }
    const ledger = await readMonthLedger(testEnv, metricsMonth());
    // A GRAND TOTAL IS NOT ENOUGH TO PROVE THIS. Scattered shards sum
    // to the right number while reading as ten separate days and ten
    // separate channels, so the shape is asserted first: ONE day and
    // ONE channel, named as they always were.
    expect(
      Object.keys(ledger.days),
      "one day of challenges came back as several — the shards never joined",
    ).toHaveLength(1);
    expect(Object.keys(ledger.days)[0]).not.toContain("#s");
    expect(
      Object.keys(ledger.channels402),
      "one channel came back as several — the shards never joined",
    ).toHaveLength(1);
    expect(Object.keys(ledger.channels402)[0]).not.toContain("#s");
    const dayTotal = Object.values(ledger.days).reduce(
      (sum, day) => sum + day.challenges,
      0,
    );
    expect(
      dayTotal,
      "the trend table lost increments to sharding — the fix would be undercounting, which is the bug",
    ).toBe(challenges);
    const channelTotal = Object.values(ledger.channels402).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(channelTotal).toBe(challenges);
    // And the item row: ONE item named as it always was, the shards
    // summed, never ten rows of a tenth each.
    expect(Object.keys(ledger.items).filter((item) => item.includes("#s"))).toEqual([]);
    expect(ledger.items["hello"]?.challenges).toBe(challenges);
  }, 30_000);

  it("still counts keys written before sharding existed", async () => {
    /*
     * History stands and is joined at read — the same law as the
     * pay-to digest join and the renamed offers advisory. A month
     * that began unsharded and ended sharded must total as one month,
     * not two.
     */
    const month = metricsMonth();
    const day = new Date().toISOString().slice(8, 10);
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "d402", day), "7");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "src402", "direct"), "7");

    for (let i = 0; i < 5; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/hello", {
        userAgent: "shard-spec",
      });
    }

    const ledger = await readMonthLedger(testEnv, month);
    // The seeded pre-sharding key and the sharded ones are the SAME
    // day and the SAME channel, so a correct join reports one of each.
    expect(
      Object.keys(ledger.days),
      "the old key and the new shards read as different days — the month split in half",
    ).toHaveLength(1);
    expect(
      Object.keys(ledger.channels402),
      "the old key and the new shards read as different channels",
    ).toEqual(["direct"]);
    const dayTotal = Object.values(ledger.days).reduce(
      (sum, d) => sum + d.challenges,
      0,
    );
    expect(
      dayTotal,
      "a pre-sharding key stopped counting — the month silently lost its own first half",
    ).toBe(12);
    const channelTotal = Object.values(ledger.channels402).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(channelTotal).toBe(12);
  }, 30_000);
});

describe("every kind that is sharded is also summed", () => {
  /*
   * THE WRITE SITE IS ONE LINE; THE READ SITE IS THREE.
   *
   * `src402${suffix}` shards on ONE line, and that one line serves
   * both the organic bucket and the house bucket. The reader splits
   * those into separate branches. A shard added at the write and
   * missed at one of those branches does not error — it silently
   * scatters that column into ten keys named `direct#s3`, and the
   * table it feeds reads as ten channels with a tenth of the traffic
   * each. Nobody sees a stack trace; they see a wrong table.
   *
   * So this asserts the property directly: whatever the write shards,
   * every read branch fed by it sums back whole.
   */
  it("sums the house channel column too, not just the organic one", async () => {
    const challenges = 25;
    for (let i = 0; i < challenges; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/hello", {
        userAgent: "shard-spec",
        houseHeader: testEnv.HOUSE_SECRET,
      });
    }
    const ledger = await readMonthLedger(testEnv, metricsMonth());
    const houseChannels = Object.keys(ledger.channels402House);
    expect(
      houseChannels.length,
      "the house channel column scattered across shard keys — one channel is being reported as many",
    ).toBe(1);
    const houseTotal = Object.values(ledger.channels402House).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(houseTotal).toBe(challenges);
    expect(
      houseChannels[0],
      "a shard marker leaked into a channel name the admin table prints",
    ).not.toContain("#s");
  }, 30_000);
});
