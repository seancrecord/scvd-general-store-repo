import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import {
  FEED_PAGES_PER_PASS,
  WALK_ROSTER_CAP,
  appendDeclaredDoor,
  longWalkPass,
  readLongWalk,
  WALK_BATCH,
} from "@/services/long-walk";
import { runWardRound } from "@/services/ward-round";
import {
  getCorpusEntry,
  listCorpus,
  takeCorpusSnapshot,
  verifyCorpusChain,
} from "@/services/corpus";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/** Calendars answer instantly and locally; no network, no flake. */
const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

/**
 * THE LONG WALK — the architecture past WARD_CAP. The hourly cron
 * walks the roster in batches all week; Sunday assembles what was
 * already walked instead of probing again; the snapshot graduates to
 * R2. These tests hold the three properties that make that honest:
 * the walk starts by freezing a roster and probing nothing, each
 * batch advances the cursor by real verdicts, and the assembly fires
 * NO probes — a host visited Tuesday is not visited again on Sunday.
 */

let probeCount = 0;

function stubWalkWorld(options: { total: number }) {
  const all = Array.from({ length: options.total }, (_, i) => ({
    resourceUrl: `https://walk-${i}.example/api/buy/x`,
  }));
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("api.cdp.coinbase.com")) {
      if (url.includes("/discovery/search")) {
        return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
      }
      const requested = Number(new URL(url).searchParams.get("offset") ?? 0);
      return Response.json({
        items: all.slice(requested, requested + 100),
        pagination: { limit: 100, offset: requested, total: options.total },
      });
    }
    if (url.includes("agent402.tools")) {
      return Response.json({
        spec: "x402-leaderboard/1",
        windowServed: "7d",
        totalSellers: 3,
        leaderboard: [
          {
            rank: 1,
            origins: ["https://homepage-only.example"],
            callsSettled: 10,
            totalUsd: 5,
            uniqueBuyers: 2,
          },
        ],
      });
    }
    if (url.includes("fuchss")) {
      // Unreadable directory this week; the census law handles null.
      return new Response("gone", { status: 503 });
    }
    /*
     * The two directories the roster widened to on 2026-09-04. Dark
     * here for the same reason fuchss is: this file is about the
     * WALK, and a readable directory would put hosts in the census
     * that every population assertion below would then have to carry.
     *
     * They must be named rather than left to the fallthrough, because
     * the fallthrough is the PROBE counter — an unrecognised fetch is
     * scored as a knock on somebody door, which is exactly the thing
     * the assembly test exists to prove does not happen. A new source
     * added to the round would otherwise read here as the assembly
     * probing again.
     */
    // Matched on the parsed hostname, not a substring of the URL: a
    // substring check is the shape CodeQL rightly refuses, since any
    // host may sit before or after it. Same refusal in a stub as in
    // the reader it stubs for.
    const host = new URL(url).hostname;
    if (
      host === "x402-list.com" ||
      host === "agentic.market" ||
      host.endsWith(".agentic.market")
    ) {
      return new Response("gone", { status: 503 });
    }
    void init;
    probeCount += 1;
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

