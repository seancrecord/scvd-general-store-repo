import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bountyRoutes } from "@/routes/bounties";
import { BASE_USDC } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  BOUNTY_TIERS,
  bountyBoard,
  bountyRailNames,
  claimBounty,
  openBounty,
  sanitizeReport,
} from "@/services/bounty-board";
import { crowdFindings } from "@/services/crowd-findings";
import { crowdWalkRow } from "@/services/crowd-walks";
import { fieldSignerFromKey } from "@/services/launch-check";
import type { BountyRecord } from "@/services/bounty-board";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const DOOR = "https://shop.example/api/buy/thing";
const DOOR_PAY_TO = "0x1111111111111111111111111111111111111111";
const SHOPPER = "0x2222222222222222222222222222222222222222";
const OTHER_SHOPPER = "0x4444444444444444444444444444444444444444";
const PAYOUT_TO = "0x3333333333333333333333333333333333333333";
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TX = `0x${"cd".repeat(32)}`;
const DIGEST = "a".repeat(64);

/**
 * WHAT WE ASK FOR, HOW LONG WE ASK IT, AND WHAT WE DO WITH THE ANSWER
 * (2026-09-08).
 *
 * On 09-08 ten listings were claimed inside twenty minutes by one
 * automated wallet, each report fifty-one characters long, and the
 * store paid $2.50 for settlements it then did nothing with. None of
 * that was the walker's fault: every listing ran the same seven days,
 * nothing on the board said what a useful report contains, and no
 * surface anywhere added the walks up.
 *
 * Three things follow, and these tests hold each: a listing's length
 * is a posting decision; a listing carries its asks and the asks are
 * NEVER conditions of payment; and the reports are read into a
 * published reading whose denominators are printed beside every count.
 */

function world(): typeof fetch {
  const pad = (addr: string) => `0x${addr.toLowerCase().slice(2).padStart(64, "0")}`;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(".example/")) {
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
                  payTo: DOOR_PAY_TO,
                },
              ],
            }),
          ),
        },
      });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ result: "0x7a120" }), { status: 200 });
    }
    if (body.method === "eth_getTransactionReceipt") {
      return new Response(
        JSON.stringify({
          result: {
            status: "0x1",
            blockNumber: "0x7a130",
            /*
             * Both walkers' transfers ride one receipt here, so a claim
             * from either wallet finds its own settlement. The claim
             * door matches on the payer it was given; this test is
             * about WHO may claim, not about which log it picks.
             */
            logs: [SHOPPER, OTHER_SHOPPER].map((from) => ({
              address: BASE_USDC,
              topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                pad(from),
                pad(DOOR_PAY_TO),
              ],
              data: `0x${(50000).toString(16)}`,
            })),
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ result: `0x${"0".repeat(64)}` }), { status: 200 });
  }) as typeof fetch;
}

const claimOptions = async () => ({
  signer: await fieldSignerFromKey(TEST_FIELD_KEY),
  fetch: world(),
  screen: async () => ({ listed: false as const, source: "test screen" }),
});

async function clearBoard(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: "bounty" });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

afterEach(async () => {
  await clearBoard();
  vi.unstubAllGlobals();
});

