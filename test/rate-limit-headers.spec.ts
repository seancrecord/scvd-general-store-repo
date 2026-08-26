import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_PROBES_PER_MINUTE,
  PROBES_PER_MINUTE,
  rateLimitHeaders,
} from "@/services/preflight";

const BASE = "https://scvd.store";

/**
 * A CEILING YOU CAN SEE, ON THE ONE PATH THAT HAS ONE.
 *
 * The audit's wording is the whole brief: "REST rate-limit headers
 * documented in OpenAPI spec, but not observed on a live response."
 * Both halves were true. The preflight limiter has been enforced since
 * 2026-08-03 and reported its state to nobody, so a caller building a
 * pipeline learned the budget by reading our prose or by being refused
 * — the least useful moment and the least informative form.
 *
 * The other half of the discipline is older and stays: the store
 * refused to put RateLimit headers on paths with no limiter behind
 * them, because an agent self-throttling against a fiction is worse
 * off than one that never looked. Both halves are asserted here.
 */

/** The store's own hostname is refused before any budget is spent. */
const PROBE_TARGET = "https://example.invalid/pay";

describe("the RateLimit fields, computed from the buckets that exist", () => {
  it("reports the binding bucket in the legacy triplet", () => {
    /*
     * TWO POLICIES, ONE TRIPLET. RateLimit-Limit can only carry one
     * number, so it has to be the one about to refuse the caller —
     * anything else hands them a ceiling that is not the one binding.
     */
    const isolate = { allowed: true, limit: 30, remaining: 4, reset: 12 };
    const global = { allowed: true, limit: 60, remaining: 41, reset: 12 };
    const headers = rateLimitHeaders(isolate, global);
    expect(headers["RateLimit-Limit"]).toBe("30");
    expect(headers["RateLimit-Remaining"]).toBe("4");
    expect(headers["RateLimit-Reset"]).toBe("12");

    // And the other way round: when the global backstop is closer.
    const flipped = rateLimitHeaders(
      { allowed: true, limit: 30, remaining: 22, reset: 9 },
      { allowed: true, limit: 60, remaining: 3, reset: 9 },
    );
    expect(flipped["RateLimit-Limit"]).toBe("60");
    expect(flipped["RateLimit-Remaining"]).toBe("3");
  });

  it("names both policies in the structured fields, so neither is hidden", () => {
    const headers = rateLimitHeaders(
      { allowed: true, limit: 30, remaining: 4, reset: 12 },
      { allowed: true, limit: 60, remaining: 41, reset: 12 },
    );
    expect(headers["RateLimit-Policy"]).toBe(
      '"isolate";q=30;w=60, "global";q=60;w=60',
    );
    expect(headers["RateLimit"]).toBe(
      '"isolate";r=4;t=12, "global";r=41;t=12',
    );
  });

  it("derives the advertised ceilings from the limiter's own constants", () => {
    // Rule 1: a hand-typed ceiling is a ceiling that goes stale the
    // first time somebody raises the real one.
    const headers = rateLimitHeaders(
      { allowed: true, limit: PROBES_PER_MINUTE, remaining: 1, reset: 5 },
      { allowed: true, limit: GLOBAL_PROBES_PER_MINUTE, remaining: 9, reset: 5 },
    );
    expect(headers["RateLimit-Policy"]).toContain(`q=${PROBES_PER_MINUTE}`);
    expect(headers["RateLimit-Policy"]).toContain(
      `q=${GLOBAL_PROBES_PER_MINUTE}`,
    );
  });
});

describe("the metered path says what it has left, on the way through", () => {
  it("carries the fields on a successful probe, not only on the refusal", async () => {
    /*
     * THE FINDING, IN ONE ASSERTION. A client that only learns its
     * budget from the 429 has already been refused; the number is
     * worth having on the answers that worked.
     */
    const response = await SELF.fetch(`${BASE}/api/preflight/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: PROBE_TARGET }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-limit")).toBeTruthy();
    expect(response.headers.get("ratelimit-remaining")).toBeTruthy();
    expect(response.headers.get("ratelimit-reset")).toBeTruthy();
    expect(response.headers.get("ratelimit-policy")).toContain('"isolate"');
    expect(response.headers.get("ratelimit")).toContain('"global"');
  });

  it("counts down as the budget is actually spent", async () => {
    // A "remaining" that never moves is a decoration. Two probes, one
    // after the other, must not report the same figure.
    const first = await SELF.fetch(`${BASE}/api/preflight/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: PROBE_TARGET }),
    });
    const second = await SELF.fetch(`${BASE}/api/preflight/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: PROBE_TARGET }),
    });
    const before = Number(first.headers.get("ratelimit-remaining"));
    const after = Number(second.headers.get("ratelimit-remaining"));
    expect(Number.isFinite(before)).toBe(true);
    expect(after).toBeLessThan(before);
  });

  it("resets within the minute it keys on, never beyond it", async () => {
    const response = await SELF.fetch(`${BASE}/api/preflight/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: PROBE_TARGET }),
    });
    const reset = Number(response.headers.get("ratelimit-reset"));
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThanOrEqual(60);
  });

  it("spends nothing on a request it refused as malformed", async () => {
    /*
     * A 400 arrives before either bucket is touched, so it carries no
     * RateLimit fields — reporting a budget that was not consulted
     * would be a number with nothing behind it.
     */
    const response = await SELF.fetch(`${BASE}/api/preflight/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("ratelimit-limit")).toBeNull();
  });
});

describe("the paths with no limiter still advertise none", () => {
  it("puts no RateLimit header on an unmetered read", async () => {
    // The older half of the discipline, kept: /menu.json has no
    // application-level ceiling, so it claims none.
    for (const path of ["/menu.json", "/llms.txt", "/corpus.json"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(
        response.headers.get("ratelimit-limit"),
        `${path} advertises a ceiling nothing enforces`,
      ).toBeNull();
    }
  });
});
