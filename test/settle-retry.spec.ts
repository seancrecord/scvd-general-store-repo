import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "@/types";
import { isRecord } from "@/types";
import { readDeclines } from "@/lib/declines";
import { isTransientSettleFailure } from "@/lib/payments";
import {
  installFacilitatorMock,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import { markKeeperPresent } from "./helpers/keeper";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * ONE SETTLE RETRY ON A FACILITATOR 5xx.
 *
 * On 2026-08-07 a real buyer's first three purchases — small_blessing
 * twice, daily_fortune once — all verified and then died on the
 * facilitator's settle endpoint returning bare 502s inside one minute.
 * Intent proven, wallet good, sale lost to somebody else's blip.
 *
 * The till now retries exactly once when the settle failure is the
 * TRANSPORT-FAILED shape ("Facilitator settle failed (5xx)"), and
 * never when the facilitator actually answered no. Safe because an
 * EIP-3009 authorization settles at most once on-chain: the retry can
 * save the sale or convert the ambiguity into a verdict, but it cannot
 * double-charge.
 */

let facilitator: FacilitatorMockState;

beforeAll(async () => {
  facilitator = installFacilitatorMock();
  await markKeeperPresent(testEnv);
});

beforeEach(() => {
  facilitator.settleTransient502s = 0;
  facilitator.settleCalls = 0;
  facilitator.settleShouldFail = false;
});

async function buyPaid(itemId: string): Promise<Response> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/${itemId}`);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0];
  if (!accepted) {
    throw new Error(`No tier 0 offered for ${itemId}`);
  }
  return SELF.fetch(`${BASE}/api/buy/${itemId}`, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
      "User-Agent": "settle-retry-spec/1",
    },
  });
}

describe("the shape that retries", () => {
  it("keys on the transport-failed string alone", () => {
    // The live string from 2026-08-07, and its 503 sibling.
    expect(
      isTransientSettleFailure(
        "Facilitator settle failed (502): error code: 502",
      ),
    ).toBe(true);
    expect(
      isTransientSettleFailure("Facilitator settle failed (503): upstream"),
    ).toBe(true);
    // A verdict is not a blip: the facilitator answered.
    expect(isTransientSettleFailure("insufficient_funds")).toBe(false);
    // A 4xx is our request being wrong, which a retry cannot fix.
    expect(
      isTransientSettleFailure("Facilitator settle failed (400): bad request"),
    ).toBe(false);
    expect(isTransientSettleFailure(undefined)).toBe(false);
  });
});

describe("a facilitator blip", () => {
  it("costs one retry, not the sale", async () => {
    facilitator.settleTransient502s = 1;
    const response = await buyPaid("small_blessing");
    expect(response.status).toBe(200);
    // First call 502'd, the retry settled: two calls, one sale.
    expect(facilitator.settleCalls).toBe(2);
  });

  /**
   * EXPLICIT TIMEOUT, 2026-08-20: this path SLEEPS 4000ms by design —
   * SETTLE_RETRY_DELAY_MS (1500) before the second settle, then
   * RESCUE_DELAY_MS (2500) before the ambiguous-502 rescue read —
   * inside vitest's 5000ms default, leaving one second for actual
   * work. On a loaded CI pool it lost that second twice in one run.
   * The budget below is the designed sleeps plus honest headroom.
   */
  it("books the verbatim reason when the outage outlives the retry", { timeout: 15_000 }, async () => {
    facilitator.settleTransient502s = 2;
    const response = await buyPaid("small_blessing");
    expect(response.status).toBe(402);
    // One retry, never a loop: a rail that is down stays down.
    expect(facilitator.settleCalls).toBe(2);

    const body: unknown = await response.json();
    expect(isRecord(body)).toBe(true);
    const declined = isRecord(body) ? body["payment_declined"] : undefined;
    expect(isRecord(declined) ? declined["reason"] : undefined).toBe(
      "Facilitator settle failed (502): error code: 502",
    );

    // And the desk reads it as the rail's fault, raw string intact.
    const report = await readDeclines(testEnv);
    const row = report.declines.find(
      (entry) =>
        entry.user_agent === "settle-retry-spec/1" &&
        entry.reason ===
          "settle:Facilitator settle failed (502): error code: 502",
    );
    expect(row).toBeDefined();
    expect(row?.stage).toBe("settle");
    expect(row?.fault).toBe("facilitator");
  });
});

describe("a facilitator verdict", () => {
  it("is never second-guessed with a retry", async () => {
    facilitator.settleShouldFail = true;
    const response = await buyPaid("small_blessing");
    expect(response.status).toBe(402);
    // The facilitator ANSWERED (success:false). One call, no retry —
    // re-asking a question that was answered is how a real decline
    // gets charged twice the day the answer changes.
    expect(facilitator.settleCalls).toBe(1);
  });
});
