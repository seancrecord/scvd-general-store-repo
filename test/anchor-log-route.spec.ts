import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { appendAnchor } from "@/services/anchor-log";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * The published anchor log, read the way a stranger reads it: can they
 * recompute a digest from what we served, without our code?
 */

async function clearAnchors(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.anchorLogPrefix,
  });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
}

async function fetchLog(): Promise<Record<string, unknown>> {
  const res = await SELF.fetch(`${BASE}/.well-known/anchor-log.json`);
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(async () => {
  await clearAnchors();
});

describe("/.well-known/anchor-log.json", () => {
  it("serves an empty log honestly rather than 404ing", async () => {
    const body = await fetchLog();
    expect(body["chain_length"]).toBe(0);
    expect(body["entries"]).toEqual([]);
    expect(body["self_check"]).toBe("no breaks found");
  });

  it("leads with what it does NOT prove", async () => {
    const body = await fetchLog();
    const disclaimer = String(body["what_it_does_not_prove"]);
    // The distinction the whole DR2 round turned on.
    expect(disclaimer).toContain("WHEN");
    expect(disclaimer).toContain("WHO SHOULD HAVE");
    expect(disclaimer.toLowerCase()).toContain("thief");
  });

  it("publishes the exact bytes a stranger must hash, and they check out", async () => {
    await appendAnchor(testEnv);
    const body = await fetchLog();
    const entries = body["entries"] as Array<Record<string, unknown>>;
    expect(entries.length).toBe(1);
    const entry = entries[0]!;

    // A stranger takes canonical_form, sha256s it with their own
    // tooling, and must land on the published digest. No store code.
    const hashed = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(String(entry["canonical_form"])),
    );
    const hex = [...new Uint8Array(hashed)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe(entry["digest"]);

    // And the canonical form really is the published snapshot, not a
    // different object we happened to hash.
    const snapshot = entry["snapshot"] as Record<string, unknown>;
    expect(String(entry["canonical_form"])).toContain(
      String(snapshot["current_public_key"]),
    );
  });

  it("documents the field order so the hash is reproducible", async () => {
    const body = await fetchLog();
    const note = String(body["canonical_form_note"]);
    for (const field of [
      "version",
      "sequence",
      "taken_at",
      "previous_digest",
      "current_public_key",
      "retired_keys",
      "artifacts_issued_total",
    ]) {
      expect(note).toContain(field);
    }
  });

  it("says a not-yet-submitted entry is not submitted, rather than implying a proof", async () => {
    await appendAnchor(testEnv);
    const body = await fetchLog();
    const entries = body["entries"] as Array<Record<string, unknown>>;
    const ots = entries[0]!["ots"] as Record<string, unknown>;
    expect(String(ots["status"])).toContain("not submitted");
    expect(body["ots_complete"]).toBe(0);
    expect(body["ots_pending"]).toBe(0);
  });

  it("counts a chain and reports its cap", async () => {
    await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    const body = await fetchLog();
    expect(body["chain_length"]).toBe(2);
    expect(body["truncated"]).toBe(false);
    expect(typeof body["scan_cap"]).toBe("number");
  });

  it("is actually reachable from every document that points at it", async () => {
    /**
     * A trust document that names a URL nobody can fetch is worse than
     * one that stays quiet: it converts an honest gap into a broken
     * promise. Four surfaces now cite the anchor log — trust.json, the
     * two x402 discovery documents, the signing key and /attestation —
     * and each pointer is followed here rather than assumed.
     */
    const citing = [
      "/.well-known/trust.json",
      "/.well-known/x402",
      "/.well-known/x402.json",
      "/.well-known/scvd-signing-key",
      "/attestation",
    ];
    for (const path of citing) {
      const res = await SELF.fetch(`${BASE}${path}`);
      expect(res.status, `${path} did not serve`).toBe(200);
      const text = await res.text();
      expect(text, `${path} lost its anchor-log pointer`).toContain(
        "/.well-known/anchor-log.json",
      );
    }
    // And the thing they all point at answers.
    const log = await SELF.fetch(`${BASE}/.well-known/anchor-log.json`);
    expect(log.status).toBe(200);
  });

  it("carries the WHEN-not-WHO limit wherever it is cited, not only at home", async () => {
    // The limit is the load-bearing part. A pointer that travels
    // without it hands a reader a stronger claim than the log makes.
    for (const path of [
      "/.well-known/trust.json",
      "/.well-known/scvd-signing-key",
      "/attestation",
    ]) {
      const text = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(text, `${path} cites the log without its limit`).toContain(
        "WHO SHOULD HAVE",
      );
    }
  });

  it("teaches the pending-vs-complete distinction in the how-to", async () => {
    const body = await fetchLog();
    const steps = (body["how_to_check_without_trusting_us"] as string[]).join(
      " ",
    );
    expect(steps).toContain("ots verify");
    expect(steps).toContain("pending");
    // The honest reading of a pending proof: a promise, not Bitcoin.
    expect(steps.toLowerCase()).toContain("not yet a bitcoin commitment");
  });

  it("tells a reader to compare block time against taken_at, which is the check that catches backdating", async () => {
    /**
     * `ots verify` alone proves the digest existed by some block. It
     * says NOTHING about the date the snapshot claims. Steps 1-3 prove
     * the chain is internally consistent — an attacker who rewrote
     * history and re-stamped it would pass all three. Only comparing
     * the block time to taken_at ties the log to time we do not
     * control, and a how-to that omits it teaches a ritual.
     */
    const body = await fetchLog();
    const steps = (body["how_to_check_without_trusting_us"] as string[]).join(
      " ",
    );
    expect(steps).toContain("taken_at");
    expect(steps.toLowerCase()).toContain("backdating");
    // And the limit no chain check can cover, said rather than hidden.
    expect(steps.toLowerCase()).toContain("fresh chain");
  });

  it("publishes an anchor_confidence so no reader can collapse submitted into confirmed", async () => {
    // Empty log: nothing submitted, and it says so in one word rather
    // than leaving every consumer to derive it and lose the nuance.
    const empty = await fetchLog();
    expect(empty["anchor_confidence"]).toBe("unanchored");

    await appendAnchor(testEnv);
    const withEntry = await fetchLog();
    expect(withEntry["anchor_confidence"]).toBe("unanchored");
    const note = String(withEntry["anchor_confidence_note"]);
    expect(note).toContain("pending_only");
    // The reason pending_only exists as its own state, said out loud.
    expect(note.toLowerCase()).toContain("same-day rewrite");
  });

  it("does not let its own status word be read as verification", async () => {
    /**
     * We deliberately do not parse OTS proofs — a second
     * implementation to be wrong is worse than serving the bytes. So
     * `complete` is bookkeeping ("a calendar handed back an upgraded
     * proof"), not a check we ran, and the document has to say which
     * of the two it is. This is the same discipline as signature_gap:
     * name what the check does not cover, on the artifact.
     */
    const body = await fetchLog();
    const note = String(body["what_our_status_word_means"]).toLowerCase();
    expect(note).toContain("not that this store verified it");
    expect(note).toContain("ots verify");
  });
});
