import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { wardDeadMan } from "@/services/health";
import type { Env } from "@/types";
vi.mock("@/lib/alerts", () => ({ sendAlert: vi.fn(async () => undefined) }));
const e = env as unknown as Env;
const now = new Date("2026-11-16T15:30:00Z");
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());
it("checks an R2-backed round's age without fetching its host rows", async () => {
  await e.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify({
    week: "2026-W46", at: "2026-11-15T11:00:00Z", hosts: [], hosts_count: 6087,
    hosts_r2_key: "ward/2026-W46/hosts.json",
  }));
  const get = vi.fn(async () => { throw new Error("the health check must not download hosts"); });
  const checked = { ...e, CORPUS_R2: { get } as unknown as R2Bucket };
  await expect(wardDeadMan(checked)).resolves.toBeUndefined();
  expect(get).not.toHaveBeenCalled();
});

it("still pages a stale round when the host archive is unavailable", async () => {
  await e.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify({
    week: "2026-W43", at: "2026-10-25T11:00:00Z", hosts: [], hosts_count: 5349,
    hosts_r2_key: "ward/2026-W43/hosts.json",
  }));
  const get = vi.fn(async () => { throw new Error("fixture archive unavailable"); });
  await wardDeadMan({ ...e, CORPUS_R2: { get } as unknown as R2Bucket });
  expect(get).not.toHaveBeenCalled();
  expect(sendAlert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ condition: "worker_health" }));
});
