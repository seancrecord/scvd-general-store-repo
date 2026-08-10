import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { listAlerts, sendAlert } from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE ALARM SURFACE THAT GOT LESS TRUSTWORTHY THE LONGER YOU LEFT IT.
 *
 * Found by the keeper at 3am, the hard way: the same undelivered sale
 * showed at 03:30 on one render and 09:30 on another, and it took six
 * fetches cross-checked against a transaction hash to establish that
 * nothing new had happened.
 *
 * The cause was not a render at all. sendAlert returned EARLY while
 * the six-hour page-dedupe key was set, writing nothing — and then,
 * the moment that key expired, minted a BRAND NEW log row with a new
 * timestamp for the same standing condition. 03:30 plus six hours is
 * 09:30. Rows live thirty days, so one unresolved event could leave a
 * hundred and twenty of them, and since listAlerts returns the newest
 * N, the duplicates pushed genuinely distinct alarms off the bottom.
 *
 * An instrument that degrades while unobserved is worst exactly when
 * it is needed. These tests are that failure, pinned.
 */

async function clearAlerts(): Promise<void> {
  for (const prefix of ["alert_log:", "alert_open:", "alert_sent:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

beforeEach(clearAlerts);

describe("a problem that has not been fixed", () => {
  it("stays ONE row however many times it is raised", async () => {
    for (let index = 0; index < 5; index += 1) {
      await sendAlert(testEnv, {
        condition: "undelivered_sale",
        detail: `settled ${index * 90} minutes ago and no goods went out`,
        key: "ord_stuck",
      });
    }
    const alerts = await listAlerts(testEnv, 50);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.repeats).toBe(5);
  });

  it("keeps the date it STARTED, which is the fact being reported", async () => {
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "first",
      key: "ord_stuck",
    });
    const first = (await listAlerts(testEnv, 50))[0]!.at;

    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "still stuck",
      key: "ord_stuck",
    });

    const [row] = await listAlerts(testEnv, 50);
    // The event did not move, so neither does its date.
    expect(row!.at).toBe(first);
    // But the surface still says it is ongoing, and how recently.
    expect(row!.last_seen).not.toBe(first);
    expect(row!.detail).toBe("still stuck");
  });

  it("re-raising even after the page window lapses does not mint a second row", async () => {
    /*
     * THE EXACT MECHANISM. The old code keyed the LOG write to the
     * six-hour email dedupe: no key, new row. Deleting that key here
     * is what six hours of wall clock used to do.
     */
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "settled and nothing went out",
      key: "ord_stuck",
    });
    const listed = await testEnv.COUNTERS.list({ prefix: "alert_sent:" });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);

    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: "settled and nothing went out",
      key: "ord_stuck",
    });
    expect(await listAlerts(testEnv, 50)).toHaveLength(1);
  });

  it("does not let one standing problem crowd distinct ones off the list", async () => {
    // Three real problems and one that keeps repeating. All four must
    // be visible; before this, the repeater would own the window.
    for (const id of ["ord_a", "ord_b", "ord_c"]) {
      await sendAlert(testEnv, {
        condition: "undelivered_sale",
        detail: `stuck: ${id}`,
        key: id,
      });
    }
    for (let index = 0; index < 20; index += 1) {
      await sendAlert(testEnv, {
        condition: "undelivered_sale",
        detail: "the noisy one",
        key: "ord_noisy",
      });
    }
    const keys = (await listAlerts(testEnv, 10)).map((row) => row.detail);
    expect(keys).toHaveLength(4);
    for (const id of ["ord_a", "ord_b", "ord_c"]) {
      expect(keys.some((detail) => detail.includes(id)), id).toBe(true);
    }
  });
});

describe("problems that are genuinely different", () => {
  it("keeps distinct keys on distinct rows", async () => {
    await sendAlert(testEnv, { condition: "order_sla", detail: "a", key: "1" });
    await sendAlert(testEnv, { condition: "order_sla", detail: "b", key: "2" });
    expect(await listAlerts(testEnv, 50)).toHaveLength(2);
  });

  it("does not collapse keyless alerts that say different things", async () => {
    /*
     * The trap in the obvious fix. Most worker_health alerts carry no
     * key, so merging on condition alone would hide every later
     * failure behind whichever fired first — trading a noisy surface
     * for a silent one, which is the worse of the two.
     */
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "the ward round could not read the discovery feed",
    });
    await sendAlert(testEnv, {
      condition: "worker_health",
      detail: "the open-labor index rebuild failed",
    });
    expect(await listAlerts(testEnv, 50)).toHaveLength(2);
  });

  it("still merges a keyless alert repeating the same words", async () => {
    for (let index = 0; index < 4; index += 1) {
      await sendAlert(testEnv, {
        condition: "worker_health",
        detail: "the same thing is still broken",
      });
    }
    const alerts = await listAlerts(testEnv, 50);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.repeats).toBe(4);
  });
});
