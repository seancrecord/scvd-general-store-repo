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
      version: 2,
      runs_remaining: 4,
      per_run: 3,
      every_hours: 168,
      max_open: 12,
      revisit_days: 0,
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
    // And it did NOT burn a press on a pass it could not act in.
    expect(pass?.runs_remaining).toBe(4);
    expect((await readBountyPlan(testEnv))?.runs_remaining).toBe(4);
  });

  it("refuses to post while payouts are paused, and keeps its presses", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    await writeBountyPlan(testEnv, {
      version: 2,
      runs_remaining: 2,
      per_run: 2,
      every_hours: 168,
      max_open: 12,
      revisit_days: 0,
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
    expect(pass?.runs_remaining).toBe(2);
  });

  /*
   * THE CADENCE IS THE KEEPER'S (2026-09-19). It was the ISO week and
   * only the ISO week: the pass stamped the week and returned for
   * every firing after the first, so the board was restocked once in
   * seven days while its listings were claimed within hours of each
   * posting. The window is now a number of hours, and the two things
   * that must hold are that a tick inside the window does nothing and
   * a tick after it acts.
   *
   * The budget here is deliberately spent, so this test knocks on no
   * stranger's door: what it is checking is the clock, not the press.
   */
  it("holds its window, then comes due", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.bountyBudget("2026-W38"), "9.95");
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    await writeBountyPlan(testEnv, {
      version: 2,
      runs_remaining: 3,
      per_run: 2,
      every_hours: 12,
      max_open: 12,
      revisit_days: 0,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
      last_run_at: NOW.toISOString(),
    });
    const signed = { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env;
    for (const hours of [1, 6, 11]) {
      expect(
        await bountyPlanPass(signed, new Date(NOW.getTime() + hours * 3_600_000)),
      ).toBeNull();
    }
    const due = await bountyPlanPass(
      signed,
      new Date(NOW.getTime() + 12 * 3_600_000),
    );
    expect(due).not.toBeNull();
    expect(due?.pressed).toBe(false);
  });

  /*
   * POST AS I PLEASE (2026-09-19, the keeper's words). The forced pass
   * skips the CADENCE and nothing else — every rule that stands
   * between a stranger and a listing this board cannot honour is
   * still checked, and this proves the first of them is.
   */
  it("presses on demand inside its window, and still refuses to overcommit", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.bountyBudget("2026-W38"), "9.95");
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    await writeBountyPlan(testEnv, {
      version: 2,
      runs_remaining: 3,
      per_run: 2,
      every_hours: 168,
      max_open: 12,
      revisit_days: 0,
      reward_usd: 0.25,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
      last_run_at: NOW.toISOString(),
    });
    const signed = { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env;
    const at = new Date(NOW.getTime() + 3_600_000);
    expect(await bountyPlanPass(signed, at)).toBeNull();
    const forced = await bountyPlanPass(signed, at, { force: true });
    expect(forced?.note).toContain("already committed");
    expect(forced?.runs_remaining).toBe(3);
  });

  /*
   * THE RUNS IT SPENT ON DOORS IT COULD NEVER POST (2026-09-19). The
   * plan took never-walked candidates in the desk's own order, and the
   * never-walked rows that STAY never-walked are the ones every press
   * refuses: a door asking $1.00 cannot be posted at any reward under
   * the $0.25 ceiling. Four candidates, four refusals, nothing posted,
   * and the week decremented anyway. Now it knocks on none of them and
   * says exactly what it found.
   */
  it("posts nothing, knocks on nothing, and names the ceiling when every door is priced out", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify({
        ...round(),
        hosts: [
          { ...host("dear.example"), offer: { networks: [], schemes: [], min_usdc: 1 } },
          { ...host("dearer.example"), offer: { networks: [], schemes: [], min_usdc: 5 } },
        ],
      }),
    );
    await writeBountyPlan(testEnv, {
      version: 2,
      runs_remaining: 4,
      per_run: 2,
      every_hours: 24,
      max_open: 12,
      revisit_days: 0,
      reward_usd: 0.1,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    const pass = await bountyPlanPass(
      { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env,
      NOW,
    );
    expect(pass?.posted).toBe(0);
    expect(pass?.pressed).toBe(false);
    expect(pass?.note).toContain("2 priced above the $0.25 ceiling");
    // The run is untouched: nothing was attempted, so nothing is charged.
    expect(pass?.runs_remaining).toBe(4);
    expect((await readBountyPlan(testEnv))?.runs_remaining).toBe(4);
  });

  /*
   * A BOARD ALREADY FULL IS A REASON TO WAIT (2026-09-19). The brake
   * is on the board rather than on the plan, so listings the keeper
   * posted by hand count against it — the walkers cannot tell which
   * hand opened a listing, and neither should the ceiling.
   */
  it("stops at its open ceiling, counting listings it did not post", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round()),
    );
    for (const id of ["h1", "h2"]) {
      await testEnv.COUNTERS.put(
        KV_KEYS.bounty(id),
        JSON.stringify({
          bounty_id: id,
          target_url: `https://${id}.example/x`,
          domain: `${id}.example`,
          pay_to: `0x${"11".repeat(20)}`,
          amount_atomic: "1000",
          amount_usd: 0.001,
          reward_usd: 0.1,
          opened_at: "2026-09-14T11:00:00.000Z",
          opened_block: 1,
          expires_at: "2026-09-30T11:00:00.000Z",
          status: "open",
        }),
      );
    }
    await writeBountyPlan(testEnv, {
      version: 2,
      runs_remaining: 4,
      per_run: 2,
      every_hours: 6,
      max_open: 2,
      revisit_days: 0,
      reward_usd: 0.1,
      tier: "sprint",
      rails: [],
      created_at: NOW.toISOString(),
    });
    const pass = await bountyPlanPass(
      { ...testEnv, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env,
      NOW,
    );
    expect(pass?.note).toContain("holds the board at 2");
    expect(pass?.runs_remaining).toBe(4);
  });

  /*
   * A PLAN WRITTEN BEFORE THE CADENCE EXISTED KEEPS ITS WEEK. Read
   * forward, not rewritten: the keeper asked for a weekly plan and
   * gets a weekly plan until he says otherwise — and the deploy that
   * shipped the cadence must not press a second time in a week the
   * old plan already pressed.
   */
  it("reads a v1 plan forward and keeps its weekly clock", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.bountyPlan,
      JSON.stringify({
        version: 1,
        weeks_remaining: 5,
        per_week: 3,
        reward_usd: 0.1,
        tier: "standard",
        rails: [],
        created_at: "2026-09-10T00:00:00.000Z",
        last_week: "2026-W38",
        history: [
          { week: "2026-W37", posted: 2, refused: 1, note: "posted 2 of 3" },
        ],
      }),
    );
    const plan = await readBountyPlan(testEnv);
    expect(plan?.runs_remaining).toBe(5);
    expect(plan?.per_run).toBe(3);
    expect(plan?.every_hours).toBe(168);
    expect(plan?.revisit_days).toBe(0);
    expect(plan?.history?.[0]?.at).toBe("2026-W37");
    // 2026-09-14 is inside 2026-W38, which this plan already pressed.
    expect(await bountyPlanPass(testEnv, NOW)).toBeNull();
  });

  it("retires itself once its presses are used up", async () => {
    await writeBountyPlan(testEnv, {
      version: 2,
      runs_remaining: 0,
      per_run: 2,
      every_hours: 168,
      max_open: 12,
      revisit_days: 0,
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
    expect(plan?.runs_remaining).toBe(6);
    expect(plan?.per_run).toBe(4);
    expect(plan?.note).toBe("the week's walk");
  });

  it("takes the cadence dials and says the cadence back in words", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        runs: "24",
        per_run: "5",
        every_hours: "12",
        max_open: "10",
        revisit_days: "14",
        reward_usd: "0.12",
        tier: "sprint",
      }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const said = decodeURIComponent(response.headers.get("location") ?? "");
    expect(said).toContain("5 every 12 hours at $0.12");
    expect(said).toContain("holding the board at 10 open");
    expect(said).toContain("revisiting doors older than 14 days");
    const plan = await readBountyPlan(testEnv);
    expect(plan?.every_hours).toBe(12);
    expect(plan?.max_open).toBe(10);
    expect(plan?.revisit_days).toBe(14);
    expect(plan?.runs_remaining).toBe(24);
  });

  /*
   * THE SECOND WALK, AUTOMATED (2026-09-19). The press had the option
   * from the day the tier shipped and the standing order had no field
   * for it, so every automated listing was open to the same wallet
   * that walked the last one. Two wallets at one door is the only
   * mechanism here that turns a stranger's claim into evidence without
   * trusting the stranger.
   */
  it("carries the second-walk option onto the plan and says so", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        runs: "8",
        per_run: "3",
        every_hours: "24",
        revisit_days: "10",
        distinct_payer: "1",
        reward_usd: "0.12",
        tier: "standard",
      }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(decodeURIComponent(response.headers.get("location") ?? "")).toContain(
      "as second walks",
    );
    expect((await readBountyPlan(testEnv))?.distinct_payer).toBe(true);
  });

  it("refuses a cadence shorter than the tick that would have to run it", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/plan`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        runs: 4,
        per_run: 2,
        every_hours: 0,
        reward_usd: 0.1,
        tier: "sprint",
      }),
    });
    expect(response.status).toBe(400);
    expect(await readBountyPlan(testEnv)).toBeNull();
  });

  /*
   * POST AS I PLEASE (2026-09-19). The standing order rode the tick
   * and only the tick, so "press the dials I already wrote down, now"
   * meant going and ticking checkboxes by hand.
   */
  describe("press it now", () => {
    it("has nothing to press when no plan is running", async () => {
      const response = await SELF.fetch(`${BASE}/admin/bounties/plan/run`, {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
      });
      expect(response.status).toBe(409);
    });

    it("runs the same pass the tick runs, and reports what it decided", async () => {
      await testEnv.COUNTERS.put(KV_KEYS.bountyBudget("2026-W38"), "9.95");
      await testEnv.COUNTERS.put(
        KV_KEYS.wardRoundLatest,
        JSON.stringify(round()),
      );
      await writeBountyPlan(testEnv, {
        version: 2,
        runs_remaining: 3,
        per_run: 2,
        every_hours: 168,
        max_open: 12,
        revisit_days: 0,
        reward_usd: 0.25,
        tier: "sprint",
        rails: [],
        created_at: NOW.toISOString(),
        last_run_at: NOW.toISOString(),
      });
      const response = await SELF.fetch(`${BASE}/admin/bounties/plan/run`, {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
        redirect: "manual",
      });
      expect(response.status).toBe(303);
      const said = decodeURIComponent(response.headers.get("location") ?? "");
      expect(said).toContain("Pressed now");
      /*
       * Forcing skips the CADENCE and not one rule beyond it: the
       * first guard the forced pass meets here is the field wallet,
       * which this test environment does not hold, and it stops at it
       * exactly as the tick would. Nothing was posted and no press was
       * spent.
       */
      expect(said).toContain("payouts are paused");
      expect((await readBountyPlan(testEnv))?.runs_remaining).toBe(3);
    });
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
      version: 2,
      runs_remaining: 4,
      per_run: 2,
      every_hours: 168,
      max_open: 12,
      revisit_days: 0,
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
    expect((await readBountyPlan(testEnv))?.runs_remaining).toBe(0);
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
      version: 2,
      runs_remaining: 5,
      per_run: 3,
      every_hours: 168,
      max_open: 12,
      revisit_days: 0,
      reward_usd: 0.2,
      tier: "standard",
      rails: [],
      created_at: NOW.toISOString(),
      history: [
        {
          at: "2026-09-08T00:00:00.000Z",
          week: "2026-W37",
          posted: 0,
          refused: 0,
          note: "the week was committed",
        },
      ],
    });
    const html = await (
      await SELF.fetch(`${BASE}/admin/market`, {
        headers: { ...AUTH, Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("The standing order");
    expect(html).toContain('action="/admin/bounties/plan"');
    expect(html).toContain("5 presses left");
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
