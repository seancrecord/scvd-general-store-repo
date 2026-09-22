import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KvWarmFacilitatorClient,
  SETTLE_TIMEOUT_MS,
  SUPPORTED_TIMEOUT_MS,
  VERIFY_TIMEOUT_MS,
  isTransientSettleFailure,
} from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * A SETTLE TIMEOUT JOINS THE TRANSPORT-DEAD DOCTRINE (the keeper's
 * latency prompt, 2026-08-27; the gap found while auditing it).
 *
 * The store's settle doctrine — one retry, then the ambiguous-settle
 * rescue that asks the chain — keys on the TRANSPORT-FAILED string
 * ("Facilitator settle failed (5xx)"). But a facilitator that HANGS
 * instead of erroring produced a different object entirely: the
 * library's FacilitatorTimeoutError extends FacilitatorResponseError,
 * and processSettlement RETHROWS that class instead of folding it into
 * the success:false decline shape. So a 502 got the full doctrine —
 * retry, rescue, decline with `payment_declined` — while a timeout
 * skipped all three and surfaced as a bare 500. Same ambiguity (the
 * money may have moved), opposite handling, and the verify-short-leash
 * comment claimed the rescue could see it when it could not.
 *
 * The fix is one conversion at the client seam: a settle timeout is
 * rethrown as a PLAIN error carrying the transient shape, so the
 * library's own generic catch builds the decline response, the retry
 * fires once (safe: an EIP-3009 nonce settles at most once on-chain),
 * and the rescue gets its look at the chain. Money still fails closed
 * — this can only turn a hang into a verdict, never into goods.
 */
describe("a settle timeout becomes the decline shape, never a bare throw", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * A hang that honors the abort signal, because real fetch does: the
   * library's deadline works by AbortSignal, so a stub that ignores
   * the signal would hang the TEST past the very timeout under test.
   */
  function hangingFetch(): { fn: typeof fetch; calls: () => number } {
    let n = 0;
    const fn = ((_input: RequestInfo | URL, init?: RequestInit) => {
      n += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(
            Object.assign(new Error("The operation was aborted"), {
              name: "AbortError",
            }),
          ),
        );
      });
    }) as unknown as typeof fetch;
    return { fn, calls: () => n };
  }

  const PAYLOAD = { x402Version: 2 } as Parameters<
    KvWarmFacilitatorClient["settle"]
  >[0];
  const REQUIREMENTS = {
    scheme: "exact",
    network: "eip155:8453",
  } as unknown as Parameters<KvWarmFacilitatorClient["settle"]>[1];

  it("rethrows the timeout as the transient shape the retry and rescue key on", async () => {
    const hang = hangingFetch();
    vi.stubGlobal("fetch", hang.fn);
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example", timeoutMs: 120 },
      testEnv.COUNTERS,
    );
    let thrown: unknown;
    try {
      await client.settle(PAYLOAD, REQUIREMENTS);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error & { operation?: unknown; timeoutMs?: unknown };
    // The message is the shape processSettlementWithRetry retries and
    // rescueAmbiguousSettle inspects — derived through the real
    // matcher, not retyped here (rule 46).
    expect(isTransientSettleFailure(error.message)).toBe(true);
    /*
     * And the CLASS must be plain. The library rethrows its own
     * FacilitatorResponseError subclasses out of processSettlement,
     * which is exactly the path that bypassed the doctrine; the class
     * itself is not exported, so the discriminators are the two fields
     * only the timeout error carries. If either survives, the decline
     * shape never forms.
     */
    expect(error.operation).toBeUndefined();
    expect(error.timeoutMs).toBeUndefined();
    expect(error.name).toBe("Error");
    // The original diagnosis stays legible inside the message.
    expect(error.message).toMatch(/timed out/i);
    /*
     * And exactly ONE wire attempt. Settle's retry discipline lives in
     * processSettlementWithRetry where the ambiguous-settle rescue can
     * see it — the client override converts the failure's class and
     * nothing else. A retry hidden down here would double the wait and
     * dodge the rescue.
     */
    expect(hang.calls()).toBe(1);
  });

  it("a settle the facilitator ANSWERED is never reshaped", async () => {
    // A verdict — even a hostile one — is not a transport death. The
    // override may only touch the timeout; everything else passes
    // through byte-identical so the no-second-guessing rule holds.
    vi.stubGlobal(
      "fetch",
      (async () =>
        Response.json({
          success: false,
          errorReason: "insufficient_funds",
          transaction: "",
          network: "eip155:8453",
          payer: "0x2222222222222222222222222222222222222222",
        })) as unknown as typeof fetch,
    );
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example", timeoutMs: 5_000 },
      testEnv.COUNTERS,
    );
    const settled = await client.settle(PAYLOAD, REQUIREMENTS);
    expect(settled.success).toBe(false);
    expect(settled.errorReason).toBe("insufficient_funds");
    expect(isTransientSettleFailure(settled.errorReason)).toBe(false);
  });

  it("the transient matcher takes both transport deaths and no verdicts", () => {
    // The live 502 string, byte-shaped as @x402/core produces it.
    expect(
      isTransientSettleFailure("Facilitator settle failed (502): error code: 502"),
    ).toBe(true);
    // A verdict is never transient, and absence is not evidence.
    expect(isTransientSettleFailure("insufficient_funds")).toBe(false);
    expect(isTransientSettleFailure("nonce_already_used")).toBe(false);
    expect(isTransientSettleFailure(undefined)).toBe(false);
  });
});

