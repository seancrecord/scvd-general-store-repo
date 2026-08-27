import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { payToDigest, PAY_TO_DIGEST_SALT } from "@/lib/pay-to-digest";
import {
  deriveWalletFacts,
  sharedWalletFactFor,
} from "@/services/operator-facts";
import { listCorpus, takeCorpusSnapshot } from "@/services/corpus";
import type { CorpusRecord } from "@/services/corpus";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE G2 RULING, AS MECHANISM (roadmap 3.6; the ruling doc is
 * docs/G2_OPERATOR_LINKING_RULING_2026-08.md, keeper-ruled
 * 2026-08-27). Four laws these tests hold the build to:
 *
 *  1. FACTS, NEVER THE CALL. No surface serves an `operator` field or
 *     asserts identity; the receiver draws the join. The caveat —
 *     custodial and platform wallets make strangers look like one
 *     operator — rides every cross-host fact inline.
 *  2. CHAIN HYGIENE. New signed rows carry a salted digest of payTo,
 *     never the verbatim address; the mutable round keeps verbatim.
 *     Existing chain rows stand as history and still join by digest,
 *     derived at read.
 *  3. T1 IS COUNTS. The public wallet-facts surface serves counts
 *     with denominators and no names, no addresses, no digest lists.
 *  4. T2 IS ABOUT ONE HOST. A door's own page may say its address
 *     also receives at N OTHER doors; no other door is named, and a
 *     round where capture did not happen says NOT_CAPTURED rather
 *     than zero (rule 52).
 */

const WALLET_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const WALLET_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: async () => new Response(new Uint8Array([1, 2, 3])),
};

function hostRow(
  host: string,
  verdict: string,
  payTo?: string[],
): Record<string, unknown> {
  return {
    host,
    url: `https://${host}/x402`,
    verdict,
    checked_at: "2026-08-27T10:00:00.000Z",
    failed: [],
    advisories: [],
    ...(payTo
      ? {
          offer: {
            networks: ["eip155:8453"],
            schemes: ["exact"],
            min_usdc: 0.01,
            pay_to: payTo.map((a) => (a.startsWith("0x") ? a.toLowerCase() : a)),
          },
        }
      : {}),
  };
}

async function seedRound(): Promise<void> {
  const round = {
    week: "2026-W35",
    started_at: "2026-08-27T10:00:00.000Z",
    finished_at: "2026-08-27T10:30:00.000Z",
    listed_resources: 4,
    hosts: [
      hostRow("alpha.example", "ready", [WALLET_A]),
      hostRow("beta.example", "ready", [WALLET_A]),
      hostRow("gamma.example", "ready", [WALLET_B]),
      hostRow("delta.example", "not_ready"),
    ],
  };
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify(round),
  );
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.corpusPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
});

describe("the digest is public arithmetic", () => {
  it("derives from the documented salt, so any address-holder can verify", async () => {
    const digest = await payToDigest(WALLET_A);
    const bytes = new TextEncoder().encode(
      `${PAY_TO_DIGEST_SALT}${WALLET_A.toLowerCase()}`,
    );
    const expected = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(digest).toBe(expected);
    // Case-insensitive for EVM (the capture law lowercases 0x).
    expect(await payToDigest(WALLET_A.toLowerCase())).toBe(digest);
  });
});

describe("chain hygiene: new signed rows carry the digest, never the address", () => {
  it("the frozen snapshot has pay_to_digest and no verbatim pay_to; the mutable round keeps verbatim", async () => {
    await seedRound();
    const records = await listCorpus(testEnv);
    expect(records.length).toBe(1);
    const raw = JSON.stringify(records[0]);
    expect(raw).not.toContain(WALLET_A.toLowerCase());
    expect(raw).not.toContain(WALLET_B.toLowerCase());
    const alpha = records[0]!.snapshot.round.hosts.find(
      (h: { host: string }) => h.host === "alpha.example",
    ) as { offer?: { pay_to?: string[]; pay_to_digest?: string[] } };
    expect(alpha.offer?.pay_to).toBeUndefined();
    expect(alpha.offer?.pay_to_digest).toEqual([await payToDigest(WALLET_A)]);
    // The mutable round is where verbatim lives (the ruling's split).
    const mutable = await testEnv.COUNTERS.get(KV_KEYS.wardRoundLatest);
    expect(mutable).toContain(WALLET_A.toLowerCase());
  });
});

