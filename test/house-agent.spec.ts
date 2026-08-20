import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isHouseTraffic } from "@/lib/channel";
import { listAlerts } from "@/lib/alerts";
import { recordPaymentDecline } from "@/lib/metrics";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * FAMILY MADE THE PAPER, 2026-08-20 — the hole both house tests shared.
 *
 * CV's field-run script walks every endpoint the Bazaar lists, and the
 * Bazaar lists this store. It hand-rolls its envelopes, so five
 * attempts at the half-cent door died BEFORE any payer address
 * existed (`payload_not_an_object`, `payload_missing_accepted`), and
 * it correctly refuses to carry the house secret to strangers' doors.
 *
 * Payer test: blind, no wallet in the payload. Secret test: blind, no
 * header. Result: five family declines booked organic, four P1s to the
 * keeper's phone, and a desk reading them as the strongest outside
 * intent the store had ever recorded.
 *
 * The agent test closes it, and these tests hold the property that
 * matters: house is recognised with NEITHER a payer NOR a secret.
 */

const FIELD_RUN_UA =
  "scvd-walkabout/1.0 (+https://scvd.store/what) x402-field-research";

describe("the store's own agents are family, envelope or no envelope", () => {
  it("knows the field run with no payer and no secret — the exact blind spot", () => {
    expect(isHouseTraffic(testEnv, { userAgent: FIELD_RUN_UA })).toBe(true);
  });

  it("knows the launch-check walker too, since it shares the agent name", () => {
    expect(
      isHouseTraffic(testEnv, {
        userAgent:
          "scvd-walkabout/1.0 (+https://scvd.store/what) x402-launch-check",
      }),
    ).toBe(true);
  });

  it("still lets an ordinary stranger be a stranger", () => {
    expect(
      isHouseTraffic(testEnv, { userAgent: "some-agent/2.0 (+https://elsewhere.example)" }),
    ).toBe(false);
    expect(isHouseTraffic(testEnv, {})).toBe(false);
  });

  it("keeps both older tests working", () => {
    const cv = HOUSE_WALLET_FILE.wallets.find((entry) => entry.who === "CV");
    expect(cv, "CV is no longer a declared house wallet").toBeTruthy();
    expect(isHouseTraffic(testEnv, { payer: cv!.address })).toBe(true);
    expect(
      isHouseTraffic(testEnv, { houseHeader: testEnv.HOUSE_SECRET }),
    ).toBe(true);
  });

  it("wakes nobody when the field run bounces off our own door", async () => {
    /**
     * The end-to-end property, stated as the night stated it: a
     * malformed envelope from our own research agent must not page the
     * keeper, and must not land in the organic column.
     */
    const before = (await listAlerts(testEnv, 30)).filter(
      (alert) => alert.condition === "payment_declined",
    ).length;
    await recordPaymentDecline(
      testEnv,
      "/api/buy/small_blessing",
      `local:payload_missing_accepted-${crypto.randomUUID().slice(0, 8)}`,
      { userAgent: FIELD_RUN_UA },
    );
    const after = (await listAlerts(testEnv, 30)).filter(
      (alert) => alert.condition === "payment_declined",
    ).length;
    expect(after, "the field run paged the keeper again").toBe(before);
  });
});
