import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth } from "@/lib/metrics";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE QUOTE LEAVES FIRST (the keeper's ruling, 2026-08-27, the
 * worldwide-latency audit — "the probers don't even pay and they
 * log").
 *
 * A bare price-check — GET on a priced door, no payment header — is
 * the path outside monitors and directory probes hit all day, and
 * every one of them used to wait on our challenge tally crossing to
 * KV's central storage before the 402 went out. The ruling: the 402
 * is the product, the count is bookkeeping, and on this branch the
 * count now rides ctx.waitUntil.
 *
 * What must stay true, and what these tests hold:
 *  - the tally still LANDS, within the request's lifetime (a deferred
 *    count that never arrives is an undercount, not a speedup);
 *  - the deferral covers ONLY the bare quote — a refused payment
 *    ATTEMPT keeps its books (tally and decline row both) ahead of
 *    the response, because those are money-adjacent;
 *  - the mechanism is the real one, read at the site, so a refactor
 *    that quietly re-awaits the tally — or quietly defers the decline
 *    — fails a test instead of a latency budget.
 */
describe("the quote leaves first, the tally lands within the request", () => {
  it("a bare price-check's challenge count lands, without the response having waited for it", async () => {
    // The item counter is spread over shards (2026-09-03), so the
    // count is the sum of every key under the item's prefix.
    const prefix = KV_KEYS.metric(metricsMonth(), "402", "hello");
    const count = async (): Promise<number> => {
      const listed = await testEnv.COUNTERS.list({ prefix });
      let total = 0;
      for (const entry of listed.keys) total += Number((await testEnv.COUNTERS.get(entry.name)) ?? "0");
      return total;
    };
    const before = await count();
    const response = await SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: { "User-Agent": "quote-tally-spec/1.0" },
    });
    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    // The contract: lands within the request lifetime. The waitFor IS
    // that contract — a tally that never lands times out here.
    await vi.waitFor(async () => {
      expect(await count()).toBeGreaterThan(before);
    });
  });

  it("the deferral is the gate's own waitUntil, and only on the bare branch — read at the site", async () => {
    /*
     * Rule 46 wants behavior over source, but the behavior here is a
     * timing property a test cannot assert without racing itself. So
     * the site is read the way supported-kinds-warm reads its
     * constructor: the 402 branch defers through executionCtx, and
     * the decline write sits OUTSIDE the deferred closure, on an
     * await of its own.
     */
    const source = (
      await import("../src/lib/payment-gate.ts?raw")
    ).default as unknown as string;
    const site = source.slice(
      source.indexOf("result.response.status === 402"),
      source.indexOf("if (!result.response.isHtml)"),
    );
    expect(site).toContain("c.executionCtx.waitUntil(tally())");
    // The paid-attempt branch stays ahead of the response.
    expect(site).toContain("await tally()");
    expect(site).toContain("await recordPaymentDecline(");
    expect(site).not.toContain("waitUntil(recordPaymentDecline");
  });
});
