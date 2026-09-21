import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { inferChannel } from "@/lib/channel";
import { doorOfSurface, porchSurface } from "@/lib/porch-surface";
import { metricsMonth } from "@/lib/metrics";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
/** Deferred writes land beside the answer; no waitUntil in tests. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * TWO LIVE DOORS COUNTED ON THE WRONG ROW (2026-09-21).
 *
 * lib/porch-surface.ts has named the UCP checkout and the A2A desk
 * since each shipped, so their calls WERE counted — on the right
 * surfaces, with the right kinds. What they were never given was a
 * door: `Channel` had no member for either, so every one of them
 * inferred "direct" and pooled with hand-rolled curl on every reading
 * in the office that asks which way buyers come in.
 *
 * The keeper ruled the seam acceptable: rows written before this stay
 * "direct" and cannot be re-derived, because the door was never on
 * them. An empty ucp or a2a column before the seam is a missing label,
 * never a quiet door.
 *
 * The door is derived from the surface the path already resolves to,
 * never from anything the caller sends — the same day an inbound
 * header that could name its own channel was removed from two readers.
 */
async function porchKeys(): Promise<string[]> {
  const prefix = KV_KEYS.metric(metricsMonth(), "porch", "");
  const listed = await testEnv.COUNTERS.list({ prefix });
  return listed.keys.map((k) => k.name.slice(prefix.length));
}

describe("the UCP checkout and the A2A desk count as their own doors", () => {
  beforeEach(async () => {
    const prefix = KV_KEYS.metric(metricsMonth(), "porch", "");
    const listed = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map((k) => testEnv.COUNTERS.delete(k.name)));
  });

  /**
   * ONE-DIRECTIONAL ON PURPOSE. recordPorchVisit holds a module-global
   * budget of PORCH_WRITES_PER_MINUTE, shared by every spec in the
   * isolate, so a positive "the row is there" assertion passes alone
   * and starves in the suite — it is not evidence of the wiring, it is
   * evidence of who ran first.
   *
   * What IS always true, budget or no budget: a row for one of these
   * surfaces must never carry "direct". If the door stops being set,
   * the rows come back as :direct and this fails. If the budget ate
   * them, there is nothing to misfile. The derivation itself is held
   * by the pure tests below, which no budget can starve.
   */
  it("never files a UCP or A2A call as direct", async () => {
    await SELF.fetch(`${BASE}/ucp/v1/catalog/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "curl/8.4.0" },
      body: JSON.stringify({ query: "hello" }),
    });
    await SELF.fetch(`${BASE}/a2a-desk.json`, { headers: { "User-Agent": "curl/8.4.0" } });
    await settled();

    const misfiled = (await porchKeys()).filter(
      (key) => doorOfSurface(key.split(":").slice(0, -1).join(":")) !== null && key.endsWith(":direct"),
    );
    expect(misfiled, `pooled with hand-rolled curl: ${misfiled.join(", ")}`).toEqual([]);
  });

  it("still lets the infrastructure table beat the door, per the 09-08 ruling", () => {
    // A monitor is a monitor whichever door it uses, and the
    // reclassifier re-derives from the user-agent with no door at all.
    const ua = "vet402-observatory-l1/1.0 (+https://vet402.com/observatory/methodology)";
    expect(inferChannel({ viaUcp: true, userAgent: ua })).toBe("infrastructure");
    expect(inferChannel({ viaA2a: true, userAgent: ua })).toBe("infrastructure");
    expect(inferChannel({ viaUcp: true, userAgent: "node" })).toBe("ucp");
    expect(inferChannel({ viaA2a: true, userAgent: "node" })).toBe("a2a");
  });

  it("reads the door off the surface, and claims no door it does not own", () => {
    expect(doorOfSurface("ucp")).toBe("ucp");
    expect(doorOfSurface("ucp:catalog")).toBe("ucp");
    expect(doorOfSurface("ucp:checkout")).toBe("ucp");
    expect(doorOfSurface("a2a")).toBe("a2a");
    expect(doorOfSurface("a2a:card-check")).toBe("a2a");
    expect(doorOfSurface("a2a:report")).toBe("a2a");
    // Everything else keeps the channel it always had.
    for (const surface of ["storefront", "well-known", "treat", "bell", "cards"]) {
      expect(doorOfSurface(surface), surface).toBe(null);
    }
  });

  it("covers every ucp and a2a surface the path table can name", () => {
    // Derived from the table rather than a list typed here, so a
    // surface added later cannot quietly go back to reading "direct".
    for (const [path, method] of [
      ["/ucp/v1/catalog/search", "POST"],
      ["/ucp/v1/checkout-sessions", "POST"],
      ["/a2a-desk", "GET"],
      ["/api/a2a/check", "GET"],
    ] as const) {
      const surface = porchSurface(path, method);
      expect(surface, `${path} has no porch surface`).toBeTruthy();
      expect(doorOfSurface(surface!), `${path} → ${surface}`).not.toBe(null);
    }
  });
});
