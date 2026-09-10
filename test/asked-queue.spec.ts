import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import {
  ASKED_FOR_CAP,
  ASKED_FOR_SWEEP_CAP,
  deriveAskedQueue,
  foldAsk,
  isSweepableHost,
  pickSweep,
  readAskedFor,
  recordAsk,
  writeAskedFor,
  type AskedForStore,
} from "@/services/asked-queue";
import { longWalkPass, readLongWalk } from "@/services/long-walk";
import { heldHalfOf } from "@/services/look";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const OWN = "scvd.store";
const T0 = new Date("2026-09-10T10:00:00.000Z");

/**
 * THE ASKED-FOR QUEUE (2026-09-10). What this file holds:
 *
 *   - a miss on the host JSON, the host page and the held half is
 *     recorded by name, with a count and nothing about who asked;
 *   - a hit is not recorded, and a name the sweep could not read is
 *     refused at the fold;
 *   - the store is capped and evicts the longest-unasked;
 *   - the freeze takes asked-for hosts into the sweep behind the
 *     directory's names, most-asked first, drops the ones a feed
 *     named, and stamps the week so the queue can say "swept";
 *   - /corpus/asked.json derives each host's state against the walk
 *     and the latest round, with denominators and never a ranking.
 */

async function clearStore(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.askedFor);
  await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
}

function stubWorld(feedHosts: string[]) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const host = new URL(url).hostname;
    if (host === "api.cdp.coinbase.com") {
      if (url.includes("/discovery/search")) {
        return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
      }
      return Response.json({
        items: feedHosts.map((h) => ({ resourceUrl: `https://${h}/api/buy/x` })),
        pagination: { limit: 100, offset: 0, total: feedHosts.length },
      });
    }
    // Every other source dark: this file is about the queue's join,
    // and a readable directory would put names in the sweep that the
    // assertions below would then have to carry.
    return new Response("gone", { status: 503 });
  });
}

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

beforeEach(clearStore);
afterEach(() => vi.unstubAllGlobals());

describe("the fold", () => {
  it("takes a host name and refuses anything the sweep could not read", () => {
    expect(isSweepableHost("door.example")).toBe(true);
    expect(isSweepableHost("Sub.Door.Example")).toBe(true);
    expect(isSweepableHost("nodots")).toBe(false);
    expect(isSweepableHost("10.0.0.1")).toBe(false);
    expect(isSweepableHost("door.example:8443")).toBe(false);
    expect(isSweepableHost("under_score.example")).toBe(false);
    expect(isSweepableHost("box.localhost")).toBe(false);
    expect(isSweepableHost("-bad.example")).toBe(false);
    expect(isSweepableHost("")).toBe(false);
  });

  it("counts asks by name, keeps the first and last time, and names the surfaces", () => {
    const empty: AskedForStore = { version: 1, hosts: {} };
    const one = foldAsk(empty, "Door.Example", "corpus_host", OWN, T0);
    expect(one.hosts["door.example"]).toEqual({
      first_asked: T0.toISOString(),
      last_asked: T0.toISOString(),
      asks: 1,
      surfaces: ["corpus_host"],
    });
    const later = new Date(T0.getTime() + 60_000);
    const two = foldAsk(one, "door.example", "look", OWN, later);
    expect(two.hosts["door.example"]!.asks).toBe(2);
    expect(two.hosts["door.example"]!.first_asked).toBe(T0.toISOString());
    expect(two.hosts["door.example"]!.last_asked).toBe(later.toISOString());
    expect(two.hosts["door.example"]!.surfaces).toEqual(["corpus_host", "look"]);
    // Our own host and an unreadable name leave the store untouched —
    // the same reference, so the caller writes nothing.
    expect(foldAsk(two, OWN, "look", OWN, later)).toBe(two);
    expect(foldAsk(two, "10.0.0.1", "look", OWN, later)).toBe(two);
  });

  it("is capped, and evicts the longest-unasked first", () => {
    let store: AskedForStore = { version: 1, hosts: {} };
    for (let i = 0; i < ASKED_FOR_CAP; i += 1) {
      store = foldAsk(store, `h${i}.example`, "look", OWN, new Date(T0.getTime() + i * 1000));
    }
    expect(Object.keys(store.hosts)).toHaveLength(ASKED_FOR_CAP);
    // Re-ask the oldest so it is no longer the longest-unasked.
    store = foldAsk(store, "h0.example", "look", OWN, new Date(T0.getTime() + ASKED_FOR_CAP * 1000));
    store = foldAsk(store, "newest.example", "look", OWN, new Date(T0.getTime() + (ASKED_FOR_CAP + 1) * 1000));
    expect(Object.keys(store.hosts)).toHaveLength(ASKED_FOR_CAP);
    expect(store.hosts["h0.example"]).toBeDefined();
    expect(store.hosts["h1.example"], "the longest-unasked was not the one evicted").toBeUndefined();
    expect(store.hosts["newest.example"]).toBeDefined();
  });
});

