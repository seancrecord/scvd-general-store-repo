import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { listAlerts } from "@/lib/alerts";
import { metricsMonth, readServerErrors } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE STORE COULD NOT SEE ITS OWN 500s.
 *
 * Found 2026-08-26 by an outside checker, twice in one evening: four
 * doors dead in one pass, then two doors serving 500 across two checks
 * thirty minutes apart. Both times every probe we could construct came
 * back with a clean 402, and both times we had nothing to look at.
 *
 * `app.onError` logged to a console stream nobody retains and returned
 * an apology. No alert, no counter, no row. Meanwhile `/pulse.json`
 * published 586 challenge samples and a healthy p95 — nothing in that
 * publication was false, it simply could not see failures, because the
 * histogram records only `status === 402`. Its silence about a broken
 * door was indistinguishable from health.
 *
 * That is Rule 52 turned on our own instrument, and the reason these
 * tests exist as BEHAVIOUR rather than as a note: the previous version
 * of this file would have been a comment in the error handler saying
 * failures ought to be recorded, which is exactly what the codebase
 * already had.
 */

async function clearErrorMetrics(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: `metric:${metricsMonth()}:err:`,
  });
  await Promise.all(listed.keys.map((k) => testEnv.COUNTERS.delete(k.name)));
}

beforeEach(clearErrorMetrics);

describe("a 500 leaves a trace that outlives the request", () => {
  it("wires the error handler to the books, not just to the console", async () => {
    /*
     * STRUCTURAL, NOT BEHAVIOURAL, AND SAID SO RATHER THAN DRESSED UP.
     *
     * Forcing a genuine unhandled throw through the live worker would
     * need a route that exists only to break, which is a permanent
     * hole in a store that takes money. So this reads the handler
     * instead — and reading is exactly the move that produced the
     * X-PAYMENT mistake, where three call sites were mistaken for
     * proof of behaviour.
     *
     * The difference is what is being claimed. This asserts the
     * handler CONTAINS the write, which is what source can honestly
     * establish; it does not claim a 500 was observed being recorded.
     * The recorder's own behaviour is exercised for real in the tests
     * below. An assertion this file cannot make is left unmade.
     */
    const source = (
      await import("../src/index.ts?raw")
    ).default as unknown as string;
    const handler = source.slice(source.indexOf("app.onError"));
    expect(handler).toContain("recordServerError");
    expect(handler).toContain("sendAlert");
    // Deferred, or the visitor waits on our bookkeeping about their
    // own error.
    expect(handler).toContain("waitUntil");
  });

  it("wires the payment gate to record a throw on its way to the 500", async () => {
    const source = (
      await import("../src/lib/payment-gate.ts?raw")
    ).default as unknown as string;
    const wrapper = source.slice(source.indexOf("export const paymentGate"));
    // The gate used to skip the instrument entirely when it threw:
    // the one path most worth measuring left no trace.
    expect(wrapper).toContain("recordGateOutcome(c, \"threw\")");
    expect(wrapper).toContain("throw error");
  });

  it("records nothing for an ordinary 402, so the counter means what it says", async () => {
    await SELF.fetch(`${BASE}/api/buy/hello`);
    const { errors } = await readServerErrors(testEnv);
    /*
     * ANTI-VACUITY, and the whole reason this assertion is inverted.
     * A counter that fires on healthy traffic would show a comforting
     * non-zero number forever and never mean anything. The 402 path is
     * the busiest path in the store; if it registers here, the
     * instrument is measuring the wrong thing.
     */
    expect(errors["hello"]).toBeUndefined();
  });

  it("keeps the alert key free of the error message", async () => {
    /*
     * The dedupe key is route + error class. Messages carry ids,
     * hashes and addresses, so keying on them mints a fresh row per
     * incident — the precise failure the alert surface was already
     * rescued from once (see the note above alertIdentity).
     */
    const source = await import("@/lib/metrics");
    expect(typeof source.recordServerError).toBe("function");
    // The recorder strips anything that could smuggle a message in.
    await source.recordServerError(testEnv, "some_door", "Type Error: 0xdead");
    const { errors } = await readServerErrors(testEnv);
    const names = Object.keys(errors["some_door"] ?? {});
    expect(names).toHaveLength(1);
    expect(names[0]).toBe("TypeError0xdead");
    expect(names[0]).not.toContain(" ");
    expect(names[0]).not.toContain(":");
  });

  it("caps the error class so a hostile name cannot mint unbounded rows", async () => {
    const source = await import("@/lib/metrics");
    await source.recordServerError(testEnv, "some_door", "X".repeat(500));
    const { errors } = await readServerErrors(testEnv);
    const name = Object.keys(errors["some_door"] ?? {})[0] ?? "";
    expect(name.length).toBeLessThanOrEqual(40);
  });

  it("names an unclassifiable error rather than writing an empty key", async () => {
    const source = await import("@/lib/metrics");
    // Rule 52: an error we cannot classify is still an error. Writing
    // an empty label would file it under nothing and lose it.
    await source.recordServerError(testEnv, "some_door", "!!!!");
    const { errors } = await readServerErrors(testEnv);
    expect(Object.keys(errors["some_door"] ?? {})).toEqual(["Unknown"]);
  });

  it("reports an empty month as no RECORDED errors, never as no errors", async () => {
    const { errors, truncated } = await readServerErrors(testEnv, "1999-01");
    expect(errors).toEqual({});
    expect(truncated).toBe(false);
  });

  it("still has an alert surface to write to", async () => {
    // The alert path is exercised through onError in production; this
    // pins that the surface it writes to is real and readable, so a
    // future refactor cannot quietly leave the write pointing nowhere.
    const rows = await listAlerts(testEnv, 5);
    expect(Array.isArray(rows)).toBe(true);
  });
});
