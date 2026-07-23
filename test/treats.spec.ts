import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { treatReaction, treatsThisWeek } from "@/services/porch";
import type { Env } from "@/types";

/**
 * The treat rail: free, nothing stored but the count, deterministic
 * Roger. The treat text itself never touches KV.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

describe("the treat rail", () => {
  it("takes a treat for free and counts it", async () => {
    const response = await SELF.fetch(`${BASE}/api/treat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ treat: "one sardine, room temperature" }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["message"]).toContain("one sardine, room temperature");
    expect(String(body["roger"])).toContain("Roger Sterling");
    expect(body["treats_on_the_rail_today"]).toBeGreaterThanOrEqual(1);
    // Only the count is stored; the sardine itself is not.
    const day = new Date().toISOString().slice(0, 10);
    const stored = await testEnv.COUNTERS.get(KV_KEYS.porchTreats(day));
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("sardine");
  });

  it("works without a body too", async () => {
    const response = await SELF.fetch(`${BASE}/api/treat`, {
      method: "POST",
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["message"]).toBe("Left on the porch rail.");
  });

  it("gives everyone in the same hour the same Roger", () => {
    const moment = new Date("2026-07-22T21:30:00Z");
    const sameHour = new Date("2026-07-22T21:55:00Z");
    expect(treatReaction(moment)).toBe(treatReaction(sameHour));
  });

  it("feeds the Gazette an aggregate, nothing more", async () => {
    await SELF.fetch(`${BASE}/api/treat`, { method: "POST" });
    expect(await treatsThisWeek(testEnv)).toBeGreaterThanOrEqual(2);
  });
});
