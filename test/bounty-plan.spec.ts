import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  bountyPlanPass,
  committedThisWeek,
  readBountyPlan,
  writeBountyPlan,
} from "@/services/bounty-plan";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const NOW = new Date("2026-09-14T12:00:00.000Z");

/**
 * THE STANDING ORDER (2026-09-10). Two properties, and the first is
 * about somebody else's money.
 *
 * ONE: A PLAN NEVER POSTS WHAT THE WEEK CANNOT PAY. The budget is
 * checked at CLAIM time, after a walker has already paid a door, so
 * an over-posted board refuses strangers who are already out of
 * pocket. Open listings must count against headroom exactly like
 * spent money does — a board with $9 of listings standing has $1 to
 * give, not $9.
 *
 * TWO: A WEEK RUNS ONCE. The pass rides the hourly tick, so without
 * a stamp it would post its whole week's allowance every hour.
 */

function host(name: string): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict: "ready",
    failed: [],
    advisories: [],
  };
}

function round(): WardRound {
  return {
    week: "2026-W38",
    at: "2026-09-14T11:00:00.000Z",
    listed_resources: 5,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [host("a.example"), host("b.example"), host("c.example")],
  };
}

async function clear(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.bountyPlan);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.bountyBudget("2026-W38"));
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.bountyPrefix });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

afterEach(clear);

describe("the standing bounty order", () => {
  it("does nothing at all when no plan is written", async () => {
    expect(await bountyPlanPass(testEnv, NOW)).toBeNull();
  });

  it("counts open listings against headroom, not just money already spent", async () => {
    // $6 spent, and two listings still standing at $0.25.
    await testEnv.COUNTERS.put(KV_KEYS.bountyBudget("2026-W38"), "6");
    for (const id of ["p1", "p2"]) {
      await testEnv.COUNTERS.put(
        KV_KEYS.bounty(id),
        JSON.stringify({
          bounty_id: id,
          target_url: `https://${id}.example/x`,
          domain: `${id}.example`,
          pay_to: `0x${"11".repeat(20)}`,
          amount_atomic: "1000",
          amount_usd: 0.001,
          reward_usd: 0.25,
          opened_at: "2026-09-14T11:00:00.000Z",
          opened_block: 1,
          expires_at: "2026-09-30T11:00:00.000Z",
          status: "open",
        }),
      );
    }
    const committed = await committedThisWeek(testEnv, NOW);
    expect(committed.spent).toBe(6);
    expect(committed.open).toBeCloseTo(0.5, 5);
    // $10 - $6 - $0.50, NOT $10 - $6.
    expect(committed.headroom).toBeCloseTo(3.5, 5);
  });

  it("posts nothing, and says why, when the week is already committed", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.bountyBudget("2026-W38"), "9.95");
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    await writeBountyPlan(testEnv, {
      version: 1,
      weeks_remaining: 4,
      per_week: 3,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    const pass = await bountyPlanPass(
      { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env,
      NOW,
    );
    expect(pass?.posted).toBe(0);
    expect(pass?.note).toContain("already committed");
    // And it did NOT burn a week of the plan on a week it could not act in.
    expect(pass?.weeks_remaining).toBe(4);
    expect((await readBountyPlan(testEnv))?.weeks_remaining).toBe(4);
  });

  it("refuses to post while payouts are paused, and keeps its weeks", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    await writeBountyPlan(testEnv, {
      version: 1,
      weeks_remaining: 2,
      per_week: 2,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    const pass = await bountyPlanPass(
      { ...testEnv, FIELD_WALLET_KEY: undefined } as Env,
      NOW,
    );
    expect(pass?.posted).toBe(0);
    expect(pass?.note).toContain("payouts are paused");
    expect(pass?.weeks_remaining).toBe(2);
  });

  it("runs a week once, however many times the tick fires", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.bountyBudget("2026-W38"), "9.95");
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    await writeBountyPlan(testEnv, {
      version: 1,
      weeks_remaining: 3,
      per_week: 2,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    const signed = { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env;
    const first = await bountyPlanPass(signed, NOW);
    expect(first).not.toBeNull();
    // Every later firing inside the same ISO week is a no-op.
    for (let index = 0; index < 3; index += 1) {
      expect(
        await bountyPlanPass(signed, new Date(NOW.getTime() + (index + 1) * 3_600_000)),
      ).toBeNull();
    }
  });

  it("retires itself once its weeks are used up", async () => {
    await writeBountyPlan(testEnv, {
      version: 1,
      weeks_remaining: 0,
      per_week: 2,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    expect(await bountyPlanPass(testEnv, NOW)).toBeNull();
  });
});
