import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE CORPUS AS A FEED (2026-09-04, roadmap C6). What this file holds:
 *
 *   - the first signed week has nothing to compare with and says so;
 *   - the second names every change by field — added, removed,
 *     recovered, regressed, a changed route, a changed defect state —
 *     and in the plain changelog, with the denominators;
 *   - a week the chain lacks is a 404 naming the weeks held;
 *   - latest.json is the latest snapshot at a stable address, with the
 *     cite line and Last-Modified, and a conditional GET answers 304.
 */

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function hostRow(host: string, verdict: string, extra: Record<string, unknown> = {}) {
  return { host, url: `https://${host}/api/buy/x`, verdict, failed: [], advisories: [], source: "discovery", ...extra };
}

async function seedWeek(week: string, hosts: Record<string, unknown>[]): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify({ week, at: `2026-08-${week === "2026-W35" ? "30" : "23"}T11:00:00.000Z`, listed_resources: hosts.length, coverage_suspect: false, hosts } as unknown as WardRound),
  );
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

async function clearCorpus(): Promise<void> {
  for (const ns of [testEnv.ORDERS, testEnv.COUNTERS]) {
    let cursor: string | undefined;
    do {
      const page = await ns.list({ cursor });
      for (const key of page.keys) await ns.delete(key.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

describe("the changes, week by week", () => {
  beforeEach(clearCorpus);

  it("the first week has nothing to compare with; the second names every change by field and in the changelog", async () => {
    await seedWeek("2026-W34", [
      hostRow("a.test", "ready", { offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.001 } }),
      hostRow("b.test", "not_ready", { failed: ["status-402"] }),
      hostRow("c.test", "ready"),
      hostRow("gone.test", "ready"),
    ]);
    await seedWeek("2026-W35", [
      hostRow("a.test", "ready", { offer: { networks: ["eip155:8453", "eip155:137"], schemes: ["exact"], min_usdc: 0.002 } }),
      hostRow("b.test", "ready"),
      hostRow("c.test", "not_ready", { failed: ["accepts"] }),
      hostRow("new.test", "ready"),
    ]);
    const first = (await (await SELF.fetch(`${BASE}/corpus/changes/2026-W34.json`)).json()) as Record<string, any>;
    expect(first.previous).toBeNull();
    expect(first.changelog[0]).toMatch(/first signed week/);
    expect(first.hosts_in_week).toBe(4);
    const response = await SELF.fetch(`${BASE}/corpus/changes/2026-W35.json`);
    expect(response.headers.get("last-modified")).toBeTruthy();
    const second = (await response.json()) as Record<string, any>;
    expect(second.previous.week).toBe("2026-W34");
    expect(second.additions).toEqual(["new.test"]);
    expect(second.removals).toEqual(["gone.test"]);
    expect(second.recoveries).toEqual([{ host: "b.test", from: "not_ready", to: "ready" }]);
    expect(second.regressions).toEqual([{ host: "c.test", from: "ready", to: "not_ready" }]);
    expect(second.changed_payment_routes).toEqual([{ host: "a.test", field: "networks", from: ["eip155:8453"], to: ["eip155:8453", "eip155:137"] }]);
    expect(second.changed_prices).toEqual([{ host: "a.test", field: "min_usdc", from: 0.001, to: 0.002 }]);
    expect(second.changed_defect_state).toEqual([
      { host: "b.test", added: [], cleared: ["status-402"] },
      { host: "c.test", added: ["accepts"], cleared: [] },
    ]);
    expect({ week: second.hosts_in_week, previous: second.hosts_in_previous, both: second.hosts_in_both }).toEqual({ week: 4, previous: 4, both: 3 });
    const log: string = second.changelog.join("\n");
    for (const line of ["Newly listed by a feed: new.test.", "No longer listed by any feed: gone.test.", "b.test answered ready this week after not_ready last week.", "c.test answered not_ready this week after ready last week.", "a.test changed its networks", "c.test now fails accepts.", "b.test no longer fails status-402."]) {
      expect(log).toContain(line);
    }
    expect(second.cite).toMatch(/^scvd\.store, corpus changes, week 2026-W35/);
    expect(JSON.stringify(second)).not.toMatch(/\b(score|rating|rank)\b/i);
    const missing = await SELF.fetch(`${BASE}/corpus/changes/2020-W01.json`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as Record<string, any>).known_weeks).toEqual(["2026-W34", "2026-W35"]);
  });

  it("latest.json is the latest snapshot at a stable address, with the cite and Last-Modified, and a conditional GET answers 304", async () => {
    const empty = await SELF.fetch(`${BASE}/corpus/latest.json`);
    expect(empty.status).toBe(404);
    await seedWeek("2026-W34", [hostRow("a.test", "ready")]);
    await seedWeek("2026-W35", [hostRow("a.test", "ready"), hostRow("b.test", "ready")]);
    const response = await SELF.fetch(`${BASE}/corpus/latest.json`);
    expect(response.status).toBe(200);
    const etag = response.headers.get("etag");
    expect(etag).toBeTruthy();
    const body = (await response.json()) as Record<string, any>;
    // The snapshot's own taken_at, not the round's clock: the date a subscriber revalidates against.
    expect(response.headers.get("last-modified")).toBe(new Date(body.snapshot.taken_at).toUTCString());
    expect(body.snapshot.week).toBe("2026-W35");
    expect(body.stable_address).toBe(`${BASE}/corpus/${body.snapshot.sequence}.json`);
    expect(body.changes_this_week).toBe(`${BASE}/corpus/changes/2026-W35.json`);
    expect(body.cite).toContain("the latest");
    const again = await SELF.fetch(`${BASE}/corpus/latest.json`, { headers: { "If-None-Match": etag! } });
    expect(again.status).toBe(304);
    const index = await SELF.fetch(`${BASE}/corpus.json`);
    expect(index.headers.get("last-modified")).toBeTruthy();
    const landing = (await (await SELF.fetch(`${BASE}/corpus`, { headers: { Accept: "application/json" } })).json()) as Record<string, any>;
    expect(landing.latest).toBe(`${BASE}/corpus/latest.json`);
    expect(landing.subscribe.notebook).toContain("corpus-recompute.ipynb");
  });
});
