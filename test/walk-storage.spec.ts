import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { longWalkPass, readLongWalk, readWalkResults } from "@/services/long-walk";
import { latestWardRound, roundRowsKey, runWardRound, type WardRound } from "@/services/ward-round";
import { roundWrote } from "@/services/ward-heartbeat";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE STORAGE MOVE (2026-09-05, "yes i agree with the two moves").
 * A week's evidence lived in ONE KV value — the walk state — and the
 * sealed round lived in three more, each carrying every row's
 * evidence at ~6 KB a host; KV holds 25 MB a value, so the walk would
 * have broken near 3,900 hosts, silently, on an hourly write. Now:
 *
 *   - each walked batch lands under its own key; the state keeps the
 *     roster, the cursor and the counts, and Sunday reads the batches
 *     back in order — a batch it cannot read is COUNTED on the round;
 *   - the sealed round keeps its rows in R2 and a pointer in KV;
 *     readers get the round whole, the heartbeat reads the count off
 *     the pointer, and a pointer whose object is gone reads as NULL,
 *     never as a round nobody walked;
 *   - a store with no bucket keeps the rows inline, as before.
 */
function stubWorld(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ resourceUrl: `https://walk-${i}.example/api/buy/x` }));
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const host = new URL(url).hostname;
    if (host === "api.cdp.coinbase.com") {
      if (url.includes("/discovery/search")) return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
      const requested = Number(new URL(url).searchParams.get("offset") ?? 0);
      return Response.json({ items: all.slice(requested, requested + 100), pagination: { limit: 100, offset: requested, total } });
    }
    if (host.includes("agent402")) {
      return Response.json({
        spec: "x402-leaderboard/1",
        windowServed: "7d",
        totalSellers: 1,
        leaderboard: [{ rank: 1, origins: ["https://homepage-only.example"], callsSettled: 1, totalUsd: 1, uniqueBuyers: 1 }],
      });
    }
    if (host.includes("fuchss") || host === "x402-list.com" || host.endsWith("agentic.market")) {
      return new Response("gone", { status: 503 });
    }
    return new Response("{}", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": btoa(
          JSON.stringify({
            x402Version: 2,
            accepts: [{ scheme: "exact", network: "eip155:8453", amount: "1000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111" }],
          }),
        ),
      },
    });
  });
}

async function reset(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundPrevious);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRound(currentWeekKey()));
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.longWalkResultsPrefix });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
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

afterEach(() => vi.unstubAllGlobals());

describe("the walk's evidence lives one value per batch", () => {
  it("the state stays small; the batches hold the rows; the read joins them in order", async () => {
    await reset();
    stubWorld(150);
    await longWalkPass(testEnv); // start
    await longWalkPass(testEnv); // 100
    await longWalkPass(testEnv); // 50
    const state = (await readLongWalk(testEnv))!;
    // Only the unknocked leaderboard row rides the state itself.
    expect(state.results.map((r) => r.host)).toEqual(["homepage-only.example"]);
    expect(state.result_batches).toBe(2);
    const first = await testEnv.COUNTERS.get(KV_KEYS.longWalkResults(state.week, 0), "json");
    expect(Array.isArray(first) && (first as unknown[]).length).toBe(100);
    const { rows, batches_missing } = await readWalkResults(testEnv, state);
    expect(batches_missing).toBe(0);
    expect(rows).toHaveLength(151);
    expect(rows[0]?.host).toBe("homepage-only.example");
    expect(rows[1]?.host).toBe("walk-0.example");
    expect(rows[150]?.host).toBe("walk-149.example");
  });

  it("a batch the store no longer holds is counted on the round, never skipped in silence", async () => {
    await reset();
    stubWorld(150);
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    const state = (await readLongWalk(testEnv))!;
    await testEnv.COUNTERS.delete(KV_KEYS.longWalkResults(state.week, 1));
    expect((await readWalkResults(testEnv, state)).batches_missing).toBe(1);
    const round = await runWardRound(testEnv);
    expect(round.walk?.batches_missing).toBe(1);
    expect(round.walk?.walked).toBe(100);
    expect(round.hosts).toHaveLength(101);
  });
});

describe("the sealed round keeps its rows in R2", () => {
  it("KV holds a pointer and a count; the reader gets the round whole; the heartbeat reads the count", async () => {
    await reset();
    stubWorld(120);
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    const round = await runWardRound(testEnv);
    expect(round.hosts).toHaveLength(121);
    const stored = (await testEnv.COUNTERS.get(KV_KEYS.wardRoundLatest, "json")) as WardRound;
    expect(stored.hosts).toEqual([]);
    expect(stored.hosts_r2_key).toBe(roundRowsKey(round.week));
    expect(stored.hosts_count).toBe(121);
    const object = await testEnv.CORPUS_R2!.get(roundRowsKey(round.week));
    expect(object).not.toBeNull();
    expect(((await object!.json()) as unknown[]).length).toBe(121);
    // The stored week value is the same pointer shape.
    const week = (await testEnv.COUNTERS.get(KV_KEYS.wardRound(round.week), "json")) as WardRound;
    expect(week.hosts_r2_key).toBe(roundRowsKey(round.week));
    // Whole again through the reader; counted right off the pointer.
    expect((await latestWardRound(testEnv))?.hosts).toHaveLength(121);
    expect(roundWrote(stored).hosts).toBe(121);
  });

  it("a pointer whose object is gone reads as no round, never as a round nobody walked", async () => {
    await reset();
    stubWorld(120);
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    await longWalkPass(testEnv);
    const round = await runWardRound(testEnv);
    await testEnv.CORPUS_R2!.delete(roundRowsKey(round.week));
    expect(await latestWardRound(testEnv)).toBeNull();
  });

  it("a store with no bucket keeps the rows inline, as before the move", async () => {
    await reset();
    stubWorld(120);
    const legacyEnv = { ...testEnv, CORPUS_R2: undefined } as Env;
    await longWalkPass(legacyEnv);
    await longWalkPass(legacyEnv);
    await longWalkPass(legacyEnv);
    const round = await runWardRound(legacyEnv);
    const stored = (await testEnv.COUNTERS.get(KV_KEYS.wardRoundLatest, "json")) as WardRound;
    expect(stored.hosts_r2_key).toBeUndefined();
    expect(stored.hosts).toHaveLength(round.hosts.length);
    expect((await latestWardRound(legacyEnv))?.hosts).toHaveLength(round.hosts.length);
  });
});
