import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import { readReason } from "@/lib/declines";
import {
  bookedReason,
  isNeverJudged,
  JUDGED_NOTE,
  neverJudgedBlock,
  signedValidBefore,
} from "@/lib/decline-diagnosis";
import { classifyVerifyFailure, verifyFailureReason } from "@/lib/payments";
import { isRecord } from "@/types";

/**
 * A VERIFY ERROR IS NOT A VERDICT (2026-09-04, off the
 * settlement_attestation funnel: verify_error ×2, both bare).
 *
 * The verify CALL failing means the payload was never examined — the
 * buyer's signature is good, their nonce unspent, no money moved. The
 * store's answer said "The signed payment was not accepted", shipped
 * the whole hand-rolling signing guide, and carried no Retry-After.
 * An agent reading that re-signs a payload that was already correct,
 * or writes the door off. Both are wrong and both cost the sale.
 *
 * And the books kept only the flat code, so the one question a keeper
 * asks of these — my egress or their endpoint — had no answer.
 */

describe("which way the verify call died", () => {
  it("separates the facilitator's answer from silence on the wire", () => {
    const withStatus = (status: number): Error =>
      Object.assign(new Error("nope"), { statusCode: status });
    expect(classifyVerifyFailure(withStatus(502))).toBe("upstream_5xx");
    expect(classifyVerifyFailure(withStatus(401))).toBe("upstream_4xx");
    expect(
      classifyVerifyFailure(
        Object.assign(new Error("hung"), { timeoutMs: 10_000 }),
      ),
    ).toBe("timeout");
    // AbortSignal.timeout's rejection carries neither field.
    expect(
      classifyVerifyFailure(
        Object.assign(new Error("The operation was aborted"), {
          name: "TimeoutError",
        }),
      ),
    ).toBe("timeout");
    expect(classifyVerifyFailure(new Error("ECONNRESET"))).toBe("transport");
  });

  it("books the class on the code, in the house's own : convention", () => {
    expect(verifyFailureReason(new Error("ECONNRESET"))).toBe(
      "verify_error:transport",
    );
  });

  /**
   * The one that is an emergency. A 4xx on verify means the
   * facilitator answered and refused US — our key, our account, our
   * quota — and it never looked at the payload. Every sale at every
   * door dies on it while each row looks like one unlucky buyer.
   */
  it("calls a 4xx from the facilitator OURS, not the buyer's and not unclear", () => {
    const { fault, reading } = readReason("verify_error:upstream_4xx");
    expect(fault).toBe("ours");
    expect(reading).toContain("credentials");
  });

  it("calls a 5xx theirs and leaves the buyer out of it", () => {
    expect(readReason("verify_error:upstream_5xx").fault).toBe("facilitator");
  });

  it("does not pretend to know whether a timeout was ours or theirs", () => {
    expect(readReason("verify_error:timeout").fault).toBe("unknown");
    expect(readReason("verify_error:transport").fault).toBe("unknown");
  });

  it("gives every class its own reading, so the desk is not one sentence", () => {
    const codes = [
      "verify_error",
      "verify_error:timeout",
      "verify_error:transport",
      "verify_error:upstream_4xx",
      "verify_error:upstream_5xx",
    ];
    expect(new Set(codes.map((c) => readReason(c).reading)).size).toBe(
      codes.length,
    );
  });

  it("still appends our payload reading to a classed code, as it did to the bare one", () => {
    // The class says the CALL died; it says nothing about the payload,
    // so a concrete field problem is still worth carrying.
    const booked = bookedReason("verify_error:timeout", [
      { field: "payload.authorization.nonce", says: "x", saw: "y", blocking: true },
    ]);
    expect(booked).toBe(
      "verify_error:timeout+payload:payload.authorization.nonce",
    );
  });
});