describe("T1: public counts, no names, never the call", () => {
  it("counts clusters with denominators and refuses names, addresses and the operator word", async () => {
    await seedRound();
    const facts = await deriveWalletFacts(await listCorpus(testEnv));
    expect(facts).not.toBeNull();
    expect(facts!.week).toBe("2026-W35");
    expect(facts!.hosts_probed).toBe(4);
    expect(facts!.hosts_with_pay_to).toBe(3);
    expect(facts!.distinct_addresses).toBe(2);
    expect(facts!.addresses_at_multiple_doors).toBe(1);
    expect(facts!.largest_cluster_doors).toBe(2);
    expect(String(facts!.shared_wallet_caveat)).toMatch(/custodial|platform/i);
    const raw = JSON.stringify(facts);
    // No addresses, no digest lists, no host names, no ratios, and —
    // the ruling's first law as a mechanism — no operator field.
    expect(raw).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(raw).not.toContain("alpha.example");
    expect(raw).not.toMatch(/"operator/);
    expect(raw).not.toMatch(/"pct"|"percent|_rate"/);
  });

  it("answers null on an empty chain rather than inventing a week", async () => {
    expect(await deriveWalletFacts([])).toBeNull();
  });
});

describe("T2: one door's own fact, nobody else named", () => {
  it("says how many OTHER doors its address receives at, with the caveat", async () => {
    await seedRound();
    const records = await listCorpus(testEnv);
    const fact = await sharedWalletFactFor(records, "alpha.example");
    expect(fact).not.toBeNull();
    expect(fact!.captured).toBe(true);
    expect(fact!.also_receives_at_other_doors).toBe(1);
    expect(String(fact!.shared_wallet_caveat)).toMatch(/custodial|platform/i);
    // Provenance: the signed snapshot this derives from, named.
    expect(fact!.digest).toBe(records[0]!.digest);
    const raw = JSON.stringify(fact);
    expect(raw).not.toContain("beta.example");
    expect(raw).not.toMatch(/"operator/);

    const solo = await sharedWalletFactFor(records, "gamma.example");
    expect(solo!.also_receives_at_other_doors).toBe(0);
  });

  it("a round with no capture says NOT_CAPTURED, never zero (rule 52)", async () => {
    await seedRound();
    const records = await listCorpus(testEnv);
    const fact = await sharedWalletFactFor(records, "delta.example");
    expect(fact).not.toBeNull();
    expect(fact!.captured).toBe(false);
    expect(fact!.also_receives_at_other_doors).toBeUndefined();

    expect(await sharedWalletFactFor(records, "never-met.example")).toBeNull();
  });
});

describe("legacy rows still join, by digest derived at read", () => {
  it("a pre-hygiene record with verbatim pay_to clusters with a sealed one", async () => {
    await seedRound();
    const sealed = (await listCorpus(testEnv))[0]!;
    // A record frozen before the ruling: verbatim addresses in the
    // signed row. It stands as history and must still join.
    const legacy = {
      ...sealed,
      snapshot: {
        ...sealed.snapshot,
        round: {
          ...sealed.snapshot.round,
          hosts: [hostRow("old.example", "ready", [WALLET_A])],
        },
      },
    } as unknown as CorpusRecord;
    const facts = await deriveWalletFacts([legacy]);
    expect(facts!.hosts_with_pay_to).toBe(1);
    expect(facts!.distinct_addresses).toBe(1);
    const fact = await sharedWalletFactFor([legacy], "old.example");
    expect(fact!.captured).toBe(true);
  });
});

describe("the surfaces", () => {
  it("GET /corpus/wallet-facts.json serves T1 with its derivation and no address anywhere", async () => {
    await seedRound();
    const response = await SELF.fetch(`${BASE}/corpus/wallet-facts.json`);
    expect(response.status).toBe(200);
    const raw = await response.text();
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(String(body.how_to_rederive)).toContain("/corpus/");
    expect(raw).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(raw).not.toMatch(/"operator/);
  });

  it("the per-subject page carries the T2 block for its own door only", async () => {
    await seedRound();
    const response = await SELF.fetch(
      `${BASE}/corpus/host/alpha.example.json`,
    );
    expect(response.status).toBe(200);
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      payment_address?: { also_receives_at_other_doors?: number };
    };
    expect(body.payment_address).toBeDefined();
    expect(body.payment_address!.also_receives_at_other_doors).toBe(1);
    expect(raw).not.toContain("beta.example");
  });
});
