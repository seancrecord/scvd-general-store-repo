import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalizeProbe,
  readWatch,
  startWatch,
  sweepStandingWatches,
} from "@/services/standing-watch";
import type { StandingWatchRecord, WatchProbe } from "@/services/standing-watch";
import { KV_KEYS } from "@/lib/kv-keys";
import { probeHost } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BEACON = "https://beacon.example/known-good-402";
const TARGET = "https://watched.example/api/buy/x";

/**
 * ROADMAP 3.4 — OBSERVER ACCOUNTING (ledger B6, B10, B11).
 *
 * B6, the acceptance case verbatim: our timeout is currently booked
 * as the subject's outage. When this store's probe cannot reach a
 * door, two very different things may be true — their door is down,
 * or OUR vantage is. The row said "unreachable" either way, which
 * quietly billed every Cloudflare hiccup to somebody else's uptime.
 * The control beacon decides: a same-tick read of a known-good
 * off-store 402. Beacon up + target down = their outage. Beacon down
 * too = OUR degraded tick, excluded from their stats AND from
 * coverage.
 *
 * B10: never a bare percentage. Expected, recorded, refused,
 * degraded, unprobed — separate numbers, explicit denominator,
 * "nothing claimed between probes" on the artifact.
 *
 * B11: a refused row is our policy, not an observation. It stops
 * counting as one.
 */

function stubFetch(options: {
  targetFails: boolean;
  beaconFails: boolean;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(BEACON)) {
        if (options.beaconFails) throw new Error("beacon unreachable");
        return new Response("{}", { status: 402 });
      }
      if (options.targetFails) throw new Error("connect timeout");
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "5000",
                  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  payTo: "0x1111111111111111111111111111111111111111",
                  maxTimeoutSeconds: 300,
                },
              ],
            }),
          ),
        },
      });
    }),
  );
}

function envWithBeacon(): Env {
  return { ...testEnv, CONTROL_BEACON_URL: BEACON } as Env;
}

