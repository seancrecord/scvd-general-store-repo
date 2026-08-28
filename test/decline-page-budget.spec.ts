import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  HOURLY_EMAIL_BUDGET,
  listAlerts,
  sendAlert,
} from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * ELEVEN PAGES FOR A PASS (task #25). A conformance instrument walked
 * the store's own door with deliberately varied bad payments — which
 * is the instrument WORKING, ours and theirs — and every distinct
 * refusal minted a distinct payment_declined alert, so the keeper's
 * phone read eleven incidents where zero had happened. That already
 * happened once and will keep happening: being probeable is the
 * store's own posture (we probe everyone else), so probe traffic is a
 * standing condition, not an anomaly.
 *
 * The fix is a page budget, not a filter: no heuristic decides which
 * decline is "really" a probe (a heuristic that guesses wrong eats a
 * real buyer's only signal). Every decline still writes its row —
 * /admin/declines and listAlerts stay complete — but payment_declined
 * EMAILS cap per hour, and the last one to send says the fold is
 * happening. A spread of distinct declines inside one hour is one
 * fact, not that many incidents.
 */

async function clearAlerts(): Promise<void> {
  for (const prefix of [
    "alert_log:",
    "alert_open:",
    "alert_sent:",
    "alert_email_budget:",
  ]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

beforeEach(clearAlerts);

async function pagedCount(): Promise<number> {
  const listed = await testEnv.COUNTERS.list({ prefix: "alert_sent:" });
  return listed.keys.length;
}

describe("the decline page budget", () => {
  it("caps payment_declined pages per hour while every row still lands", async () => {
    const budget = HOURLY_EMAIL_BUDGET["payment_declined"]!;
    expect(budget).toBeGreaterThan(0);

    // Eleven distinct refusals, the incident's own number.
    for (let index = 0; index < 11; index += 1) {
      await sendAlert(testEnv, {
        condition: "payment_declined",
        detail: `THEIRS, nothing to fix — probe variant ${index}`,
        key: `hello:variant-${index}`,
      });
    }

    // The desk is complete: one row per distinct refusal.
    expect(await listAlerts(testEnv, 50)).toHaveLength(11);
    // The phone is not: pages stop at the budget.
    expect(await pagedCount()).toBe(budget);
  });

  it("does not budget the conditions where every page is an incident", async () => {
    // An undelivered sale is never probe noise — five distinct stuck
    // orders are five pages, exactly as before.
    for (const id of ["a", "b", "c", "d", "e"]) {
      await sendAlert(testEnv, {
        condition: "undelivered_sale",
        detail: `stuck: ${id}`,
        key: `ord_${id}`,
      });
    }
    expect(await pagedCount()).toBe(5);
  });

  it("still refuses to nag: a repeating identity is one page, not one per raise", async () => {
    // The budget rides ON TOP of the existing dedupe, it does not
    // replace it — the same refusal repeating spends the budget once.
    for (let index = 0; index < 4; index += 1) {
      await sendAlert(testEnv, {
        condition: "payment_declined",
        detail: "THEIRS — same wall, same client",
        key: "hello:same-wall",
      });
    }
    expect(await pagedCount()).toBe(1);
    const budgetKeys = await testEnv.COUNTERS.list({
      prefix: "alert_email_budget:",
    });
    expect(budgetKeys.keys).toHaveLength(1);
    const spent = await testEnv.COUNTERS.get(budgetKeys.keys[0]!.name);
    expect(spent).toBe("1");
  });
});
