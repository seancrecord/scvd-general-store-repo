import { describe, expect, it } from "vitest";
import source from "../src/index.ts?raw";
import config from "../wrangler.jsonc?raw";

describe("corpus schedule and compute headroom", () => {
  it("runs the sweep on the existing hourly cron before launching concurrent work", () => {
    const sweep = source.indexOf('if (event.cron === "30 * * * *")');
    const sunday = source.indexOf('if (event.cron === "0 11 * * SUN")');
    expect(sweep).toBeGreaterThan(0);
    expect(source.slice(sweep, sunday)).toContain('await import("@/services/corpus-sweep")');
    expect(source.indexOf('jobs.add(', sweep)).toBeGreaterThan(sunday);
    expect(source.slice(sunday, source.indexOf('THE TRADE RECEIVABLE', sunday))).not.toContain('takeCorpusSnapshot');
  });

  it("allows more CPU than the retained Sunday invocation exhausted", () => {
    // The incident reading is evidence, not a desired configuration value:
    // a limit at or below the observed kill cannot give this job headroom.
    const observedCpuAtKill = 3000;
    const configuredCpu = Number(config.match(/"cpu_ms"\s*:\s*(\d+)/)?.[1]);
    expect(configuredCpu).toBeGreaterThan(observedCpuAtKill);
  });
});
