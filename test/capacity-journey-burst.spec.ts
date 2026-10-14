import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

describe("local warm mixed discovery and quote bursts", () => {
  beforeAll(async () => {
    installFacilitatorMock();
    // Cold SELF bursts currently fail with cross-request I/O inside the
    // Worker/Vitest boundary. Keep that diagnostic reproducible separately;
    // this warm regression test makes no cold or production capacity claim.
    if (process.env.SCVD_COLD_BURST !== "1") {
      const warm = await SELF.fetch("https://scvd.store/api/buy/hello");
      expect(warm.status).toBe(402);
      await warm.arrayBuffer();
    }
  });
  for (const concurrency of [10, 25, 50]) {
    it(`answers ${concurrency} simultaneous journeys without losing quotes`, async () => {
      const began = performance.now();
      const timings: number[] = [];
      await Promise.all(Array.from({ length: concurrency }, async () => {
        const start = performance.now();
        const catalogue = await SELF.fetch("https://scvd.store/menu.json");
        expect(catalogue.status).toBe(200);
        await catalogue.arrayBuffer();
        const quote = await SELF.fetch("https://scvd.store/api/buy/hello");
        expect(quote.status).toBe(402);
        expect(quote.headers.has("PAYMENT-REQUIRED")).toBe(true);
        await quote.arrayBuffer();
        timings.push(performance.now() - start);
      }));
      timings.sort((a, b) => a - b);
      console.info(JSON.stringify({ benchmark: "local_mocked_discovery_quote", concurrency,
        requests: concurrency * 2, wall_ms: Math.round(performance.now() - began),
        journey_p95_ms: Math.round(timings[Math.ceil(timings.length * .95) - 1]!),
        production_capacity_proven: false, payments_made: 0 }));
    });
  }
});
