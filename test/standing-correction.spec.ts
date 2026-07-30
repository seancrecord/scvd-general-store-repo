import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
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
