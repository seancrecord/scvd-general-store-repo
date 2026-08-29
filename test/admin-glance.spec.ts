import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { readGlance, writeGlance, GLANCE_KEY } from "@/services/glance";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE DESK THAT RECOMPUTES THE WORLD EVERY TIME YOU OPEN IT.
 *
 * The keeper's ask: fast, scannable, works on a phone. What makes
 * /admin slow is structural rather than cosmetic — seventeen parallel
 * loads on every open, three of them heavy walks (computeStats over
 * every month the store has been open, reconcileSettles, and the rail
 * refresh whose own comment admits it is riding along on the
 * certificate walk). On a phone that wait is the whole experience.
 *
 * So the numbers he actually opens the desk to see are computed once
 * on the hourly cron and stored as ONE blob. The desk reads that blob
 * and paints; everything else stays a tap away.
 *
 * THE HONESTY REQUIREMENT, which is the point of the tests below.
 * A cached number that looks live is worse than a slow one — the
 * keeper would be making calls on figures of unknown age. So the blob
 * carries `computed_at` and the desk shows it, a missing blob renders
 * as "not computed yet" rather than as zeros (a zero is a claim; an
 * absent reading is not), and the five numbers are the five he chose,
 * by name, so a later edit cannot quietly drop one.
 *
 * The keeper picked these five on 2026-08-28: orders waiting on a
 * human, things needing his review, open alerts, this month's organic
 * settlements, and the month's take.
 */

const FIELDS = [
  "pending_orders",
  "pending_reviews",
  "open_alerts",
  "organic_settlements",
  "take_usdc",
] as const;

beforeEach(async () => {
  await testEnv.COUNTERS.delete(GLANCE_KEY);
});

describe("the glance", () => {
  it("is absent before anything computes it, and says so rather than showing zeros", async () => {
    /*
     * A zero on a dashboard is a claim: "I looked, there were none."
     * An unwritten blob has not looked. Rendering the second as the
     * first is how a keeper concludes the queue is empty on the day
     * the cron stopped running.
     */
    expect(await readGlance(testEnv)).toBeNull();
  });

  it("carries the keeper's five numbers and the time it read them", async () => {
    await writeGlance(testEnv);
    const glance = await readGlance(testEnv);
    expect(glance, "the glance did not write").toBeTruthy();
    for (const field of FIELDS) {
      expect(
        typeof glance![field],
        `the glance is missing "${field}", one of the five the keeper chose`,
      ).not.toBe("undefined");
    }
    expect(Date.parse(glance!.computed_at)).toBeGreaterThan(0);
  });

  it("costs the desk exactly one read", async () => {
    /*
     * The whole point. If reading the glance ever fans out again, the
     * desk is back to recomputing the world and this file is the
     * thing that noticed.
     */
    await writeGlance(testEnv);
    let reads = 0;
    const counters = testEnv.COUNTERS;
    const spied = {
      ...counters,
      get: (...args: Parameters<typeof counters.get>) => {
        reads += 1;
        return counters.get(...args);
      },
    } as typeof counters;
    await readGlance({ ...testEnv, COUNTERS: spied } as Env);
    expect(reads).toBe(1);
  });

  it("counts every number as a number, never a string that looks like one", async () => {
    await writeGlance(testEnv);
    const glance = (await readGlance(testEnv))!;
    for (const field of ["pending_orders", "pending_reviews", "open_alerts", "organic_settlements"] as const) {
      expect(Number.isFinite(glance[field]), field).toBe(true);
    }
  });
});
