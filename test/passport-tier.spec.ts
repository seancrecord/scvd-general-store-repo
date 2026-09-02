import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { issuePassport } from "@/services/passport";
import {
  ESTABLISHED_ROUNDS,
  STANDING_ROUNDS,
  TIER_RULE,
  deriveTier,
  type TierRow,
} from "@/services/passport-tier";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";
import { isRecord } from "@/types";

/**
 * THE PASSPORT TIER (roadmap N7b, 2026-09-02) — the first derived
 * verdict published under "never a ranking, and never a verdict
 * without its derivation and denominator beside it."
 *
 * Written red first, from the keeper's prompt: the tier derives from
 * fixture rows and never from a typed word; three of four is observed
 * and not established; four of four with an unreachable is not
 * established; suspect coverage in the window forces indeterminate
 * whatever the readiness; a paid refresh that finds the door broken
 * flips the passport, the chip, the profile and tiers.json in the
 * same hour; tiers.json is alphabetical and carries no rank or
 * position; and /criteria carries the rule.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  failed: string[] = [],
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/x402`,
    verdict,
    failed,
    advisories: [],
    source: "discovery",
  };
}

function round(
  week: string,
  hosts: WardHostResult[],
  extra: Partial<WardRound> = {},
): WardRound {
  const n = Number.parseInt(week.slice(-2), 10);
  return {
    week,
    at: `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`,
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
    ...extra,
  };
}

async function chain(rounds: WardRound[]): Promise<void> {
  for (const [index, entry] of rounds.entries()) {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(entry));
    const pass = await takeCorpusSnapshot(testEnv, {
      ...okCalendar,
      now: new Date(Date.UTC(2026, 0, index + 1, 12)),
    });
    if (!pass.taken) throw new Error(`seed failed: ${pass.reason}`);
  }
}

async function json(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error(`${path} is not an object`);
  return body;
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
  await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh("door.example"));
});

function rows(verdicts: (TierRow["verdict"] | "gap" | "suspect")[]): TierRow[] {
  return verdicts.map((entry, index) => ({
    sequence: index + 1,
    week: `2026-W${String(index + 1).padStart(2, "0")}`,
    taken_at: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    entry_url: `${BASE}/corpus/${index + 1}.json`,
    observed: entry !== "gap" && entry !== "suspect",
    ...(entry !== "gap" && entry !== "suspect" ? { verdict: entry } : { gap: "not_observed" }),
    coverage_suspect: entry === "suspect",
  }));
}

const ready = (at = "2026-01-08T12:00:00.000Z") =>
  ({ verdict: "ready", observed_at: at, source: "census" }) as const;

describe("the tier is a function of the rows, the latest observation, and our coverage", () => {
  it("derives from fixture rows and prints its fraction on the line", () => {
    const reading = deriveTier(
      { rounds: rows(["ready", "ready", "ready", "ready"]), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(reading.tier).toBe("established");
    expect(reading.line).toBe("established — 4 of 4, W01–W04");
    expect(reading.fraction).toMatchObject({ ready: 4, rounds: 4 });
    expect(reading.rows).toHaveLength(4);
    expect(reading.rule).toBe(TIER_RULE.find((r) => r.tier === "established")!.rule);
  });

  it("a host at 3 of 4 is observed, not established", () => {
    const reading = deriveTier(
      { rounds: rows(["ready", "not_ready", "ready", "ready"]), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(reading.tier).toBe("observed");
    expect(reading.line).toBe("observed — 3 of 4, W01–W04");
  });

  it("4 of 4 with one unreachable is not established", () => {
    const reading = deriveTier(
      { rounds: rows(["ready", "unreachable", "ready", "ready"]), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(reading.tier).toBe("observed");
    expect(reading.fraction.ready).toBe(3);
  });

  it("standing needs eight of the last eight, and falls to established with seven", () => {
    const eight = deriveTier(
      { rounds: rows(Array(STANDING_ROUNDS).fill("ready")), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(eight.tier).toBe("standing");
    expect(eight.line).toBe("standing — 8 of 8, W01–W08");
    const seven = deriveTier(
      { rounds: rows(["not_ready", ...Array(7).fill("ready")]), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(seven.tier).toBe("established");
    expect(seven.fraction.rounds).toBe(ESTABLISHED_ROUNDS);
  });

  it("coverage_suspect in the window forces indeterminate regardless of readiness", () => {
    const reading = deriveTier(
      { rounds: rows(["ready", "ready", "suspect", "ready"]), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(reading.tier).toBe("indeterminate");
    expect(reading.coverage_suspect).toBe(true);
    expect(reading.line).toMatch(/^indeterminate — 3 of 4, /);
  });

  it("a gap that is not our fault is a round without a ready, never suspect", () => {
    const reading = deriveTier(
      { rounds: rows(["ready", "ready", "gap", "ready"]), latest: ready() },
      `${BASE}/criteria`,
    );
    expect(reading.tier).toBe("observed");
    expect(reading.coverage_suspect).toBe(false);
  });

  it("the latest observation not on the ready side is broken, whatever the rows say", () => {
    const reading = deriveTier(
      {
        rounds: rows(["ready", "ready", "ready", "ready"]),
        latest: { verdict: "unreachable", observed_at: "2026-01-09T00:00:00Z", source: "paid_refresh" },
      },
      `${BASE}/criteria`,
    );
    expect(reading.tier).toBe("broken");
    expect(reading.latest.source).toBe("paid_refresh");
  });

  it("no signed round in the window is indeterminate: fewer rounds than the rule needs", () => {
    const reading = deriveTier({ rounds: [], latest: { verdict: null, observed_at: null, source: null } }, `${BASE}/criteria`);
    expect(reading.tier).toBe("indeterminate");
    expect(reading.fraction).toMatchObject({ ready: 0, rounds: 0, weeks: "no rounds" });
  });
});

describe("the tier rides every surface with its fraction, on the same fold", () => {
  it("passport, chip, profile index and tiers.json agree, and a paid refresh finding broken flips them all", async () => {
    await chain([
      round("2026-W01", [host("door.example", "ready")]),
      round("2026-W02", [host("door.example", "ready")]),
      round("2026-W03", [host("door.example", "ready")]),
      round("2026-W04", [host("door.example", "ready")]),
    ]);
    const passport = await json("/passport/door.example");
    const payload = passport.payload as Record<string, unknown>;
    const summary = payload.summary as Record<string, unknown>;
    expect(summary.tier).toBe("established");
    expect(summary.tier_line).toBe("established — 4 of 4, W01–W04");
    const tier = payload.tier as Record<string, unknown>;
    expect((tier.rows as unknown[]).length).toBe(4);
    expect(tier.criteria_url).toBe(`${BASE}/criteria`);

    const html = await (
      await SELF.fetch(`${BASE}/passport/door.example`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain('data-tier="established"');
    expect(html).toContain("4 of 4, W01–W04");

    const chip = await (await SELF.fetch(`${BASE}/badges/passport/door.example.svg`)).text();
    expect(chip).toContain("ESTABLISHED 4/4");
    expect(chip).toContain("tier established — 4 of 4, W01–W04");

    const history = await json("/corpus/host/door.example.json");
    expect((history.tier as Record<string, unknown>).line).toBe("established — 4 of 4, W01–W04");

    const index = await json("/corpus/tiers.json");
    const entry = (index.hosts as Array<Record<string, unknown>>).find((h) => h.host === "door.example");
    expect(entry?.line).toBe("established — 4 of 4, W01–W04");

    // The paid refresh finds the door broken; newest wins everywhere.
    await testEnv.COUNTERS.put(
      KV_KEYS.passportRefresh("door.example"),
      JSON.stringify({
        artifact: "passport_refresh",
        host: "door.example",
        url: "https://door.example/x402",
        observed_at: "2026-01-05T00:00:00.000Z",
        verdict: "not_ready",
        failed: ["status-402"],
        advisories: [],
        instrument: "test",
        what_this_buys: "test",
      }),
    );
    const refused = await SELF.fetch(`${BASE}/passport/door.example`);
    expect(refused.status).toBe(403);
    const chipRefused = await SELF.fetch(`${BASE}/badges/passport/door.example.svg`);
    expect(chipRefused.status).toBe(403);
    const after = await json("/corpus/host/door.example.json");
    expect((after.tier as Record<string, unknown>).tier).toBe("broken");
    expect((after.tier as Record<string, unknown>).line).toBe("broken — 4 of 4, W01–W04");
    const afterIndex = await json("/corpus/tiers.json");
    const afterEntry = (afterIndex.hosts as Array<Record<string, unknown>>).find((h) => h.host === "door.example");
    expect(afterEntry?.tier).toBe("broken");
    expect((afterEntry?.latest as Record<string, unknown>).source).toBe("paid_refresh");
  });

  it("tiers.json is alphabetical and carries no rank or position field", async () => {
    await chain([
      round("2026-W01", [host("zeta.example", "ready"), host("alpha.example", "not_ready", ["x"]), host("mid.example", "ready")]),
      round("2026-W02", [host("zeta.example", "ready"), host("alpha.example", "ready"), host("mid.example", "unreachable")]),
    ]);
    const index = await json("/corpus/tiers.json");
    const hosts = index.hosts as Array<Record<string, unknown>>;
    expect(hosts.map((h) => h.host)).toEqual(["alpha.example", "mid.example", "zeta.example"]);
    const flat = JSON.stringify(index).toLowerCase();
    expect(flat).not.toContain('"rank"');
    expect(flat).not.toContain('"position"');
    expect(flat).not.toContain('"score"');
    for (const entry of hosts) {
      expect(String(entry.line)).toMatch(/\b\d+ of \d+\b/);
    }
    expect(hosts.find((h) => h.host === "mid.example")?.tier).toBe("broken");
    expect(hosts.find((h) => h.host === "zeta.example")?.tier).toBe("observed");
    expect(index.by_tier).toMatchObject({ broken: 1 });
  });

  it("a capped round we did not reach the host in is suspect coverage, and the passport says so", async () => {
    await chain([
      round("2026-W01", [host("door.example", "ready")]),
      round("2026-W02", [host("door.example", "ready")]),
      round("2026-W03", [host("other.example", "ready")], { capped: true }),
      round("2026-W04", [host("door.example", "ready")]),
    ]);
    const outcome = await issuePassport(testEnv, "door.example", new Date("2026-01-05T00:00:00Z"));
    if (!outcome.issued) throw new Error("passport refused");
    expect(outcome.passport.payload.tier?.tier).toBe("indeterminate");
    expect(outcome.passport.payload.tier?.coverage_suspect).toBe(true);
    expect(outcome.passport.payload.summary.tier_line).toMatch(/^indeterminate — 3 of 4/);
  });
});

describe("/criteria carries the rule, typed once", () => {
  it("prints every tier's rule verbatim and points at the index", async () => {
    const body = await json("/criteria");
    const rule = body.tier_rule as Record<string, unknown>;
    expect(rule.rules).toEqual(TIER_RULE);
    expect(rule.established_needs).toBe(ESTABLISHED_ROUNDS);
    expect(rule.index).toBe(`${BASE}/corpus/tiers.json`);
    const html = await (
      await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "text/html" } })
    ).text();
    for (const entry of TIER_RULE) {
      expect(html).toContain(entry.rule.replace(/&/g, "&amp;"));
    }
  });
});
