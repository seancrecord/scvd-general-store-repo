import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readReason } from "@/lib/declines";
import {
  blockingProblems,
  describeExactEvmPayload,
  describeMismatch,
  looksLikeAnException,
  mismatchReasonCode,
} from "@/lib/requirement-match";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { decodePaymentRequired } from "./helpers/payment";
import { TEST_PAYER } from "./helpers/facilitator-mock";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE REFUSAL THAT NEVER REACHED A HOOK.
 *
 * CV signed three authorizations with the domain copied out of our own
 * 402 and all three booked `unspecified:reason_not_captured` — the
 * label whose reading said "if it recurs, the hook is not firing." It
 * could not fire: the SDK refuses in three places and only verifyPayment
 * has hooks on it. A requirement mismatch exits two steps earlier, with
 * its reason sitting in the 402 body we were throwing away.
 */
describe("a refusal before the facilitator", () => {
  /** A payload whose `accepted` is rebuilt rather than echoed. */
  function rebuiltSignature(accepted: Record<string, unknown>): string {
    return btoa(
      JSON.stringify({
        x402Version: 2,
        // Only the fields a hand-rolled client tends to think matter.
        accepted: {
          scheme: accepted.scheme,
          network: accepted.network,
          amount: accepted.amount,
          asset: accepted.asset,
          payTo: accepted.payTo,
          maxTimeoutSeconds: accepted.maxTimeoutSeconds,
        },
        payload: {
          signature: `0x${"cd".repeat(65)}`,
          authorization: {
            from: TEST_PAYER,
            to: accepted.payTo,
            value: accepted.amount,
            validAfter: "0",
            validBefore: "99999999999",
            nonce: `0x${"11".repeat(32)}`,
          },
        },
      }),
    );
  }

  it("names the fields instead of booking 'reason not captured'", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/hello");
    const accepted = decodePaymentRequired(first).accepts[0] as unknown as Record<
      string,
      unknown
    >;

    const declined = await SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: { "PAYMENT-SIGNATURE": rebuiltSignature(accepted) },
    });
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, unknown>;
    const stated = body.payment_declined as Record<string, unknown>;

    expect(stated).toBeTruthy();
    // The old behaviour: "unspecified:reason_not_captured" and nothing else.
    expect(String(stated.reason)).toContain("local:requirement_mismatch");
    // The SDK's own words are kept verbatim beside our reading.
    expect(String(stated.message)).toContain("No matching payment requirements");
    // And the actual diagnosis: which fields disagreed.
    const mismatch = stated.requirement_mismatch as Record<string, unknown>;
    expect(Array.isArray(mismatch.mismatches)).toBe(true);
    expect((mismatch.mismatches as unknown[]).length).toBeGreaterThan(0);
  });

  it("answers a payload with no `accepted` in words, not in a stack trace", async () => {
    // CV's second retry, 2026-07-29. The SDK's matcher destructures
    // `accepted`, so an absent one throws a TypeError, the SDK catches
    // it into the challenge, and we slugged the trace into a reason
    // code that read as our crash:
    //   local:cannot_destructure_property_extra_of_accepted_as_it_is_undef
    const signature = btoa(
      JSON.stringify({
        x402Version: 2,
        payload: {
          signature: `0x${"cd".repeat(65)}`,
          authorization: {
            from: TEST_PAYER,
            to: "0x1111111111111111111111111111111111111111",
            value: "500000",
            validAfter: "0",
            validBefore: "99999999999",
            nonce: `0x${"22".repeat(32)}`,
          },
        },
      }),
    );
    const declined = await SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: { "PAYMENT-SIGNATURE": signature },
    });
    const body = (await declined.json()) as Record<string, unknown>;
    const stated = body.payment_declined as Record<string, unknown>;

    expect(stated.reason).toBe("local:payload_missing_accepted");
    // Never again: no exception text slugged into a reason code.
    expect(String(stated.reason)).not.toContain("destructure");
    expect(String(stated.reason)).not.toContain("undefined");
    // And it says what DID arrive, which is what makes it actionable.
    expect(String(stated.message)).toContain("x402Version");
    expect(String(stated.message)).toContain("payload");
    expect(readReason("local:payload_missing_accepted").fault).toBe("buyer");
  });

  it("gives an exception one stable code instead of an unbounded family", () => {
    // A slug built from a TypeError is a truncated stack trace wearing
    // a reason code's clothes, and every variant becomes its own row in
    // the books.
    expect(
      looksLikeAnException(
        "Cannot destructure property 'extra' of 'accepted' as it is undefined.",
      ),
    ).toBe(true);
    expect(looksLikeAnException("No matching payment requirements")).toBe(false);
    expect(readReason("local:sdk_threw").reading).toContain("is not one");
  });

  it("names the inner-payload field when the facilitator's answer is truncated", async () => {
    // CV's third round, 2026-07-29. Envelope right, requirement
    // matched, and CDP answered "'paymentPayload' is invalid: must
    // match one of [x402V2Pay..." — cut off at 200 characters by the
    // SDK, with no way to ask for the rest. So we read the shape.
    const offered = {
      scheme: "exact",
      network: "eip155:8453",
      amount: "500000",
      asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 300,
    };
    const problems = describeExactEvmPayload(offered, {
      signature: `0x${"cd".repeat(65)}`,
      authorization: {
        from: TEST_PAYER,
        to: offered.payTo,
        // The classic: JSON.stringify of a JavaScript number.
        value: 500000,
        validAfter: 0,
        validBefore: "99999999999",
        nonce: `0x${"11".repeat(32)}`,
      },
    });
    const fields = problems.map((problem) => problem.field);
    expect(fields).toContain("payload.authorization.value");
    expect(fields).toContain("payload.authorization.validAfter");
    // The type is shown, or "5000 is not 5000" reads as nonsense.
    expect(problems[0]?.saw).toContain("number");
  });

  it("catches an authorization that would pay the wrong address", () => {
    const offered = {
      scheme: "exact",
      network: "eip155:8453",
      amount: "500000",
      payTo: "0x1111111111111111111111111111111111111111",
    };
    const problems = describeExactEvmPayload(offered, {
      signature: `0x${"cd".repeat(65)}`,
      authorization: {
        from: TEST_PAYER,
        to: "0x2222222222222222222222222222222222222222",
        value: "500000",
        validAfter: "0",
        validBefore: "99999999999",
        nonce: `0x${"11".repeat(32)}`,
      },
    });
    // Passes every schema and still loses the money. Worth catching here.
    expect(problems.map((problem) => problem.field)).toContain(
      "payload.authorization.to",
    );
  });

  it("says nothing at all about a correct payload", () => {
    expect(
      describeExactEvmPayload(
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "500000",
          payTo: "0x1111111111111111111111111111111111111111",
        },
        {
          signature: `0x${"cd".repeat(65)}`,
          authorization: {
            from: TEST_PAYER,
            to: "0x1111111111111111111111111111111111111111",
            value: "500000",
            validAfter: "0",
            validBefore: "99999999999",
            nonce: `0x${"11".repeat(32)}`,
          },
        },
      ),
    ).toEqual([]);
  });

  it("appends our reading to an opaque verdict and never replaces it", () => {
    // House discipline: the facilitator's string is the fact. A reading
    // that overwrites the fact is how a guess becomes a fact.
    const reading = readReason("verify_error+payload:payload.authorization.value");
    expect(reading.reading).toContain("OUR reading");
    expect(reading.reading).toContain("payload.authorization.value");
  });

  it("refuses a number-typed authorization locally, before the facilitator round trip", async () => {
    // CV's point, and the reason this layer is infrastructure rather
    // than polish: CDP's answer to this is a truncated union-type error
    // naming no field. Caught here, it costs nothing and names one.
    const first = await SELF.fetch("https://scvd.store/api/buy/hello");
    const accepted = decodePaymentRequired(first).accepts[0] as unknown as Record<
      string,
      unknown
    >;
    const signature = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted,
        payload: {
          signature: `0x${"cd".repeat(65)}`,
          authorization: {
            from: TEST_PAYER,
            to: accepted.payTo,
            value: accepted.amount,
            validAfter: 0,
            validBefore: 99999999999,
            nonce: `0x${"33".repeat(32)}`,
          },
        },
      }),
    );
    const declined = await SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: { "PAYMENT-SIGNATURE": signature },
    });
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, unknown>;
    const stated = body.payment_declined as Record<string, unknown>;
    expect(String(stated.reason)).toBe(
      "local:preflight:payload.authorization.validAfter",
    );
    expect(String(body.error)).toContain("facilitator was never called");
    expect(String(stated.note)).toContain("before spending the round trip");
  });

  it("never refuses a smart-account signature, which only looks wrong from here", () => {
    // ERC-1271 signatures are not 65 bytes. A store that refuses one
    // because most signatures are has turned a diagnostic into a wall,
    // and it would refuse a payment the facilitator would have taken.
    const problems = describeExactEvmPayload(
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "500000",
        payTo: "0x1111111111111111111111111111111111111111",
      },
      {
        signature: `0x${"ab".repeat(200)}`,
        authorization: {
          from: TEST_PAYER,
          to: "0x1111111111111111111111111111111111111111",
          value: "500000",
          validAfter: "0",
          validBefore: "99999999999",
          nonce: `0x${"11".repeat(32)}`,
        },
      },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.field).toBe("payload.signature");
    expect(problems[0]?.blocking, "we refused a smart account").toBe(false);
    expect(blockingProblems(problems)).toEqual([]);
  });

  it("stays silent when the echo is correct, so it can never invent a mismatch", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/hello");
    const challenge = decodePaymentRequired(first);
    const accepts = challenge.accepts as unknown as Record<string, unknown>[];
    // The verbatim echo, which is what a correct client sends.
    expect(describeMismatch(accepts, accepts[0])).toBeUndefined();
  });

  it("reproduces the SDK's comparison: key set exact, types exact, order free", () => {
    const offered = [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "5000",
        maxTimeoutSeconds: 60,
        extra: { name: "USD Coin", version: "2" },
      },
    ];
    // Reordered keys are fine.
    expect(
      describeMismatch(offered, {
        network: "eip155:8453",
        amount: "5000",
        scheme: "exact",
        maxTimeoutSeconds: 60,
        extra: { version: "2", name: "USD Coin" },
      }),
    ).toBeUndefined();

    // A number where we published a string is NOT fine, and the report
    // has to make that visible rather than printing 5000 twice.
    const typed = describeMismatch(offered, {
      scheme: "exact",
      network: "eip155:8453",
      amount: 5000,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    });
    expect(typed?.mismatches[0]?.field).toBe("amount");
    expect(JSON.stringify(typed?.mismatches[0]?.you_sent)).toContain("number");

    // A missing field fails, and says so in words.
    const missing = describeMismatch(offered, {
      scheme: "exact",
      network: "eip155:8453",
      amount: "5000",
      extra: { name: "USD Coin", version: "2" },
    });
    expect(missing?.mismatches[0]?.field).toBe("maxTimeoutSeconds");
    expect(missing?.mismatches[0]?.you_sent).toBe("(field not present)");

    // `extra` is subset-checked, not deep-equal: yours may carry more.
    expect(
      describeMismatch(offered, {
        scheme: "exact",
        network: "eip155:8453",
        amount: "5000",
        maxTimeoutSeconds: 60,
        extra: { name: "USD Coin", version: "2", mine: "kept" },
      }),
    ).toBeUndefined();
  });

  it("puts the disagreeing field in the reason, because the field is the diagnosis", () => {
    const report = describeMismatch(
      [{ scheme: "exact", network: "eip155:8453" }],
      { scheme: "exact", network: "eip155:84532" },
    );
    expect(mismatchReasonCode(report as never)).toBe(
      "local:requirement_mismatch:network",
    );
  });

  it("reads a resource mismatch as OURS, since we are the ones who move the URL", () => {
    expect(readReason("local:requirement_mismatch:resource").fault).toBe("ours");
    expect(readReason("local:requirement_mismatch:amount").fault).toBe("buyer");
    // And the old label's reading now explains itself instead of
    // pointing at a hook that was never able to fire.
    expect(readReason("unspecified:reason_not_captured").reading).toContain(
      "three places",
    );
  });
});