describe("a listing's length is chosen, not inherited", () => {
  it("posts a sprint, a standard and a long, and publishes which is which", async () => {
    vi.stubGlobal("fetch", world());
    const now = new Date("2026-09-08T12:00:00.000Z");
    // The sprint fixture expired at noon on September 10. The rendered
    // board must read the same clock used to create its listings, rather
    // than SELF's separate Worker's real clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const sprint = await openBounty(
        testEnv,
        { targetUrl: DOOR, rewardUsd: 0.1, tier: "sprint" },
        { fetch: world(), now },
      );
      expect(sprint.tier).toBe("sprint");
      expect(sprint.open_days).toBe(BOUNTY_TIERS.sprint);
      expect(sprint.expires_at).toBe("2026-09-10T12:00:00.000Z");

      const long = await openBounty(
        testEnv,
        { targetUrl: "https://other.example/api", rewardUsd: 0.1, tier: "long" },
        { fetch: world(), now },
      );
      expect(long.open_days).toBe(21);
      expect(long.expires_at).toBe("2026-09-29T12:00:00.000Z");

      const board = await bountyBoard(testEnv, now);
      const room = await (
        await bountyRoutes.request(`${BASE}/bounties`, { headers: { Accept: "text/html" } }, testEnv)
      ).text();
      expect(board.open_count).toBe(2);
      expect(room).toContain("sprint");
      // Moving the clock still expires a sprint; only the test clock is fixed.
      vi.setSystemTime(new Date("2026-09-10T12:00:00.001Z"));
      expect((await bountyBoard(testEnv, new Date())).open_count).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a length outside the bound rather than quietly clamping it", async () => {
    vi.stubGlobal("fetch", world());
    await expect(
      openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1, days: 400 }, { fetch: world() }),
    ).rejects.toThrow(/between 1 and 30 days/);
  });
});

describe("the asks are published, and are never conditions of payment", () => {
  it("carries the asks onto the listing and every face that serves it", async () => {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(
      testEnv,
      {
        targetUrl: DOOR,
        rewardUsd: 0.1,
        asks: ["Did a PAYMENT-RESPONSE receipt come back?", "  ", "Send the body digest."],
      },
      { fetch: world() },
    );
    expect(bounty.asks).toEqual([
      "Did a PAYMENT-RESPONSE receipt come back?",
      "Send the body digest.",
    ]);
    const room = await (
      await SELF.fetch(`${BASE}/bounties`, { headers: { Accept: "text/html" } })
    ).text();
    expect(room).toContain("What we want observed here");
    expect(room).toContain("Send the body digest.");
    const json = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      what_we_need_back: string[];
    };
    expect(json.what_we_need_back.join(" ")).toContain("body_sha256");
    const claimDoor = (await (await SELF.fetch(`${BASE}/api/bounty-claim`)).json()) as {
      what_we_need_back: string[];
    };
    expect(claimDoor.what_we_need_back.length).toBeGreaterThan(3);
  });

  /**
   * THE LINE THAT MUST NOT MOVE. A reward withheld over an
   * unverifiable report would be this store grading a stranger's
   * homework with money — and buying the answers it wanted.
   */
  it("pays a walk that sends no report at all", async () => {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1, asks: ["Send everything."] },
      { fetch: world() },
    );
    const result = await claimBounty(
      testEnv,
      { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
      await claimOptions(),
    );
    expect(result.reward_usd).toBe(0.1);
  });

  it("keeps a structured report, drops a malformed field, and never refuses over one", async () => {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1 }, { fetch: world() });
    await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: TX,
        payer: SHOPPER,
        payoutTo: PAYOUT_TO,
        report: {
          status: 200,
          payment_response: true,
          body_sha256: `0x${DIGEST.toUpperCase()}`,
          bytes: 1234,
          latency_ms: 850,
          // Nonsense: dropped, not refused.
          content_type: "",
        } as never,
      },
      await claimOptions(),
    );
    const stored = await testEnv.COUNTERS.get<BountyRecord>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    expect(stored?.claim?.report).toEqual({
      status: 200,
      payment_response: true,
      body_sha256: DIGEST,
      bytes: 1234,
      latency_ms: 850,
    });
    // The sanitizer is the same one, exercised directly on junk.
    expect(sanitizeReport({ status: 9000, bytes: -5 } as never)).toBeUndefined();
    expect(sanitizeReport(undefined)).toBeUndefined();
  });

  /**
   * The structured half rides the SIGNED corpus row where the free
   * text cannot: its fields are bounded at the door, so the store's
   * signature vouches for "this walker sent these values" and nothing
   * more.
   */
  it("freezes the structured report into the corpus row, still tiered as theirs", async () => {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1 }, { fetch: world() });
    await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: TX,
        payer: SHOPPER,
        payoutTo: PAYOUT_TO,
        observation: "the goods came back",
        report: { status: 200, body_sha256: DIGEST },
      },
      await claimOptions(),
    );
    const stored = await testEnv.COUNTERS.get<BountyRecord>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    const row = await crowdWalkRow(stored!);
    expect(row?.tier).toBe("crowd-walked");
    expect(row?.walker_report).toEqual({ status: 200, body_sha256: DIGEST });
    // The free text still never rides verbatim.
    expect(JSON.stringify(row)).not.toContain("the goods came back");
  });
});

