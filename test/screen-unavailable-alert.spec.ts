import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { ALERT_CONDITIONS, listAlerts } from "@/lib/alerts";
import { accrueCredit, redeemCredit } from "@/services/store-credit";
import { fieldSignerFromKey, raiseScreenUnavailable } from "@/services/launch-check";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE SCREEN THAT FAILED CLOSED IN SILENCE (2026-09-04).
 *
 * On 2026-09-03 the sanctions screen did not answer for ninety
 * minutes, every bounty claim was refused by rule, and nothing paged:
 * the keeper learned it from a walker's letter. Failing closed was
 * right. Failing closed QUIETLY was the defect — the one class of
 * failure the store cannot discover by being told, because the people
 * being turned away are strangers with no address to write to.
 *
 * These hold that an unanswered screen pages, once per door, and that
 * the page says whose problem it is.
 */

async function alertsFor(condition: string): Promise<string[]> {
  const alerts = await listAlerts(testEnv, 40);
  return alerts
    .filter((alert) => alert.condition === condition)
    .map((alert) => alert.detail);
}

describe("an unanswered sanctions screen pages the keeper", () => {
  it("is one of the conditions the store pages on", () => {
    expect(ALERT_CONDITIONS).toContain("payout_screen_unavailable");
  });

  it("pages from the credit desk when the screen returns nothing", async () => {
    const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const wallet = privateKeyToAccount(key).address;
    await accrueCredit(testEnv, wallet, 30);
    await expect(
      redeemCredit(testEnv, wallet, {
        signer: await fieldSignerFromKey(key),
        screen: async () => ({
          listed: null,
          source: "Chainalysis on-chain sanctions oracle — no answer from 3 endpoints: a.test (HTTP 429), b.test (HTTP 429), c.test (unreachable)",
        }),
      }),
    ).rejects.toThrow(/fails closed/);

    const details = await alertsFor("payout_screen_unavailable");
    const detail = details.find((text) => text.includes("credit cash-out"));
    expect(detail, "the credit desk failed closed without paging").toBeTruthy();
    // Whose problem it is, first, so a lock screen carries the answer.
    expect(detail!.startsWith("OURS to check")).toBe(true);
    // The refusal's own words, so the page names the endpoints that
    // did not answer rather than restating that something did not.
    expect(detail).toContain("a.test (HTTP 429)");
    // And what it means for the walkers, and where to read them.
    expect(detail).toContain("/admin/bounties");
  });

  it("names the door, and a listing does not page — only silence does", async () => {
    // A listed address is the screen WORKING; it is not this alarm.
    await raiseScreenUnavailable(testEnv, "bounty claim bty_test", "oracle (HTTP 503)");
    const details = await alertsFor("payout_screen_unavailable");
    expect(details.some((text) => text.includes("bounty claim bty_test"))).toBe(true);
  });
});
