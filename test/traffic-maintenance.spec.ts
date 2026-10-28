import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleTrafficCorrections } from "@/services/traffic-maintenance";
import { recomputeCorrections } from "@/services/reclassify";
import { sendAlert } from "@/lib/alerts";
import type { Env } from "@/types";
vi.mock("@/services/reclassify", () => ({ recomputeCorrections: vi.fn(async () => []) }));
vi.mock("@/lib/alerts", () => ({ sendAlert: vi.fn(async () => undefined) }));
const env = {} as Env;
const start = Date.parse("2026-10-23T00:30:00Z");
beforeEach(() => vi.clearAllMocks());

describe("retrospective traffic reporting on a smaller budget", () => {
  it("does four historical scans across a full day of hourly ticks", async () => {
    const pending: Promise<unknown>[] = [];
    for (let hour = 0; hour < 24; hour++) {
      scheduleTrafficCorrections({ cron: "30 * * * *", scheduledTime: start + hour * 3_600_000 }, env, { waitUntil: p => pending.push(p) });
    }
    await Promise.all(pending);
    expect(pending).toHaveLength(4);
    expect(vi.mocked(recomputeCorrections).mock.calls.map(call => call[1]?.getUTCHours())).toEqual([0, 6, 12, 18]);
    for (const call of vi.mocked(recomputeCorrections).mock.calls) expect(call[2]).toEqual({ cache: true });
  });
  it("does not repeat the scan on the statistics or weekly trigger", () => {
    const waitUntil = vi.fn();
    for (const cron of ["15 * * * *", "0 11 * * SUN"]) scheduleTrafficCorrections({ cron, scheduledTime: start }, env, { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(recomputeCorrections).not.toHaveBeenCalled();
  });
  it("still reports a failed scheduled scan", async () => {
    vi.mocked(recomputeCorrections).mockRejectedValueOnce(new Error("fixture storage failure"));
    const pending: Promise<unknown>[] = [];
    scheduleTrafficCorrections({ cron: "30 * * * *", scheduledTime: start }, env, { waitUntil: p => pending.push(p) });
    await Promise.all(pending);
    expect(sendAlert).toHaveBeenCalledWith(env, expect.objectContaining({ condition: "worker_health" }));
  });
});
