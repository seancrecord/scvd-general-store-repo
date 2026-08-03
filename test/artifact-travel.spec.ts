import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyAgeBucket } from "@/lib/metrics";

/**
 * DID THE ARTIFACT TRAVEL? The one pathway we can actually observe.
 *
 * Three routes could bring an agent here unprompted, and CV's walk on
 * 2026-08-02 found all three shut:
 *
 *   1. It notices a need and goes shopping. Needs an operator who
 *      granted BOTH open-ended search AND spending autonomy. Rare by
 *      construction, not by model weakness.
 *   2. It knows us from training data. Closed — an unrecognised brand
 *      surfaces around 6% of the time against a recognised one, and we
 *      are too new to be in any corpus that surfaces spontaneously.
 *   3. An artifact of ours travels, and a LATER agent acts on it.
 *      PROBLEMS.md #3 has this as "no prior art found, positive or
 *      negative" — genuinely unmeasured rather than measured at zero.
 *
 * The third is the only one that is OURS to observe, and it was the
 * one nobody was watching.
 *
 * WHAT WE WILL NOT DO TO MEASURE IT. /api/verify is an unauthenticated
 * GET. We do not know who is asking and are not going to find out — no
 * IPs, no cookies, no wallet on a read. That rules out attributing a
 * caller, permanently, and it is not a limitation to be engineered
 * around.
 *
 * WHAT TIME GIVES US INSTEAD. A certificate checked minutes after
 * minting is almost certainly its buyer looking at what it just
 * bought. One checked three weeks later is being read by somebody
 * whose session did not mint it — the buying context is long gone.
 * That is artifact travel, visible without knowing one thing about who
 * travelled with it.
 *
 * A PROXY, NOT A PROOF, and the file says so where the number is read:
 * a patient buyer re-checking an old purchase is indistinguishable
 * from a stranger. What the bucket rules out is the common case, not
 * every case.
 */
const HOUR = 3_600_000;
const NOW = Date.parse("2026-08-03T12:00:00.000Z");

describe("the age bucket separates a buyer's glance from a later reader", () => {
  it.each([
    ["minted moments ago", NOW - 60_000, "under_1h"],
    ["same afternoon", NOW - 5 * HOUR, "under_1d"],
    ["a few days on", NOW - 72 * HOUR, "under_1w"],
    ["three weeks later", NOW - 21 * 24 * HOUR, "over_1w"],
  ])("%s reads as %s", (_label, minted, expected) => {
    expect(verifyAgeBucket(new Date(minted).toISOString(), NOW)).toBe(expected);
  });

  it("bounds the key space no matter the traffic", () => {
    // Four buckets and an unknown, forever. The venue counter learned
    // this lesson the hard way today: a metric key built from
    // caller-supplied data is a key space a stranger can inflate.
    const buckets = new Set(
      Array.from({ length: 500 }, (_, index) =>
        verifyAgeBucket(new Date(NOW - index * HOUR).toISOString(), NOW),
      ),
    );
    expect(buckets.size).toBeLessThanOrEqual(4);
  });

  it("refuses to guess when the date is unreadable", () => {
    // A malformed or missing date must not silently land in a real
    // bucket and pass as a finding.
    for (const bad of ["", "not-a-date", "2026-13-45T99:99:99Z"]) {
      expect(verifyAgeBucket(bad, NOW)).toBe("unknown_age");
    }
  });
});

describe("a verified certificate records how old it was", () => {
  it("counts the age bucket beside the per-item verify count", async () => {
    const { mintCertificate } = await import("@/services/certificates");
    const { recordVerifyCall } = await import("@/lib/metrics");
    const testEnv = env as never as import("@/types").Env;

    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    await recordVerifyCall(
      testEnv,
      minted.certificate.item,
      { userAgent: "a-stranger/1.0" },
      minted.certificate.date,
    );

    const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
    const ageKeys = listed.keys
      .map((entry) => entry.name)
      .filter((name) => name.includes(":verifyage:"));
    expect(
      ageKeys.length,
      "a verified certificate left no age reading, so artifact travel stays unmeasured",
    ).toBeGreaterThan(0);
    // Freshly minted, so it must land in the buyer's-glance bucket.
    expect(ageKeys.some((key) => key.endsWith("under_1h"))).toBe(true);
  });

  it("records nothing when no mint date is available", async () => {
    // Stamps, anchors and gazette pages reach the same recorder without
    // a certificate date. They must not manufacture an age.
    const { recordVerifyCall } = await import("@/lib/metrics");
    const testEnv = env as never as import("@/types").Env;
    const before = (await testEnv.COUNTERS.list({ prefix: "metric:" })).keys
      .map((entry) => entry.name)
      .filter((name) => name.includes(":verifyage:")).length;
    await recordVerifyCall(testEnv, "stamp:week", { userAgent: "x/1.0" });
    const after = (await testEnv.COUNTERS.list({ prefix: "metric:" })).keys
      .map((entry) => entry.name)
      .filter((name) => name.includes(":verifyage:")).length;
    expect(after).toBe(before);
  });
});
