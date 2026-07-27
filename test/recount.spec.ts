import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { MetricEvent } from "@/lib/metrics";
import { recountFromRows } from "@/lib/recount";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/** Rows sort newest-first by inverted timestamp; seed them the same way. */
let seq = 0;
async function seedRow(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(14, "0");
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
    at: new Date().toISOString(),
    ...partial,
  };
}

describe("the recount", () => {
  it("re-reads old rows with today's crawler table and reports the correction", async () => {
    // Two rows the books recorded as organic direct. One of them is a
    // prober that the table did not know about when the row was written.
    await seedRow(
      challenge({ user_agent: "mako-pulse-prober/0.1", channel: "direct" }),
    );
    await seedRow(
      challenge({ user_agent: "mako-pulse-prober/0.1", channel: "direct" }),
    );
    // A real customer on curl stays a customer.
    await seedRow(challenge({ user_agent: "curl/8.4.0", channel: "direct" }));
    // Already classified as infrastructure when written; stays put.
    await seedRow(
      challenge({ user_agent: "Googlebot/2.1", channel: "infrastructure" }),
    );
    // House traffic is house regardless of what the table thinks.
    await seedRow(
      challenge({
        user_agent: "mako-pulse-prober/0.1",
        channel: "direct",
        house: true,
      }),
    );
    // Money that moved: settles are their own column.
    await seedRow(
      challenge({ kind: "settle", user_agent: "curl/8.4.0", house: true }),
    );

    const result = await recountFromRows(testEnv);

    expect(result.rows_scanned).toBeGreaterThanOrEqual(6);
    expect(result.by_kind["challenge"]).toBeGreaterThanOrEqual(5);

    // The correction: two organic rows were machinery all along.
    expect(result.reclassified_organic_to_infrastructure).toBe(2);
    expect(result.as_recorded.organic).toBe(3);
    expect(result.as_reclassified.organic).toBe(1);
    // The infrastructure column gains exactly what organic lost.
    expect(result.as_reclassified.infrastructure).toBe(
      result.as_recorded.infrastructure + 2,
    );
    // House never moves: the keeper testing from a prober UA is the keeper.
    expect(result.as_recorded.house).toBe(1);
    expect(result.as_reclassified.house).toBe(1);

    // The user-agent behind the correction is named, so it can be fixed.
    expect(result.movers[0]?.user_agent).toBe("mako-pulse-prober/0.1");
    expect(result.movers[0]?.rows).toBe(2);

    // Settles counted apart, and the window is reported honestly.
    expect(result.settles.house).toBe(1);
    expect(result.oldest_row).toBeDefined();
    expect(result.newest_row).toBeDefined();
  });

  it("says so when the scan is capped instead of implying it read everything", async () => {
    const result = await recountFromRows(testEnv, 2);
    expect(result.rows_scanned).toBe(2);
    expect(result.capped).toBe(true);
  });
});
