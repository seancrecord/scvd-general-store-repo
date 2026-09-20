import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_USDC } from "@/lib/base-rpc";
import { bountyCandidates, openBountyBatch } from "@/services/bounty-batch";
import {
  readRefusalMemory,
  recordRefusals,
  refusalsForRound,
} from "@/services/bounty-refusals";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const NOW = new Date("2026-09-20T12:00:00.000Z");
const ROUND_AT = "2026-09-19T11:00:00.000Z";
const PAY_TO = "0x1111111111111111111111111111111111111111";

/**
 * THE DESK COULD NOT SEE LIVENESS (2026-09-20, from the round posted
 * the day before: three of twenty doors refused the press, and all
 * three had read "ready, never walked, cheap").
 *
 * The census row says ready; the press finds out otherwise; and
 * nothing carried that back, so those three doors stayed at the top of
 * the candidate list waiting to be offered again. On a twelve-hour
 * cadence that is the same three refusals fourteen times a week.
 *
 * Two properties, and the second is what keeps this from being a
 * blacklist — a thing this store does not keep (rule 43).
 */

function host(name: string, offer?: number): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/thing`,
    verdict: "ready",
    failed: [],
    advisories: [],
    ...(offer !== undefined
      ? { offer: { networks: [], schemes: [], min_usdc: offer } }
      : {}),
  };
}

function round(at: string, hosts: WardHostResult[]): WardRound {
  return {
    week: "2026-W38",
    at,
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

async function clear(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.bountyRefusals);
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.bountyPrefix });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

afterEach(async () => {
  await clear();
  vi.unstubAllGlobals();
});

describe("what the doors said last time we knocked", () => {
  it("remembers only what was about the DOOR, never what was about the press", async () => {
    await recordRefusals(
      testEnv,
      ROUND_AT,
      [
        { domain: "gone.example", code: "no-402", refusal: "the door answered 526, not 402" },
        { domain: "keyed.example", code: "no-402", refusal: "the door answered 401, not 402" },
        // Both of these are facts about THIS press: a different week or
        // a different reward changes the answer, so caching them would
        // hide a door the keeper can post by moving a dial.
        { domain: "open.example", code: "already-open", refusal: "an open bounty already stands" },
        { domain: "dear.example", code: "reward-below-price", refusal: "the reward must exceed" },
        { domain: "railless.example", code: "rail-not-offered", refusal: "quotes no arbitrum entry" },
      ],
      NOW,
    );
    const memory = await readRefusalMemory(testEnv);
    expect(Object.keys(memory).sort()).toEqual(["gone.example", "keyed.example"]);
    expect(memory["gone.example"]?.round_at).toBe(ROUND_AT);
  });

  /*
   * IT EXPIRES AGAINST THE CENSUS, NOT A CLOCK. The moment a newer
   * round has probed the host, the memory is ignored and the door
   * returns to the desk on its own — because the thing that would
   * settle the question has happened. No keeper ever clears a list.
   */
  it("drops a memory the moment a newer round has re-read the host", async () => {
    await recordRefusals(
      testEnv,
      ROUND_AT,
      [{ domain: "gone.example", code: "no-402", refusal: "answered 526" }],
      NOW,
    );
    const memory = await readRefusalMemory(testEnv);
    expect(Object.keys(refusalsForRound(memory, ROUND_AT))).toEqual([
      "gone.example",
    ]);
    // A round taken AFTER the refusal: the census has asked again.
    expect(refusalsForRound(memory, "2026-09-26T11:00:00.000Z")).toEqual({});
  });

  it("sinks a refused door on the desk, with what it said and when", async () => {
    await recordRefusals(
      testEnv,
      ROUND_AT,
      [{ domain: "gone.example", code: "no-402", refusal: "the door answered 526, not 402" }],
      NOW,
    );
    const memory = refusalsForRound(await readRefusalMemory(testEnv), ROUND_AT);
    const candidates = bountyCandidates(
      round(ROUND_AT, [host("gone.example", 0.001), host("live.example", 0.001)]),
      [],
      "scvd.store",
      NOW,
      24,
      0.12,
      memory,
    );
    const gone = candidates.find((row) => row.domain === "gone.example");
    expect(gone?.last_refusal?.code).toBe("no-402");
    expect(gone?.blocked).toContain("526");
    expect(gone?.blocked).toContain("2026-09-20");
    // Shown, not hidden, and below the door a press can actually open.
    expect(candidates[0]?.domain).toBe("live.example");
    expect(candidates[0]?.blocked).toBeUndefined();
  });

  /*
   * END TO END: a press that is refused writes the refusal down, and
   * the desk built from the same round stops offering that door. This
   * is the loop the 2026-09-19 round did not have.
   */
  it("carries a real press refusal through to the desk", async () => {
    const world = (() =>
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("gone.example")) {
          return new Response("nope", { status: 526 });
        }
        if (url.includes("live.example")) {
          return new Response(JSON.stringify({ x402Version: 2 }), {
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
                      asset: BASE_USDC,
                      payTo: PAY_TO,
                    },
                  ],
                }),
              ),
            },
          });
        }
        return new Response(JSON.stringify({ result: "0x7a120" }), { status: 200 });
      }) as typeof fetch)();
    vi.stubGlobal("fetch", world);

    const result = await openBountyBatch(
      testEnv,
      {
        urls: [
          "https://live.example/api/thing",
          "https://gone.example/api/thing",
        ],
        rewardUsd: 0.12,
        roundAt: ROUND_AT,
      },
      { fetch: world, now: NOW },
    );
    expect(result.posted).toBe(1);
    expect(result.outcomes.find((outcome) => !outcome.ok)?.code).toBe("no-402");

    const memory = refusalsForRound(await readRefusalMemory(testEnv), ROUND_AT);
    expect(memory["gone.example"]?.refusal).toContain("526");
    const candidates = bountyCandidates(
      round(ROUND_AT, [host("gone.example", 0.001)]),
      [],
      "scvd.store",
      NOW,
      24,
      0.12,
      memory,
    );
    expect(candidates[0]?.blocked).toContain("the last press here was refused");
  });

  /*
   * A PRESS THAT NAMES NO ROUND REMEMBERS NOTHING. The memory expires
   * against a round, so a refusal with no round to expire against
   * would be permanent — and permanent is the one thing this must
   * never be.
   */
  it("remembers nothing when the press names no round", async () => {
    const world = (async () =>
      new Response("nope", { status: 404 })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", world);
    await openBountyBatch(
      testEnv,
      { urls: ["https://gone.example/api/thing"], rewardUsd: 0.12 },
      { fetch: world, now: NOW },
    );
    expect(await readRefusalMemory(testEnv)).toEqual({});
  });
});
