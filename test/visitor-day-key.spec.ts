import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { visitorDayKey } from "@/lib/visitor-day-key";
import { VOICE } from "@/store";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * A NAMELESS VISITOR LEAVES NO ADDRESS BEHIND (lib/visitor-day-key.ts,
 * 2026-09-21). The bell and the letterbox hold one turn a day; a
 * visitor with no name used to be held under the connecting address,
 * written raw into a key that lived a day, while the trust page said
 * addresses are not stored. The line still holds; the address does not.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

async function keysContaining(prefix: string, needle: string): Promise<string[]> {
  const listed = await testEnv.COUNTERS.list({ prefix });
  return listed.keys.map((k) => k.name).filter((name) => name.includes(needle));
}

describe("the bell", () => {
  it("holds a nameless ringer to one ring a day without keeping its address", async () => {
    const address = "203.0.113.77";
    const ring = (door: "http" | "mcp") =>
      door === "http"
        ? SELF.fetch(`${BASE}/api/bell`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "CF-Connecting-IP": address },
            body: "{}",
          })
        : SELF.fetch(`${BASE}/mcp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "CF-Connecting-IP": address },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ring_bell", arguments: {} } }),
          });
    const first = (await (await ring("http")).json()) as { message: string };
    expect(first.message).not.toBe(VOICE.bellRungAlready);
    const second = (await (await ring("http")).json()) as { message: string };
    expect(second.message).toBe(VOICE.bellRungAlready);
    // The MCP bell is the same bell, keyed the same way: still today's ring.
    const viaMcp = (await (await ring("mcp")).json()) as { result?: { structuredContent?: { message?: string }; content?: { text?: string }[] } };
    expect(JSON.stringify(viaMcp)).toContain(VOICE.bellRungAlready);

    expect(await keysContaining("bell_ring:", address)).toEqual([]);
    const today = new Date().toISOString().slice(0, 10);
    const expected = await visitorDayKey(address, today);
    expect(await keysContaining("bell_ring:", expected)).toHaveLength(1);
  });
});

describe("the letterbox", () => {
  it("holds a nameless correspondent to one letter a day without keeping its address", async () => {
    const address = "198.51.100.9";
    const post = () =>
      SELF.fetch(`${BASE}/api/letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": address },
        body: JSON.stringify({ letter: "A short note, unsigned, for the keeper's Sunday." }),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
    expect(await keysContaining("letter_sent:", address)).toEqual([]);
    const today = new Date().toISOString().slice(0, 10);
    expect(await keysContaining("letter_sent:", await visitorDayKey(address, today))).toHaveLength(1);
  });
});

describe("the key itself", () => {
  it("is a digest of the day and the address, sixteen hex characters, and changes with the day", async () => {
    const a = await visitorDayKey("203.0.113.1", "2026-09-21");
    expect(a).toMatch(/^v:[0-9a-f]{16}$/);
    expect(a).not.toContain("203.0.113.1");
    expect(await visitorDayKey("203.0.113.1", "2026-09-22")).not.toBe(a);
    expect(await visitorDayKey("203.0.113.2", "2026-09-21")).not.toBe(a);
  });
});
