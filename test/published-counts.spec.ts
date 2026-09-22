import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PUBLISHED_COUNTS,
  PUBLISHED_COUNTS_RULE,
  pathMatches,
  publishedCountsBlock,
  registeredCount,
  type CountRoute,
} from "@/store/published-counts";
import STATS_SHAPE from "./fixtures/published-counts/stats.json";
import PULSE_SHAPE from "./fixtures/published-counts/pulse.json";
import RAILS_SHAPE from "./fixtures/published-counts/rails.json";
import OBSERVATORY_SHAPE from "./fixtures/published-counts/observatory.json";
import COVERAGE_SHAPE from "./fixtures/published-counts/coverage.json";
import CORPUS_SHAPE from "./fixtures/published-counts/corpus.json";
import { sealStoreMonth, unsealedMonths } from "@/services/store-month";
import type { Env } from "@/types";

/**
 * THE PUBLISHED COUNTS GUARD (2026-09-21). Rule 43 for the numbers:
 * every numeric leaf a public count route serves has a row in the
 * register naming its instrument, population, window, exclusions and
 * bounds — or this file fails and names the leaf. Walked twice: on
 * what the suite's empty store serves, and on recorded production
 * shapes, so a field the suite cannot produce (a rail split, a
 * net-by-chain month, a correction) is held too.
 */

/**
 * THE STORE'S OWN MONTH has no recorded production shape yet: nothing
 * is sealed in production until the first month closes under the new
 * chain. So `shape` is optional, and the live walk is made meaningful
 * instead — beforeAll seals a month into the suite's own store, so
 * the walk reads a real entry with real figures rather than an empty
 * chain that would pass by having nothing in it. A route walked with
 * no rows is a guard asleep, which is the failure this file exists to
 * prevent. When the first month is sealed in production, record its
 * shape here like the others.
 */
const ROUTES: Array<{ route: CountRoute; url: string; shape?: unknown }> = [
  { route: "/stats", url: "/stats", shape: STATS_SHAPE },
  { route: "/pulse", url: "/pulse.json", shape: PULSE_SHAPE },
  { route: "/pulse", url: "/pulse", shape: PULSE_SHAPE },
  { route: "/rails", url: "/rails", shape: RAILS_SHAPE },
  { route: "/observatory", url: "/observatory", shape: OBSERVATORY_SHAPE },
  { route: "/coverage", url: "/coverage.json", shape: COVERAGE_SHAPE },
  { route: "/corpus.json", url: "/corpus.json", shape: CORPUS_SHAPE },
  { route: "/store-month", url: "/store-month.json" },
];

/**
 * Seal one month so the /store-month walk above reads an entry. The
 * calendar is stubbed: a guard that depends on the network is a guard
 * that goes red for reasons that have nothing to do with the register.
 */
beforeAll(async () => {
  const testEnv = env as unknown as Env;
  const [month] = await unsealedMonths(testEnv);
  if (month) {
    await sealStoreMonth(testEnv, month, {
      submit: async () => ({ status: "pending" as const, submitted_at: "2026-09-22T00:00:00.000Z" }),
    });
  }
});

function numericLeaves(node: unknown, path: string, out: Set<string>): void {
  if (typeof node === "number") {
    out.add(path);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) numericLeaves(item, `${path}[]`, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "published_counts") continue; // the register describing itself is not a count
      numericLeaves(value, path ? `${path}.${key}` : key, out);
    }
  }
}

function unregistered(route: CountRoute, document: unknown): string[] {
  const leaves = new Set<string>();
  numericLeaves(document, "", leaves);
  return [...leaves].filter((leaf) => registeredCount(route, leaf) === undefined).sort();
}

describe("every published count has its denominator registered", () => {
  it("matches paths the way the register writes them", () => {
    expect(pathMatches("months[].organic", "months[].organic")).toBe(true);
    expect(pathMatches("months[].surfaces[].by_channel.*", "months[].surfaces[].by_channel.direct")).toBe(true);
    expect(pathMatches("net_by_chain.*.months[].booked_usdc", "net_by_chain.base.months[].booked_usdc")).toBe(true);
    expect(pathMatches("latest.**", "latest.snapshot.round.market.rot.pct")).toBe(true);
    expect(pathMatches("months[].organic", "months.organic")).toBe(false);
    expect(pathMatches("all_time.organic_settled", "all_time.organic_settled.extra")).toBe(false);
    expect(pathMatches("months[].surfaces[].by_channel.*", "months[].surfaces[].house")).toBe(false);
  });

  for (const { route, url } of ROUTES) {
    it(`serves no numeric leaf without a row: ${url} (the suite's own store)`, async () => {
      const res = await SELF.fetch(`https://scvd.store${url}`, { headers: { Accept: "application/json" } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(unregistered(route, body)).toEqual([]);
      const block = body["published_counts"] as { rule: string; rows: unknown[] };
      expect(block?.rule).toBe(PUBLISHED_COUNTS_RULE);
      expect(block.rows).toEqual(publishedCountsBlock(route).rows);
    });
  }

  for (const { route, url, shape } of ROUTES) {
    if (shape === undefined) continue; // no production shape recorded yet
    it(`serves no numeric leaf without a row: ${url} (recorded production shape)`, () => {
      expect(unregistered(route, shape)).toEqual([]);
    });
  }

  it("keeps every row honest about what it needs", () => {
    for (const row of PUBLISHED_COUNTS) {
      expect(row.unit.length, row.path).toBeGreaterThan(0);
      expect(row.instrument.length, row.path).toBeGreaterThan(0);
      expect(row.population.length, row.path).toBeGreaterThan(0);
      expect(row.window.length, row.path).toBeGreaterThan(0);
      if (row.kind === "rate") expect(row.population, row.path).toMatch(/\w/);
      if (row.kind === "constant") expect(row.population, row.path).toMatch(/^not a count/);
    }
    // One row per (route, path): a duplicate is two denominators for one number.
    const seen = new Set<string>();
    for (const row of PUBLISHED_COUNTS) {
      const key = `${row.route} ${row.path}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("prints the rows under the figures on the pages that have one", async () => {
    for (const url of ["/pulse", "/rails", "/observatory"]) {
      const res = await SELF.fetch(`https://scvd.store${url}`, {
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
      });
      const html = await res.text();
      expect(html, url).toContain('id="denominators"');
      expect(html, url).toContain(PUBLISHED_COUNTS_RULE.slice(0, 60));
    }
  });
});
