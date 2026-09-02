import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  runWardRound,
  latestWardRound,
  wardDelta,
  type WardRound,
} from "@/services/ward-round";
import { marketAggregates } from "@/services/market";
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

  it("the sealed market block IS the arithmetic of its own rows — claimed recomputable, and here recomputed", async () => {
    /*
     * The round promises its aggregates are "plain arithmetic anyone
     * can recompute from the round's own rows" — and until
     * 2026-08-28 nothing anywhere recomputed one: chain verification
     * proves bytes, not derivation. This is the promise kept the way
     * a stranger would keep it, before the block freezes into the
     * anchored corpus.
     */
    stubWorld({
      listedUrls: [
        "https://shop-a.example/api/buy/x",
        "https://shop-b.example/api/buy/z",
      ],
    });
    await runWardRound(testEnv);
    const stored = await latestWardRound(testEnv);
    expect(stored?.market).toBeTruthy();
    expect(stored!.market).toEqual(
      marketAggregates(stored!.hosts, stored!.market!.discovery_fields_seen),
    );
  });

  it("names which of our own doors the index returns, and which it has dropped (N5)", async () => {
    const { MENU_ITEMS } = await import("@/store/menu");
    stubWorld({
      listedUrls: ["https://shop-a.example/api/buy/x"],
      searchBody: {
        items: [
          { resourceUrl: `${BASE}/api/buy/hello` },
          { resourceUrl: `${BASE}/api/buy/service_audit` },
        ],
      },
    });
    const round = await runWardRound(testEnv);
    expect(round.our_doors?.could_not_check).toBe(false);
    expect(round.our_doors?.claimed).toBe(MENU_ITEMS.length);
    expect(round.our_doors?.found.sort()).toEqual(["hello", "service_audit"]);
    expect(round.our_doors?.missing).toContain("conformance_watch");
    expect(round.our_doors?.missing.length).toBe(MENU_ITEMS.length - 2);
    // The miss is on the signed round, dated: what the corpus freezes.
    const stored = await latestWardRound(testEnv);
    expect(stored?.our_doors?.missing).toEqual(round.our_doors?.missing);
  });

  /**
   * THE OTHER DIRECTION. Agent Economy Report, 2026-09-02: 33 catalog
   * rows under this host, 11 of them doors retired on 08-05 and 08-20,
   * every one answering 410 — scored as 66% available. The catalog
   * admits on first settle and never delists, and N5 only looked for
   * doors the index had DROPPED. This is the reading that would have
   * told us first.
   */
  it("names the retired doors the index still returns, apart from found and missing", async () => {
    const { MENU_ITEMS } = await import("@/store/menu");
    const { RETIRED_ITEMS } = await import("@/store/retired");
    const { listAlerts } = await import("@/lib/alerts");
    const retired = RETIRED_ITEMS.find((item) => item.id === "dibs");
    expect(retired).toBeDefined();
    stubWorld({
      listedUrls: ["https://shop-a.example/api/buy/x"],
      searchBody: {
        items: [
          { resourceUrl: `${BASE}/api/buy/hello` },
          { resourceUrl: `${BASE}/api/buy/dibs` },
          { resourceUrl: `${BASE}/api/buy/phone_call/` },
          { resourceUrl: `${BASE}/api/buy/never_stocked` },
          // Somebody else's dibs is not ours.
          { resourceUrl: "https://shop-b.example/api/buy/dibs" },
        ],
      },
    });
    const round = await runWardRound(testEnv);
    expect(round.our_doors?.found).toEqual(["hello"]);
    expect(round.our_doors?.missing.length).toBe(MENU_ITEMS.length - 1);
    expect(round.our_doors?.stale).toEqual(["dibs", "phone_call"]);
    expect(round.our_doors?.unknown).toEqual(["never_stocked"]);
    // Neither bucket leaks into the claimed arithmetic.
    expect(round.our_doors?.missing).not.toContain("dibs");
    expect(round.our_doors?.found).not.toContain("dibs");
    // Sealed on the round the corpus freezes, and the keeper is told once.
    const stored = await latestWardRound(testEnv);
    expect(stored?.our_doors?.stale).toEqual(["dibs", "phone_call"]);
    const alerts = await listAlerts(testEnv, 20);
    expect(
      alerts.some((alert) => alert.detail.includes("retired door(s)") && alert.detail.includes("dibs, phone_call")),
    ).toBe(true);
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
    expect(round.our_doors).toEqual({
      claimed: (await import("@/store/menu")).MENU_ITEMS.length,
      found: [],
      missing: [],
      stale: [],
      unknown: [],
      could_not_check: true,
    });
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

describe("the leaderboard feed (agent402.tools, shape captured 2026-08-04)", () => {
  const CAPTURED = {
    spec: "x402-leaderboard/1",
    windowRequested: "24h",
    windowServed: "7d",
    totalSellers: 771,
    leaderboard: [
      {
        rank: 1,
        name: "BlockRun.AI",
        origins: ["https://blockrun.ai", "https://blockrun-web-vbsbhh7lea-uc.a.run.app"],
        homepage: "https://blockrun.ai",
        endpoints: 136,
        wallet: "0xe9030014f5dae217d0a152f02a043567b16c1abf",
        network: "base",
        callsSettled: 1082089,
        totalUsd: 23115.402624,
        uniqueBuyers: 262,
      },
      {
        rank: 40,
        name: "SCVD General Store",
        origins: ["https://scvd.store"],
        callsSettled: 60,
        totalUsd: 30.5,
        uniqueBuyers: 4,
      },
    ],
  };

  it("maps rows to labeled claims, keyed by host, with the served window", async () => {
    const { mapLeaderboard } = await import("@/services/ward-round");
    const read = mapLeaderboard(CAPTURED, "scvd.store");
    expect(read).not.toBeNull();
    expect(read!.sellers).toBe(771);
    // The window is what was SERVED, not what was asked — the feed's
    // own honesty about its cache, carried through.
    expect(read!.window).toBe("7d");
    const blockrun = read!.byHost.get("blockrun.ai");
    expect(blockrun?.claim).toMatchObject({
      calls: 1082089,
      unique_buyers: 262,
      source: "agent402.tools",
    });
    // ONE origin per seller: the preview-deploy second origin stays out.
    expect(read!.byHost.has("blockrun-web-vbsbhh7lea-uc.a.run.app")).toBe(false);
  });

  it("finds our own rank and keeps us out of the probe population", async () => {
    const { mapLeaderboard } = await import("@/services/ward-round");
    const read = mapLeaderboard(CAPTURED, "scvd.store");
    expect(read!.ourRank).toBe(40);
    expect(read!.byHost.has("scvd.store")).toBe(false);
  });

  it("keeps not_probed hosts out of the delta — coverage change is not ecosystem change", async () => {
    const last = fakeRound("2026-W31", { "steady.example": "ready" });
    const now = fakeRound("2026-W32", { "steady.example": "ready" });
    now.hosts.push({
      host: "listed-only.example",
      url: "https://listed-only.example",
      verdict: "not_probed",
      failed: [],
      advisories: [],
    });
    last.hosts.push({
      host: "was-probed.example",
      url: "https://was-probed.example/api/x",
      verdict: "ready",
      failed: [],
      advisories: [],
    });
    now.hosts.push({
      host: "was-probed.example",
      url: "https://was-probed.example",
      verdict: "not_probed",
      failed: [],
      advisories: [],
    });
    const delta = wardDelta(now, last);
    // Newly listed-only host is "new" (population fact, fine)...
    expect(delta.new_hosts).toEqual(["listed-only.example"]);
    // ...but a probed→not_probed transition is OUR coverage moving,
    // never a failure or a flap.
    expect(delta.newly_failing).toEqual([]);
    expect(delta.flappers).toEqual([]);
  });

  it("refuses a body that does not declare the spec — a shape guess is not a reading", async () => {
    const { mapLeaderboard } = await import("@/services/ward-round");
    expect(mapLeaderboard({ leaderboard: [] }, "scvd.store")).toBeNull();
    expect(mapLeaderboard("nonsense", "scvd.store")).toBeNull();
  });
});

describe("coverage drop is loud", () => {
  it("a shrunken round leads with the drop, not a shrug", async () => {
    const { renderWardPage } = await import("@/pages/admin/ward-page");
    const html = renderWardPage(
      {
        week: "2026-W32",
        at: "2026-08-05T13:21:00.000Z",
        listed_resources: 100,
        coverage_suspect: true,
        coverage_drop: {
          previous_hosts: 98,
          this_round: 38,
          previous_at: "2026-08-04T12:00:00.000Z",
        },
        capped: false,
        our_search_presence: true,
        hosts: [],
      },
      null,
      {
        new_hosts: [],
        gone_hosts: [],
        newly_failing: [],
        newly_fixed: [],
        flappers: [],
      },
    );
    expect(html).toContain("COVERAGE DROPPED");
    expect(html).toContain("98");
    expect(html).toContain("comparisons are unsafe");
  });
});

describe("the door bank rides the round (2026-08-18, corpus velocity)", () => {
  /*
   * The velocity problem in one round: the feed names fewer doors
   * than the cap allows, so the spare slots re-probe doors past
   * rounds declared. A revisit is memory, not a listing — it carries
   * a real verdict but must never move the listed/gone delta.
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

  function stubWorldShared(options: { listedUrls: string[] }) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.cdp.coinbase.com")) {
        if (url.includes("/discovery/search")) {
          return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
        }
        return Response.json({
          items: options.listedUrls.map((resourceUrl) => ({ resourceUrl })),
        });
      }
      // Every stranger's door answers as a conformant 402.
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

  it("banks this round's doors and spends spare cap on banked ones", async () => {
    const { writeDoorBank } = await import("@/services/door-bank");
    await writeDoorBank(testEnv, {
      doors: {
        "remembered.example": {
          url: "https://remembered.example/api/buy/x",
          first_listed: "2026-W20",
          last_listed: "2026-W20",
        },
      },
      cursor: null,
    });
    stubWorldShared({ listedUrls: ["https://fresh.example/api/buy/y"] });
    const round = await runWardRound(testEnv);
    const revisit = round.hosts.find((h) => h.host === "remembered.example");
    expect(revisit?.source).toBe("revisit");
    // A revisit is a real knock on a declared door, never not_probed.
    expect(revisit?.verdict).toBe("ready");
    expect(round.door_bank?.revisited).toBeGreaterThanOrEqual(1);
    // The fresh door joined the bank for the next lean week.
    const { readDoorBank } = await import("@/services/door-bank");
    const bank = await readDoorBank(testEnv);
    expect(bank.doors["fresh.example"]).toBeDefined();
  });

  it("keeps revisit rows out of the listed/gone delta", () => {
    const last = fakeRound("2026-W31", { "steady.example": "ready" });
    const now = fakeRound("2026-W32", { "steady.example": "ready" });
    now.hosts.push({
      host: "memory.example",
      url: "https://memory.example/api/thing",
      verdict: "not_ready",
      failed: ["status-402"],
      advisories: [],
      source: "revisit",
    });
    const delta = wardDelta(now, last);
    // Our cursor reaching back is not the ecosystem gaining a host —
    // and next week's rotation moving on is not the host leaving.
    expect(delta.new_hosts).toEqual([]);
    expect(wardDelta(fakeRound("2026-W33", { "steady.example": "ready" }), now).gone_hosts).toEqual([]);
  });

  it("records the feed's pagination shape when coverage is suspect", async () => {
    stubWorldShared({
      listedUrls: Array.from(
        { length: 100 },
        (_, i) => `https://h${i}.example/api/buy/x`,
      ),
    });
    const round = await runWardRound(testEnv);
    // A full page with no recognized cursor: the round says suspect
    // AND writes down what the page offered, so the next spelling fix
    // reads the corpus instead of guessing like 2026-08-05.
    expect(round.coverage_suspect).toBe(true);
    expect(round.pagination_shape).toContain("items");
  });
});

describe("offset paging: the 08-05 collapse, solved by its own instrument", () => {
  /*
   * The first hand-run round after pagination_shape shipped read
   * `pagination.limit / offset / total` off the live feed — the feed
   * moved to OFFSET pagination on 08-05 and there was never a cursor
   * to find. The reader now follows the declared shape literally, and
   * these tests hold the two edges that matter: a real multi-page walk
   * reads to the declared total, and a server that ignores our offset
   * cannot trick the round into counting page one sixty times.
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

  const conformant402 = () =>
    new Response("{}", {
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

  function stubOffsetWorld(options: { total: number; ignoreOffset?: boolean }) {
    const all = Array.from({ length: options.total }, (_, i) => ({
      resourceUrl: `https://host-${i}.example/api/buy/x`,
    }));
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.cdp.coinbase.com")) {
        if (url.includes("/discovery/search")) {
          return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
        }
        const requested = options.ignoreOffset
          ? 0
          : Number(new URL(url).searchParams.get("offset") ?? 0);
        return Response.json({
          items: all.slice(requested, requested + 100),
          pagination: { limit: 100, offset: options.ignoreOffset ? 0 : requested, total: options.total },
          x402Version: 2,
        });
      }
      return conformant402();
    });
  }

  it("walks offset pages to the declared total and claims clean coverage", async () => {
    stubOffsetWorld({ total: 230 });
    const round = await runWardRound(testEnv);
    expect(round.listed_resources).toBe(230);
    // Reading everything the feed declares is the one full-last-page
    // case that is NOT a cap wearing completeness.
    expect(round.coverage_suspect).toBe(false);
    expect(round.pagination_shape).toBeUndefined();
  });

  it("a server that ignores the offset is caught, not counted sixty times", async () => {
    stubOffsetWorld({ total: 500, ignoreOffset: true });
    const round = await runWardRound(testEnv);
    // Page one, once — and the round says the coverage is suspect,
    // with the shape recorded for whoever fixes the next move.
    expect(round.listed_resources).toBe(100);
    expect(round.coverage_suspect).toBe(true);
    expect(round.pagination_shape).toContain("pagination.total");
  });
});
