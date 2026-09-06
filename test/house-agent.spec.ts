import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { inferChannel, isHouseTraffic } from "@/lib/channel";
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

/**
 * THE COLD READ, 2026-09-06 — the same blind spot, third client.
 *
 * scripts/cold-read.mjs measures what the first knock after a deploy
 * costs. To measure the COLD path it must knock from outside, so its
 * workflow sends no house secret, and it never pays, so there is no
 * payer to match. The census caught it walking all 32 doors, 288 asks
 * in twelve hours, in the ORGANIC DIRECT column: the store's own
 * latency canary reading as its busiest customer.
 */
const COLD_READ_UA = "scvd-cold-read/1 (+https://scvd.store)";

describe("the store's own cold read is family too", () => {
  it("knows the canary with no payer and no secret, exactly as it knocks", () => {
    expect(isHouseTraffic(testEnv, { userAgent: COLD_READ_UA })).toBe(true);
  });

  it("does not swallow a stranger who merely mentions a cold read", () => {
    expect(isHouseTraffic(testEnv, { userAgent: "some-buyer/1.0 (cold start)" })).toBe(false);
  });
});

/**
 * THE WALKERS THE TABLE STILL CALLED ORGANIC, promoted 2026-09-06 off
 * the census's own list. Each names its job in its user-agent and each
 * walked six or more doors inside a minute without ever opening a
 * wallet; one writes "no-pay" into the string. The generic SDK strings
 * beside them stay OUT, and this test says so, because promoting one
 * of those would misclassify a real buyer forever.
 */
describe("clients that name their own job read as machinery", () => {
  const NAMED_MACHINERY = [
    "AgentEconomyReport/1.0 (rating CCC, up from CC this week; https://agenteconomy.report/s/scvd.store)",
    "the402-validator/0.2 (+https://the402.dev)",
    "nsgoods-payability-observatory/1.0 (+https://payable.nsgoods.org)",
    "Dexter-Verifier/1.0",
    "x402-band-hunt-b/1.0 (+dry-only; no-pay)",
  ];

  for (const userAgent of NAMED_MACHINERY) {
    it(`reads ${userAgent.split("/")[0]} as infrastructure`, () => {
      expect(inferChannel({ userAgent })).toBe("infrastructure");
    });
  }

  it("leaves a real buyer's SDK alone, which is the whole reason the list is names and not habits", () => {
    for (const userAgent of ["curl/8.18.0", "node", "axios/1.18.1", "Deno/2.7.4", "undici"]) {
      expect(inferChannel({ userAgent })).toBe("direct");
    }
  });
});

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
