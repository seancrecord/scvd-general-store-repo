import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { listAlerts } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { recordPaymentDecline, recordSettlement } from "@/lib/metrics";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

async function alertDetails(): Promise<string[]> {
  return (await listAlerts(testEnv, 30)).map((alert) => alert.detail);
}

/**
 * The alert LOG persists for thirty days, so presence proves nothing
 * inside a suite that has already raised one. Count instead.
 */
async function firstSignatureAlerts(): Promise<number> {
  return (await alertDetails()).filter((detail) =>
    detail.includes("FIRST OUTSIDE PAYMENT SIGNATURE"),
  ).length;
}

async function reset(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.firstSignature);
  await testEnv.COUNTERS.delete("alert_sent:first_outside_signature:once");
}

/**
 * THE ONE FIRST WORTH WAKING A HUMAN FOR.
 *
 * CV ruled on the thresholds: only the first non-house wallet wakes the
 * keeper. First repeat buyer and first item sold twice are Sunday-sweep
 * material — genuinely interesting, not time-sensitive.
 *
 * AND HIS REFINEMENT CHANGED THE TRIGGER, which is the part these tests
 * exist for: keyed to a signature PRESENTED, not a payment settled. A
 * stranger who tries and bounces is the same magnitude of news as one
 * who clears, and more actionable, because a decline is the thing we
 * can still fix. Waiting for a clean settle would have let the
 * 2026-07-28 client — the first outside wallet ever to try here — pass
 * unflagged because their client was malformed.
 */
describe("the first outside signature", () => {
  beforeEach(reset);

  it("wakes him on a DECLINE, not only on a settle", async () => {
    await recordPaymentDecline(testEnv, "/api/buy/hello", "local:preflight:x", {
      userAgent: "stranger/1.0",
    });
    const details = await alertDetails();
    const raised = details.find((detail) =>
      detail.includes("FIRST OUTSIDE PAYMENT SIGNATURE"),
    );
    expect(raised, "a stranger's first decline raised nothing").toBeTruthy();
    expect(raised).toContain("declined");
    // The alarm has to say what to do next, not just that it happened.
    expect(raised).toContain("/admin/declines");
  });

  it("fires once, ever, and never again", async () => {
    await recordPaymentDecline(testEnv, "/api/buy/hello", "reason-one", {
      userAgent: "stranger/1.0",
    });
    const first = await firstSignatureAlerts();
    await recordPaymentDecline(testEnv, "/api/buy/small_blessing", "reason-two", {
      userAgent: "stranger/2.0",
    });
    await recordSettlement(testEnv, "/api/buy/hello", {
      userAgent: "stranger/3.0",
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
    });
    const after = await firstSignatureAlerts();
    expect(after, "the once-ever alarm fired twice").toBe(first);
  });

  it("stays silent for the house, by the same definition the ledger publishes", async () => {
    // CV's second point, and it matters more than the first: do not
    // build a private notion of "family" that can drift from the public
    // one. This asserts the alarm respects the declared wallet list.
    const cv = HOUSE_WALLET_FILE.wallets.find((entry) => entry.who === "CV");
    expect(cv, "CV is not in the published wallet list").toBeTruthy();
    const before = await firstSignatureAlerts();
    await recordSettlement(testEnv, "/api/buy/hello", {
      payer: cv?.address,
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
    });
    expect(
      await firstSignatureAlerts(),
      "a declared house wallet woke the keeper",
    ).toBe(before);
    expect(await testEnv.COUNTERS.get(KV_KEYS.firstSignature)).toBeNull();
  });

  it("stays silent for a house-header request too", async () => {
    const before = await firstSignatureAlerts();
    await recordPaymentDecline(testEnv, "/api/buy/hello", "house-test", {
      houseHeader: testEnv.HOUSE_SECRET,
      houseParam: testEnv.HOUSE_SECRET,
    });
    expect(await firstSignatureAlerts()).toBe(before);
  });

  it("records what happened, so the moment is legible later", async () => {
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      userAgent: "stranger/9.9",
      paidUsdc: 0.005,
      minimumUsdc: 0.005,
    });
    const raw = await testEnv.COUNTERS.get(KV_KEYS.firstSignature);
    expect(raw).toBeTruthy();
    const stamp = JSON.parse(raw as string) as {
      item: string;
      outcome: string;
      at: string;
    };
    expect(stamp.item).toBe("small_blessing");
    expect(stamp.outcome).toBe("settled");
    expect(stamp.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
