import { describe, expect, it, vi } from "vitest";
import { ScheduledJobs } from "@/lib/scheduled-jobs";
import workerSource from "../src/index.ts?raw";

describe("scheduled storage working sets", () => {
  it("starts one deferred job at a time and waits for its reads to finish", async () => {
    const jobs = new ScheduledJobs(vi.fn());
    const events: string[] = [];
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    for (const name of ["archive", "ledger", "watches"]) jobs.add(name, async () => {
      active++;
      peak = Math.max(peak, active);
      events.push(name);
      if (name === "archive") await held;
      active--;
    });
    expect(events).toEqual([]);
    const done = jobs.run();
    const started = [...events];
    release();
    await done;
    expect(started).toEqual(["archive"]);
    expect(events).toEqual(["archive", "ledger", "watches"]);
    expect(peak).toBe(1);
  });

  it("pages a rejected import or job and continues even when alert delivery fails", async () => {
    const failure = new Error("fixture import failed");
    const report = vi.fn(async () => { throw new Error("fixture alert unavailable"); });
    const next = vi.fn(async () => undefined);
    const jobs = new ScheduledJobs(report);
    jobs.add("broken", async () => { throw failure; });
    jobs.add("paid-obligation", next);
    await jobs.run();
    expect(report).toHaveBeenCalledWith("broken", failure);
    expect(next).toHaveBeenCalledOnce();
  });

  it("defers the production sweeps, drains them, and leaves the statistics trigger isolated", () => {
    const scheduled = workerSource.slice(workerSource.indexOf("scheduled:"));
    expect(scheduled).not.toContain("ctx.waitUntil(");
    expect(scheduled).toContain('jobs.add("corpus-anchors", () =>');
    expect(scheduled).toContain("await jobs.run()");
    expect(scheduled.indexOf("return;", scheduled.indexOf("PUBLIC_STATISTICS_CRON"))).toBeLessThan(scheduled.indexOf("new ScheduledJobs"));
  });
});
