import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_USDC } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  BOUNTY_TIERS,
  bountyBoard,
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
      await SELF.fetch(`${BASE}/bounties`, { headers: { Accept: "text/html" } })
    ).text();
    expect(board.open_count).toBe(2);
    expect(room).toContain("sprint");
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