/**
 * THE SETTLE DEADLINE IS OURS TO NAME (found reviewing the @x402/core
 * 2.25.0 → 2.26.0 bump, which moved the library's DEFAULT_TIMEOUT_MS
 * from 30s to 90s in one line).
 *
 * Settle was the only facilitator lane with no deadline of its own:
 * verify and getSupported each construct their own client, and settle
 * inherited whatever the library shipped, because @coinbase/x402's
 * createFacilitatorConfig carries no timeoutMs. Every test above hands
 * the client an explicit timeoutMs, so a library bump could triple the
 * hang a real buyer waits through — 90s, then the retry's 90s, before
 * the ambiguous-settle rescue asks the chain — and CI would stay
 * green. These two pin the production shape instead: the deadline the
 * store chose when the caller names none, and the caller's own when it
 * does.
 */
describe("the settle lane's deadline", () => {
  /**
   * The number actually armed on the wire: @x402/core's HTTP client
   * resolves `config.timeoutMs ?? DEFAULT_TIMEOUT_MS` once in its
   * constructor and stores it, then builds every request's
   * AbortSignal.timeout from that field. Reading it is reading what a
   * real settle would wait. (The first test in this file already
   * proves the field reaches the wire: it hangs on a 120ms client and
   * gets the abort.) Not on the published type, hence the cast.
   */
  const armed = (client: KvWarmFacilitatorClient): unknown =>
    (client as unknown as { timeoutMs?: unknown }).timeoutMs;

  it("is the store's own number when the caller names none", () => {
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
    );
    // Production's shape: createFacilitatorConfig carries no timeoutMs,
    // so this is the branch every real settle takes. Before
    // SETTLE_TIMEOUT_MS existed it read the library's default, and
    // 2.26.0 moved that from 30_000 to 90_000 without a word here.
    expect(armed(client)).toBe(SETTLE_TIMEOUT_MS);
    expect(SETTLE_TIMEOUT_MS).toBe(30_000);
  });

  it("is the caller's when the caller names one", () => {
    // The short leashes the tests above rely on must still win, or the
    // store's default would quietly lengthen every one of them.
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example", timeoutMs: 120 },
      testEnv.COUNTERS,
    );
    expect(armed(client)).toBe(120);
  });

  it("does not disturb the verify and supported lanes", () => {
    /*
     * Same config object feeds all three clients, so a mistake in the
     * settle lane's merge is most likely to show up as one of the
     * short leashes inheriting 30s. Read them off the lanes the class
     * built rather than trusting the constructor's shape.
     */
    const client = new KvWarmFacilitatorClient(
      { url: "https://facilitator.example" },
      testEnv.COUNTERS,
    );
    const lanes = client as unknown as {
      verifyLane: { timeoutMs?: unknown };
      supportedLane: { timeoutMs?: unknown };
    };
    expect(lanes.verifyLane.timeoutMs).toBe(VERIFY_TIMEOUT_MS);
    expect(lanes.supportedLane.timeoutMs).toBe(SUPPORTED_TIMEOUT_MS);
  });
});
