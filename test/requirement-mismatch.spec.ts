import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readReason } from "@/lib/declines";
import { describeMismatch, mismatchReasonCode } from "@/lib/requirement-match";
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
