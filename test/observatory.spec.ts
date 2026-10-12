import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import METRICS_SOURCE from "../src/lib/metrics.ts?raw";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth, recordPorchVisit } from "@/lib/metrics";
import { PORCH_EXACT } from "@/lib/porch-surface";
import { ROOMS } from "@/store/rooms";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import {
  OBSERVATORY_LEDGER_KEY_CAP,
  OBSERVATORY_PORCH_WRITES_PER_MINUTE,
  computeObservatory,
} from "@/services/observatory";
import type { Env } from "@/types";

/**
 * THE OBSERVATORY PAGE (2026-09-02): the porch's counts, read. What
 * this file holds:
 *
 *   - a recorded visit shows up under its surface and its channel,
 *     with house and infrastructure kept beside it, not inside it;
 *   - surfaces are in name order, never by count;
 *   - the floors the page quotes are the counter's own constants;
 *   - no key on the artifact reads as a rate, share or score;
 *   - the page serves a person and a machine at one URL, carries the
 *     corrections pointer, and is a registered room and dataset;
 *   - the page counts itself.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

// counted_paths is a route-name dictionary, not a set of metric fields.
// Inspect its values recursively, but do not call "declarations" a ratio.
function metricFieldNames(node: unknown, countedPaths: object): string[] {
  if (Array.isArray(node)) return node.flatMap(value => metricFieldNames(value, countedPaths));
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) => [
    ...(node === countedPaths ? [] : [key]),
    ...metricFieldNames(value, countedPaths),
  ]);
}

const isRelativeMetric = (key: string): boolean => /rate|ratio|percent|score|rank|share/i.test(key);

describe("the counts, read", () => {
  it("shows a recorded visit under its surface and channel, house beside it, in name order", async () => {
    await recordPorchVisit(testEnv, "atlas", {});
    await recordPorchVisit(testEnv, "atlas", {});
    await recordPorchVisit(testEnv, "corpus", {});
    const observatory = await computeObservatory(testEnv);
    const month = observatory.months.find((entry) => entry.month === metricsMonth())!;
    expect(month).toBeTruthy();
    const atlas = month.surfaces.find((row) => row.surface === "atlas")!;
    expect(atlas.organic).toBeGreaterThanOrEqual(2);
    expect(Object.values(atlas.by_channel).reduce((sum, count) => sum + count, 0)).toBe(atlas.organic);
    expect(typeof atlas.house).toBe("number");
    expect(typeof atlas.infrastructure).toBe("number");
    const names = month.surfaces.map((row) => row.surface);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(month.organic_visits).toBeGreaterThanOrEqual(3);
  });

  it("publishes who reads the host pages by class and format, and how concentrated, naming nobody", async () => {
    const { recordPageRead } = await import("@/services/buyer-signals");
    const { signalStore } = await import("@/services/signal-store");
    await signalStore(testEnv)?.reset();
    const read = (format: "html" | "json" | "markdown", userAgent: string, accept: string) =>
      recordPageRead(testEnv, { page: "corpus_host", format, subject: "seen.example", userAgent, accept, referrer: undefined, ownHost: "scvd.store", house: false });
    await read("html", "Mozilla/5.0", "text/html");
    await read("json", "python-httpx/0.27", "application/json");
    await read("json", "Mozilla/5.0 (compatible; Claude-User/1.0)", "*/*");
    await read("html", "Mozilla/5.0 (compatible; GPTBot/1.0)", "*/*");
    const observatory = await computeObservatory(testEnv);
    const month = observatory.months.find((entry) => entry.month === metricsMonth())!;
    expect(month.host_pages?.by_format_and_reader).toEqual({ "html:browser": 1, "html:crawler": 1, "json:agent": 1, "json:fetcher": 1 });
    // The crawler is out of the subject count; the one subject came back in two formats.
    expect(month.host_pages?.histogram).toEqual({
      subjects: 1,
      by_formats: { one: 0, two: 1, three: 0 },
      repeat: { at_least_2: 1, at_least_5: 0, at_least_10: 0 },
      reads: 3,
      overflow: 0,
    });
    expect(JSON.stringify(observatory)).not.toContain("seen.example");
    expect(JSON.stringify(observatory).toLowerCase()).not.toContain("gptbot");
    const html = await (await SELF.fetch(`${BASE}/observatory`, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } })).text();
    expect(html).toContain("Who reads the pages about a host");
    expect(html).toContain("<code>json:fetcher</code></td><td>1</td>");
  });

  it("quotes the counter's own floors, not a number typed here", () => {
    expect(METRICS_SOURCE).toContain(`PORCH_WRITES_PER_MINUTE = ${OBSERVATORY_PORCH_WRITES_PER_MINUTE};`);
    expect(METRICS_SOURCE).toContain(`METRIC_KEY_CAP = ${OBSERVATORY_LEDGER_KEY_CAP};`);
  });

  it("lists every counted path from the roster the counter reads, and counts itself", async () => {
    const observatory = await computeObservatory(testEnv);
    for (const [path, surface] of PORCH_EXACT) {
      expect(observatory.counted_paths[path]).toBe(surface);
    }
    expect(observatory.counted_paths["/observatory"]).toBe("observatory");
  });

  it("no metric field reads as a rate, share or score", async () => {
    const observatory = await computeObservatory(testEnv);
    expect(metricFieldNames(observatory, observatory.counted_paths).filter(isRelativeMetric)).toEqual([]);
  });

  it("exempts only route names, while still catching relative metrics at every depth", () => {
    const countedPaths = { "/seller-declarations": "seller_declarations", "/conversion-rate": "fixture" };
    const fixture = {
      counted_paths: countedPaths,
      conversion_rate: 0.5,
      months: [{ nested: { ratio: 0.5, percent: 50, score: 1, rank: 1, share: 0.5 } }],
    };
    expect(metricFieldNames(fixture, countedPaths).filter(isRelativeMetric))
      .toEqual(["conversion_rate", "ratio", "percent", "score", "rank", "share"]);
    // Even a metric nested under a route remains visible to the guard.
    const nested = { "/seller-declarations": { score: 1 } };
    expect(metricFieldNames({ counted_paths: nested }, nested).filter(isRelativeMetric)).toEqual(["score"]);
  });
});

describe("the page", () => {
  it("serves a person and a machine at one URL, with the pointer and the floors", async () => {
    const html = await (await SELF.fetch(`${BASE}/observatory`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("The observatory");
    expect(html).toContain("never by count");
    expect(html).toContain("/corrections");
    expect(html).toContain(`Porch writes a minute: ${OBSERVATORY_PORCH_WRITES_PER_MINUTE}`);
    const response = await SELF.fetch(`${BASE}/observatory`, { headers: { Accept: "application/json" } });
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, any>;
    expect(body.months.length).toBeGreaterThan(0);
    expect(body.floors.ledger_key_cap).toBe(OBSERVATORY_LEDGER_KEY_CAP);
    expect(String(body.corrections)).toContain("/corrections");
    // The key on KV the visit landed under is the one the ledger reads.
    expect(KV_KEYS.metricMonthPrefix(metricsMonth())).toBeTruthy();
  });

  it("is a registered room and a published dataset", () => {
    expect(ROOMS.map((room) => room.path)).toContain("/observatory");
    expect(PUBLISHED_DATASETS.map((dataset) => dataset.path)).toContain("/observatory");
  });
});