describe("the pick", () => {
  const seeded = (): AskedForStore => ({
    version: 1,
    hosts: {
      "feed-named.example": { first_asked: "2026-09-01T00:00:00.000Z", last_asked: "2026-09-02T00:00:00.000Z", asks: 9, surfaces: ["look"] },
      "once.example": { first_asked: "2026-09-03T00:00:00.000Z", last_asked: "2026-09-03T00:00:00.000Z", asks: 1, surfaces: ["look"] },
      "thrice.example": { first_asked: "2026-09-04T00:00:00.000Z", last_asked: "2026-09-05T00:00:00.000Z", asks: 3, surfaces: ["corpus_host"] },
      "earlier-once.example": { first_asked: "2026-09-02T00:00:00.000Z", last_asked: "2026-09-02T00:00:00.000Z", asks: 1, surfaces: ["look"] },
      "swept.example": { first_asked: "2026-09-01T00:00:00.000Z", last_asked: "2026-09-01T00:00:00.000Z", asks: 5, surfaces: ["look"], last_swept_week: "2026-W37" },
    },
  });

  it("drops what a feed named, skips what this week already swept, and takes most-asked first up to the cap", () => {
    const picked = pickSweep(seeded(), "2026-W37", new Set(["feed-named.example"]), 2);
    expect(picked.hosts).toEqual(["thrice.example", "earlier-once.example"]);
    expect(picked.dropped).toBe(1);
    expect(picked.waiting).toBe(1);
    expect(picked.store.hosts["feed-named.example"]).toBeUndefined();
    expect(picked.store.hosts["thrice.example"]!.last_swept_week).toBe("2026-W37");
    expect(picked.store.hosts["once.example"]!.last_swept_week).toBeUndefined();
    // Last week's sweep stamp does not shield a host from this week's.
    const next = pickSweep(seeded(), "2026-W38", new Set(), ASKED_FOR_SWEEP_CAP);
    expect(next.hosts).toContain("swept.example");
  });
});

describe("the miss is recorded on every free surface", () => {
  it("the host JSON and the host page record a never-probed host, and a hit records nothing", async () => {
    const miss = await SELF.fetch(`${BASE}/corpus/host/never-walked.example.json`);
    expect(miss.status).toBe(200);
    const page = await SELF.fetch(`${BASE}/corpus/host/never-walked.example`);
    expect(page.status).toBe(404);
    const body = (await page.json()) as Record<string, string>;
    expect(body.asked).toBe(`${BASE}/corpus/asked.json`);
    expect(body.error).toContain("The ask is recorded");
    // The write rides waitUntil; the test runtime drains it before
    // the next fetch resolves. Give it one turn regardless.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const store = await readAskedFor(testEnv);
    expect(store.hosts["never-walked.example"]?.asks).toBe(2);
    expect(store.hosts["never-walked.example"]?.surfaces).toEqual(["corpus_host"]);
  });

  it("the held half records the miss too, so the look, the passport and the A2A door all feed the queue", async () => {
    const held = await heldHalfOf(testEnv, "held-miss.example", T0);
    expect(held.never_met).toBe(true);
    const store = await readAskedFor(testEnv);
    expect(store.hosts["held-miss.example"]).toEqual({
      first_asked: T0.toISOString(),
      last_asked: T0.toISOString(),
      asks: 1,
      surfaces: ["look"],
    });
  });

  it("a KV failure costs the ask, never the answer", async () => {
    const broken = { ...testEnv, COUNTERS: { get: async () => { throw new Error("kv down"); }, put: async () => { throw new Error("kv down"); } } } as unknown as Env;
    await expect(recordAsk(broken, "door.example", "look", T0)).resolves.toBeUndefined();
  });
});

