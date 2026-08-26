import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_CRITERIA_VERSION } from "@/services/service-audit";
import { LAUNCH_CHECK_BATTERY, performLaunchCheck } from "@/services/launch-check";
import { canonicalizeProbe } from "@/services/standing-watch";
import { probeHost } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * ROADMAP 1.3, THE LEGACY CLASSES — ledger D6: methodology version
 * INSIDE the signed bytes, on every observation class.
 *
 * The 0.14 incident is the argument, restated once: two of our own
 * instruments disagreed in public because a signed verdict carried no
 * record of WHICH battery produced it, so nothing could surface the
 * disagreement until an outside instrument tripped over it. The
 * envelope tree has required a battery version since #243; the three
 * classes that predate it — standing-watch rows, ward rounds, launch
 * checks — went on signing verdicts a verifier could not tie to a
 * battery revision. A verdict from preflight-v1 quoted against a
 * future preflight-v2 reading looks like a contradiction when it is
 * a version skew, and nothing in the signature could say so.
 *
 * PREIMAGE LAW, same as #246 and 1.2: the version rides on NEW rows
 * only, appended inside the signed bytes; a legacy row keeps its
 * exact original preimage and verifies forever.
 *
 * HONESTY EDGE: a door that never answered ran no battery, so an
 * unreachable row carries NO battery citation — citing a battery
 * that did not run is the same lie as hashing a body we did not
 * finish reading.
 */

afterEach(() => vi.unstubAllGlobals());

const CHALLENGE = btoa(
  JSON.stringify({
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        payTo: "0x3333333333333333333333333333333333333333",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "5000",
        maxTimeoutSeconds: 300,
      },
    ],
  }),
);

function stubDoor(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const parsed = new URL(String(url));
      if (parsed.protocol === "https:" && parsed.hostname === "door.example") {
        return new Response("terms", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": CHALLENGE },
        });
      }
      return new Response("no upstream here", { status: 500 });
    }),
  );
}

describe("the battery signs its own name", () => {
  it("standing-watch rows carry the preflight battery inside the signed bytes", () => {
    const preimage = canonicalizeProbe("watch_1", "https://door.example/x", {
      at: "2026-08-26T17:00:00.000Z",
      verdict: "ready",
      failed: [],
      battery: AUDIT_CRITERIA_VERSION,
    });
    const parsed = JSON.parse(preimage) as Record<string, unknown>;
    expect(parsed["battery"]).toBe("preflight-v1");
  });

  it("keeps a legacy row's preimage byte-identical — no battery, no field", () => {
    const preimage = canonicalizeProbe("watch_1", "https://door.example/x", {
      at: "2026-08-26T17:00:00.000Z",
      verdict: "ready",
      failed: [],
    });
    expect(preimage).not.toContain("battery");
  });

  it("ward rows name the battery that produced the verdict", async () => {
    stubDoor();
    const row = await probeHost(testEnv, "https://door.example/x");
    expect(row.battery).toBe(AUDIT_CRITERIA_VERSION);
  });

  it("an unreachable door ran no battery, and the row says none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect timeout");
      }),
    );
    const row = await probeHost(testEnv, "https://door.example/x");
    expect(row.verdict).toBe("unreachable");
    expect(row.battery).toBeUndefined();
  });

  it("the walk names its own battery inside the signed core", async () => {
    stubDoor();
    const check = await performLaunchCheck(testEnv, "https://door.example/x", {
      fetch: globalThis.fetch,
    });
    expect(check.battery).toBe(LAUNCH_CHECK_BATTERY);
    // Above the signature, where the verify recipe reaches.
    const keys = Object.keys(check);
    expect(keys.indexOf("battery")).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf("battery")).toBeLessThan(keys.indexOf("signature"));
  });
});
