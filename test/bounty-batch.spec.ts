import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_USDC } from "@/lib/base-rpc";
import {
  BOUNTY_BATCH_CAP,
  bountyCandidates,
  batchNotice,
  openBountyBatch,
} from "@/services/bounty-batch";
import type { BountyRecord } from "@/services/bounty-board";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};
const NOW = new Date("2026-09-08T12:00:00.000Z");
const PAY_TO = "0x1111111111111111111111111111111111111111";

/**
 * A ROUND OF BOUNTIES, NOT A BOUNTY (2026-09-08, the keeper: "i should
 * probably do up to ten bounties and then like tracking what we are
 * doing with it").
 *
 * The two things this press has to get right, and both are about the
 * keeper's information rather than about the posting itself: the list
 * he chooses from has to carry what this store has ALREADY done at
 * each door, and a door that refuses to be posted has to come back
 * named. A batch that silently drops eight of ten is worse than the
 * ten trips it replaces.
 */

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  extra: Partial<WardHostResult> = {},
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/thing`,
    verdict,
    failed: [],
    advisories: [],
    ...extra,
  };
}

function round(hosts: WardHostResult[]): WardRound {
  return {
    week: "2026-W37",
    at: "2026-09-06T11:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

function bounty(
  domain: string,
  status: BountyRecord["status"],
  openedAt: string,
  expiresAt: string,
): BountyRecord {
  return {
    bounty_id: `bty_${domain.replace(/\W/g, "")}`,
    target_url: `https://${domain}/api/thing`,
    domain,
    pay_to: PAY_TO,
    amount_atomic: "50000",
    amount_usd: 0.05,
    reward_usd: 0.1,
    opened_at: openedAt,
    opened_block: 1,
    expires_at: expiresAt,
    status,
  };
}

/** Doors that 402 (shop.example, other.example) and one that does not. */
function world(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.startsWith("https://dead.example/")) {
      return new Response("gone", { status: 404 });
    }
    if (url.startsWith("https://")  && url.includes(".example/")) {
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
                  amount: "50000",
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
  }) as typeof fetch;
}

async function clearBoard(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: "bounty" });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
}

afterEach(async () => {
  await clearBoard();
  vi.unstubAllGlobals();
});

describe("the posting list carries what we have already done", () => {
  it("offers ready doors only, never-walked first, with our own history beside each", () => {
    const candidates = bountyCandidates(
      round([
        host("paid.example", "ready"),
        host("fresh.example", "ready", { offer: { networks: [], schemes: [], min_usdc: 0.001 } }),
        host("broken.example", "not_ready"),
        host("gone.example", "unreachable"),
        host("scvd.store", "ready"),
        host("expired.example", "ready"),
      ]),
      [
        bounty("paid.example", "paid", "2026-09-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z"),
        bounty("expired.example", "open", "2026-08-20T00:00:00.000Z", "2026-08-27T00:00:00.000Z"),
      ],
      "scvd.store",
      NOW,
    );
    const domains = candidates.map((entry) => entry.domain);
    // Ready only, and never our own door.
    expect(domains).not.toContain("broken.example");
    expect(domains).not.toContain("gone.example");
    expect(domains).not.toContain("scvd.store");
    // Never walked first — breadth is the board's whole job.
    expect(domains[0]).toBe("fresh.example");
    expect(candidates[0]?.history.state).toBe("never");
    expect(candidates[0]?.min_usdc).toBe(0.001);

    const paid = candidates.find((entry) => entry.domain === "paid.example");
    expect(paid?.history.state).toBe("paid");
    expect(paid?.history.at).toBe("2026-09-01T00:00:00.000Z");
    // A stored "open" past its expiry is expired, the same derivation
    // the board and the claim door both make.
    const stale = candidates.find((entry) => entry.domain === "expired.example");
    expect(stale?.history.state).toBe("expired");
    expect(stale?.blocked).toBeUndefined();
  });

  /**
   * A DOOR WE ALREADY HAVE OPEN IS SHOWN AND DISABLED, never filtered
   * away: "you already have a bounty open here" is the answer to the
   * question the keeper is asking, and hiding the row makes him ask it
   * again next week.
   */
  it("shows an already-open door with its reason instead of hiding it", () => {
    const candidates = bountyCandidates(
      round([host("open.example", "ready")]),
      [
        bounty(
          "open.example",
          "open",
          "2026-09-07T00:00:00.000Z",
          "2026-09-14T00:00:00.000Z",
        ),
      ],
      "scvd.store",
      NOW,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.history.state).toBe("open");
    expect(candidates[0]?.blocked).toContain("one per domain per week");
  });

  it("names one door per domain, whatever the round listed", () => {
    const candidates = bountyCandidates(
      round([
        host("dup.example", "ready"),
        { ...host("dup.example", "ready"), url: "https://dup.example/api/other" },
      ]),
      [],
      "scvd.store",
      NOW,
    );
    expect(candidates).toHaveLength(1);
  });
});

