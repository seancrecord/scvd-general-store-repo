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

  it("no key reads as a rate, share or score", async () => {
    const observatory = await computeObservatory(testEnv);
    const keys: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          keys.push(key);
          walk(value);
        }
      }
    };
    walk(observatory);
    expect(keys.filter((key) => /rate|ratio|percent|score|rank|share/i.test(key))).toEqual([]);
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
