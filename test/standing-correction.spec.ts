import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { MetricEvent } from "@/lib/metrics";
import { readCorrection, recomputeCorrections } from "@/services/reclassify";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

let seq = 0;
async function seedRow(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(
    14,
    "0",
  );
  seq += 1;
  await testEnv.COUNTERS.put(
    `evt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

function challenge(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "challenge",
    item: "hello",
    channel: "direct",
    house: false,
    at: "2026-07-15T00:00:00.000Z",
    ...partial,
  };
}

/**
 * THE STANDING CORRECTION.
 *
 * A monitoring bot spent four days in the organic column because
 * channel is decided when a 402 goes out and never revisited. The
 * crawler table learned its name on 2026-07-26; the counters it had
 * already inflated cannot learn anything, because they are integers.
 *
 * The recount page could not fix this: it scans newest-first and stops
 * at a cap, so its figure covers a window rather than a month — and
 * publishing a window figure as a month correction would mint a NEW
 * wrong number carrying a correction's authority, which is worse than
 * the number being corrected. So the walk moved to the clock, where
 * nothing renders and every row can be read.
 */
describe("the walk re-reads every row, not a window", () => {
  it("moves a row the books called organic and today calls machinery", async () => {
    await seedRow(
      challenge({ user_agent: "SentinelOracle/0.1", channel: "direct" }),
    );
    await seedRow(challenge({ user_agent: "some-agent/1.0" }));

    const written = await recomputeCorrections(testEnv);
    const july = written.find((entry) => entry.month === "2026-07");
    expect(july, "no correction written for the seeded month").toBeTruthy();
    expect(july?.complete).toBe(true);
    // Both rows were RECORDED organic; only one still reads that way.
    expect(july?.recorded_organic).toBe(2);
    expect(july?.corrected_organic).toBe(1);
    expect(july?.moved_to_infrastructure).toBe(1);
    expect(july?.movers[0]?.user_agent).toBe("SentinelOracle/0.1");
  });

  it("stores it where the public surfaces can read it", async () => {
    await recomputeCorrections(testEnv);
    const stored = await readCorrection(testEnv, "2026-07");
    expect(stored?.month).toBe("2026-07");
    expect(stored?.computed_at).toBeTruthy();
  });

  it("never counts house traffic as a correction to organic", async () => {
    // House rows are excluded from the organic column structurally,
    // so they were never in the number being corrected. Counting them
    // here would inflate the correction and understate organic — the
    // opposite error, and the harder one to notice.
    const before = await readCorrection(testEnv, "2026-07");
    await seedRow(
      challenge({ house: true, user_agent: "SentinelOracle/0.1" }),
    );
    await recomputeCorrections(testEnv);
    const after = await readCorrection(testEnv, "2026-07");
    expect(after?.moved_to_infrastructure).toBe(
      before?.moved_to_infrastructure,
    );
  });

  it("leaves a row already filed as machinery out of the correction", async () => {
    // A row the books ALREADY called infrastructure was never in the
    // organic column, so moving it would be double-counting — the
    // exact error of subtracting 23 from a figure the 23 were already
    // out of.
    const before = await readCorrection(testEnv, "2026-07");
    await seedRow(
      challenge({
        channel: "infrastructure",
        user_agent: "SentinelOracle/0.1",
      }),
    );
    await recomputeCorrections(testEnv);
    const after = await readCorrection(testEnv, "2026-07");
    expect(after?.recorded_organic).toBe(before?.recorded_organic);
    expect(after?.moved_to_infrastructure).toBe(
      before?.moved_to_infrastructure,
    );
  });
});

/**
 * THE SECOND MOVE (2026-09-04): a client the table calls organic whose
 * behaviour is a catalog walk. Published as its own half so a reader
 * can see which part of the correction is a name and which is a deed.
 */
describe("the standing correction moves walkers by behaviour", () => {
  const T0 = Date.parse("2026-07-10T09:00:00.000Z");
  const at = (ms: number) => new Date(T0 + ms).toISOString();

  // The cases above compare before/after on a shared month; these
  // count exact rows, so each starts from an empty book.
  beforeEach(async () => {
    let cursor: string | undefined;
    for (;;) {
      const listed = await testEnv.COUNTERS.list({ prefix: "evt:", limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      if (listed.list_complete) break;
      cursor = listed.cursor;
    }
  });

  it("moves a generic-SDK client that walked four doors inside a minute", async () => {
    for (const [n, item] of ["hello", "small_blessing", "luckies", "daily_fortune"].entries()) {
      await seedRow(challenge({ user_agent: "node", item, at: at(n * 10_000) }));
    }
    // A buyer-shaped client that looked at two doors is left alone.
    await seedRow(challenge({ user_agent: "buyer-client/1.0", item: "hello", at: at(5_000) }));
    await seedRow(challenge({ user_agent: "buyer-client/1.0", item: "luckies", at: at(8_000) }));
    const [july] = await recomputeCorrections(testEnv, new Date("2026-07-31T00:00:00Z"));
    expect(july?.moved_by_behaviour).toBe(4);
    expect(july?.behaviour_movers?.[0]).toEqual({ user_agent: "node", rows: 4 });
    // The name-based half is untouched by it: "node" names nothing.
    expect(july?.moved_to_infrastructure).toBe(0);
    // And the corrected figure is what is left after BOTH halves.
    expect(july?.corrected_organic).toBe(2);
    expect(july?.recorded_organic).toBe(6);
  });

  it("does not move three doors in a minute, or four across two", async () => {
    for (const [n, item] of ["hello", "small_blessing", "luckies"].entries()) {
      await seedRow(challenge({ user_agent: "undici", item, at: at(n * 10_000) }));
    }
    for (const [n, item] of ["hello", "small_blessing", "luckies", "daily_fortune"].entries()) {
      await seedRow(challenge({ user_agent: "Deno/2", item, at: at(n * 30_000) })); // 90s span
    }
    const [july] = await recomputeCorrections(testEnv, new Date("2026-07-31T00:00:00Z"));
    expect(july?.moved_by_behaviour).toBe(0);
    expect(july?.corrected_organic).toBe(7);
  });
});