describe("what the buyer is told when nothing judged their payment", () => {
  it("recognises every verify_error class as never-judged", () => {
    for (const reason of [
      "verify_error",
      "verify_error:timeout",
      "verify_error:transport",
      "verify_error:upstream_4xx",
      "verify_error:upstream_5xx",
    ]) {
      expect(isNeverJudged({ reason }), reason).toBe(true);
    }
  });

  it("does NOT claim never-judged once our own pre-flight found a real field problem", () => {
    // bookedReason appends this exactly when the payload IS suspect.
    expect(
      isNeverJudged({
        reason: "verify_error+payload:payload.authorization.nonce",
      }),
    ).toBe(false);
  });

  it("leaves a genuine verdict saying what it always said", () => {
    expect(isNeverJudged({ reason: "insufficient_funds" })).toBe(false);
    expect(isNeverJudged(undefined)).toBe(false);
    expect(JUDGED_NOTE).toContain("was not accepted");
  });

  it("tells the agent to resend the SAME payload rather than re-sign", () => {
    const block = neverJudgedBlock(1_800_000_000);
    expect(block["fault"]).toBe("upstream");
    expect(String(block["note"])).toContain("NEVER JUDGED");
    const retry = block["retry"];
    expect(isRecord(retry)).toBe(true);
    if (!isRecord(retry)) return;
    expect(retry["resend_identical_payload"]).toBe(true);
    expect(retry["payload_valid_until"]).toBe(1_800_000_000);
    expect(String(retry["how"])).toContain("Do not re-sign");
    expect(String(retry["how"])).toContain("1800000000");
    // The thing an agent must NOT conclude.
    expect(String(block["note"])).not.toContain("not accepted");
  });

  it("omits the validity window rather than inventing one", () => {
    const retry = neverJudgedBlock(undefined)["retry"];
    expect(isRecord(retry)).toBe(true);
    if (!isRecord(retry)) return;
    expect(retry).not.toHaveProperty("payload_valid_until");
    expect(String(retry["how"])).not.toContain("good until");
  });

  it("reads the validity window off the payload the buyer actually signed", () => {
    const header = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: {},
        payload: { authorization: { validBefore: "1800000000" } },
      }),
    );
    expect(signedValidBefore(header)).toBe(1_800_000_000);
    expect(signedValidBefore("not base64 at all !!")).toBeUndefined();
    expect(signedValidBefore(undefined)).toBeUndefined();
  });
});

/**
 * THE SAME ANSWER AT BOTH DOORS, end to end. A verify call that dies
 * on the wire must produce: a body that says the payload was never
 * judged, a Retry-After the buyer can act on without reading prose,
 * and NO signing guide — because pointing a correct signer at its own
 * signing code is how a good client gets talked into re-signing a
 * payload that was already right.
 */
describe("the door's answer when verify never reached the facilitator", () => {
  it("tells an HTTP buyer to resend, and does not hand them the signing guide", async () => {
    const state = installFacilitatorMock();
    const path = "/api/buy/small_blessing";
    const challenge = await SELF.fetch(`https://scvd.store${path}`);
    expect(challenge.status).toBe(402);
    const accepted = (await decodePaymentRequired(challenge)).accepts[0]!;

    // Both attempts: the lane retries once, so one failure is invisible.
    state.verifyNetworkFailures = 2;
    const refused = await SELF.fetch(`https://scvd.store${path}`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });

    expect(refused.status).toBe(402);
    // The retry actually happened — this is the short-leash contract.
    expect(state.verifyCalls).toBe(2);
    // A no with a timestamp is a yes deferred; the store sells that
    // advice on its own shelf.
    expect(refused.headers.get("Retry-After")).toBe("2");

    const body = (await refused.json()) as Record<string, unknown>;
    const declined = body["payment_declined"];
    expect(isRecord(declined)).toBe(true);
    if (!isRecord(declined)) return;
    // A dead connection books its class, not a shrug: this is the row
    // that used to read "verify_error" and leave the keeper guessing.
    expect(declined["reason"]).toBe("verify_error:transport");
    expect(declined["fault"]).toBe("upstream");
    expect(String(declined["note"])).toContain("NEVER JUDGED");
    const retry = declined["retry"];
    expect(isRecord(retry)).toBe(true);
    if (!isRecord(retry)) return;
    expect(retry["resend_identical_payload"]).toBe(true);
    // The window comes off the payload they actually signed.
    expect(retry["payload_valid_until"]).toBe(99999999999);

    // The accusation that must not ship: a signing guide, on a
    // response where the signature was never looked at.
    expect(body).not.toHaveProperty("hand_rolling");
  });

  it("keeps the signing guide for a refusal that WAS a judgement", async () => {
    const state = installFacilitatorMock();
    const path = "/api/buy/small_blessing";
    const challenge = await SELF.fetch(`https://scvd.store${path}`);
    const accepted = (await decodePaymentRequired(challenge)).accepts[0]!;

    state.verifyShouldFail = true; // an ANSWER of no, not a dead call
    const refused = await SELF.fetch(`https://scvd.store${path}`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });

    expect(refused.status).toBe(402);
    // Nothing transient about a verdict: no retry, no Retry-After.
    expect(refused.headers.get("Retry-After")).toBeNull();
    const body = (await refused.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("hand_rolling");
    const declined = body["payment_declined"];
    expect(isRecord(declined)).toBe(true);
    if (!isRecord(declined)) return;
    expect(declined).not.toHaveProperty("retry");
    expect(String(declined["note"])).toContain("was not accepted");
  });
});

