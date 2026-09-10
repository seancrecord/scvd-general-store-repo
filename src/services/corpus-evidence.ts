/**
 * THE EVIDENCE, BESIDE THE CHAIN (2026-09-10, the slow-doors read).
 *
 * Since 2026-08-26 every probed row carried its raw capture — the
 * verbatim PAYMENT-REQUIRED bytes, the curated headers, the body
 * digest — inside the signed snapshot. That was the right instinct
 * (a verdict whose challenge rides in the same signed bytes is
 * reproducible without trusting us) and the wrong container: by
 * week 6 the round held 2,767 hosts at ~3.4 KB of capture each, and
 * the snapshot was 11.5 MB of which the facts every derived surface
 * reads were under a tenth. The chain grows by one such snapshot a
 * week, forever, and every reader walked all of it.
 *
 * So the freeze does to the capture what the store already does to
 * the record itself: SIGN THE HASH, KEEP THE BYTES BESIDE IT. A
 * sealed row carries `evidence_digest` — sha256 over the RFC 8785
 * canonical bytes of the capture, and their length — where the
 * capture sat, and the capture goes to R2 in one of sixteen shard
 * objects per snapshot, addressed by the host. The signature still
 * covers the evidence, through its digest; a stranger fetches the
 * bytes at /corpus/{sequence}/evidence/{host}.json, hashes them, and
 * compares against the signed row. Sixteen puts at the freeze, not
 * one per host: the subrequest budget is 1,000 an invocation and a
 * round is already past that in hosts.
 *
 * PREIMAGE LAW, same as pay_to_digest: rows sealed before this carry
 * the capture inline and stand byte-identical; the reader below
 * serves either shape from the same door and says which it was.
 * The MUTABLE ward round (what the current-week desks and the offer
 * authenticity instrument read) keeps its captures inline: this is
 * a change to what the chain holds, not to what the probe keeps.
 */
import { jcsCanonicalize } from "@/lib/jcs";
import type { CorpusRecord } from "@/services/corpus-list";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { WatchEvidenceCapture } from "@/services/watch-evidence";
import type { Env } from "@/types";

export interface EvidenceDigest {
  /** sha256, hex, over the RFC 8785 canonical JSON of the capture. */
  sha256: string;
  /** Length of those canonical bytes. */
  bytes: number;
}

export const EVIDENCE_DIGEST_DATED = "2026-09-10";

/** The canonical bytes a digest commits to and the door serves. */
export function canonicalEvidence(evidence: WatchEvidenceCapture): string {
  return jcsCanonicalize(evidence);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function evidenceDigestOf(evidence: WatchEvidenceCapture): Promise<EvidenceDigest> {
  const canonical = canonicalEvidence(evidence);
  return { sha256: await sha256Hex(canonical), bytes: new TextEncoder().encode(canonical).length };
}

/** One hex character of the host's sha256: sixteen shards, ~170 hosts each at today's round. */
export async function evidenceShardOf(host: string): Promise<string> {
  return (await sha256Hex(host)).slice(0, 1);
}

export function evidenceShardKey(sequence: number, shard: string): string {
  return `corpus/${sequence}/evidence/${shard}.json`;
}

export function evidenceUrl(base: string, sequence: number, host: string): string {
  return `${base}/corpus/${sequence}/evidence/${host}.json`;
}

/**
 * The sealed rows: each capture replaced by its digest, in place, and
 * the captures written to their shards. With no bucket bound the
 * round comes back untouched and the capture stays inline, exactly
 * the fallback putCorpusRecord takes for the record itself.
 *
 * A host that appears twice in one round with two different captures
 * cannot be addressed by name; both rows keep their capture inline
 * rather than let the door serve one row's bytes for the other's
 * digest. Never seen in a round; guarded because the address is the
 * host and the guarantee is the digest.
 */
export async function detachEvidence(env: Env, round: WardRound, sequence: number): Promise<WardRound> {
  if (!env.CORPUS_R2) return round;
  const digests = new Map<string, EvidenceDigest>();
  const ambiguous = new Set<string>();
  for (const host of round.hosts ?? []) {
    if (!host.evidence) continue;
    const digest = await evidenceDigestOf(host.evidence);
    const seen = digests.get(host.host);
    if (seen && seen.sha256 !== digest.sha256) ambiguous.add(host.host);
    digests.set(host.host, digest);
  }
  const shards = new Map<string, Record<string, WatchEvidenceCapture>>();
  const hosts: WardHostResult[] = [];
  for (const host of round.hosts ?? []) {
    if (!host.evidence || ambiguous.has(host.host)) {
      hosts.push(host);
      continue;
    }
    const shard = await evidenceShardOf(host.host);
    const bucket = shards.get(shard) ?? {};
    bucket[host.host] = host.evidence;
    shards.set(shard, bucket);
    // The digest lands where the capture sat, so no other byte of the
    // row moves — the pay_to_digest discipline.
    const sealed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(host)) {
      if (key === "evidence") sealed.evidence_digest = digests.get(host.host);
      else sealed[key] = value;
    }
    hosts.push(sealed as unknown as WardHostResult);
  }
  await Promise.all(
    [...shards].map(([shard, bucket]) =>
      env.CORPUS_R2!.put(evidenceShardKey(sequence, shard), JSON.stringify(bucket), {
        httpMetadata: { contentType: "application/json" },
      }),
    ),
  );
  return { ...round, hosts };
}

export type EvidenceRead =
  | {
      found: true;
      evidence: WatchEvidenceCapture;
      /** The bytes to serve and to hash. */
      canonical: string;
      sha256: string;
      /** True when the capture sits inside the signed snapshot itself (rows sealed before 2026-09-10). */
      inline: boolean;
      /** For a detached capture: whether its bytes recompute to the signed digest. Null when inline — the signature covers it directly. */
      digest_matches: boolean | null;
      signed_sha256: string | null;
    }
  | { found: false; reason: "host_not_in_round" | "no_evidence_on_row" | "evidence_unreadable" };

/** One host's capture from one signed snapshot, whichever shape the row was sealed in. */
export async function readEvidence(env: Env, record: CorpusRecord, host: string): Promise<EvidenceRead> {
  const rows = (record.snapshot.round.hosts ?? []).filter((row) => row.host === host);
  if (rows.length === 0) return { found: false, reason: "host_not_in_round" };
  const row = rows[0]!;
  if (row.evidence) {
    const canonical = canonicalEvidence(row.evidence);
    return {
      found: true,
      evidence: row.evidence,
      canonical,
      sha256: await sha256Hex(canonical),
      inline: true,
      digest_matches: null,
      signed_sha256: null,
    };
  }
  if (!row.evidence_digest) return { found: false, reason: "no_evidence_on_row" };
  const object = env.CORPUS_R2
    ? await env.CORPUS_R2.get(evidenceShardKey(record.snapshot.sequence, await evidenceShardOf(host)))
    : null;
  if (!object) return { found: false, reason: "evidence_unreadable" };
  const shard = JSON.parse(await object.text()) as Record<string, WatchEvidenceCapture>;
  const evidence = shard[host];
  if (!evidence) return { found: false, reason: "evidence_unreadable" };
  const canonical = canonicalEvidence(evidence);
  const sha256 = await sha256Hex(canonical);
  return {
    found: true,
    evidence,
    canonical,
    sha256,
    inline: false,
    digest_matches: sha256 === row.evidence_digest.sha256,
    signed_sha256: row.evidence_digest.sha256,
  };
}
