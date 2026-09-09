import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { renderWardPage } from "@/pages/admin/ward-page";
import type { WardRound } from "@/services/ward-round";
import { MENU_ITEMS } from "@/store/menu";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

describe("the desk says how visible the store is", () => {
  afterEach(() => vi.unstubAllGlobals());
  function round(missing: string[]): WardRound {
    return {
      week: "2026-W36",
      at: "2026-09-06T11:00:00.000Z",
      listed_resources: 0,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      our_doors: {
        claimed: MENU_ITEMS.length,
        found: MENU_ITEMS.map((item) => item.id).filter((id) => !missing.includes(id)),
        missing,
        could_not_check: false,
      },
      hosts: [],
    };
  }

  it("withdraws legacy missing claims and offers a free live check", async () => {
    const missing = MENU_ITEMS.slice(0, 2).map((item) => item.id);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round(missing)));
    const page = await SELF.fetch(`${BASE}/admin`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Visibility:");
    expect(html).toContain(`${MENU_ITEMS.length - 2} of ${MENU_ITEMS.length}`);
    expect(html).not.toContain("npm run shop");
    expect(html).toContain("not established");
    expect(html).toContain("/admin/ward/index");
    const ward = renderWardPage(round(missing), null, null);
    expect(ward).not.toContain("Re-register");
    expect(ward).toContain("not established");
    expect(ward).toContain("saved weekly reading");
  });

  it("says every door is findable when none is missing", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round([])));
    const page = await SELF.fetch(`${BASE}/admin`, { headers: AUTH });
    const html = await page.text();
    expect(html).toContain(`${MENU_ITEMS.length} of ${MENU_ITEMS.length}`);
    expect(html).toContain("saved weekly reading");
    expect(html).not.toContain("it can find");
  });

  it("the free live check is authenticated, shows current evidence, and leaves the signed round untouched", async () => {
    const ed25519 = await import("@noble/ed25519");
    const seed = new Uint8Array(32).fill(0x42);
    const key = new Uint8Array(64);
    key.set(seed);
    key.set(await ed25519.getPublicKeyAsync(seed), 32);
    testEnv.CDP_API_KEY_ID = "test-key-id";
    testEnv.CDP_API_KEY_SECRET = btoa(String.fromCharCode(...key));
    const saved = JSON.stringify(round(["hello"]));
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, saved);
    let calls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      expect(url.host).toBe("api.cdp.coinbase.com");
      expect(url.pathname).toBe("/platform/v2/x402/discovery/search");
      expect(init?.method ?? "GET").toBe("GET");
      calls++;
      return Response.json({ partialResults: false, resources: MENU_ITEMS.map(item => ({ resource: `${BASE}/api/buy/${item.id}` })) });
    });
    const denied = await SELF.fetch(`${BASE}/admin/ward/index`);
    expect([401, 403]).toContain(denied.status);
    expect(calls).toBe(0);
    const response = await SELF.fetch(`${BASE}/admin/ward/index`, { headers: AUTH });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain(`${MENU_ITEMS.length} of ${MENU_ITEMS.length} payable doors found`);
    expect(html).toContain("This free check does not change a signed round");
    expect(calls).toBe(1);
    expect(await testEnv.COUNTERS.get(KV_KEYS.wardRoundLatest)).toBe(saved);
  });
});