describe("a second walk has to be somebody else", () => {
  it("refuses the wallet that already walked this door, and keeps the listing open", async () => {
    vi.stubGlobal("fetch", world());
    const first = await openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1 }, { fetch: world() });
    await claimBounty(
      testEnv,
      { bountyId: first.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
      await claimOptions(),
    );
    // A second listing on the same door, posted as a second walk.
    const second = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1, distinctPayer: true },
      { fetch: world(), now: new Date(Date.now() + 8 * 24 * 3600 * 1000) },
    );
    expect(second.distinct_payer_required).toBe(true);
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: second.bounty_id,
          txHash: `0x${"ab".repeat(32)}`,
          payer: SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        await claimOptions(),
      ),
    ).rejects.toThrow(/has not already been paid for walking this door/);
    // Refused, not spent: the listing is still there for somebody else.
    const stored = await testEnv.COUNTERS.get<BountyRecord>(
      KV_KEYS.bounty(second.bounty_id),
      "json",
    );
    expect(stored?.status).toBe("open");
    // And a different wallet is paid for the same listing.
    const paid = await claimBounty(
      testEnv,
      {
        bountyId: second.bounty_id,
        txHash: `0x${"ef".repeat(32)}`,
        payer: OTHER_SHOPPER,
        payoutTo: PAYOUT_TO,
      },
      await claimOptions(),
    );
    expect(paid.reward_usd).toBe(0.1);
  });
});

describe("the walks are read, not just stored", () => {
  const walk = (
    id: string,
    host: string,
    payer: string,
    report?: Record<string, unknown>,
    verdict: "ready" | "not_ready" = "ready",
  ): BountyRecord =>
    ({
      bounty_id: id,
      target_url: `https://${host}/api`,
      domain: host,
      pay_to: DOOR_PAY_TO,
      amount_atomic: "50000",
      amount_usd: 0.05,
      reward_usd: 0.25,
      opened_at: "2026-09-08T00:00:00.000Z",
      opened_block: 1,
      expires_at: "2026-09-15T00:00:00.000Z",
      status: "paid",
      claim: {
        tx_hash: "0xab",
        payer,
        payout_to: PAYOUT_TO,
        claimed_at: "2026-09-08T01:00:00.000Z",
        authorization_nonce: "0x01",
        authorization_valid_before: "9999999999",
        house_probe: { verdict, failed: [], advisories: [], at: "2026-09-08T01:00:00.000Z" },
        ...(report ? { report } : {}),
      },
    }) as unknown as BountyRecord;

  it("counts the crowd's real size and says so in the headline", () => {
    const findings = crowdFindings([
      walk("b1", "a.example", SHOPPER),
      walk("b2", "b.example", SHOPPER),
      walk("b3", "c.example", SHOPPER),
    ]);
    expect(findings.walks.settlements).toBe(3);
    expect(findings.walks.distinct_payers).toBe(1);
    expect(findings.headline).toContain("1 paying wallet");
    expect(findings.headline).toContain("one buyer's experience, not the market's");
    expect(findings.reports.not_reported).toBe(3);
  });

  it("holds two wallets' digests against each other at one door", () => {
    const agree = crowdFindings([
      walk("b1", "same.example", SHOPPER, { body_sha256: DIGEST }),
      walk("b2", "same.example", OTHER_SHOPPER, { body_sha256: DIGEST }),
    ]);
    expect(agree.digests[0]).toEqual({
      host: "same.example",
      walks: 2,
      payers: 2,
      agreement: "agree",
    });
    const differ = crowdFindings([
      walk("b1", "same.example", SHOPPER, { body_sha256: DIGEST }),
      walk("b2", "same.example", OTHER_SHOPPER, { body_sha256: "b".repeat(64) }),
    ]);
    expect(differ.digests[0]?.agreement).toBe("differ");
    // One wallet twice is not two witnesses.
    const single = crowdFindings([
      walk("b1", "same.example", SHOPPER, { body_sha256: DIGEST }),
      walk("b2", "same.example", SHOPPER, { body_sha256: DIGEST }),
    ]);
    expect(single.digests[0]?.agreement).toBe("single");
  });

  /**
   * THE CELL A PROBE CANNOT FILL: our own knock said the door was not
   * ready, and a stranger's real money went through it anyway. That is
   * the whole argument for paying walkers, and it needs its own count.
   */
  it("separates our knock from their walk, both ways", () => {
    const findings = crowdFindings([
      walk("b1", "a.example", SHOPPER, { status: 200 }, "ready"),
      walk("b2", "b.example", SHOPPER, { status: 500 }, "ready"),
      walk("b3", "c.example", SHOPPER, { status: 200 }, "not_ready"),
      walk("b4", "d.example", SHOPPER),
    ]);
    expect(findings.house_vs_walker).toEqual({
      both_good: 1,
      house_ready_walk_failed: 1,
      house_unready_walk_worked: 1,
      incomparable: 1,
    });
    expect(findings.limits.join(" ")).toContain("still cannot pay for");
  });

  it("publishes the reading on the board's own faces", async () => {
    const json = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      what_the_walks_show: { headline: string; limits: string[] };
    };
    expect(json.what_the_walks_show.headline.length).toBeGreaterThan(10);
    expect(json.what_the_walks_show.limits.length).toBeGreaterThan(2);
    const room = await (
      await SELF.fetch(`${BASE}/bounties`, { headers: { Accept: "text/html" } })
    ).text();
    expect(room).toContain("What the walks have shown");
    expect(room).toContain("whose fact it is");
  });
});