describe("the press posts a round and names every refusal", () => {
  it("posts the doors that 402 and reports the one that did not", async () => {
    vi.stubGlobal("fetch", world());
    const result = await openBountyBatch(
      testEnv,
      {
        urls: [
          "https://one.example/api/thing",
          "https://dead.example/api/thing",
          "https://two.example/api/thing",
        ],
        rewardUsd: 0.1,
        note: "the week's walk",
      },
      { fetch: world() },
    );
    expect(result.posted).toBe(2);
    expect(result.refused).toBe(1);
    const refusal = result.outcomes.find((outcome) => !outcome.ok);
    expect(refusal?.url).toContain("dead.example");
    expect(refusal?.refusal).toContain("404");
    // The posted ones are really on the board, with the note carried.
    const { bountyBoard } = await import("@/services/bounty-board");
    const board = await bountyBoard(testEnv, NOW);
    expect(board.open_count).toBe(2);
    expect(board.bounties[0]?.note).toBe("the week's walk");
    // And the notice a keeper reads says both halves.
    const notice = batchNotice(result);
    expect(notice).toContain("Posted 2 bounties");
    expect(notice).toContain("dead.example");
  });

  it("posts at most ten a press and says how many it did not take", async () => {
    vi.stubGlobal("fetch", world());
    const urls = Array.from(
      { length: BOUNTY_BATCH_CAP + 2 },
      (_, index) => `https://door${index}.example/api/thing`,
    );
    const result = await openBountyBatch(
      testEnv,
      { urls, rewardUsd: 0.1 },
      { fetch: world() },
    );
    expect(result.outcomes).toHaveLength(BOUNTY_BATCH_CAP);
    expect(result.trimmed).toBe(2);
    expect(batchNotice(result)).toContain("past the 10-per-press cap");
  });

  it("refuses the second bounty on one domain, in the same press", async () => {
    vi.stubGlobal("fetch", world());
    const result = await openBountyBatch(
      testEnv,
      {
        urls: [
          "https://same.example/api/one",
          "https://same.example/api/two",
        ],
        rewardUsd: 0.1,
      },
      { fetch: world() },
    );
    expect(result.posted).toBe(1);
    expect(result.outcomes[1]?.refusal).toContain("one per domain per week");
  });
});

describe("the press is behind the gate and answers both callers", () => {
  it("refuses an unauthenticated press", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/batch`, {
      method: "POST",
      headers: { "CF-Connecting-IP": "192.0.2.210" },
      body: new URLSearchParams({ url: "https://one.example/api", reward_usd: "0.1" }),
    });
    expect(response.status).toBe(401);
  });

  it("says so plainly when nothing was checked", async () => {
    const response = await SELF.fetch(`${BASE}/admin/bounties/batch`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [], reward_usd: 0.1 }),
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("nothing was posted");
  });

  it("answers a JSON press with every outcome", async () => {
    vi.stubGlobal("fetch", world());
    const response = await SELF.fetch(`${BASE}/admin/bounties/batch`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: ["https://json1.example/api", "https://dead.example/api"],
        reward_usd: 0.1,
      }),
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      posted: number;
      refused: number;
      outcomes: Array<{ ok: boolean; refusal?: string }>;
    };
    expect(result.posted).toBe(1);
    expect(result.refused).toBe(1);
    expect(result.outcomes.find((outcome) => !outcome.ok)?.refusal).toBeTruthy();
  });

  /**
   * THE DESK ITSELF. The list is only worth building if the page it
   * lands on prints the history beside each door — the whole point is
   * that the tenth press is as informed as the first.
   */
  it("renders the list on the market desk, with our history on each row", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round([host("fresh.example", "ready"), host("paid.example", "ready")]),
      ),
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.bounty("bty_paidexample"),
      JSON.stringify(
        bounty(
          "paid.example",
          "paid",
          "2026-09-01T00:00:00.000Z",
          "2026-09-08T00:00:00.000Z",
        ),
      ),
    );
    const html = await (
      await SELF.fetch(`${BASE}/admin/market`, {
        headers: { ...AUTH, Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("Post a round of bounties");
    expect(html).toContain("never walked");
    expect(html).toContain("walked and paid");
    expect(html).toContain('action="/admin/bounties/batch"');
    // The single-door form stays, under the list.
    expect(html).toContain("Or post one door by hand");
  });
});
