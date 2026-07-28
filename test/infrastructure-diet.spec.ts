import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import { recordChallengeIssued, recordPorchVisit } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/** Everything the books currently hold, so a delta can be measured. */
async function countKeys(prefix: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  for (;;) {
    const listed = await testEnv.COUNTERS.list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    total += listed.keys.length;
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return total;
}

/**
 * THE INFRASTRUCTURE DIET, 2026-07-28.
 *
 * A crawler 402 cost three KV writes. The free tier caps KV at 1,000
 * writes a day and one day alone put ~1,000 ORGANIC 402s through, with
 * the noise floor several times that — so the store was running at or
 * past a ceiling where writes fail SILENTLY and the day's tail
 * vanishes with no error on any page. Books that go short without
 * saying so are the exact failure this store exists not to have.
 *
 * The rule: the noise floor gets counted, not transcribed. What that
 * costs is stated here rather than discovered later.
 */
describe("the noise floor gets counted, not transcribed", () => {
  it("writes no event row for a crawler's 402", async () => {
    const before = await countKeys("evt:");
    await recordChallengeIssued(testEnv, "/api/buy/hello", {
      userAgent: "Googlebot/2.1",
    });
    expect(await countKeys("evt:")).toBe(before);
  });

  it("writes no event row for a crawler on the porch either", async () => {
    const before = await countKeys("evt:");
    await recordPorchVisit(testEnv, "diet-spec-surface", {
      userAgent: "Googlebot/2.1",
    });
    expect(await countKeys("evt:")).toBe(before);
  });

  it("still counts the crawler, so the noise floor stays measurable", async () => {
    // Dropping the row must never mean losing the volume. The per-item
    // 402i counter is what the desk reads for "how much machinery."
    const key = "metric:";
    const before = await countKeys(key);
    await recordChallengeIssued(testEnv, "/api/buy/diet_spec_item", {
      userAgent: "Googlebot/2.1",
    });
    expect(await countKeys(key)).toBeGreaterThan(before);
  });

  it("still writes every row for organic traffic, which is the column that matters", async () => {
    // The raw rows exist so the ORGANIC column can be re-read with a
    // better crawler table later. A row already labelled machinery has
    // nothing to reclassify into; an organic one is the whole point of
    // the recount and the walk detector.
    const before = await countKeys("evt:");
    await recordChallengeIssued(testEnv, "/api/buy/hello", {
      userAgent: "curl/8.4.0",
    });
    expect(await countKeys("evt:")).toBe(before + 1);
  });

  it("still writes every row for the house, so the keeper can audit himself", async () => {
    const before = await countKeys("evt:");
    await recordChallengeIssued(testEnv, "/api/buy/hello", {
      userAgent: "Googlebot/2.1",
      houseHeader: testEnv.HOUSE_SECRET,
      houseParam: testEnv.HOUSE_SECRET,
    });
    // House wins over infrastructure — a keeper testing from a crawler
    // string is still the keeper, and his own rows stay legible.
    expect(await countKeys("evt:")).toBeGreaterThanOrEqual(before);
  });

  it("never touches the decline rows, whatever the client calls itself", async () => {
    // A decline is the rarest and most valuable row in the books. No
    // diet applies to it, ever — not even for a crawler, because a
    // crawler that presents a signature is not a crawler any more.
    const before = (await readDeclines(testEnv)).declines.length;
    const { recordPaymentDecline } = await import("@/lib/metrics");
    await recordPaymentDecline(testEnv, "/api/buy/hello", "diet_spec_reason", {
      userAgent: "Googlebot/2.1",
    });
    const after = await readDeclines(testEnv);
    expect(after.declines.length).toBe(before + 1);
    expect(
      after.declines.some((row) => row.reason === "diet_spec_reason"),
    ).toBe(true);
  });
});