/**
 * WHICH RAIL A DOOR IS CAPTURED ON (2026-09-09).
 *
 * The claim verifier reads seven EVM chains and Solana. The board had
 * posted on exactly two, and not by choice: the picker takes Base
 * whenever a door offers Base, and in the 2026-W37 census every single
 * door quoting Polygon, Arbitrum or World also quoted Base. 347 doors
 * on three rails, structurally unpostable.
 *
 * So a press may name the rail. The rule that matters is what happens
 * when the door does not offer it: a REFUSAL naming what it did offer,
 * never a quiet Base row, because a keeper who asked for Arbitrum
 * evidence and got Base would have bought the wrong thing and been
 * told it worked.
 */
describe("a rail is a posting decision, not an accident", () => {
  /** A door quoting Base and Arbitrum, the shape the census is full of. */
  function twoRailWorld(): typeof fetch {
    const evm = world();
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes(".example/")) {
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
                    payTo: DOOR_PAY_TO,
                  },
                  {
                    scheme: "exact",
                    network: "eip155:42161",
                    amount: "50000",
                    asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
                    payTo: DOOR_PAY_TO,
                  },
                ],
              }),
            ),
          },
        });
      }
      return evm(input, init);
    }) as typeof fetch;
  }

  it("takes Base by default, and Arbitrum when Arbitrum is asked for", async () => {
    const railWorld = twoRailWorld();
    vi.stubGlobal("fetch", railWorld);
    const byDefault = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: railWorld },
    );
    expect(byDefault.network).toBe("eip155:8453");

    const asked = await openBounty(
      testEnv,
      { targetUrl: "https://second.example/api", rewardUsd: 0.1, rail: "arbitrum" },
      { fetch: railWorld },
    );
    expect(asked.network).toBe("eip155:42161");
    // The CAIP-2 spelling resolves to the same rail.
    const byCaip2 = await openBounty(
      testEnv,
      { targetUrl: "https://third.example/api", rewardUsd: 0.1, rail: "eip155:42161" },
      { fetch: railWorld },
    );
    expect(byCaip2.network).toBe("eip155:42161");
  });

  it("refuses rather than quietly capturing another rail", async () => {
    const railWorld = twoRailWorld();
    vi.stubGlobal("fetch", railWorld);
    // The door offers Base and Arbitrum; Polygon is not on offer.
    await expect(
      openBounty(
        testEnv,
        { targetUrl: DOOR, rewardUsd: 0.1, rail: "polygon" },
        { fetch: railWorld },
      ),
    ).rejects.toThrow(/quotes no polygon entry — it offers eip155:8453, eip155:42161/);
    // Nothing was posted on any rail.
    const board = await bountyBoard(testEnv, new Date());
    expect(board.bounties).toHaveLength(0);
  });

  /**
   * XRPL, not Algorand: 81 ready doors quote XRPL in the W37 census
   * and this store reads none of them. (Algorand was the honest
   * example here for about an hour, until the fifth rail shipped — a
   * test that names an unsupported rail has to be repointed at one
   * that is still unsupported, which is the pleasant kind of
   * maintenance.)
   */
  it("refuses a rail this store cannot verify, and names the ones it can", async () => {
    const railWorld = twoRailWorld();
    vi.stubGlobal("fetch", railWorld);
    await expect(
      openBounty(
        testEnv,
        { targetUrl: DOOR, rewardUsd: 0.1, rail: "xrpl:0" },
        { fetch: railWorld },
      ),
    ).rejects.toThrow(/cannot verify a settlement on "xrpl:0"/);
    // And the refusal names what it CAN read, including the newest rail.
    await expect(
      openBounty(
        testEnv,
        { targetUrl: DOOR, rewardUsd: 0.1, rail: "xrpl:0" },
        { fetch: railWorld },
      ),
    ).rejects.toThrow(/Algorand/);
  });

  /**
   * The copy that said "Base, Polygon and Solana" while the verifier
   * read seven chains. Derived now, so the rules cannot fall behind
   * the code again.
   */
  it("publishes the rails it reads, derived from the verifier's own table", async () => {
    const names = bountyRailNames();
    for (const label of ["Base", "Polygon", "Arbitrum", "World", "Solana"]) {
      expect(names, `${label} missing from the published rails`).toContain(label);
    }
    const json = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      the_rules: string[];
    };
    const rails = json.the_rules.find((rule) => rule.includes("can be posted"));
    expect(rails).toContain("Arbitrum");
    expect(rails).toContain("World");
    expect(rails).not.toContain("Doors on Base, Polygon and Solana");
  });
});

