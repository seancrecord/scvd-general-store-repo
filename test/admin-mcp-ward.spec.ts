import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { McpRegister, McpWalkState } from "@/services/mcp-ward";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` };
const BROWSER = { ...AUTH, Accept: "text/html" };

/**
 * THE SECOND WARD'S CRANK (the keeper's ask, 2026-09-04: "i also need
 * a way to run the mcp ward separate from the other in admin").
 *
 * Two things are held here and the second matters more than the first.
 *
 * One: the room renders and its cranks work, including on a store
 * where nothing has ever walked — the state a fresh deploy is in, and
 * the state an admin page is most likely to throw on.
 *
 * Two: RESET IS SAFE. It drops an in-flight walk and touches the
 * register not at all, so first_seen and last_seen survive for every
 * host across every pass. A partial pass could never have recorded a
 * delisting anyway, which is exactly why discarding one needs no
 * ceremony — but it must be shown to discard only that.
 */

async function seedWalk(state: Partial<McpWalkState>): Promise<void> {
  const full: McpWalkState = {
    version: 1,
    week: "2026-W36",
    started_at: "2026-09-06T00:00:00.000Z",
    cursor: "somewhere/in/the/registry",
    pages_read: 7,
    servers_seen: 700,
    hosts: ["a.example", "b.example"],
    status_counts: { active: 690, deprecated: 10 },
    truncated: false,
    ...state,
  };
  await testEnv.COUNTERS.put(KV_KEYS.mcpWalkState, JSON.stringify(full));
}

async function seedRegister(): Promise<void> {
  const register: McpRegister = {
    version: 1,
    hosts: {
      "a.example": { first_seen: "t0", last_seen: "t1" },
      "gone.example": { first_seen: "t0", last_seen: "t0", unconfirmed: true },
    },
    last_pass: "2026-W35",
  };
  await testEnv.COUNTERS.put(KV_KEYS.mcpRegister, JSON.stringify(register));
}

describe("the MCP ward has its own room", () => {
  it("renders on a store where nothing has ever walked", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.mcpWalkState);
    await testEnv.COUNTERS.delete(KV_KEYS.mcpRegister);
    const response = await SELF.fetch(`${BASE}/admin/mcp-ward`, { headers: BROWSER });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Advance the MCP walk one batch");
    // Its age, not a measurement of an empty registry.
    expect(html).toContain("No completed pass yet");
  });

  it("shows a pass in flight with how far it has got", async () => {
    await seedWalk({});
    const html = await (
      await SELF.fetch(`${BASE}/admin/mcp-ward`, { headers: BROWSER })
    ).text();
    expect(html).toContain("A pass is in flight");
    expect(html).toContain("7 registry pages read");
  });

  it("says on the page that a truncated pass will record no delisting", async () => {
    await seedWalk({ truncated: true });
    const html = await (
      await SELF.fetch(`${BASE}/admin/mcp-ward`, { headers: BROWSER })
    ).text();
    expect(html).toContain("record NO delisting");
  });

  /**
   * THE SEPARATION, on the console where it is easiest to lose. A
   * single room with both wards' numbers on it is the affordance that
   * eventually gets them added together, most likely by us.
   */
  it("refuses to be read together with the x402 ward, in words", async () => {
    await seedRegister();
    const html = await (
      await SELF.fetch(`${BASE}/admin/mcp-ward`, { headers: BROWSER })
    ).text();
    expect(html).toContain("shares no total");
    expect(html).toContain("/admin/ward");
  });

  it("is reachable from the office nav", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin/ward`, { headers: BROWSER })
    ).text();
    expect(html).toContain('href="/admin/mcp-ward"');
  });
});

describe("the cranks", () => {
  it("advances the walk without touching the x402 ward", async () => {
    const before = await testEnv.COUNTERS.get(KV_KEYS.wardRoundLatest);
    const response = await SELF.fetch(`${BASE}/admin/mcp-ward/run`, {
      method: "POST",
      headers: AUTH,
      redirect: "manual",
    });
    expect([302, 303]).toContain(response.status);
    expect(await testEnv.COUNTERS.get(KV_KEYS.wardRoundLatest)).toBe(before);
  });

  it("reset drops the in-flight walk and keeps the register whole", async () => {
    await seedWalk({});
    await seedRegister();
    const response = await SELF.fetch(`${BASE}/admin/mcp-ward/reset`, {
      method: "POST",
      headers: AUTH,
      redirect: "manual",
    });
    expect([302, 303]).toContain(response.status);
    expect(await testEnv.COUNTERS.get(KV_KEYS.mcpWalkState)).toBeNull();
    // Every host's history survives — that is the whole safety claim.
    const register = await testEnv.COUNTERS.get<McpRegister>(
      KV_KEYS.mcpRegister,
      "json",
    );
    expect(Object.keys(register?.hosts ?? {}).sort()).toEqual([
      "a.example",
      "gone.example",
    ]);
    expect(register?.hosts["a.example"]?.first_seen).toBe("t0");
    expect(register?.last_pass).toBe("2026-W35");
  });
});

describe("the ward page reports on its own instrument", () => {
  it("carries the heartbeat and the source liveness, above the delta", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin/ward`, { headers: BROWSER })
    ).text();
    expect(html).toContain("Is the instrument working?");
    expect(html).toContain("Heartbeat:");
    // And points at the public face rather than being a private-only view.
    expect(html).toContain('href="/sources"');
  });
});
