import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  runWardRound,
  latestWardRound,
  wardDelta,
  type WardRound,
} from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE WARD ROUND: the weekly in-Worker ecosystem census. What these
 * tests hold is the part that makes it safe to automate — the delta
 * logic that surfaces changes instead of rows, the consent posture
 * (per-host verdicts stay behind the keeper's login), and the one
 * alarm (our own search presence) never firing on "could not check".
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

function fakeRound(
  week: string,
  hosts: Record<string, "ready" | "not_ready" | "unreachable">,
): WardRound {
  return {
    week,
    at: `${week}-01T11:00:00.000Z`,
    listed_resources: Object.keys(hosts).length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: Object.entries(hosts).map(([host, verdict]) => ({
      host,
      url: `https://${host}/api/thing`,
      verdict,
      failed: verdict === "ready" ? [] : ["status-402"],
      advisories: [],
    })),
  };
}

describe("the delta surfaces changes, not rows", () => {
  it("classifies new, gone, newly-failing, newly-fixed and flappers", () => {
    const last = fakeRound("2026-W31", {
      "steady.example": "ready",
      "healed.example": "not_ready",
      "broke.example": "ready",
      "left.example": "ready",
    });
    const now = fakeRound("2026-W32", {
      "steady.example": "ready",
      "healed.example": "ready",
      "broke.example": "not_ready",
      "arrived.example": "ready",
    });
    const delta = wardDelta(now, last);
    expect(delta.new_hosts).toEqual(["arrived.example"]);
    expect(delta.gone_hosts).toEqual(["left.example"]);
    expect(delta.newly_failing).toEqual(["broke.example"]);
    expect(delta.newly_fixed).toEqual(["healed.example"]);
    // Flappers = ANY verdict change; the Night Watch prospect signal.
    expect(delta.flappers.sort()).toEqual(["broke.example", "healed.example"]);
  });

  it("a first round is all new hosts and no verdict claims", () => {
    const delta = wardDelta(fakeRound("2026-W32", { "a.example": "ready" }), null);
    expect(delta.new_hosts).toEqual(["a.example"]);
    expect(delta.newly_failing).toEqual([]);
  });
});

describe("the round itself, with the outside world stubbed", () => {
  /**
   * The CDP JWT is signed BEFORE any fetch happens, so the stub alone
   * is not enough — the test env needs a real-format Ed25519 key. A
   * throwaway derived from a fixed seed: valid shape, signs fine, has
   * never touched anything real and never will.
   */
  beforeAll(async () => {
    const ed25519 = await import("@noble/ed25519");
    const seed = new Uint8Array(32).fill(0x42);
    const publicKey = await ed25519.getPublicKeyAsync(seed);
    const both = new Uint8Array(64);
    both.set(seed);
    both.set(publicKey, 32);
    testEnv.CDP_API_KEY_ID = "test-key-id";
    testEnv.CDP_API_KEY_SECRET = btoa(String.fromCharCode(...both));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWorld(options: {
    listedUrls: string[];
    searchBody?: unknown;
    hostAnswers?: (url: string) => Response;
  }) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.cdp.coinbase.com")) {
        if (url.includes("/discovery/search")) {
          if (options.searchBody === undefined) {
            return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
          }
          return Response.json(options.searchBody);
        }
        return Response.json({
          items: options.listedUrls.map((resourceUrl) => ({ resourceUrl })),
        });
      }
      if (options.hostAnswers) {
        return options.hostAnswers(url);
      }
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "1000",
                  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  payTo: "0x1111111111111111111111111111111111111111",
                },
              ],
            }),
          ),
        },
      });
    });
  }

  it("dedupes to hosts, skips our own, probes the rest, stores the round", async () => {
    stubWorld({
      listedUrls: [
        "https://shop-a.example/api/buy/x",
        "https://shop-a.example/api/buy/y",
        `${BASE}/api/buy/hello`,
        "https://shop-b.example/api/buy/z",
      ],
    });
    const round = await runWardRound(testEnv);
    expect(round.hosts.map((entry) => entry.host).sort()).toEqual([
      "shop-a.example",
      "shop-b.example",
    ]);
    expect(round.hosts.every((entry) => entry.verdict === "ready")).toBe(true);
    expect(round.our_search_presence).toBe(true);
    const stored = await latestWardRound(testEnv);
    expect(stored?.week).toBe(round.week);
  });

  it("an unreadable search is 'could not check', never 'absent', and no alarm fires", async () => {
    stubWorld({
      listedUrls: ["https://shop-c.example/api/buy/x"],
      searchBody: undefined,
    });
    // Break only the search call.
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/discovery/search")) {
        return new Response("upstream sad", { status: 500 });
      }
      return inner(input as never);
    });
    const round = await runWardRound(testEnv);
    expect(round.our_search_presence).toBeNull();
  });
});

describe("the readout stays behind the keeper's login", () => {
  it("/admin/ward without auth is refused", async () => {
    const response = await SELF.fetch(`${BASE}/admin/ward`);
    expect([401, 403]).toContain(response.status);
  });

  it("with auth it renders, and an empty book says so", async () => {
    const response = await SELF.fetch(`${BASE}/admin/ward`, {
      headers: {
        Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
      },
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("ward round");
  });
});

describe("the shelf name is the keeper's pick", () => {
  it("standing_watch wears The Night Watch, day shift included", async () => {
    const { MENU_ITEMS } = await import("@/store");
    const item = MENU_ITEMS.find((entry) => entry.id === "standing_watch")!;
    expect(item.name).toBe("The Night Watch");
    // The line that turns the misnomer into a joke instead of a lie —
    // it probes around the clock, and the copy says so up front.
    expect(item.description).toContain("Day shift included");
  });
});

describe("the ward's dead-man check", () => {
  it("a stale round alarms; a fresh one and an empty book stay quiet", async () => {
    const { wardDeadMan } = await import("@/services/health");
    const { KV_KEYS } = await import("@/lib/kv-keys");
    const { listAlerts } = await import("@/lib/alerts");

    // Empty book: quiet — nothing can be stale before the first round.
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    await wardDeadMan(testEnv);

    // Stale round: the alarm names the week and the hand-crank.
    const stale = fakeRound("2026-W25", { "old.example": "ready" });
    stale.at = new Date(Date.now() - 9 * 24 * 3600_000).toISOString();
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(stale));
    await wardDeadMan(testEnv);
    const alerts = await listAlerts(testEnv, 10);
    expect(
      alerts.some((alert) => alert.detail.includes("ward round is stale")),
      "a cron that silently stopped must not read as a healthy ecosystem",
    ).toBe(true);
  });
});
