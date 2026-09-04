import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { payToDigest } from "@/lib/pay-to-digest";
import type { BountyRecord } from "@/services/bounty-board";
import { canonicalizeCorpusSnapshot } from "@/services/corpus";
import { crowdWalkRow, crowdWalksForWeek } from "@/services/crowd-walks";
import { buildFreshSet } from "@/services/fresh-set";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE PROMISE THE BOARD MADE IN PROSE (2026-09-04). BOUNTY_BOARD.md
 * said from the first day that a shopper's chain-verified settlement
 * enters the corpus at its own tier. The keeper read the first paid
 * claim and asked where the data went; the answer was nowhere. These
 * hold the row now: born sealed (digests, never wallets; a hash of
 * the walker's text, never the text), assembled into the week's
 * round, frozen by the corpus, served on the routing surface at its
 * own tier and never blended into the probe rows.
 */

const PAYER = "0xd3b5958e453ff9bb3f46fd2e60b24d916ed3a95f";
const PAY_TO = "0x1111111111111111111111111111111111111111";
const OBSERVATION = "GET answered 402 with x402 v2 exact terms, then I paid and got JSON back";

function paidBounty(id: string, claimedAt: string, extra: Partial<NonNullable<BountyRecord["claim"]>> = {}): BountyRecord {
  return {
    bounty_id: id,
    target_url: "https://glim.sh/api/v1/twitter/trends",
    domain: "glim.sh",
    pay_to: PAY_TO,
    network: "eip155:8453",
    amount_atomic: "1000",
    amount_usd: 0.001,
    reward_usd: 0.25,
    opened_at: "2026-09-01T00:00:00.000Z",
    opened_block: 1000,
    expires_at: "2026-09-08T00:00:00.000Z",
    status: "paid",
    claim: {
      tx_hash: "0x4b829a997e1bcdeb0000000000000000000000000000000000000000000075c7aa",
      payer: PAYER,
      payout_to: PAYER,
      claimed_at: claimedAt,
      authorization_nonce: `0x${"aa".repeat(32)}`,
      authorization_valid_before: "1789138064",
      settled_block: 35_000_000,
      house_probe: { verdict: "ready", failed: [], advisories: [], at: claimedAt },
      observation: OBSERVATION,
      ...extra,
    },
  };
}

describe("a paid claim becomes a corpus row, born sealed", () => {
  it("carries the chain's part and our knock, digests instead of wallets, a hash instead of their words", async () => {
    const row = await crowdWalkRow(paidBounty("bty_1", "2026-09-04T14:47:00.000Z"));
    expect(row).toBeTruthy();
    expect(row!.tier).toBe("crowd-walked");
    expect(row!.host).toBe("glim.sh");
    expect(row!.settlement.block).toBe(35_000_000);
    expect(row!.settlement.amount_usd).toBe(0.001);
    expect(row!.settlement.payer_digest).toBe(await payToDigest(PAYER));
    expect(row!.settlement.pay_to_digest).toBe(await payToDigest(PAY_TO));
    expect(row!.house_probe?.verdict).toBe("ready");
    expect(row!.observation?.length).toBe(OBSERVATION.length);
    expect(row!.observation?.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Nothing verbatim that the chain could not unsign.
    const text = JSON.stringify(row);
    expect(text.toLowerCase()).not.toContain(PAYER.slice(2).toLowerCase());
    expect(text.toLowerCase()).not.toContain(PAY_TO.slice(2).toLowerCase());
    expect(text).not.toContain("x402 v2 exact terms");
  });

  it("an open bounty is no row at all", async () => {
    const open = { ...paidBounty("bty_2", "2026-09-04T00:00:00.000Z"), status: "open" as const };
    delete (open as { claim?: unknown }).claim;
    expect(await crowdWalkRow(open)).toBeNull();
  });

  it("assembles one week's paid claims, and only that week's", async () => {
    const put = (bounty: BountyRecord) =>
      testEnv.COUNTERS.put(KV_KEYS.bounty(bounty.bounty_id), JSON.stringify(bounty));
    await put(paidBounty("bty_w36_a", "2026-09-04T14:47:00.000Z"));
    await put(paidBounty("bty_w36_b", "2026-09-02T09:00:00.000Z"));
    await put(paidBounty("bty_w35", "2026-08-28T09:00:00.000Z"));
    try {
      const pass = await crowdWalksForWeek(testEnv, "2026-W36");
      expect(pass.rows.map((row) => row.bounty_id)).toEqual(["bty_w36_b", "bty_w36_a"]);
      // A reading that saw the whole board says so, rather than
      // leaving a caller to assume it (bounded-read honesty).
      expect(pass.truncated).toBe(false);
      expect((await crowdWalksForWeek(testEnv, "2026-W30")).rows).toEqual([]);
    } finally {
      for (const id of ["bty_w36_a", "bty_w36_b", "bty_w35"]) {
        await testEnv.COUNTERS.delete(KV_KEYS.bounty(id));
      }
    }
  });
});

describe("the rows reach the record and the routing surface at their own tier", () => {
  function round(extra: Partial<WardRound> = {}): WardRound {
    return {
      week: "2026-W36",
      at: "2026-09-06T11:00:00.000Z",
      listed_resources: 2,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: [
        { host: "glim.sh", url: "https://glim.sh/api/v1/twitter/trends", verdict: "ready", failed: [], advisories: [] },
        { host: "other.example", url: "https://other.example/api", verdict: "ready", failed: [], advisories: [] },
      ],
      ...extra,
    };
  }

  it("freezes into the corpus snapshot with everything else on the round", async () => {
    const row = await crowdWalkRow(paidBounty("bty_1", "2026-09-04T14:47:00.000Z"));
    const canonical = canonicalizeCorpusSnapshot({
      version: 1,
      sequence: 1,
      taken_at: "2026-09-06T11:00:00.000Z",
      previous_digest: null,
      source: "ward_round",
      week: "2026-W36",
      round: round({ crowd_walks: [row!] }),
    });
    expect(canonical).toContain('"crowd_walks"');
    expect(canonical).toContain('"tier":"crowd-walked"');
  });

  it("the fresh set lists them apart and flags the door a stranger paid", async () => {
    const row = await crowdWalkRow(paidBounty("bty_1", "2026-09-04T14:47:00.000Z"));
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round({ crowd_walks: [row!] })),
    );
    const set = await buildFreshSet(testEnv);
    expect(set).toBeTruthy();
    expect(set!.crowd_walks).toHaveLength(1);
    expect(set!.crowd_walks[0]).toMatchObject({
      tier: "crowd-walked",
      host: "glim.sh",
      amount_usd: 0.001,
      house_probe_verdict: "ready",
      history_url: `${BASE}/corpus/host/glim.sh.json`,
    });
    expect(set!.crowd_walks_note).toContain("their claim");
    // The published set states whether it is the week or a floor.
    expect(set!.crowd_walks_truncated).toBe(false);
    const glim = set!.rows.find((r) => r.host === "glim.sh");
    const other = set!.rows.find((r) => r.host === "other.example");
    expect(glim?.settled_by_a_stranger_this_week).toBe(true);
    expect(other?.settled_by_a_stranger_this_week).toBeUndefined();
    // Served live, same shape.
    const live = await SELF.fetch(`${BASE}/fresh-set`, { headers: { Accept: "application/json" } });
    expect(live.status).toBe(200);
    const body = (await live.json()) as { crowd_walks?: unknown[] };
    expect(Array.isArray(body.crowd_walks)).toBe(true);
  });
});
