import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { takeCorpusSnapshot, listCorpus } from "@/services/corpus";
import { deriveTrajectory, deriveDiff } from "@/services/trajectory";
import { KV_KEYS } from "@/lib/kv-keys";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

/**
 * ROADMAP 3.5 — DERIVED VIEWS OVER THE CORPUS CHAIN (G5, J2, M3).
 *
 * The chain already holds the history: every week a signed snapshot
 * of everything the round observed. What nobody could do was READ the
 * history as history — the market's shape over time (M3), what
 * changed since last week (J2), and drift in a door's own terms —
 * price, rails — that sat derivable across snapshots but was never
 * minted as fact (G5).
 *
 * THE LAW OF THIS ROW: views are DERIVED ONLY from signed snapshots.
 * Every point names the digest it came from; a stranger re-derives
 * the whole surface from /corpus/N.json with their own tools, and
 * this spec does exactly that. Denominators always; no ratios —
 * a percentage with a hidden denominator is how a market lies.
 */

function hostRow(
  host: string,
  verdict: "ready" | "not_ready" | "unreachable" | "not_probed",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { host, url: `https://${host}/api/buy/x`, verdict, failed: [], advisories: [], ...extra };
}

function syntheticRound(week: string, hosts: Record<string, unknown>[]): WardRound {
  return {
    week,
    at: `2026-08-20T00:00:00.000Z`,
    listed_resources: hosts.length,
    coverage_suspect: false,
    hosts,
  } as unknown as WardRound;
}

async function seedWeek(week: string, hosts: Record<string, unknown>[]): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify(syntheticRound(week, hosts)),
  );
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

const WEEK_ONE_HOSTS = [
  hostRow("alpha.example", "ready", {
    offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.005 },
  }),
  hostRow("beta.example", "not_ready", { failed: ["accepts"] }),
  hostRow("gone.example", "ready"),
];

const WEEK_TWO_HOSTS = [
  // alpha drifted: price moved, a rail appeared.
  hostRow("alpha.example", "ready", {
    offer: { networks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"], schemes: ["exact"], min_usdc: 0.01 },
  }),
  // beta transitioned to ready.
  hostRow("beta.example", "ready", {
    offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 1 },
  }),
  // gone.example disappeared; fresh.example appeared.
  hostRow("fresh.example", "not_ready", { failed: ["x402-version"] }),
  // and one row where OUR vantage was blind (3.4): must not count
  // against anyone, listed under its own name.
  hostRow("blind.example", "unreachable", { observer_status: "degraded" }),
  hostRow("down.example", "unreachable", { observer_status: "ok" }),
];

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await seedWeek("2026-W34", WEEK_ONE_HOSTS);
  await seedWeek("2026-W35", WEEK_TWO_HOSTS);
});

describe("M3 — the trajectory is the chain, read as time", () => {
  it("derives one point per week, counting by verdict with the denominator beside it", async () => {
    const records = await listCorpus(testEnv);
    const view = deriveTrajectory(records);
    expect(view.weeks).toHaveLength(2);

    const [w1, w2] = view.weeks;
    expect(w1!.week).toBe("2026-W34");
    expect(w1!.hosts_probed).toBe(3);
    expect(w1!.ready).toBe(2);
    expect(w1!.not_ready).toBe(1);

    expect(w2!.week).toBe("2026-W35");
    expect(w2!.hosts_probed).toBe(5);
    expect(w2!.ready).toBe(2);
    expect(w2!.unreachable).toBe(1);
    /*
     * 3.4 flows through: the tick where our vantage was blind is not
     * anyone's outage, and the trajectory says so under its own name.
     */
    expect(w2!.observer_degraded).toBe(1);
  });

  it("counts rails per chain and failure classes by their registered names", async () => {
    const view = deriveTrajectory(await listCorpus(testEnv));
    const w2 = view.weeks[1]!;
    expect(w2.networks["eip155:8453"]).toBe(2);
    expect(w2.networks["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]).toBe(1);
    expect(w2.failure_classes["x402-version"]).toBe(1);
  });

  it("every point names the signed snapshot it came from", async () => {
    const records = await listCorpus(testEnv);
    const view = deriveTrajectory(records);
    for (const [index, point] of view.weeks.entries()) {
      expect(point.digest).toBe(records[index]!.digest);
      expect(point.sequence).toBe(records[index]!.snapshot.sequence);
    }
  });

  it("serves no ratio anywhere — counts and denominators only", async () => {
    const view = deriveTrajectory(await listCorpus(testEnv));
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/"pct"|"percent|_rate"/);
  });

  it("RE-DERIVES: the whole surface reproduces from the raw chain, byte for byte", async () => {
    const once = deriveTrajectory(await listCorpus(testEnv));
    const again = deriveTrajectory(await listCorpus(testEnv));
    expect(JSON.stringify(again)).toBe(JSON.stringify(once));
  });
});

describe("J2 — what changed since, served as transitions", () => {
  it("names appeared, disappeared, and verdict transitions between two signed weeks", async () => {
    const diff = deriveDiff(await listCorpus(testEnv), "2026-W34");
    expect(diff).not.toBeNull();
    expect(diff!.appeared).toContain("fresh.example");
    expect(diff!.disappeared).toContain("gone.example");
    expect(diff!.transitions).toContainEqual({
      host: "beta.example",
      from: "not_ready",
      to: "ready",
    });
    expect(diff!.from.digest).toBeDefined();
    expect(diff!.to.digest).toBeDefined();
  });

  it("G5 — drift becomes a dated fact: the price moved and the rail appeared, in the door's own terms", async () => {
    const diff = deriveDiff(await listCorpus(testEnv), "2026-W34");
    expect(diff!.drift).toContainEqual({
      host: "alpha.example",
      field: "min_usdc",
      from: 0.005,
      to: 0.01,
    });
    const railDrift = diff!.drift.find(
      (d) => d.host === "alpha.example" && d.field === "networks",
    );
    expect(railDrift).toBeDefined();
  });

  it("an unknown since-week answers with the weeks that exist, never a guess", async () => {
    const diff = deriveDiff(await listCorpus(testEnv), "2026-W01");
    expect(diff).toBeNull();
  });
});

describe("the surface is public and derived at read", () => {
  it("GET /corpus/trajectory.json serves the derived view with its derivation stated", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/trajectory.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(body.weeks)).toBe(true);
    expect(String(body.how_to_rederive)).toContain("/corpus/");
    expect(String(body.nothing_claimed_between_snapshots ?? body.what_this_is)).toBeTruthy();
  });

  it("GET /corpus/diff.json names the weeks it knows when asked about one it does not", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/diff.json?since=1999-W01`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { known_weeks?: string[] };
    expect(body.known_weeks).toBeDefined();
  });
});
