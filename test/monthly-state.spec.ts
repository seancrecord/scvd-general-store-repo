import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { monthOf, statesFromPoints } from "@/services/monthly-state";
import type { WeekPoint } from "@/services/trajectory";
import type { WardRound } from "@/services/ward-round";
import { ROOMS } from "@/store/rooms";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { FREE_DOORS } from "@/store/atlas";
import type { Env } from "@/types";

/**
 * THE STATE OF x402, BY MONTH (2026-09-03, roadmap V5). What this
 * file holds:
 *
 *   - weeks are grouped by the calendar month they were taken in; the
 *     closing reading is the last week's and the door-week totals are
 *     every week's summed, labelled apart;
 *   - defects are summed in door-weeks by registered name, most
 *     frequent first; the month before rides as a reading, never a
 *     share, and the first month has none;
 *   - no key on the artifact reads as a rate, share, score or rank;
 *   - the page serves a person and a machine at one URL, a stable
 *     address per month, and is a room, a dataset and an atlas door.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

function point(week: string, takenAt: string, over: Partial<WeekPoint> = {}): WeekPoint {
  return {
    week,
    sequence: 1,
    digest: "d".repeat(64),
    taken_at: takenAt,
    hosts_listed: 10,
    hosts_probed: 8,
    ready: 5,
    not_ready: 2,
    unreachable: 1,
    not_probed: 2,
    observer_degraded: 0,
    offers_seen: 7,
    networks: { "eip155:8453": 5 },
    failure_classes: {},
    coverage_suspect: false,
    ...over,
  } as WeekPoint;
}

describe("derived from the weeks", () => {
  it("groups by the month a snapshot was taken in, closes on the last week, sums door-weeks, and sets the month before beside", () => {
    const states = statesFromPoints(
      [
        point("2026-W31", "2026-08-02T11:00:00Z", { sequence: 1, ready: 4, failure_classes: { "status-402": 2 } }),
        point("2026-W35", "2026-08-30T11:00:00Z", { sequence: 2, ready: 6, hosts_probed: 9, failure_classes: { "status-402": 1, "x402-version": 1 } }),
        point("2026-W36", "2026-09-06T11:00:00Z", { sequence: 3, ready: 7, hosts_listed: 12, not_probed: 3, coverage_suspect: true }),
      ],
      BASE,
    );
    expect(states.map((state) => state.month)).toEqual(["2026-08", "2026-09"]);
    const august = states[0]!;
    expect(august.weeks.map((week) => week.week)).toEqual(["2026-W31", "2026-W35"]);
    expect(august.closing).toMatchObject({ week: "2026-W35", payable: 6, probed: 9 });
    expect(august.door_weeks).toMatchObject({ rounds: 2, payable: 10, probed: 17 });
    expect(august.defects).toEqual([
      { id: "status-402", title: expect.any(String), door_weeks: 3 },
      { id: "x402-version", title: expect.any(String), door_weeks: 1 },
    ]);
    expect(august.against_the_last).toBeUndefined();
    const september = states[1]!;
    expect(september.against_the_last).toMatchObject({ month: "2026-08", closing: { week: "2026-W35", payable: 6 } });
    expect(september.our_gaps).toEqual({ not_probed_door_weeks: 3, observer_degraded_ticks: 0, coverage_suspect_weeks: 1 });
    expect(september.how_to_rederive).toContain(`${BASE}/corpus/3.json`);
    expect(monthOf({ taken_at: "2026-12-31T23:59:59Z" })).toBe("2026-12");
  });

  it("no key on the artifact reads as a rate, share, score or rank", () => {
    const [state] = statesFromPoints([point("2026-W36", "2026-09-06T11:00:00Z")], BASE);
    const keys: string[] = [];
    const walkKeys = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walkKeys);
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          keys.push(key);
          walkKeys(value);
        }
      }
    };
    walkKeys(state);
    expect(keys.filter((key) => /rate|ratio|percent|score|rank|share/i.test(key))).toEqual([]);
  });
});

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function hostRow(host: string, verdict: string, extra: Record<string, unknown> = {}) {
  return { host, url: `https://${host}/api/buy/x`, verdict, failed: [], advisories: [], ...extra };
}

async function seedWeek(week: string, hosts: Record<string, unknown>[]): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify({ week, at: "2026-08-20T00:00:00.000Z", listed_resources: hosts.length, coverage_suspect: false, hosts } as unknown as WardRound),
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

describe("the page", () => {
  beforeEach(clearCorpus);

  it("says so when the chain holds no month yet, at one URL for a person and a machine", async () => {
    const body = (await (await SELF.fetch(`${BASE}/corpus/month`, { headers: { Accept: "application/json" } })).json()) as Record<string, unknown>;
    expect(body.month).toBeNull();
    expect(body.known_months).toEqual([]);
    expect(String(body.corrections)).toContain("/corrections");
    const missing = await SELF.fetch(`${BASE}/corpus/month/2020-01`, { headers: { Accept: "application/json" } });
    expect(missing.status).toBe(404);
  });

  it("serves the month the seeded weeks fall in, with a stable address and the JSON twin", async () => {
    await seedWeek("2026-W35", [hostRow("a.test", "ready"), hostRow("b.test", "not_ready", { failed: ["status-402"] }), hostRow("c.test", "unreachable")]);
    await seedWeek("2026-W36", [hostRow("a.test", "ready"), hostRow("b.test", "ready"), hostRow("c.test", "not_ready", { failed: ["status-402"] })]);
    const body = (await (await SELF.fetch(`${BASE}/corpus/month`, { headers: { Accept: "application/json" } })).json()) as Record<string, any>;
    const month = new Date().toISOString().slice(0, 7);
    expect(body.month).toBe(month);
    expect(body.weeks.map((week: { week: string }) => week.week)).toEqual(["2026-W35", "2026-W36"]);
    expect(body.closing).toMatchObject({ week: "2026-W36", probed: 3, payable: 2, not_payable: 1 });
    expect(body.door_weeks).toMatchObject({ rounds: 2, probed: 6, payable: 3 });
    expect(body.defects).toEqual([{ id: "status-402", title: expect.any(String), door_weeks: 2 }]);
    expect(body.months_held).toEqual([month]);
    const stable = await SELF.fetch(`${BASE}/corpus/month/${month}`, { headers: { Accept: "text/html" } });
    expect(stable.status).toBe(200);
    const html = await stable.text();
    expect(html).toContain("The state of x402");
    expect(html).toContain("door-weeks");
    expect(html).toContain(`<link rel="canonical" href="${BASE}/corpus/month/${month}">`);
    expect(html).toContain("/corrections");
  });

  it("is a room, a dataset and an atlas door", () => {
    expect(ROOMS.map((room) => room.path)).toContain("/corpus/month");
    expect(PUBLISHED_DATASETS.map((dataset) => dataset.path)).toContain("/corpus/month");
    expect(FREE_DOORS.map((door) => door.path)).toContain("/corpus/month");
  });
});
