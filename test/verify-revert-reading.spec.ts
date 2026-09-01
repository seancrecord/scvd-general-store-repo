import { describe, expect, it } from "vitest";
import { readReason } from "@/lib/declines";
import { firstSuspect } from "@/lib/payment-gate";

/**
 * THE $21 REVERT (2026-09-01, the keeper's field report). Four buys
 * from one wallet: three at $5 settled, the fourth at $21 came back
 * "payment_declined: verify_error, invalid_payload: contract call
 * failed: execution reverted" — twice, same signing code. The wallet
 * held $29.93 before the run; the arithmetic says it was short. The
 * books read that string as "the signature did not verify" and the
 * buyer got the raw contract error. Both now name the first suspect.
 */
const REVERT = "invalid_payload: contract call failed: execution reverted";

describe("a verify-time revert is read as a balance question first", () => {
  it("in the books: the buyer's fault to check, the balance named, the signature not blamed", () => {
    const read = readReason(REVERT);
    expect(read.fault).toBe("buyer");
    expect(read.reading.toLowerCase()).toContain("balance");
    expect(read.reading.toLowerCase()).toContain("cheaper item");
    expect(read.reading.toLowerCase()).not.toContain("signature did not verify");
  });

  it("still reads the plain funds case as the wallet being short", () => {
    expect(readReason("insufficient_funds").reading.toLowerCase()).toContain("wallet was short");
  });

  it("on the 402: the first suspect names the balance against this item's price", () => {
    const suspect = firstSuspect({ reason: "verify_error", message: REVERT }, 21);
    expect(suspect).toBeTruthy();
    expect(suspect!.toLowerCase()).toContain("balance");
    expect(suspect).toContain("$21");
    expect(suspect!.toLowerCase()).toContain("reverted");
    expect(firstSuspect({ reason: "insufficient_funds" }, 5)).toContain("$5");
    // A decline that says nothing about money names no suspect it did not earn.
    expect(firstSuspect({ reason: "invalid_network" }, 5)).toBeUndefined();
    expect(firstSuspect({ reason: "local:payload_v1_envelope" }, 5)).toBeUndefined();
  });
});

import { SELF } from "cloudflare:test";
import { beforeAll } from "vitest";
import { installFacilitatorMock, type FacilitatorMockState } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

let mock: FacilitatorMockState;
beforeAll(() => {
  mock = installFacilitatorMock();
});

describe("through the till: the 402 a reverted buyer actually receives", () => {
  it("carries first_suspect naming the balance and the price, beside the raw reason", async () => {
    const url = "https://scvd.store/api/buy/hello";
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    mock.verifyShouldFail = true;
    mock.verifyInvalidReason = REVERT;
    try {
      const declined = await SELF.fetch(url, {
        headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
      });
      expect(declined.status).toBe(402);
      const body = (await declined.json()) as Record<string, any>;
      expect(body.payment_declined).toBeTruthy();
      expect(JSON.stringify(body.payment_declined)).toContain("execution reverted");
      expect(String(body.payment_declined.first_suspect).toLowerCase()).toContain("balance");
      expect(String(body.payment_declined.first_suspect)).toContain("$0.5");
    } finally {
      mock.verifyShouldFail = false;
      delete mock.verifyInvalidReason;
    }
  });
});