describe("the second rail's envelope is not the first rail's (2026-08-04)", () => {
  /**
   * Eight consecutive Solana payments refused pre-verify were all
   * relabeled "payload_missing_authorization" by our own diagnosis —
   * an SVM payload correctly carries a signed TRANSACTION, and the
   * shape check demanded EIP-3009 unconditionally, overwriting the
   * SDK's true refusal with a wrong one. These pin the repaired
   * reading for both rails.
   */
  it("accepts a correctly-shaped Solana payload, so the true refusal can surface", async () => {
    const { describePayloadShape } = await import("@/lib/requirement-match");
    expect(
      describePayloadShape({
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          amount: "5000",
        },
        payload: { transaction: "AZxTb64…signed-solana-tx…==" },
      }),
    ).toBeUndefined();
  });

  it("names the Solana shape in Solana words when the transaction is missing", async () => {
    const { describePayloadShape } = await import("@/lib/requirement-match");
    const problem = describePayloadShape({
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      },
      payload: { signature: "0xcd" },
    });
    expect(problem?.code).toBe("local:payload_missing_transaction");
    expect(problem?.says).toContain("no EIP-3009 authorization on Solana");
  });

  it("still demands the authorization object on the EVM rail", async () => {
    const { describePayloadShape } = await import("@/lib/requirement-match");
    const problem = describePayloadShape({
      x402Version: 2,
      accepted: { scheme: "exact", network: "eip155:8453" },
      payload: { transaction: "not-how-evm-works" },
    });
    expect(problem?.code).toBe("local:payload_missing_authorization");
  });

  it("keeps the EVM deep-diagnosis off Solana payloads", async () => {
    // describeExactEvmPayload already gates on eip155:*; pinned so the
    // gate survives refactors — EVM field rules applied to a Solana
    // transaction would manufacture nonsense problems.
    expect(
      describeExactEvmPayload(
        { scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
        { transaction: "AZxTb64==" },
      ),
    ).toEqual([]);
  });
});
