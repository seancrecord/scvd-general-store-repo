import { describe, expect, it } from "vitest";
import {
  canonicalizeAnchorSnapshot,
  checkAnchoredKeyHistory,
  verifyAnchorChain,
} from "../verifier/x402-verify.js";
import { canonicalizeSnapshot, digestOf } from "@/services/anchor-log";
import type { AnchorSnapshot } from "@/services/anchor-log";

/**
 * THE VERIFIER'S ANCHOR-LOG CHECK, tested the only way it means
 * anything: by lying to it.
 *
 * The chain is worth more than a sentence on a website ONLY IF an
 * outsider recomputes it. So the cases that matter here are the four
 * ways a log can be dishonest — an edited snapshot, an
 * edited-and-rehashed snapshot, a deleted entry, and a canonical_form
 * that is not the snapshot beside it — plus the one where the issuer
 * simply does not publish a log at all, which must read as "no
 * information" and never as "failed".
 *
 * The canonicalization is also pinned against the SERVER'S OWN
 * implementation, not against a copy of itself. Two independent
 * implementations that agree is the property being bought; a verifier
 * tested only against its own output would agree with itself forever
 * while drifting away from the thing it verifies.
 */

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

function snapshot(
  sequence: number,
  previousDigest: string | null,
  overrides: Partial<AnchorSnapshot> = {},
): AnchorSnapshot {
  return {
    version: 1,
    sequence,
    taken_at: `2026-0${sequence}-01T00:00:00.000Z`,
    previous_digest: previousDigest,
    current_public_key: KEY_A,
    retired_keys: [],
    artifacts_issued_total: sequence * 10,
    ...overrides,
  };
}

interface LogEntry {
  snapshot: AnchorSnapshot;
  digest: string;
  canonical_form: string;
  ots?: { status: string; proof_base64?: string };
}

/** Builds an honest log the same way the Worker builds the real one. */
async function buildLog(snapshots: AnchorSnapshot[]): Promise<{
  entries: LogEntry[];
}> {
  const entries: LogEntry[] = [];
  let previous: string | null = null;
  for (const base of snapshots) {
    const linked: AnchorSnapshot = { ...base, previous_digest: previous };
    const digest = await digestOf(linked);
    entries.push({
      snapshot: linked,
      digest,
      canonical_form: canonicalizeSnapshot(linked),
    });
    previous = digest;
  }
  return { entries };
}

function fakeFetch(
  body: unknown,
  status = 200,
): (url: string) => Promise<Response> {
  return async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response;
}

describe("canonicalizeAnchorSnapshot", () => {
  it("agrees byte for byte with the server that writes the log", async () => {
    const snap = snapshot(3, "deadbeef", {
      retired_keys: [
        { public_key: KEY_B, retired_on: "2026-02-01" },
        { public_key: KEY_A, retired_on: "2026-01-01" },
      ],
    });
    expect(canonicalizeAnchorSnapshot(snap)).toBe(canonicalizeSnapshot(snap));
  });

  it("sorts retired keys the same way regardless of published order", () => {
    const ordered = snapshot(1, null, {
      retired_keys: [
        { public_key: KEY_A, retired_on: "2026-01-01" },
        { public_key: KEY_B, retired_on: "2026-02-01" },
      ],
    });
    const shuffled = snapshot(1, null, {
      retired_keys: [
        { public_key: KEY_B, retired_on: "2026-02-01" },
        { public_key: KEY_A, retired_on: "2026-01-01" },
      ],
    });
    expect(canonicalizeAnchorSnapshot(shuffled)).toBe(
      canonicalizeAnchorSnapshot(ordered),
    );
  });

  it("ignores fields the issuer bolted on, so the form stays fixed", () => {
    const clean = snapshot(1, null);
    const padded = { ...clean, note: "trust me", extra: 42 };
    expect(canonicalizeAnchorSnapshot(padded)).toBe(
      canonicalizeAnchorSnapshot(clean),
    );
  });
});

