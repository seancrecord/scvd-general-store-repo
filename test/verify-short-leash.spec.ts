import { env } from "cloudflare:test";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KvWarmFacilitatorClient } from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE VERIFY SHORT-LEASH (#49) — the receipt is three confirmed lost
 * settles on spot_check in one four-minute window (2026-08-27, 00:53
 * to 00:57 UTC): the buyer's payload was clean, our preflight found
 * nothing wrong, and each attempt died because the verify STEP itself
 * errored. Verify is a read-only question — no money moves on it —
 * so it is the one facilitator call that is unconditionally safe to
 * retry and unconditionally safe to abandon.
 *
 * The leash has two teeth, mirroring the settle doctrine established
 * on 2026-08-07 (SETTLE_RETRY_DELAY_MS in payments.ts):
 *
 *   1. A short deadline. The library's default gives verify the same
 *      30 seconds settle gets, but a verify that has not answered in
 *      10 is not going to, and the buyer is standing at a 402 door.
 *   2. One fast retry — on TRANSPORT-shaped failures only. A
 *      facilitator that ANSWERED with a verdict (VerifyError carries
 *      the HTTP statusCode) was not a blip and is never second-guessed,
 *      exactly as settle never second-guesses success:false.
 *
 * SETTLE IS DELIBERATELY NOT TOUCHED. A verify timeout means "ask
 * again"; a settle timeout means "the money may have moved" — those
 * are different risk classes and the last test pins the difference
 * into the prototype chain itself.
 */

const FACILITATOR = "https://facilitator.test";

type VerifyArgs = Parameters<HTTPFacilitatorClient["verify"]>;

const PAYLOAD = { x402Version: 2 } as unknown as VerifyArgs[0];
const REQUIREMENTS = {} as unknown as VerifyArgs[1];

function leashed(verifyTimeoutMs?: number): KvWarmFacilitatorClient {
  return new KvWarmFacilitatorClient(
    { url: FACILITATOR },
    testEnv.COUNTERS,
    verifyTimeoutMs,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the verify short-leash", () => {
  it("retries once past a transport blip and the sale survives", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      expect(url).toBe(`${FACILITATOR}/verify`);
      calls += 1;
      if (calls === 1) {
        // Byte-for-byte the live outage shape: Cloudflare's canned
        // plain-text body, no JSON, no verdict anywhere in it.
        return new Response("error code: 502", { status: 502 });
      }
      return Response.json({ isValid: true, payer: "0xabc" });
    });
    const result = await leashed().verify(PAYLOAD, REQUIREMENTS);
    expect(result.isValid).toBe(true);
    expect(calls).toBe(2);
  });

  it("never second-guesses a delivered verdict, even over a non-2xx", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      // The facilitator ANSWERED: an isValid body over a 402. The
      // library throws VerifyError for this shape; it is a verdict
      // wearing an error status, not an outage, and retrying it would
      // just ask the same question twice.
      return Response.json(
        { isValid: false, invalidReason: "insufficient_funds" },
        { status: 402 },
      );
    });
    await expect(leashed().verify(PAYLOAD, REQUIREMENTS)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("does not retry a clean 200 'no' — a verdict is a verdict", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return Response.json({ isValid: false, invalidReason: "insufficient_funds" });
    });
    const result = await leashed().verify(PAYLOAD, REQUIREMENTS);
    expect(result.isValid).toBe(false);
    expect(calls).toBe(1);
  });

  it("cuts a hanging verify at the leash, both attempts, well under 30s", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        // Hangs forever unless the caller's deadline aborts it — the
        // honest model of the 00:53 window. The library's signal MUST
        // reach fetch for the leash to bite; this promise proves it.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        });
      },
    );
    const started = Date.now();
    await expect(leashed(200).verify(PAYLOAD, REQUIREMENTS)).rejects.toThrow(
      /timed out|timeout|abort/i,
    );
    expect(calls).toBe(2);
    // Two 200ms leashes plus the pause — nowhere near the 30s default.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("the declines desk can read a bare verify_error now", async () => {
    const { readReason } = await import("@/lib/declines");
    const { reading, fault } = readReason("verify_error");
    // Before #49 this reason fell through to the unwritten-reading
    // fallback — the desk showing the keeper the one string the
    // incident kept producing, with no line explaining it.
    expect(reading).not.toContain("No reading written");
    expect(fault).toBe("unknown");
    expect(reading).toMatch(/never judged/i);
    expect(reading).toMatch(/retry|leash/i);
    // The +payload variant keeps its own, sharper reading: there OUR
    // shape-read named a concrete field, and the fault points at it.
    expect(readReason("verify_error+payload:authorization.nonce").reading).toMatch(
      /our reading of the payload/i,
    );
  });

  it("leaves settle alone: money in motion keeps the full deadline, no retry here", () => {
    // The leash exists because verify is safe to abandon; settle is
    // not (a timeout there is indeterminate — the transfer may have
    // broadcast). The subclass must not override settle: its retry
    // discipline lives in processSettlementWithRetry, where the
    // ambiguous-outcome rescue can see it.
    expect(KvWarmFacilitatorClient.prototype.settle).toBe(
      HTTPFacilitatorClient.prototype.settle,
    );
  });
});