describe("the freeze takes the queue into the sweep", () => {
  it("asked-for hosts join the sweep, a feed-named host leaves the queue, and the week is stamped", async () => {
    await writeAskedFor(testEnv, {
      version: 1,
      hosts: {
        "feed-a.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 4, surfaces: ["look"] },
        "asked-1.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 1, surfaces: ["look"] },
        "asked-2.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 7, surfaces: ["corpus_host"] },
      },
    });
    stubWorld(["feed-a.example", "feed-b.example"]);
    const pass = await longWalkPass(testEnv);
    expect(pass.phase).toBe("started");
    const state = (await readLongWalk(testEnv))!;
    expect(state.sweep!.hosts).toEqual(["asked-2.example", "asked-1.example"]);
    expect(state.sweep!.asked_for).toEqual({ swept: 2, waiting: 0, dropped: 1 });
    const store = await readAskedFor(testEnv);
    expect(store.hosts["feed-a.example"]).toBeUndefined();
    expect(store.hosts["asked-2.example"]!.last_swept_week).toBe(currentWeekKey());
  });
});

describe("/corpus/asked.json", () => {
  it("derives each host's state against the walk and the latest round, with denominators", () => {
    const store: AskedForStore = {
      version: 1,
      hosts: {
        "walked.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 2, surfaces: ["look"], last_swept_week: "2026-W36" },
        "rostered.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 1, surfaces: ["look"], last_swept_week: "2026-W37" },
        "swept.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 1, surfaces: ["look"], last_swept_week: "2026-W37" },
        "queued.example": { first_asked: T0.toISOString(), last_asked: T0.toISOString(), asks: 1, surfaces: ["corpus_host"] },
      },
    };
    const queue = deriveAskedQueue(
      store,
      { walked: new Set(["walked.example"]), roster: new Set(["rostered.example", "walked.example"]) },
      BASE,
      T0,
    );
    expect(queue.hosts_asked).toBe(4);
    expect(queue.by_state).toEqual({ queued: 1, swept_no_door_found: 1, on_roster: 1, walked: 1 });
    expect(queue.hosts.map((h) => [h.host, h.state])).toEqual([
      ["queued.example", "queued"],
      ["rostered.example", "on_roster"],
      ["swept.example", "swept_no_door_found"],
      ["walked.example", "walked"],
    ]);
    expect(queue.hosts[0]!.history_url).toBe(`${BASE}/corpus/host/queued.example.json`);
    expect(queue.what_this_is_not).toMatch(/never a ranking/i);
  });

  it("serves the queue, empty and honest before anyone asks", async () => {
    const empty = (await (await SELF.fetch(`${BASE}/corpus/asked.json`)).json()) as Record<string, any>;
    expect(empty.artifact).toBe("asked_for_queue");
    expect(empty.hosts_asked).toBe(0);
    expect(empty.hosts).toEqual([]);
    await recordAsk(testEnv, "someone-asked.example", "look", T0);
    const one = (await (await SELF.fetch(`${BASE}/corpus/asked.json`)).json()) as Record<string, any>;
    expect(one.hosts_asked).toBe(1);
    expect(one.hosts[0].state).toBe("queued");
    expect(one.corrections).toBeTruthy();
  });
});
