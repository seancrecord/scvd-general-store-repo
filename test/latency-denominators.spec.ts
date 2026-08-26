import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  LATENCY_BUCKET_EDGES_MS,
  latencyBucket,
  recordRouteTiming,
} from "@/lib/metrics";
import { computePulse } from "@/services/pulse";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * ROADMAP 0.12 — latency served with denominators.
 *
 * The store publishes its own timings, which is exactly the reading a
 * stranger should trust least, so the denominators are the product: what
 * the clock included, what it excluded, how coarse the buckets are, and
 * the fact that the sample count is a floor rather than a census. These
 * hold the arithmetic AND the disclosures, because a figure that quietly
 * lost its method is worse than no figure.
 */
describe("published latency, with its denominators", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("buckets by the published edges, and never off the end", () => {
    expect(latencyBucket(0)).toBe("u00050");
    expect(latencyBucket(49)).toBe("u00050");
    // The edge itself belongs to the NEXT bucket: `u00050` means
    // "under 50", so 50 cannot be in it or the label would be a lie.
    expect(latencyBucket(50)).toBe("u00100");
    expect(latencyBucket(4999)).toBe("u05000");
    expect(latencyBucket(5000)).toBe("over");
    expect(latencyBucket(120_000)).toBe("over");
    // Labels sort in bucket order, so raw keys read as a histogram.
    const sorted = [...LATENCY_BUCKET_EDGES_MS]
      .map((e) => latencyBucket(e - 1))
      .sort();
    expect(sorted).toEqual(
      [...LATENCY_BUCKET_EDGES_MS].map((e) => latencyBucket(e - 1)),
    );
  });

  it("publishes percentiles as intervals, never as point values", async () => {
    for (let i = 0; i < 6; i += 1) {
      await recordRouteTiming(testEnv, "spec_ranges", 10);
    }
    await recordRouteTiming(testEnv, "spec_ranges", 90_000);

    const route = (await computePulse(testEnv)).latency.routes["spec_ranges"];
    expect(route).toBeDefined();
    expect(route!.samples).toBe(7);
    // Six of seven under 50ms, so the median is in the first bucket and
    // is reported as the interval it fell in, not as a number we did
    // not measure.
    expect(route!.p50_ms_range).toEqual([0, 50]);
    // The outlier owns the tail, and the last bucket is open-ended —
    // a null upper bound says "at least this", which is the only true
    // thing a histogram can say about its own edge.
    expect(route!.p95_ms_range).toEqual([5000, null]);
  });

  it("says nothing rather than zero when a route has no samples", async () => {
    const latency = (await computePulse(testEnv)).latency;
    expect(latency.routes["never_called_at_all"]).toBeUndefined();
    // The resolution is published, or the ranges above cannot be read.
    expect(latency.bucket_edges_ms).toEqual([...LATENCY_BUCKET_EDGES_MS]);
  });

  it("carries the disclosures that make the number readable", async () => {
    const latency = (await computePulse(testEnv)).latency;
    // Excluded: everything between the buyer and our gate.
    expect(latency.what_this_is).toMatch(/server-side only/i);
    expect(latency.what_this_is).toMatch(/TLS/);
    // The count is a floor, and the reason is named rather than implied.
    expect(latency.method).toMatch(/floor, not a census/i);
    expect(latency.method).toMatch(/last-write-wins/i);
    // Deferred, so the instrument cannot slow what it measures.
    expect(latency.method).toMatch(/after the response is sent/i);
    // The store timing itself is the reading to trust least, said aloud.
    expect(latency.method).toMatch(/external monitor/i);
  });

  /**
   * THE WIRING TEST. Everything above passes against a helper called
   * directly; only this one proves a real challenge is actually timed.
   * Mutating the waitUntil out of paymentGate must turn this red.
   */
  it("times a real 402 end to end", async () => {
    const before = (await computePulse(testEnv)).latency.routes["challenge"];
    const beforeSamples = before?.samples ?? 0;

    const response = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    expect(response.status).toBe(402);

    const after = (await computePulse(testEnv)).latency.routes["challenge"];
    expect(after).toBeDefined();
    expect(after!.samples).toBeGreaterThan(beforeSamples);
    expect(after!.p50_ms_range).not.toBeNull();
  });
});
