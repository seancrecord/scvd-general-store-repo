import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaymentStack, SUPPORTED_KINDS_KV_KEY } from "@/lib/payments";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;

/**
 * NO REQUEST AWAITS ANOTHER REQUEST'S SYNC (2026-11-16).
 *
 * The stack cached `httpServer.initialize()` itself, so the request
 * that built it owned the promise every later paid request awaited.
 * When that request ended first, the runtime dropped the settlement
 * and the next buyer of /open-for-business/2026-W44 got a 500 —
 * "This promise was created by a request that has since ended, so it
 * can never settle" — paged as a settlement_failure.
 *
 * The runtime's cross-request rule cannot be staged inside one test,
 * so this holds the mechanism that makes it impossible: until a sync
 * has finished, each read hands back a promise of its own (never one
 * shared object), and once one has finished nobody syncs again.
 */
afterEach(() => vi.unstubAllGlobals());

describe("the payment stack's facilitator sync", () => {
  it("hands each caller its own sync until one finishes, then none at all", async () => {
    await testEnv.COUNTERS.delete(SUPPORTED_KINDS_KV_KEY);
    // A facilitator that never answers: the first syncs stay pending.
    vi.stubGlobal("fetch", (() => new Promise<Response>(() => {})) as unknown as typeof fetch);
    const stack = getPaymentStack(testEnv);
    const first = stack.initialized;
    const second = getPaymentStack(testEnv).initialized;
    expect(second).not.toBe(first);

    // Now the facilitator answers; this caller's own sync completes.
    installFacilitatorMock();
    await getPaymentStack(testEnv).initialized;

    const sync = vi.spyOn(stack.httpServer, "initialize");
    await getPaymentStack(testEnv).initialized;
    await getPaymentStack(testEnv).initialized;
    expect(sync).not.toHaveBeenCalled();
  });
});
