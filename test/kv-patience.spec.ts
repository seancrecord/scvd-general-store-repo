import { describe, expect, it } from "vitest";
import {
  PATIENT_KV_POLICY,
  REQUEST_KV_POLICY,
  currentKvPolicy,
  kvGet,
  withKvRetry,
  withPatientKv,
} from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * TWO BUDGETS, ONE POLICY (2026-09-02, the keeper's ruling). A request
 * path keeps three tries; a cron tick gets five, because nobody is
 * waiting on a walk. The choice rides the caller's async context, so
 * a walk three promises deep still knows it is a walk.
 */

function failingThen(succeedOn: number): { get: () => Promise<string>; calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    get: async () => {
      state.calls += 1;
      if (state.calls < succeedOn) throw new Error("KV GET failed: 500 Internal Server Error");
      return "ok";
    },
  };
}

describe("the retry budget follows the caller", () => {
  it("is the request budget by default, and the patient one inside withPatientKv", async () => {
    expect(currentKvPolicy()).toBe(REQUEST_KV_POLICY);
    await withPatientKv(async () => {
      expect(currentKvPolicy()).toBe(PATIENT_KV_POLICY);
      await Promise.resolve();
      expect(currentKvPolicy(), "the choice survives an await").toBe(PATIENT_KV_POLICY);
    });
    expect(currentKvPolicy()).toBe(REQUEST_KV_POLICY);
  });

  it("a blip that outlasts three tries still fails a request path", async () => {
    const door = failingThen(4);
    await expect(withKvRetry(door.get)).rejects.toThrow("500");
    expect(door.calls).toBe(3);
  });

  it("the same blip is absorbed under the patient budget, through the shared helpers", async () => {
    const door = failingThen(4);
    const namespace = { get: door.get } as unknown as Env["ORDERS"];
    const value = await withPatientKv(() => kvGet(namespace, "any"));
    expect(value).toBe("ok");
    expect(door.calls).toBe(4);
  }, 20_000);

  it("a failure that survives even the patient budget still throws", async () => {
    const door = failingThen(99);
    await expect(withPatientKv(() => withKvRetry(door.get))).rejects.toThrow("500");
    expect(door.calls).toBe(PATIENT_KV_POLICY.retries);
  }, 20_000);
});
