import { SELF, env } from "cloudflare:test";
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
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

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

/**
 * THE HANDLE ON THE LEVER (2026-09-13, the keeper: "i had thought we
 * created a button to add new ones or is it automatic").
 *
 * The plan had run on the tick for three days with no door on any
 * page — settable only by hand-rolling a POST — so the honest answer
 * to "is it automatic" was "it could be, and isn't". A form that sets
 * it is the whole fix, and the two things it must not get wrong are
 * that a press lands the keeper back on a page he can read, and that
 * the JSON door keeps answering JSON for whatever was already calling
 * it.
 */
describe("the standing order has a door on the desk", () => {
  it("sets the plan from a form and lands back on the desk saying so", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        weeks: "6",
        per_week: "4",
        reward_usd: "0.25",
        tier: "standard",
        note: "the week's walk",
      }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/admin/market");
    expect(decodeURIComponent(location)).toContain("4 a week at $0.25");
    const plan = await readBountyPlan(testEnv);
    expect(plan?.weeks_remaining).toBe(6);
    expect(plan?.per_week).toBe(4);
    expect(plan?.note).toBe("the week's walk");
  });

  /*
   * A REFUSAL IS A PAGE TOO. A form press that lands on a bare JSON
   * error is a keeper who cannot tell whether anything was written —
   * and here nothing was, which is the fact that has to reach him.
   */
  it("refuses a bad form press in words, and writes nothing", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        weeks: "6",
        per_week: "40",
        reward_usd: "0.25",
        tier: "standard",
      }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(decodeURIComponent(response.headers.get("location") ?? "")).toContain(
      "Nothing was set",
    );
    expect(await readBountyPlan(testEnv)).toBeNull();
  });

  it("retires the plan from the form's own off switch", async () => {
    await writeBountyPlan(testEnv, {
      version: 1,
      weeks_remaining: 4,
      per_week: 2,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ weeks: "0" }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(decodeURIComponent(response.headers.get("location") ?? "")).toContain(
      "retired",
    );
    /*
     * Retiring stores a ZEROED plan rather than deleting the key, and
     * the pass reads that as "do nothing" — so the fact to assert is
     * that no week is left to run, not that the key is gone.
     */
    expect((await readBountyPlan(testEnv))?.weeks_remaining).toBe(0);
    expect(await bountyPlanPass(testEnv, NOW)).toBeNull();
  });

  /* The JSON door is what the tick's own callers use. It keeps its shape. */
  it("still answers a JSON call with JSON", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        weeks: 3,
        per_week: 2,
        reward_usd: 0.1,
        tier: "sprint",
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body).toHaveProperty("affordable_this_week");
  });

  it("shows the plan and this week's headroom on the market desk", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    await writeBountyPlan(testEnv, {
      version: 1,
      weeks_remaining: 5,
      per_week: 3,
      reward_usd: 0.2,
      tier: "standard",
      rails: [],
      created_at: NOW.toISOString(),
      history: [
        { week: "2026-W37", posted: 0, refused: 0, note: "the week was committed" },
      ],
    });
    const html = await (
      await SELF.fetch(`${BASE}/admin/market`, {
        headers: { ...AUTH, Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("The standing order");
    expect(html).toContain('action="/admin/bounties/plan"');
    expect(html).toContain("5 weeks left");
    expect(html).toContain("of headroom");
    // The history rides along, so a week that posted nothing is legible.
    expect(html).toContain("the week was committed");
    expect(html).toContain("Retire it");
  });

  it("offers to set one when none is running", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    const html = await (
      await SELF.fetch(`${BASE}/admin/market`, {
        headers: { ...AUTH, Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("No standing order.");
    expect(html).toContain("Set the standing order");
    expect(html).not.toContain("Retire it");
  });

  /*
   * A RETIRED PLAN IS A ZEROED ONE ON DISK, and a form that read its
   * dials off it would offer a $0 reward the browser refuses and an
   * infinite number of listings (headroom / 0). The desk after a
   * retirement has to be as pressable as the desk before the first
   * plan ever was.
   */
  it("offers workable dials after a retirement, not the zeroed ones", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round()));
    await writeBountyPlan(testEnv, null);
    const html = await (
      await SELF.fetch(`${BASE}/admin/market`, {
        headers: { ...AUTH, Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("No standing order.");
    expect(html).toContain("Set the standing order");
    expect(html).not.toContain('value="0.00"');
    expect(html).not.toContain("Infinity");
  });
});
