import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preflightUrl,
  BATTERY_CHECK_NAMES,
  reachedLevel,
  runChecks,
  triStateVector,
} from "@/services/preflight";

/**
 * ROADMAP 2.1b — THE FREE SURFACE PUBLISHES HOW FAR THE PROBE GOT.
 *
 * Ledger B1: `ready|not_ready|unreachable` collapses ~19 separable
 * signals. The taxonomy (L0-L6) already exists in the ledger; this
 * slice publishes the rungs ONE UNPAID PROBE can honestly claim —
 * none, L1, L2, L3a — beside the tri-state vector, on the free
 * preflight report. L3b+ are stated as not measured, never omitted.
 *
 * Workers fetch collapses L0 sub-classes (DNS/TCP/TLS/timeout), so a
 * failed probe claims NO level and names the failure "unlocalized"
 * rather than fabricating a sub-class (B2, rule 5).
 */

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response("", { status, headers });
}

const CHALLENGE = btoa(
  JSON.stringify({
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        payTo: "0x4444444444444444444444444444444444444444",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "5000",
        maxTimeoutSeconds: 300,
      },
    ],
  }),
);

describe("reached_level from one unpaid probe", () => {
  it("a clean 402 reaches L3a", () => {
    const vector = triStateVector(
      runChecks(response(402, { "PAYMENT-REQUIRED": CHALLENGE }), false).checks,
    );
    expect(reachedLevel(vector, false)).toBe("L3a");
  });

  it("a 200 door reaches L1: HTTP answered, x402 never detected", () => {
    const vector = triStateVector(runChecks(response(200), false).checks);
    expect(reachedLevel(vector, false)).toBe("L1");
  });

  it("a headerless 402 is still L1 — detectability needs the header", () => {
    const vector = triStateVector(runChecks(response(402), false).checks);
    expect(reachedLevel(vector, false)).toBe("L1");
  });

  it("a parseable header with a broken challenge is L2, not L3a", () => {
    const challenge = btoa(JSON.stringify({ x402Version: 1, accepts: [] }));
    const vector = triStateVector(
      runChecks(response(402, { "PAYMENT-REQUIRED": challenge }), false).checks,
    );
    expect(reachedLevel(vector, false)).toBe("L2");
  });

  it("a failed probe claims no level at all", () => {
    expect(reachedLevel([], true)).toBe("none");
  });
});

describe("the free preflight report carries the vector and the level", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes checks_vector, reached_level, and states what it does NOT measure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(402, { "PAYMENT-REQUIRED": CHALLENGE })),
    );
    const result = await preflightUrl(
      "https://door.example/api/thing",
      env as never,
    );
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body["reached_level"]).toBe("L3a");
    const vector = body["checks_vector"] as { name: string; state: string }[];
    expect(vector.slice(0, BATTERY_CHECK_NAMES.length).map((v) => v.name)).toEqual(
      [...BATTERY_CHECK_NAMES],
    );
    // Absence stated, never omitted: the rungs this probe cannot climb
    // are named as unmeasured, not silently missing.
    expect(String(body["reached_level_meaning"])).toMatch(/L3b/);
    expect(String(body["reached_level_meaning"])).toMatch(/not measure/i);
  });

  it("an unreachable probe publishes none + unlocalized, inventing no sub-class", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused, allegedly");
      }),
    );
    const result = await preflightUrl(
      "https://door.example/api/thing",
      env as never,
    );
    const body = result.body as Record<string, unknown>;
    expect(body["reached_level"]).toBe("none");
    expect(body["network_failure"]).toBe("unlocalized");
    const vector = body["checks_vector"] as {
      name: string;
      state: string;
      blocked_by?: string;
    }[];
    for (const row of vector) {
      if (row.name !== "reachable") {
        expect(row.state).toBe("not_reached");
        expect(row.blocked_by).toBe("reachable");
      }
    }
  });
});
