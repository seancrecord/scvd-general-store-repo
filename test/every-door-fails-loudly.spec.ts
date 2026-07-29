import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import type { Env } from "@/types";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * DOES IT WORK, AND DOES IT FAIL LOUDLY, ARE DIFFERENT TESTS.
 *
 * CV's own post-mortem on the MCP gap, 2026-07-29, and it is the
 * sharpest thing anyone said tonight: he proved a payment SUCCEEDS
 * over MCP and reasonably concluded the fix had propagated. It had
 * not. Declines over that door were going completely unrecorded, and
 * no amount of successful-payment testing could have shown it, because
 * the happy path and the failure path are different code.
 *
 * So this file tests the failure path on the doors nobody forced to
 * fail. The paid shelves are not only /api/buy — the almanac, the
 * gazette and the zodiac archive are all priced, all behind the same
 * middleware. "Same middleware" is exactly the kind of confident
 * architectural claim that turned out to be two things wearing one
 * coat last time, so it gets walked rather than asserted.
 */
describe("every paid door books its own declines", () => {
  /** A payload with numbers where the schema demands decimal strings. */
  function malformed(): string {
    return btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: "eip155:8453",
          amount: "10000",
          asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          payTo: "0x1111111111111111111111111111111111111111",
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
        payload: {
          signature: `0x${"cd".repeat(65)}`,
          authorization: {
            from: TEST_PAYER,
            to: "0x1111111111111111111111111111111111111111",
            value: 10000,
            validAfter: 0,
            validBefore: 99999999999,
            nonce: `0x${"66".repeat(32)}`,
          },
        },
      }),
    );
  }

  it("records a decline on the almanac, not only on /api/buy", async () => {
    const before = (await readDeclines(testEnv)).declines.length;
    const response = await SELF.fetch(
      "https://scvd.store/almanac/notes-from-a-tuesday-in-oak-city",
      { headers: { "PAYMENT-SIGNATURE": malformed() } },
    );
    expect(response.status).toBe(402);
    const after = await readDeclines(testEnv);
    expect(
      after.declines.length,
      "a paid door outside /api/buy swallowed a decline",
    ).toBeGreaterThan(before);
    // And the row names which door, or the desk cannot act on it.
    // Paths outside /api/buy become colon-joined item keys, so an
    // almanac page books as `almanac:<slug>` rather than vanishing
    // into a bucket shared with the shelf.
    expect(
      after.declines.some((row) => row.item.startsWith("almanac:")),
      "the decline was booked without naming the door",
    ).toBe(true);
  });

  it("names the field there too, rather than a different answer per door", async () => {
    const response = await SELF.fetch(
      "https://scvd.store/almanac/notes-from-a-tuesday-in-oak-city",
      { headers: { "PAYMENT-SIGNATURE": malformed() } },
    );
    const body = (await response.json()) as Record<string, unknown>;
    const declined = body.payment_declined as Record<string, unknown>;
    // One store, one answer. A buyer who gets a named field on one
    // shelf and a shrug on another has learned the store is unreliable,
    // which is worse than either answer on its own.
    expect(String(declined?.reason ?? "")).toContain("local:preflight:");
  });
});
