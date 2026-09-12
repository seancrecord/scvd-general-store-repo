import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { watchRoutes } from "@/routes/watch";
import { startWatch, WATCH_DURATION_HOURS, type WatchHistory } from "@/services/standing-watch";
import { KV_KEYS } from "@/lib/kv-keys";
import { publishWatch } from "@/services/watch-recovery";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const START = Date.parse("2026-09-01T12:00:00Z");
const TERM = WATCH_DURATION_HOURS * 3600_000;
const testEnv = env as Env;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

async function history(id: string, accept: string) {
  const response = await watchRoutes.request(`${BASE}/api/watch/${id}`, {
    headers: { Accept: accept },
  }, testEnv);
  expect(response.status).toBe(200);
  return response;
}

it("an active empty watch describes its upcoming observation", async () => {
  const { record } = await startWatch(testEnv, "https://active-watch.example/pay");
  const page = await (await history(record.watch_id, "text/html")).text();
  expect(page).toContain("still running");
  expect(page).toContain("Nothing observed yet");
  expect(page).not.toContain("No observations were recorded during this watch");
});

for (const recoveredAfterExpiry of [false, true]) {
  it(`${recoveredAfterExpiry ? "recovered after expiry" : "original"} empty watch admits its ended term and missed hours`, async () => {
    const { record } = await startWatch(testEnv, "https://ended-watch.example/pay", undefined, {
      purchasedAt: new Date(START).toISOString(),
    });
    vi.setSystemTime(START + TERM + 3600_000);
    if (recoveredAfterExpiry) {
      await testEnv.ORDERS.delete(KV_KEYS.standingWatch(record.watch_id));
      expect((await watchRoutes.request(`${BASE}/api/watch/${record.watch_id}`, {}, testEnv)).status).toBe(404);
      // Restore through the same durable publication path purchase recovery uses.
      await publishWatch(testEnv, { kind: "standing", record });
    }
    const before = await testEnv.ORDERS.get(KV_KEYS.standingWatch(record.watch_id));
    const json = await (await history(record.watch_id, "application/json")).json() as WatchHistory;
    const page = await (await history(record.watch_id, "text/html")).text();
    expect(json.complete).toBe(true);
    expect(json.ends_at).toBe(new Date(START + TERM).toISOString());
    expect(json.summary.hours_unprobed).toBe(WATCH_DURATION_HOURS);
    expect(page).toContain(`${json.summary.hours_unprobed} hours nobody probed`);
    expect(page).toContain("No observations were recorded during this watch");
    expect(page).toContain("Its term has ended");
    expect(page).not.toContain("Nothing observed yet");
    expect(page).not.toContain("first probe lands");
    expect(page).not.toContain("this page fills in as the week goes");
    expect(await testEnv.ORDERS.get(KV_KEYS.standingWatch(record.watch_id))).toBe(before);
  });
}