/**
 * ONE LISTING PAYS ONCE, EVEN WHEN BOTH WALKERS REALLY WALKED
 * (2026-09-09).
 *
 * The claim door named this hole the day it shipped and left it open:
 * the replay guard keys the SETTLEMENT, so two claims on one listing
 * carrying two DIFFERENT real transactions both passed every check and
 * both were signed a reward. One listing, two payouts, and a weekly
 * budget that counted one — the money is not stolen, it is spent twice
 * for one piece of evidence.
 *
 * KV could not fix it: last-write-wins, edge-cached reads, no
 * compare-and-swap. A Durable Object decides it in one step. This test
 * is the one that would have failed before the lock existed, and it
 * uses two distinct settlements on purpose — with one transaction the
 * old tx guard already answered.
 */
describe("two real settlements, one listing", () => {
  it("signs exactly one reward and refuses the other without spending", async () => {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: world() },
    );
    const options = await claimOptions();
    const attempts = await Promise.allSettled([
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: `0x${"11".repeat(32)}`,
          payer: SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        options,
      ),
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          // A DIFFERENT settlement, equally real on this fake chain.
          txHash: `0x${"22".repeat(32)}`,
          payer: OTHER_SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        options,
      ),
    ]);
    const paid = attempts.filter((a) => a.status === "fulfilled");
    expect(paid.length, "one listing signed more than one reward").toBe(1);
    const refused = attempts.find((a) => a.status === "rejected");
    expect(String((refused as PromiseRejectedResult).reason)).toMatch(
      /being verified right now|not open/,
    );
    // The listing is paid once and the loser's settlement is not burned:
    // a walk that was refused must stay claimable somewhere else.
    const stored = await testEnv.COUNTERS.get<BountyRecord>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    expect(stored?.status).toBe("paid");
  });

  it("gives the lock back when a claim is refused, so the next walker is not shut out", async () => {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: world() },
    );
    // A screened-out payout address: refused deep inside the claim path.
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: `0x${"33".repeat(32)}`,
          payer: SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        {
          signer: await fieldSignerFromKey(TEST_FIELD_KEY),
          fetch: world(),
          screen: async () => ({ listed: true as const, source: "test screen" }),
        },
      ),
    ).rejects.toThrow(/sanctions screen/);
    // The very next claim goes through: the hold was released, not left
    // to lapse on its own clock.
    const paid = await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: `0x${"44".repeat(32)}`,
        payer: SHOPPER,
        payoutTo: PAYOUT_TO,
      },
      await claimOptions(),
    );
    expect(paid.reward_usd).toBe(0.1);
  });
});