async function clearWalkState(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
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

afterEach(() => {
  vi.unstubAllGlobals();
  probeCount = 0;
});

describe("the walk's three phases", () => {
  it("starts by freezing the roster and probing nobody", async () => {
    await clearWalkState();
    stubWalkWorld({ total: 250 });
    const pass = await longWalkPass(testEnv);
    expect(pass.phase).toBe("started");
    expect(probeCount, "the start pass knocked on a door").toBe(0);
    const state = (await readLongWalk(testEnv))!;
    expect(state.week).toBe(currentWeekKey());
    expect(state.roster).toHaveLength(250);
    expect(state.cursor).toBe(0);
    // The leaderboard-only homepage is population, recorded at start,
    // never queued for a knock — the 2026-08-04 lesson on this path.
    expect(
      state.results.find((r) => r.host === "homepage-only.example")?.verdict,
    ).toBe("not_probed");
  });

  it("walks one batch per firing, and the cursor is real verdicts", async () => {
    await clearWalkState();
    stubWalkWorld({ total: 250 });
    await longWalkPass(testEnv);
    const first = await longWalkPass(testEnv);
    expect(first.phase).toBe("walked");
    expect(probeCount).toBe(WALK_BATCH);
    const state = (await readLongWalk(testEnv))!;
    expect(state.cursor).toBe(WALK_BATCH);
    expect(
      state.results.filter((r) => r.verdict === "ready"),
    ).toHaveLength(WALK_BATCH);

    // Two more firings finish the 250-door roster, then it idles.
    await longWalkPass(testEnv);
    const last = await longWalkPass(testEnv);
    expect(last.phase).toBe("walked");
    const done = (await readLongWalk(testEnv))!;
    expect(done.cursor).toBe(250);
    expect(done.finished_at).toBeTruthy();
    const idle = await longWalkPass(testEnv);
    expect(idle.phase).toBe("idle");
  });

  it("assembles Sunday's round from the walk WITHOUT probing again", async () => {
    await clearWalkState();
    stubWalkWorld({ total: 250 });
    await longWalkPass(testEnv); // start
    await longWalkPass(testEnv); // 100
    await longWalkPass(testEnv); // 200
    await longWalkPass(testEnv); // 250, finished

    probeCount = 0;
    const round = await runWardRound(testEnv);
    expect(
      probeCount,
      "assembly knocked on a door — a host visited Tuesday was visited again on Sunday",
    ).toBe(0);
    expect(round.walk).toBeTruthy();
    expect(round.walk!.roster).toBe(250);
    expect(round.walk!.walked).toBe(250);
    expect(round.capped).toBe(false);
    expect(round.listed_resources).toBe(250);
    // Walked hosts carry real verdicts; the homepage rides as population.
    expect(round.hosts.filter((h) => h.verdict === "ready")).toHaveLength(250);
    expect(round.hosts.find((h) => h.host === "homepage-only.example")?.verdict).toBe(
      "not_probed",
    );
  });

  it("a week that ends mid-roster assembles honestly capped", async () => {
    await clearWalkState();
    stubWalkWorld({ total: 250 });
    await longWalkPass(testEnv); // start
    await longWalkPass(testEnv); // 100 of 250
    const round = await runWardRound(testEnv);
    expect(round.walk!.walked).toBe(100);
    expect(round.capped, "an unwalked tail must read as the cap binding").toBe(true);
  });
});

describe("the corpus graduates to R2", () => {
  it("stores the record as an object, points from KV, and the chain still verifies", async () => {
    await clearWalkState();
    // Clear any corpus entries earlier tests minted.
    let cursor: string | undefined;
    for (;;) {
      const listed = await testEnv.COUNTERS.list({
        prefix: KV_KEYS.corpusPrefix,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      if (listed.list_complete) break;
      cursor = listed.cursor;
    }
    stubWalkWorld({ total: 120 });
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    await runWardRound(testEnv);

    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(pass.taken).toBe(true);

    // KV holds a slim pointer, not the round.
    const raw = (await testEnv.COUNTERS.get(
      `${KV_KEYS.corpusPrefix}000000001`,
      "json",
    )) as Record<string, unknown>;
    expect(raw["pointer"]).toBe(true);
    expect(String(raw["r2_key"])).toBe("corpus/1.json");

    // The object is the record, and the readers resolve it whole.
    const object = await testEnv.CORPUS_R2!.get("corpus/1.json");
    expect(object, "no R2 object behind the pointer").toBeTruthy();
    const entry = await getCorpusEntry(testEnv, 1);
    expect(entry?.snapshot.round.walk?.walked).toBe(100);
    expect((await listCorpus(testEnv))[0]?.digest).toBe(entry?.digest);

    // And the stranger's walk of the chain still closes.
    const verdict = await verifyCorpusChain(testEnv);
    expect(verdict.intact).toBe(true);
    expect(verdict.entries).toBe(1);
  });

  it("falls back to the legacy full-record-in-KV shape when no bucket is bound", async () => {
    // A clean chain, because the write shape is the question here.
    let cursor: string | undefined;
    for (;;) {
      const listed = await testEnv.COUNTERS.list({
        prefix: KV_KEYS.corpusPrefix,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      if (listed.list_complete) break;
      cursor = listed.cursor;
    }
    const legacyEnv = { ...testEnv, CORPUS_R2: undefined } as Env;
    const pass = await takeCorpusSnapshot(legacyEnv, okCalendar);
    expect(pass.taken).toBe(true);
    const raw = (await testEnv.COUNTERS.get(
      `${KV_KEYS.corpusPrefix}000000001`,
      "json",
    )) as Record<string, unknown>;
    // The legacy shape: the record itself, no pointer — a missing
    // binding degrades to the old behaviour, never breaks the chain.
    expect(raw["pointer"]).toBeUndefined();
    expect((raw["snapshot"] as Record<string, unknown>)["sequence"]).toBe(1);
    expect((await verifyCorpusChain(legacyEnv)).intact).toBe(true);
  });
});

/**
 * THE FEED READ RESUMES (2026-09-04). The one-shot round's 60-page cap
 * bound the day the Bazaar passed 6,000 declared resources, and for
 * five rounds the census recorded discovery as unreadable while the
 * walk walked the first 6,000 rows' hosts. A bigger cap binds again
 * at the next size; so the walk reads the feed across hourly
 * firings, on a stored cursor, until the feed's own declared total
 * is reached. These hold: a feed larger than one pass is READ, not
 * capped; the reading passes probe nobody; the census gets every
 * host the feed named even where the walk's roster cap bound; and
 * the cap says so.
 */
describe("the feed read resumes across firings", () => {
  const TOTAL = FEED_PAGES_PER_PASS * 100 + 50;

  it("reads a feed larger than one pass completely, over two firings, probing nobody", async () => {
    await clearWalkState();
    stubWalkWorld({ total: TOTAL });
    const first = await longWalkPass(testEnv);
    expect(first.phase).toBe("reading");
    if (first.phase !== "reading") throw new Error("unreachable");
    expect(first.rows).toBe(FEED_PAGES_PER_PASS * 100);
    expect(first.declared).toBe(TOTAL);
    expect(first.passes).toBe(1);
    expect(probeCount, "a reading pass knocked on a door").toBe(0);
    const reading = (await readLongWalk(testEnv))!;
    expect(reading.feed?.resume.offset).toBe(FEED_PAGES_PER_PASS * 100);
    expect(reading.feed?.resume.rows_read).toBe(FEED_PAGES_PER_PASS * 100);
    // Not yet a roster: nothing walks, nothing assembles, from this state.
    expect(reading.results).toEqual([]);

    const second = await longWalkPass(testEnv);
    expect(second.phase).toBe("started");
    expect(probeCount).toBe(0);
    const frozen = (await readLongWalk(testEnv))!;
    expect(frozen.feed).toBeUndefined();
    expect(frozen.listed_resources).toBe(TOTAL);
    // Read to the declared total: complete, and said so — the cap that
    // used to bind here is the thing this test exists to bury.
    expect(frozen.coverage_suspect).toBe(false);
    expect(frozen.discovery_read?.stop).toBe("declared_total");
    // Pages are the read as a whole, across both firings.
    expect(frozen.discovery_read?.pages).toBe(FEED_PAGES_PER_PASS + 1);
    expect(frozen.feed_hosts).toHaveLength(TOTAL);

    const third = await longWalkPass(testEnv);
    expect(third.phase).toBe("walked");
    expect(probeCount).toBe(WALK_BATCH);
  });

  it("caps the roster at the KV ceiling, says so, and still counts every feed host in the census", async () => {
    await clearWalkState();
    stubWalkWorld({ total: TOTAL });
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    const frozen = (await readLongWalk(testEnv))!;
    expect(frozen.roster_capped).toBe(true);
    expect(frozen.roster).toHaveLength(WALK_ROSTER_CAP);
    expect(frozen.feed_hosts).toHaveLength(TOTAL);
    // Walk one batch so Sunday has something to assemble.
    await longWalkPass(testEnv);
    const round = await runWardRound(testEnv);
    expect(round.walk?.roster_capped).toBe(true);
    expect(round.walk?.feed_hosts).toBe(TOTAL);
    expect(round.walk?.roster).toBe(WALK_ROSTER_CAP);
    // The census's discovery answer is the FEED, whole, not the roster.
    const discovery = round.population?.per_source.find((row) => row.source === "discovery");
    expect(discovery).toEqual({ source: "discovery", hosts: TOTAL });
    // A directory that could not be read says so beside its null.
    const fuchss = round.population?.per_source.find((row) => row.source === "fuchss");
    expect(fuchss).toEqual({ source: "fuchss", hosts: null, why: "unreadable" });
  });

  it("a declared door while the feed is still being read waits for the freeze, and is not lost", async () => {
    await clearWalkState();
    stubWalkWorld({ total: TOTAL });
    await longWalkPass(testEnv);
    expect(
      await appendDeclaredDoor(testEnv, "declares.example", "https://declares.example/api/pay"),
    ).toBe("roster-not-frozen-yet");
    const reading = (await readLongWalk(testEnv))!;
    expect(reading.roster.some((entry) => entry.source === "well-known")).toBe(false);
  });

  it("declared doors ride behind the feed's cap, never inside it", async () => {
    await clearWalkState();
    stubWalkWorld({ total: TOTAL });
    const { readWellKnownStore, writeWellKnownStore, recordWellKnownRead } = await import(
      "@/services/well-known-doors"
    );
    const store = await readWellKnownStore(testEnv);
    await writeWellKnownStore(
      testEnv,
      recordWellKnownRead(
        store,
        "declares.example",
        {
          kind: "doors",
          declaring_host: "declares.example",
          doors: ["https://declares.example/api/pay"],
          foreign: 0,
          refused: 0,
          capped: false,
          via: "x402",
        },
        "2026-W35",
        "2026-09-01T00:00:00.000Z",
      ).store,
    );
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    const frozen = (await readLongWalk(testEnv))!;
    expect(frozen.roster).toHaveLength(WALK_ROSTER_CAP + 1);
    expect(frozen.roster[WALK_ROSTER_CAP]).toEqual({
      host: "declares.example",
      url: "https://declares.example/api/pay",
      source: "well-known",
      catalog: null,
    });
    await testEnv.COUNTERS.delete(KV_KEYS.wellKnownDoors);
  });
});