async function sweepAndRead(env: Env, watchId: string) {
  await sweepStandingWatches(env, { burstGapMs: 0 });
  const history = await readWatch(env, watchId);
  expect(history).not.toBeNull();
  return history!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("B6 — whose outage is it", () => {
  it("target down, beacon down: OUR degraded tick, not their outage", async () => {
    const beaconEnv = envWithBeacon();
    const { record } = await startWatch(beaconEnv, TARGET);
    stubFetch({ targetFails: true, beaconFails: true });
    const history = await sweepAndRead(beaconEnv, record.watch_id);

    /*
     * THE RED LINE. Today this books summary.unreachable = 1 — a
     * signed, published claim that THEIR door was down, made at the
     * exact moment we could not see anything at all.
     */
    expect(history.summary.probes_observer_degraded).toBe(1);
    expect(history.summary.unreachable).toBe(0);
    expect(history.summary.probes_recorded).toBe(0);
    const probe = history.probes[0]!;
    expect(probe.verdict).toBe("unreachable");
    expect(probe.observer_status).toBe("degraded");
  });

  it("target down, beacon up: their outage, confirmed rather than assumed", async () => {
    const beaconEnv = envWithBeacon();
    const { record } = await startWatch(beaconEnv, TARGET);
    stubFetch({ targetFails: true, beaconFails: false });
    const history = await sweepAndRead(beaconEnv, record.watch_id);

    expect(history.summary.unreachable).toBe(1);
    expect(history.summary.probes_observer_degraded).toBe(0);
    expect(history.probes[0]!.observer_status).toBe("ok");
  });

  it("no beacon provisioned: the failure books as theirs, and the row says the attribution was never checked", async () => {
    const { record } = await startWatch(testEnv, TARGET);
    stubFetch({ targetFails: true, beaconFails: true });
    const history = await sweepAndRead(testEnv, record.watch_id);

    expect(history.summary.unreachable).toBe(1);
    expect(history.probes[0]!.observer_status).toBe("unchecked");
  });

  it("a tick that observed successfully never consults the beacon", async () => {
    const beaconEnv = envWithBeacon();
    const { record } = await startWatch(beaconEnv, TARGET);
    stubFetch({ targetFails: false, beaconFails: true });
    const history = await sweepAndRead(beaconEnv, record.watch_id);

    // Beacon down but the target answered: the observation stands.
    expect(history.summary.ready).toBe(1);
    expect(history.probes[0]!.observer_status).toBe("ok");
  });
});

describe("B10 — numbers, never a bare percentage", () => {
  it("the summary serves expected, recorded, refused and degraded as separate numbers with the no-claims sentence", async () => {
    const beaconEnv = envWithBeacon();
    const { record } = await startWatch(beaconEnv, TARGET);
    stubFetch({ targetFails: false, beaconFails: false });
    const history = await sweepAndRead(beaconEnv, record.watch_id);

    expect(history.summary.probes_expected).toBeDefined();
    expect(history.summary.probes_refused).toBe(0);
    expect(history.summary.probes_observer_degraded).toBe(0);
    expect(history.summary.nothing_claimed_between_probes).toContain(
      "between probes",
    );
  });

  it("latency is served as a distribution, never a mean", async () => {
    const beaconEnv = envWithBeacon();
    const { record } = await startWatch(beaconEnv, TARGET);
    stubFetch({ targetFails: false, beaconFails: false });
    const history = await sweepAndRead(beaconEnv, record.watch_id);

    const latency = history.summary.latency_ms;
    expect(latency).toBeDefined();
    expect(latency!.p50).toBeGreaterThanOrEqual(0);
    expect(latency!.max).toBeGreaterThanOrEqual(latency!.p50);
    expect("mean" in (latency as object)).toBe(false);
  });
});

describe("B11 — a refusal is policy, not observation", () => {
  it("a refused row counts under probes_refused and never as a recorded observation", async () => {
    // A private address: the probe guard refuses it on every tick.
    const { record } = await startWatch(testEnv, "https://127.0.0.1/api/buy/x");
    stubFetch({ targetFails: false, beaconFails: false });
    const history = await sweepAndRead(testEnv, record.watch_id);

    expect(history.summary.probes_refused).toBe(1);
    expect(history.summary.probes_recorded).toBe(0);
  });
});

describe("the census carries the same law (B6 at the ward round)", () => {
  it("an unreachable ward probe under a dead beacon says the blindness was ours", async () => {
    const beaconEnv = envWithBeacon();
    stubFetch({ targetFails: true, beaconFails: true });
    const result = await probeHost(beaconEnv, TARGET);
    expect(result.verdict).toBe("unreachable");
    /*
     * THE RED LINE, census edition: this row rides verbatim into the
     * hash-chained weekly snapshot. Before 3.4 it said "unreachable"
     * with nothing distinguishing their outage from our blindness —
     * a Bitcoin-anchored claim about a host, made while this store
     * could not see anything at all.
     */
    expect(result.observer_status).toBe("degraded");
  });

  it("beacon up: the unreachable is theirs, confirmed", async () => {
    const beaconEnv = envWithBeacon();
    stubFetch({ targetFails: true, beaconFails: false });
    const result = await probeHost(beaconEnv, TARGET);
    expect(result.observer_status).toBe("ok");
  });

  it("an answered door never carries the field — answering proved the vantage", async () => {
    stubFetch({ targetFails: false, beaconFails: false });
    const result = await probeHost(testEnv, TARGET);
    expect(result.verdict).not.toBe("unreachable");
    expect(result.observer_status).toBeUndefined();
  });
});

describe("the preimage law holds across the 3.4 field", () => {
  it("a legacy row with no observer_status canonicalizes without one, byte-identical forever", async () => {
    const legacy = {
      at: "2026-08-01T00:00:00.000Z",
      verdict: "ready" as const,
      failed: [],
      status: 402,
      latency_ms: 120,
    };
    const bytes = canonicalizeProbe("watch_abc", TARGET, legacy);
    expect(bytes).not.toContain("observer_status");

    const fresh = { ...legacy, observer_status: "ok" as const };
    const freshBytes = canonicalizeProbe("watch_abc", TARGET, fresh);
    expect(freshBytes).toContain("observer_status");
    // Appended after everything legacy, so the legacy prefix survives.
    expect(freshBytes.startsWith(bytes.slice(0, -1))).toBe(true);
  });
});
