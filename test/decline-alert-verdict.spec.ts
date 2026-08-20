import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { listAlerts } from "@/lib/alerts";
import { recordPaymentDecline } from "@/lib/metrics";
import { readReason } from "@/lib/declines";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE ALERT THAT BURIED ITS OWN LEDE, 2026-08-20.
 *
 * Four payment_declined P1s reached the keeper's phone inside two
 * minutes and every preview said the same thing: a path, a machine
 * string, "the reading is at /admin/declines". The question a decline
 * actually asks — is the store turning away money, or is a stranger's
 * wallet short — was already answered in code by readReason(), and
 * that answer went to a page he was not looking at instead of the
 * notification he was.
 *
 * These tests hold the fix where it matters: the fault verdict leads
 * the detail, so it survives a lock-screen truncation, and the raw
 * reason is never dropped in the process.
 */

async function latestDeclineAlert(): Promise<string> {
  const alerts = await listAlerts(testEnv, 30);
  const declines = alerts.filter(
    (alert) => alert.condition === "payment_declined",
  );
  return declines[0]?.detail ?? "";
}

/** A fresh reason per call: the alert dedupes on item + reason. */
function uniqueReason(base: string): string {
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

describe("the decline alert leads with whose problem it is", () => {
  it("says OURS, first, when the store turned away money it could have taken", async () => {
    // A recipient/amount disagreement is readReason's "ours" — our
    // published requirements disagreeing with our own gate.
    const reason = `payTo not accepted ${uniqueReason("x")}`;
    await recordPaymentDecline(testEnv, "/api/buy/small_blessing", reason, {
      userAgent: "verdict-test-client/1.0",
    });
    const detail = await latestDeclineAlert();
    expect(detail.startsWith("OURS, money turned away")).toBe(true);
    // The raw reason survives beside the verdict — the fact is never
    // replaced by our reading of it.
    expect(detail).toContain(reason);
    expect(detail).toContain("/api/buy/small_blessing");
    // And the plain-words reading rides along, so the phone carries
    // the same answer the desk would give.
    expect(detail).toContain(readReason(reason).reading.slice(0, 40));
  });

  it("says THEIRS, first, when the buyer's wallet was simply short", async () => {
    const reason = `insufficient_funds ${uniqueReason("y")}`;
    await recordPaymentDecline(testEnv, "/api/buy/hello", reason, {
      userAgent: "verdict-test-client/1.0",
    });
    const detail = await latestDeclineAlert();
    expect(detail.startsWith("THEIRS, nothing to fix")).toBe(true);
    expect(detail).toContain("wallet was short");
  });

  it("names the payment rail when the facilitator itself fell over", async () => {
    const reason = `Facilitator settle failed (502): error code: 502 ${uniqueReason("z")}`;
    await recordPaymentDecline(testEnv, "/api/buy/hello", reason, {
      userAgent: "verdict-test-client/1.0",
    });
    expect(await latestDeclineAlert()).toContain("UPSTREAM, the payment rail");
  });

  it("reads a settle-side reason past its stage prefix, not as an unknown", async () => {
    /**
     * The desk strips "settle:" before reading; the alert has to do the
     * same or every settle-side decline pages as UNCLEAR — which is
     * the one verdict that tells a keeper nothing.
     */
    const reason = `insufficient_funds ${uniqueReason("w")}`;
    await recordPaymentDecline(
      testEnv,
      "/api/buy/hello",
      `settle:${reason}`,
      { userAgent: "verdict-test-client/1.0" },
    );
    const detail = await latestDeclineAlert();
    expect(detail.startsWith("THEIRS, nothing to fix")).toBe(true);
    // The stage prefix stays visible in the quoted raw reason.
    expect(detail).toContain("settle:");
  });

  it("still says nothing at all when the wallet is the house's own", async () => {
    const before = (await listAlerts(testEnv, 30)).filter(
      (alert) => alert.condition === "payment_declined",
    ).length;
    await recordPaymentDecline(
      testEnv,
      "/api/buy/hello",
      uniqueReason("house-reason"),
      // House by the same definition house-ledger.json publishes.
      {
        houseHeader: testEnv.HOUSE_SECRET,
        houseParam: testEnv.HOUSE_SECRET,
        userAgent: "verdict-test-client/1.0",
      },
    );
    const after = (await listAlerts(testEnv, 30)).filter(
      (alert) => alert.condition === "payment_declined",
    ).length;
    expect(after).toBe(before);
  });
});
