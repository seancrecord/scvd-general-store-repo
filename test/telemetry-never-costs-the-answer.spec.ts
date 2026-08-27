import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { app } from "@/index";
import { recordChallengeIssued } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * TELEMETRY NEVER COSTS A VISITOR THE ANSWER (incident 2026-08-27).
 *
 * Five worker_health pages in one night, four different doors —
 * recurring_patronage at 01:25, then service_audit, certificate_of_
 * patronage and hello between 09:26 and 09:30 — every one "500 on
 * GET /api/buy/…: KV PUT failed: 429 Too Many Requests."
 *
 * Those are plain GETs. Nobody paid; they were asking the price. The
 * throw was recordChallengeIssued: four read-then-write bumps on
 * shared monthly counter keys, awaited at the gate with no catch, and
 * Cloudflare KV allows ONE write per second per key. Any burst — a
 * crawler sweep, an agent retrying — trips the limit, and the visitor
 * gets a 500 where the 402 challenge belongs. The uptime monitors
 * polling these doors (x402-list, and soon UptimeRobot) read that as
 * a broken shop.
 *
 * The rule this file pins: the 402 is the product; the counter is
 * bookkeeping. A lost count is a smaller lie than a closed door.
 */

function countersWhosePutsFail(times: number): {
  env: Env;
  putAttempts: () => number;
} {
  let attempts = 0;
  const real = testEnv.COUNTERS;
  const counters = {
    ...real,
    get: real.get.bind(real),
    list: real.list.bind(real),
    delete: real.delete.bind(real),
    put: async (...args: Parameters<typeof real.put>) => {
      attempts += 1;
      if (attempts <= times) {
        throw new Error("KV PUT failed: 429 Too Many Requests");
      }
      return real.put(...args);
    },
  } as unknown as Env["COUNTERS"];
  return {
    env: { ...testEnv, COUNTERS: counters } as Env,
    putAttempts: () => attempts,
  };
}

beforeAll(() => {
  installFacilitatorMock();
});

const ctx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

describe("the door answers even when the books cannot be written", () => {
  it("a 402 challenge is served while EVERY counter write is failing", async () => {
    const broken = countersWhosePutsFail(Number.POSITIVE_INFINITY);
    const response = await app.fetch(
      new Request("https://scvd.store/api/buy/hello"),
      broken.env,
      ctx,
    );

    /*
     * The night's alarms were this exact request answering 500. The
     * challenge must go out: it is computed from the menu and the
     * rails, not from anything the failed write was keeping.
     */
    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
  });

  it("a transient 429 does not even lose the count", async () => {
    const flaky = countersWhosePutsFail(1);
    await expect(
      recordChallengeIssued(flaky.env, "/api/buy/hello"),
    ).resolves.toBeUndefined();
    // Retried past the blip: more attempts than failures.
    expect(flaky.putAttempts()).toBeGreaterThan(1);
  });

  it("at the metrics layer a persistent failure is still loud", async () => {
    /*
     * The swallow lives at the GATE, where a throw would become a
     * customer-facing 500. The metrics function itself keeps the
     * kv-retry contract — absorb the blip, rethrow what persists — so
     * every OTHER caller (crons, admin walks) still hears about a
     * counter that cannot be written instead of quietly undercounting.
     */
    const broken = countersWhosePutsFail(Number.POSITIVE_INFINITY);
    await expect(
      recordChallengeIssued(broken.env, "/api/buy/hello"),
    ).rejects.toThrow(/429/);
  });
});