/**
 * THE ASK, MADE OF SHAPE RATHER THAN SENTENCES (2026-09-09).
 *
 * Forty-nine settlements from three wallets carried ZERO structured
 * reports. The asks were on every listing, in the JSON those walkers
 * polled 235 times, and at the claim door — and a walker is code whose
 * claim body was written against the shape published the day it
 * integrated. Prose in a field nobody parses is prose nobody sends.
 *
 * Four things follow, and these tests hold each: the ask is a template
 * a client can act on; the fields are taken wherever the walker puts
 * them; a malformed field is explained rather than silently dropped;
 * and the answer teaches without ever touching the reward.
 */
describe("the ask is a shape, and the door teaches on the way past", () => {
  async function paidClaim(body: Record<string, unknown>) {
    vi.stubGlobal("fetch", world());
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: world() },
    );
    return claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: TX,
        payer: SHOPPER,
        payoutTo: PAYOUT_TO,
        ...body,
      } as never,
      await claimOptions(),
    );
  }

  it("publishes a template with keys and nulls, not a paragraph", async () => {
    const board = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      report_template: Record<string, null>;
      report_fields: Array<{ field: string; what: string; how: string; why: string }>;
    };
    expect(Object.keys(board.report_template).sort()).toEqual([
      "body_sha256",
      "bytes",
      "content_type",
      "etag",
      "latency_ms",
      "payment_response",
      "status",
    ]);
    expect(Object.values(board.report_template).every((v) => v === null)).toBe(true);
    // Every field says what it is, how to get it, and what it buys.
    for (const entry of board.report_fields) {
      expect(entry.what.length, entry.field).toBeGreaterThan(10);
      expect(entry.how.length, entry.field).toBeGreaterThan(10);
      expect(entry.why.length, entry.field).toBeGreaterThan(10);
    }
    // And the claim door answers with a complete, fillable body.
    const door = (await (await SELF.fetch(`${BASE}/api/bounty-claim`)).json()) as {
      example_claim: Record<string, unknown>;
    };
    expect(Object.keys(door.example_claim)).toContain("report");
    expect(door.example_claim["bounty_id"]).toBeTruthy();
  });

  it("tells a walk that sent nothing exactly what it could have sent", async () => {
    const result = await paidClaim({});
    expect(result.reward_usd).toBe(0.1);
    expect(result.your_report.received).toBeNull();
    expect(result.your_report.missing.map((m) => m.field)).toContain("body_sha256");
    for (const entry of result.your_report.missing) {
      expect(entry.how.length, entry.field).toBeGreaterThan(10);
    }
    expect(result.your_report.template).toHaveProperty("status", null);
    // The reward is never the lever.
    expect(result.your_report.note).toContain("reward is yours regardless");
  });

  /**
   * A CORRECT PAYLOAD IN THE FLATTER SHAPE. Refusing this on a
   * technicality would be this store failing the way the doors it
   * audits fail: the right values, rejected for their packaging.
   */
  it("takes the fields at the top level as well as nested", async () => {
    const { claimedReport } = await import("@/routes/bounties");
    // The flatter shape, which is the one a client is likelier to send.
    expect(
      claimedReport({ bounty_id: "bty_x", status: 200, body_sha256: DIGEST }),
    ).toEqual({ status: 200, body_sha256: DIGEST });
    // The nested shape, as documented.
    expect(claimedReport({ report: { status: 201 } })).toEqual({ status: 201 });
    // Both at once: nested wins, and nothing is lost from either.
    expect(
      claimedReport({ status: 200, latency_ms: 12, report: { status: 500 } }),
    ).toEqual({ status: 500, latency_ms: 12 });
    // A claim with no report at all stays undefined rather than {}.
    expect(claimedReport({ bounty_id: "bty_x" })).toBeUndefined();
  });

  it("keeps what fits, names what did not, and never charges for the mistake", async () => {
    const result = await paidClaim({
      report: {
        status: 200,
        body_sha256: "not-a-digest",
        payment_response: "yes",
        latency_ms: 850,
      },
    });
    expect(result.reward_usd).toBe(0.1);
    expect(result.your_report.received).toEqual({ status: 200, latency_ms: 850 });
    const dropped = result.your_report.dropped.map((d) => d.field).sort();
    expect(dropped).toEqual(["body_sha256", "payment_response"]);
    // Each says the shape it needed, so a walker is one edit from useful.
    const digest = result.your_report.dropped.find((d) => d.field === "body_sha256");
    expect(digest?.why).toContain("64 hex characters");
    const receipt = result.your_report.dropped.find((d) => d.field === "payment_response");
    expect(receipt?.why).toContain("true or false");
  });

  it("says so plainly when a walk sent everything", async () => {
    const result = await paidClaim({
      report: {
        status: 200,
        payment_response: false,
        body_sha256: DIGEST,
        bytes: 1234,
        latency_ms: 850,
        content_type: "application/json",
        etag: 'W/"d28-1jERcbmO1KX0"',
      },
    });
    expect(result.your_report.missing).toHaveLength(0);
    expect(result.your_report.dropped).toHaveLength(0);
    expect(result.your_report.note).toContain("held against another walker");
  });

  /**
   * SELLING TO SOMEBODY WHO WAS JUST PAID (the keeper: "so they can
   * spend the money they made"). Once, on the paid answer, made of
   * facts read off the menu and the credit desk — and never on a
   * refusal, because a walker being told no is not a sales
   * opportunity.
   */
  it("offers the shelf on a paid claim, with prices read off the menu", async () => {
    const { walkerOffer } = await import("@/services/walker-offer");
    const offer = walkerOffer(BASE);
    expect(offer.cheapest_usd).toBeGreaterThan(0);
    expect(offer.cheapest_item.buy_url).toContain("/api/buy/");
    expect(offer.credit).toContain("%");
    // The rate AND the floor: a rebate whose threshold is unstated
    // reads as money you can take today, and is not.
    const { CREDIT_FLOOR_ATOMIC, CREDIT_RATE } = await import("@/services/store-credit");
    expect(offer.credit).toContain(`${CREDIT_RATE * 100}%`);
    expect(offer.credit).toContain(`$${(Number(CREDIT_FLOOR_ATOMIC) / 1e6).toFixed(2)}`);
    // The standing arrangement is named where it exists.
    expect(offer.patronage?.id).toBe("recurring_patronage");
    expect(offer.patronage?.what).toContain("thirty-day");
    // The cheapest quoted price is really the cheapest on the menu.
    const { MENU_ITEMS } = await import("@/store/menu");
    const min = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
    expect(offer.cheapest_usd).toBe(min);
  });

  it("never puts the offer on a refusal", async () => {
    const refused = await SELF.fetch(`${BASE}/api/bounty-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bounty_id: "bty_none", tx_hash: `0x${"cd".repeat(32)}` }),
    });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(await refused.json())).not.toContain("spend_it_here");
  });
});