describe("verifyAnchorChain", () => {
  it("accepts an honest chain", async () => {
    const log = await buildLog([snapshot(1, null), snapshot(2, null)]);
    const result = await verifyAnchorChain(log);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.checked).toBe(2);
  });

  it("accepts an empty log without inventing a problem", async () => {
    const result = await verifyAnchorChain({ entries: [] });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  it("catches an edited snapshot by rehashing it", async () => {
    const log = await buildLog([snapshot(1, null), snapshot(2, null)]);
    log.entries[0]!.snapshot.current_public_key = KEY_B;
    const result = await verifyAnchorChain(log);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain(
      "published digest does not match",
    );
  });

  it("catches an edited-and-rehashed snapshot via the next entry's link", async () => {
    const log = await buildLog([snapshot(1, null), snapshot(2, null)]);
    // The thorough forgery: edit the snapshot AND fix its own digest
    // and canonical form, so entry 1 is internally perfect.
    log.entries[0]!.snapshot.artifacts_issued_total = 99999;
    log.entries[0]!.digest = await digestOf(log.entries[0]!.snapshot);
    log.entries[0]!.canonical_form = canonicalizeSnapshot(
      log.entries[0]!.snapshot,
    );
    const result = await verifyAnchorChain(log);
    // Entry 1 now checks out on its own. Entry 2 still commits to the
    // digest of what entry 1 USED to be, and that is the whole point.
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain(
      "previous_digest does not match",
    );
  });

  it("catches a deleted entry as a sequence gap", async () => {
    const log = await buildLog([
      snapshot(1, null),
      snapshot(2, null),
      snapshot(3, null),
    ]);
    log.entries.splice(1, 1);
    const result = await verifyAnchorChain(log);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("an entry is missing");
  });

  it("catches a canonical_form that is not the snapshot beside it", async () => {
    const log = await buildLog([snapshot(1, null)]);
    // The lie this defends against: show an innocent snapshot, hash a
    // different string. Derived canonicalization makes it visible.
    log.entries[0]!.canonical_form = canonicalizeSnapshot(
      snapshot(1, null, { current_public_key: KEY_B }),
    );
    const result = await verifyAnchorChain(log);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("is not the snapshot");
  });

  it("rejects a genesis entry that claims a predecessor", async () => {
    const snap = snapshot(1, "not-null-at-all");
    const log = {
      entries: [
        {
          snapshot: snap,
          digest: await digestOf(snap),
          canonical_form: canonicalizeSnapshot(snap),
        },
      ],
    };
    const result = await verifyAnchorChain(log);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("claims a previous digest");
  });

  it("notes a chain that starts past 1 without calling it broken", async () => {
    const log = await buildLog([snapshot(1, null), snapshot(2, null)]);
    log.entries.shift();
    log.entries[0]!.snapshot.previous_digest = null;
    log.entries[0]!.digest = await digestOf(log.entries[0]!.snapshot);
    log.entries[0]!.canonical_form = canonicalizeSnapshot(
      log.entries[0]!.snapshot,
    );
    const result = await verifyAnchorChain(log);
    expect(result.ok).toBe(true);
    expect(result.notes.join(" ")).toContain("were not published here");
  });

  it("reports every break, not just the first", async () => {
    const log = await buildLog([
      snapshot(1, null),
      snapshot(2, null),
      snapshot(3, null),
    ]);
    log.entries[0]!.snapshot.current_public_key = KEY_B;
    log.entries[2]!.snapshot.current_public_key = KEY_B;
    const result = await verifyAnchorChain(log);
    expect(result.problems.length).toBeGreaterThan(1);
  });

  it("survives a malformed entry instead of throwing", async () => {
    const result = await verifyAnchorChain({
      entries: [{ digest: "nope" }, null, "not an object"],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("no snapshot published");
  });

  it("takes an injected digest function, like the crypto seam does", async () => {
    const log = await buildLog([snapshot(1, null)]);
    let called = 0;
    const result = await verifyAnchorChain(log, {
      digest: async (text: string) => {
        called += 1;
        return canonicalizeAnchorSnapshot(log.entries[0]!.snapshot) === text
          ? log.entries[0]!.digest
          : "wrong";
      },
    });
    expect(called).toBe(1);
    expect(result.ok).toBe(true);
  });
});

describe("checkAnchoredKeyHistory", () => {
  const did = "did:web:example.store";

  it("says 'no information' rather than 'failed' for a DID it cannot use", async () => {
    const result = await checkAnchoredKeyHistory("did:key:z6Mk", KEY_A);
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain("did:web");
  });

  it("treats a missing anchor log as the ecosystem's normal state", async () => {
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch(null, 404) as unknown as typeof fetch,
    });
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain("404");
  });

  it("does not blow up when the host is unreachable", async () => {
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(result.available).toBe(false);
    expect(String(result.reason)).toContain("unreachable");
  });

  it("refuses to answer when given no key to look for", async () => {
    const result = await checkAnchoredKeyHistory(did, "", {
      fetch: fakeFetch(await buildLog([snapshot(1, null)])) as unknown as typeof fetch,
    });
    // Without this an empty key would match an entry that merely
    // omitted the field, and "found" would mean nothing.
    expect(result.available).toBe(false);
  });

  it("decodes a did:web port when building the log URL", async () => {
    let seen = "";
    await checkAnchoredKeyHistory("did:web:localhost%3A8787#key-1", KEY_A, {
      fetch: (async (url: string) => {
        seen = url;
        return { ok: false, status: 404 } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    expect(seen).toBe(
      "https://localhost:8787/.well-known/anchor-log.json",
    );
  });

  it("finds a key and reports where it first appears", async () => {
    const log = await buildLog([
      snapshot(1, null, { current_public_key: KEY_B }),
      snapshot(2, null, {
        current_public_key: KEY_A,
        retired_keys: [{ public_key: KEY_B, retired_on: "2026-02-01" }],
      }),
      snapshot(3, null, {
        current_public_key: KEY_A,
        retired_keys: [{ public_key: KEY_B, retired_on: "2026-02-01" }],
      }),
    ]);
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.found).toBe(true);
    expect(result.chain_ok).toBe(true);
    expect(result.first_seen_sequence).toBe(2);
    expect(result.bitcoin_confirmed).toBe(false);
  });

  it("finds a retired key too, since old artifacts still need checking", async () => {
    const log = await buildLog([
      snapshot(1, null, { current_public_key: KEY_B }),
      snapshot(2, null, {
        current_public_key: KEY_A,
        retired_keys: [{ public_key: KEY_B, retired_on: "2026-02-01" }],
      }),
    ]);
    const result = await checkAnchoredKeyHistory(did, KEY_B, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.found).toBe(true);
    expect(result.first_seen_sequence).toBe(1);
  });

  it("says plainly when a key is nowhere in the history", async () => {
    const log = await buildLog([snapshot(1, null)]);
    const result = await checkAnchoredKeyHistory(did, KEY_B, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.available).toBe(true);
    expect(result.found).toBe(false);
    expect(String(result.reason)).toContain("does not appear");
  });

  it("lets a later confirmed entry vouch for an earlier one, chain intact", async () => {
    const log = await buildLog([
      snapshot(1, null),
      snapshot(2, null),
      snapshot(3, null),
    ]);
    log.entries[2]!.ots = { status: "complete", proof_base64: "cHJvb2Y=" };
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.first_seen_sequence).toBe(1);
    expect(result.bitcoin_confirmed).toBe(true);
    // The proof comes back so the caller can settle it themselves.
    expect(result.ots_proof_base64).toBe("cHJvb2Y=");
    expect(result.ots_status_is_unverified_claim).toBe(true);
  });

  it("withdraws that inference the moment the chain does not recompute", async () => {
    const log = await buildLog([snapshot(1, null), snapshot(2, null)]);
    log.entries[1]!.ots = { status: "complete", proof_base64: "cHJvb2Y=" };
    // Tamper with entry 1: the confirmed entry 2 can no longer speak
    // for it, because the link between them is what carried the claim.
    log.entries[0]!.snapshot.artifacts_issued_total = 99999;
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.chain_ok).toBe(false);
    expect(result.bitcoin_confirmed).toBe(false);
    expect(String(result.reason)).toContain("unbacked");
  });

  it("calls a pending proof pending, not a Bitcoin commitment", async () => {
    const log = await buildLog([snapshot(1, null)]);
    log.entries[0]!.ots = { status: "pending", proof_base64: "cHJvb2Y=" };
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.bitcoin_confirmed).toBe(false);
    expect(String(result.reason)).toContain("calendar's promise");
  });

  it("reads an out-of-order log by sequence, not by array position", async () => {
    const log = await buildLog([
      snapshot(1, null, { current_public_key: KEY_A }),
      snapshot(2, null, { current_public_key: KEY_A }),
    ]);
    log.entries.reverse();
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    // Position lies; the sequence number does not.
    expect(result.first_seen_sequence).toBe(1);
  });

  it("matches keys case-insensitively and past an 0x prefix", async () => {
    const log = await buildLog([
      snapshot(1, null, { current_public_key: KEY_A.toUpperCase() }),
    ]);
    const result = await checkAnchoredKeyHistory(did, `0x${KEY_A}`, {
      fetch: fakeFetch(log) as unknown as typeof fetch,
    });
    expect(result.found).toBe(true);
  });

  it("handles an empty log without claiming anything about it", async () => {
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch({ entries: [] }) as unknown as typeof fetch,
    });
    expect(result.available).toBe(true);
    expect(result.found).toBe(false);
    expect(String(result.reason)).toContain("empty");
  });

  it("does not choke on a log whose entries field is nonsense", async () => {
    const result = await checkAnchoredKeyHistory(did, KEY_A, {
      fetch: fakeFetch({ entries: "no" }) as unknown as typeof fetch,
    });
    expect(result.found).toBe(false);
  });
});
