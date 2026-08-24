import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_PROBES_PER_MINUTE,
  PROBES_PER_MINUTE,
} from "@/services/preflight";

const BASE = "https://scvd.store";

/**
 * ROADMAP 0.13 — A LIMIT NOBODY IS TOLD ABOUT IS A TRAP.
 *
 * The free preflight has enforced two ceilings since 2026-08-03: a
 * per-isolate bucket and a global KV backstop. Neither appeared in any
 * response. A caller building against it learned the limit by being
 * refused mid-pipeline, which is the worst moment and the least
 * informative form.
 *
 * The conformance desk already got this right — its `rate_limit`
 * field states the budget AND the tradeoff it makes ("a plain global
 * bucket, which means it bounds our cost rather than allocating
 * fairly between callers, and that trade is deliberate"). This brings
 * the other free instrument onto the same footing.
 *
 * SILENT LIMITING VIOLATES THE STATED-CONDITIONS LAW. Every other
 * number this store publishes carries its own conditions; a ceiling
 * that only reveals itself on refusal is the one exception, and there
 * is no reason for it.
 *
 * DERIVED, NOT TYPED (rule 46). The numbers in the response come from
 * the same constants the limiter enforces, so raising a ceiling
 * cannot leave the published figure behind.
 */
describe("the free preflight states its own ceilings", () => {
  it("publishes both limits on a normal answer", async () => {
    const response = await SELF.fetch(`${BASE}/api/preflight/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://door.example/paid" }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    const limits = body["rate_limit"] as
      | { per_isolate_per_minute?: number; global_per_minute?: number; note?: string }
      | undefined;
    expect(limits, "the ceiling is enforced but never stated").toBeDefined();

    // The published figures ARE the enforced ones.
    expect(limits!.per_isolate_per_minute).toBe(PROBES_PER_MINUTE);
    expect(limits!.global_per_minute).toBe(GLOBAL_PROBES_PER_MINUTE);
  });

  it("says the ceiling is approximate rather than implying precision", async () => {
    /*
     * The global bucket is a read-modify-write on eventually
     * consistent KV: lost increments make it slightly GENEROUS, never
     * tighter than stated. Publishing a round number without that
     * caveat would be a precision claim the mechanism cannot support.
     */
    const response = await SELF.fetch(`${BASE}/api/preflight/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://door.example/paid" }),
    });
    const body = (await response.json()) as {
      rate_limit?: { note?: string };
    };
    const note = String(body.rate_limit?.note ?? "").toLowerCase();
    expect(note).toContain("approximate");
    // And points bulk readers somewhere that does not cost a probe.
    expect(note).toMatch(/corpus|fresh-set|snapshot/);
  });
});
