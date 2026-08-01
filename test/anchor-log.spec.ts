import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendAnchor,
  canonicalizeSnapshot,
  digestOf,
  latestAnchor,
  listAnchors,
  saveAnchor,
  verifyChain,
  type AnchorRecord,
  type AnchorSnapshot,
} from "@/services/anchor-log";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE ANCHOR LOG, tested for the properties an outside verifier will
 * actually rely on: that the chain is a chain, that a digest is the
 * hash of its own published snapshot, and that tampering is loud.
 *
 * Every test here runs WITHOUT network. The external submitters are a
 * separate seam for exactly this reason — the chain's correctness must
 * be provable with nobody else's server involved.
 */

async function clearAnchors(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.anchorLogPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
}

beforeEach(async () => {
  await clearAnchors();
});

describe("the digest", () => {
  const base: AnchorSnapshot = {
    version: 1,
    sequence: 1,
    taken_at: "2026-08-02T00:00:00.000Z",
    previous_digest: null,
    current_public_key: "aa".repeat(32),
    retired_keys: [
      { public_key: "bb".repeat(32), retired_on: "2026-07-31" },
      { public_key: "cc".repeat(32), retired_on: "2026-07-22" },
    ],
    artifacts_issued_total: 42,
  };

  it("is deterministic for the same snapshot", async () => {
    expect(await digestOf(base)).toBe(await digestOf({ ...base }));
  });

  it("sorts retired keys, so registry write order cannot change it", async () => {
    const reordered: AnchorSnapshot = {
      ...base,
      retired_keys: [...base.retired_keys].reverse(),
    };
    expect(await digestOf(reordered)).toBe(await digestOf(base));
    // And the canonical form really is sorted oldest-retirement-first.
    const canonical = canonicalizeSnapshot(base);
    expect(canonical.indexOf("2026-07-22")).toBeLessThan(
      canonical.indexOf("2026-07-31"),
    );
  });

  it("changes when any committed field changes", async () => {
    const original = await digestOf(base);
    expect(await digestOf({ ...base, artifacts_issued_total: 43 })).not.toBe(
      original,
    );
    expect(await digestOf({ ...base, current_public_key: "dd".repeat(32) })).not.toBe(
      original,
    );
    expect(await digestOf({ ...base, taken_at: "2026-08-03T00:00:00.000Z" })).not.toBe(
      original,
    );
    expect(await digestOf({ ...base, previous_digest: "ff".repeat(32) })).not.toBe(
      original,
    );
  });

  it("is recomputable by a stranger from the published snapshot alone", async () => {
    // Exactly what an outsider does: take the JSON, canonicalize with
    // the documented field order, sha256 it.
    const roundTripped = JSON.parse(
      JSON.stringify(base),
    ) as AnchorSnapshot;
    expect(await digestOf(roundTripped)).toBe(await digestOf(base));
  });
});

describe("appending", () => {
  it("starts a genesis entry with no previous digest", async () => {
    const first = await appendAnchor(testEnv);
    expect(first.snapshot.sequence).toBe(1);
    expect(first.snapshot.previous_digest).toBeNull();
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    // Stored, not just returned.
    expect((await latestAnchor(testEnv))?.digest).toBe(first.digest);
  });

  it("chains each entry to the one before it", async () => {
    const first = await appendAnchor(testEnv);
    const second = await appendAnchor(testEnv);
    const third = await appendAnchor(testEnv);
    expect(second.snapshot.previous_digest).toBe(first.digest);
    expect(third.snapshot.previous_digest).toBe(second.digest);
    expect(third.snapshot.sequence).toBe(3);
    expect(await verifyChain(await listAnchors(testEnv))).toEqual([]);
  });

  it("orders by sequence, not by KV key luck, past ten entries", async () => {
    for (let i = 0; i < 11; i += 1) {
      await appendAnchor(testEnv);
    }
    const records = await listAnchors(testEnv);
    expect(records.length).toBe(11);
    // The zero-padding exists so entry 10 does not sort before entry 2.
    expect(records.map((r) => r.snapshot.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(await verifyChain(records)).toEqual([]);
  });

  it("records the key state it is committing to", async () => {
    const record = await appendAnchor(testEnv);
    expect(record.snapshot.current_public_key).toMatch(/^[0-9a-f]{64}$/);
    // The live key is never listed as one of its own retired keys.
    const retiredKeys = record.snapshot.retired_keys.map((k) => k.public_key);
    expect(retiredKeys).not.toContain(record.snapshot.current_public_key);
  });
});

describe("tampering is loud", () => {
  it("catches an edited snapshot whose digest was left alone", async () => {
    await appendAnchor(testEnv);
    const second = await appendAnchor(testEnv);
    // Someone rewrites history: bump the artifact count, keep the digest.
    const forged: AnchorRecord = {
      ...second,
      snapshot: { ...second.snapshot, artifacts_issued_total: 9999 },
    };
    await saveAnchor(testEnv, forged);
    const problems = await verifyChain(await listAnchors(testEnv));
    expect(problems.some((p) => p.problem.includes("digest does not match"))).toBe(
      true,
    );
  });

  it("catches a re-hashed entry, because the NEXT entry still names the old digest", async () => {
    await appendAnchor(testEnv);
    const second = await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    // A more careful forger recomputes the digest too — and the chain
    // still breaks, because entry three points at what entry two used
    // to be. This is the property the previous_digest field buys.
    const rewrittenSnapshot = {
      ...second.snapshot,
      artifacts_issued_total: 9999,
    };
    await saveAnchor(testEnv, {
      snapshot: rewrittenSnapshot,
      digest: await digestOf(rewrittenSnapshot),
    });
    const problems = await verifyChain(await listAnchors(testEnv));
    expect(
      problems.some((p) => p.problem.includes("previous_digest does not chain")),
    ).toBe(true);
  });

  it("catches a deleted entry as a sequence gap", async () => {
    await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    await testEnv.COUNTERS.delete(`${KV_KEYS.anchorLogPrefix}000000002`);
    const problems = await verifyChain(await listAnchors(testEnv));
    expect(problems.some((p) => p.problem.includes("sequence gap"))).toBe(true);
  });

  it("reports every break, not just the first", async () => {
    await appendAnchor(testEnv);
    const second = await appendAnchor(testEnv);
    const third = await appendAnchor(testEnv);
    for (const record of [second, third]) {
      await saveAnchor(testEnv, {
        ...record,
        snapshot: { ...record.snapshot, artifacts_issued_total: 1234 },
      });
    }
    const problems = await verifyChain(await listAnchors(testEnv));
    expect(problems.length).toBeGreaterThan(1);
  });

  it("passes an untouched chain, so the check is not just always-fail", async () => {
    await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    expect(await verifyChain(await listAnchors(testEnv))).toEqual([]);
  });
});

describe("empty state", () => {
  it("has no latest anchor and an empty chain verifies vacuously", async () => {
    expect(await latestAnchor(testEnv)).toBeNull();
    expect(await listAnchors(testEnv)).toEqual([]);
    expect(await verifyChain([])).toEqual([]);
  });
});