/**
 * THE MCP DOOR, which is the one an agent reads as JSON with nobody
 * watching. It carried "The signed payment was not accepted" too. A
 * fix that looks shared and isn't is worse than no fix, because it is
 * believed — so both doors are pinned here, in one file.
 */
describe("the MCP door says the same thing in the same words", () => {
  const call = async (payment?: unknown): Promise<Record<string, unknown>> => {
    const response = await SELF.fetch("https://scvd.store/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "buy_signed_record",
          arguments: { item_id: "hello" },
          ...(payment ? { _meta: { "x402/payment": payment } } : {}),
        },
      }),
    });
    return (await response.json()) as Record<string, unknown>;
  };

  const declinedFrom = (
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined => {
    const error = body["error"] as Record<string, unknown> | undefined;
    const data = (error?.["data"] ?? {}) as Record<string, unknown>;
    const declined = data["payment_declined"];
    return isRecord(declined) ? declined : undefined;
  };

  it("tells an agent the payload was never judged, and to resend it", async () => {
    const state = installFacilitatorMock();

    // The store delivers the terms first; echo its own accepts entry
    // back rather than rebuilding one, which is the store's own rule.
    const quoted = await call();
    const data = ((quoted["error"] as Record<string, unknown> | undefined)?.[
      "data"
    ] ?? {}) as Record<string, unknown>;
    const required = (data["x402/payment-required"] ?? {}) as Record<
      string,
      unknown
    >;
    const accepts = (required["accepts"] ?? []) as Record<string, unknown>[];
    const accepted = accepts[0];
    expect(accepted, JSON.stringify(data).slice(0, 300)).toBeDefined();
    if (!accepted) return;

    state.verifyNetworkFailures = 2;
    const refused = await call({
      x402Version: 2,
      accepted,
      payload: {
        signature: `0x${"cd".repeat(65)}`,
        authorization: {
          from: TEST_PAYER,
          to: accepted["payTo"],
          value: accepted["amount"],
          validAfter: "0",
          validBefore: "99999999999",
          nonce: `0x${"77".repeat(32)}`,
        },
      },
    });

    const declined = declinedFrom(refused);
    expect(declined, JSON.stringify(refused).slice(0, 500)).toBeDefined();
    if (!declined) return;
    expect(String(declined["reason"])).toMatch(/^verify_error/);
    expect(declined["fault"]).toBe("upstream");
    expect(String(declined["note"])).toContain("NEVER JUDGED");
    const retry = declined["retry"];
    expect(isRecord(retry)).toBe(true);
    if (!isRecord(retry)) return;
    expect(retry["resend_identical_payload"]).toBe(true);
    expect(retry["payload_valid_until"]).toBe(99999999999);
  });
});
