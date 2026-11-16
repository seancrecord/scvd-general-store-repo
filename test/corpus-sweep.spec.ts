import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { listAlerts } from "@/lib/alerts";
import { sealStoredWeek, takeCorpusSnapshot, unsealedStoredWeeks, verifyCorpusChain } from "@/services/corpus";
import { sweepCorpusSnapshots } from "@/services/corpus-sweep";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const e = env as unknown as Env;
const now = new Date("2026-11-16T12:30:00Z");
const calendar = { now, calendars: ["https://calendar.test"], fetch: (async () => new Response(new Uint8Array([1,2,3]))) as typeof fetch };
function round(week: string, at: string): WardRound {
  return { week, at, listed_resources: 0, coverage_suspect: false, capped: false, our_search_presence: true, hosts: [] };
}
async function store(week: string, at: string, latest = false): Promise<void> {
  const value = JSON.stringify(round(week, at));
  await e.COUNTERS.put(KV_KEYS.wardRound(week), value);
  if (latest) await e.COUNTERS.put(KV_KEYS.wardRoundLatest, value);
}
async function clear(prefix: string): Promise<void> {
  const rows = await e.COUNTERS.list({ prefix });
  await Promise.all(rows.keys.map(k => e.COUNTERS.delete(k.name)));
}
beforeEach(async () => {
  vi.setSystemTime(now);
  await clear(KV_KEYS.corpusPrefix);
  await clear(KV_KEYS.wardRoundPrefix);
  await clear("alert:");
  await clear("alert_log:");
  await e.COUNTERS.delete(KV_KEYS.wardRoundLatest);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("hourly corpus sealing", () => {
  it("seals one stored week per sweep, oldest first, and a repeat writes nothing", async () => {
    await store("2026-W44", "2026-11-01T11:01:00Z");
    await store("2026-W45", "2026-11-08T11:01:00Z");
    await store("2026-W46", "2026-11-15T11:01:00Z", true);
    await sweepCorpusSnapshots(e, calendar);
    expect(await unsealedStoredWeeks(e)).toEqual(["2026-W45", "2026-W46"]);
    await sweepCorpusSnapshots(e, calendar);
    await sweepCorpusSnapshots(e, calendar);
    const put = vi.spyOn(e.COUNTERS, "put");
    await sweepCorpusSnapshots(e, calendar);
    expect(put).not.toHaveBeenCalled();
    expect((await verifyCorpusChain(e)).intact).toBe(true);
  });

  it("pages by week before retrying a seal that survived a sweep without completing", async () => {
    await store("2026-W46", "2026-11-16T12:01:00Z");
    // The pointer exists, but its host object is unreadable. The round ran;
    // this cannot be silently treated as no work waiting.
    await e.COUNTERS.put(KV_KEYS.wardRound("2026-W46"), JSON.stringify({ ...round("2026-W46", "2026-11-16T12:01:00Z"), hosts_r2_key: "missing-hosts" }));
    await sweepCorpusSnapshots(e, calendar);
    vi.setSystemTime(new Date("2026-11-16T13:30:00Z"));
    let pagedBeforeRetry = false;
    const bucket = new Proxy(e.CORPUS_R2!, {
      get(target, prop) {
        if (prop === "get") return async (...args: unknown[]) => {
          if (args[0] === "missing-hosts") {
            const alerts = await listAlerts(e);
            pagedBeforeRetry = alerts.some(a => a.identity === "worker_health:corpus-unsealed:2026-W46" && a.detail.includes("more than one hourly sweep"));
          }
          return Reflect.apply(target.get, target, args);
        };
        const value: unknown = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await sweepCorpusSnapshots({ ...e, CORPUS_R2: bucket }, { ...calendar, now: new Date() });
    expect(pagedBeforeRetry, "the overdue page must precede work a runtime kill could interrupt").toBe(true);
    const alerts = await listAlerts(e);
    expect(alerts.some(a => a.identity === "worker_health:corpus-unsealed:2026-W46" && a.detail.includes("2026-W46"))).toBe(true);
  });

  it("lists trailing gaps through the latest stored round, including that round itself", async () => {
    await store("2026-W43", "2026-10-25T11:01:00Z", true);
    await takeCorpusSnapshot(e, calendar);
    await store("2026-W44", "2026-11-01T11:01:00Z");
    await store("2026-W46", "2026-11-15T11:01:00Z", true);
    const response = await SELF.fetch("https://scvd.store/corpus.json");
    const body = await response.json() as { continuity: { weeks_missing: string[] } };
    expect(body.continuity.weeks_missing).toEqual(["2026-W44", "2026-W45", "2026-W46"]);
    await sealStoredWeek(e, "2026-W44", calendar);
    const next = await (await SELF.fetch("https://scvd.store/corpus.json")).json() as typeof body;
    expect(next.continuity.weeks_missing).toEqual(["2026-W45", "2026-W46"]);
  });

  it("blocks a later stored week when an earlier week has disappeared", async () => {
    await store("2026-W43", "2026-10-25T11:01:00Z", true);
    await takeCorpusSnapshot(e, calendar);
    await store("2026-W45", "2026-11-08T11:01:00Z", true);
    await sweepCorpusSnapshots(e, calendar);
    expect(await unsealedStoredWeeks(e)).toEqual(["2026-W45"]);
    expect((await listAlerts(e)).some(a => a.identity === "worker_health:corpus-unsealed:2026-W44")).toBe(true);
  });

  it("does not hydrate the archive to discover that there is no waiting week", async () => {
    await store("2026-W46", "2026-11-15T11:01:00Z", true);
    await takeCorpusSnapshot(e, calendar);
    const archive = vi.spyOn(e.CORPUS_R2!, "get");
    await sweepCorpusSnapshots(e, calendar);
    expect(archive).not.toHaveBeenCalled();
  });
});

it.each([false, true])("appends Sunday's newer round after a hand-run seal (legacy pointer: %s)", async (legacy) => {
  await store("2026-W46", "2026-11-10T11:01:00Z", true);
  await takeCorpusSnapshot(e, calendar);
  if (legacy) {
    const rows = await e.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
    const key = rows.keys[0]!.name;
    const pointer = await e.COUNTERS.get<Record<string, unknown>>(key, "json");
    delete pointer!.round_at;
    await e.COUNTERS.put(key, JSON.stringify(pointer));
  }
  await store("2026-W46", "2026-11-15T11:01:00Z", true);
  expect(await unsealedStoredWeeks(e)).toEqual(["2026-W46"]);
  await sweepCorpusSnapshots(e, calendar);
  const records = (await import("@/services/corpus")).listCorpus;
  expect((await records(e)).map(r => r.snapshot.round.at)).toEqual(["2026-11-10T11:01:00Z", "2026-11-15T11:01:00Z"]);
  expect(await unsealedStoredWeeks(e)).toEqual([]);
  expect((await verifyCorpusChain(e)).intact).toBe(true);
});
