import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createOrRenewPass, getPass } from "@/services/patronage";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, PatronagePass } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE PASS WRITE SURVIVES A TRANSIENT KV FAILURE (incident 2026-08-27).
 *
 * A live alarm: "500 on GET /api/buy/recurring_patronage: KV PUT
 * failed: 429 Too Many Requests. A visitor was handed an error page
 * here." To reach that write a request must already have SETTLED —
 * fulfillment.ts calls pending.settle() before deliverInstantGoods —
 * so the buyer's money had moved and the response was still an error
 * page. That is the "paid, no goods" class this store exists to
 * detect, arriving at our own counter.
 *
 * The rate limiter does not care whose burst tripped it, so the cure
 * is the one kv-retry.ts already states: absorb the blip, and NEVER
 * paper over a failure that outlives the retries. A soft-fail that
 * returned the pass anyway would be strictly worse than the crash —
 * a 200 closes the delivery intent (payment-gate.ts gates the close
 * on status < 300), so the buyer would walk away holding a pass URL
 * for a pass that was never written, with nothing left to flag it.
 * Loud failure keeps the intent row open and the keeper paged.
 */

/** An env whose PATRONS namespace fails its first `failures` writes. */
function envWithFlakyPut(failures: number): { env: Env; attempts: () => number } {
  let attempts = 0;
  const real = testEnv.PATRONS;
  const patrons = {
    ...real,
    get: real.get.bind(real),
    put: async (key: string, value: string) => {
      attempts += 1;
      if (attempts <= failures) {
        throw new Error("KV PUT failed: 429 Too Many Requests");
      }
      return real.put(key, value);
    },
  } as unknown as Env["PATRONS"];
  return {
    env: { ...testEnv, PATRONS: patrons } as Env,
    attempts: () => attempts,
  };
}

describe("a settled patronage sale survives a transient KV write failure", () => {
  it("a 429 on the first attempt still mints the pass", async () => {
    const flaky = envWithFlakyPut(1);
    const result = await createOrRenewPass(flaky.env, { patronNumber: 41 });

    expect(result.renewed).toBe(false);
    expect(flaky.attempts()).toBeGreaterThan(1);

    /*
     * Written for real, not merely returned. The bug this guards
     * against hands back a pass object whose KV row does not exist,
     * so asserting on the return value alone would pass against the
     * very defect it is meant to catch.
     */
    const stored = await testEnv.PATRONS.get<PatronagePass>(
      KV_KEYS.patronagePass(result.pass.pass_id),
      "json",
    );
    expect(stored?.pass_id).toBe(result.pass.pass_id);
  });

  it("a renewal's write is guarded too, not just a fresh mint", async () => {
    const seeded = await createOrRenewPass(testEnv, { patronNumber: 42 });
    const flaky = envWithFlakyPut(1);
    const renewed = await createOrRenewPass(flaky.env, {
      patronNumber: 42,
      passId: seeded.pass.pass_id,
    });

    expect(renewed.renewed).toBe(true);
    expect(renewed.pass.renewals).toBe(1);
    const stored = await testEnv.PATRONS.get<PatronagePass>(
      KV_KEYS.patronagePass(seeded.pass.pass_id),
      "json",
    );
    expect(stored?.renewals).toBe(1);
  });

  it("THE LINE THIS DOES NOT CROSS: a failure that outlives the retries still throws", async () => {
    const flaky = envWithFlakyPut(Number.POSITIVE_INFINITY);
    await expect(
      createOrRenewPass(flaky.env, { patronNumber: 43 }),
    ).rejects.toThrow(/429/);
  });

  it("the pass read survives a transient failure as well", async () => {
    const seeded = await createOrRenewPass(testEnv, { patronNumber: 44 });
    let reads = 0;
    const real = testEnv.PATRONS;
    const patrons = {
      ...real,
      put: real.put.bind(real),
      get: async (key: string, type?: string) => {
        reads += 1;
        if (reads === 1) throw new Error("KV GET failed: 429 Too Many Requests");
        return (real.get as (k: string, t?: string) => Promise<unknown>)(key, type);
      },
    } as unknown as Env["PATRONS"];

    const found = await getPass({ ...testEnv, PATRONS: patrons } as Env, seeded.pass.pass_id);
    expect(found?.pass_id).toBe(seeded.pass.pass_id);
    expect(reads).toBeGreaterThan(1);
  });
});
