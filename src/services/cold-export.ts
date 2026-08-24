import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { sha256Hex } from "@/services/anchor-log";
import type { Env } from "@/types";

/**
 * THE COLD EXPORT — because the anchor chain proves INTEGRITY, not
 * AVAILABILITY (roadmap 0.11).
 *
 * Every signature, digest and OpenTimestamps proof this store serves
 * answers one question: has the record been altered? None of them
 * answers the other one: is the record still there. Bitcoin will
 * happily confirm that a corpus entry existed on a given day, to a
 * reader who no longer has the entry.
 *
 * WHAT IS ACTUALLY AT RISK, and it is not mainly the corpus. Corpus
 * BODIES already live in R2 as self-contained records — snapshot,
 * digest, signature, OTS — with only a slim pointer in KV, so losing
 * the namespace would cost the index rather than the evidence.
 *
 * The exposure is `cert:`. This store publishes that every
 * certificate verifies free FOREVER, and says on its own retirement
 * tombstones that "retirement changes the shelf, not the record". That
 * promise is backed by one KV namespace and nothing else. A store
 * whose entire product is evidence cannot have its longest-lived
 * promise resting on a single mutable surface.
 *
 * WHAT THIS IS NOT. Not a restore. Writing the copy is the easy half
 * and the half that gets built; the half that matters is having
 * walked a restore before you need one. The manifest exists so that
 * walk is checkable rather than hopeful — every bundle carries the
 * count and the sha256 of exactly what was written.
 *
 * SAME BUCKET IS NOT THE POINT. R2 and KV are separate services with
 * separate failure modes, which is the gap this closes. A copy in the
 * same account is not an offsite backup, and pretending otherwise
 * would be its own overclaim — so the manifest is served, and pulling
 * it somewhere else is a keeper action this file cannot perform.
 */

/** One prefix worth carrying out of the building, and why. */
export interface ColdSubject {
  /** Which binding holds it. */
  namespace: "COUNTERS" | "PATRONS" | "ORDERS" | "GUESTBOOK";
  prefix: string;
  /** What is lost if this goes, in the operator's terms. */
  stakes: string;
}

/**
 * Ordered by what cannot be remade. A certificate is unreproducible:
 * it names a moment, carries a signature over it, and was promised to
 * outlive the shelf. A counter can be recomputed; a certificate
 * cannot be reissued without lying about when it was written.
 */
export const COLD_SUBJECTS: readonly ColdSubject[] = [
  {
    namespace: "PATRONS",
    prefix: KV_KEYS.certPrefix,
    stakes:
      "Every certificate this store has ever issued. /api/verify/{cert_id} is promised free and forever, on the artifact itself and on every retirement notice. Losing these breaks the longest promise the store makes, and no reissue can honestly restore them — a certificate names the moment it was written.",
  },
  {
    namespace: "COUNTERS",
    prefix: KV_KEYS.corpusPrefix,
    stakes:
      "The corpus chain index. Bodies are self-contained in R2 already, so this is the ordering and the pointers rather than the evidence — recoverable by walking the bucket, but slowly and by hand.",
  },
  {
    namespace: "COUNTERS",
    prefix: KV_KEYS.standingWatchPrefix,
    stakes:
      "Standing watch histories: dated observations a buyer paid for and can no longer obtain, because the moments they describe have passed.",
  },
  {
    namespace: "COUNTERS",
    prefix: KV_KEYS.anchorLogPrefix,
    stakes:
      "The anchor log — which digests were submitted to OpenTimestamps and when. Losing it does not invalidate a proof, but it loses the map from proof to subject.",
  },
];

export interface BundleReport {
  prefix: string;
  namespace: string;
  keys: number;
  /** sha256 of the exact bytes written, so a restore can be checked. */
  sha256: string;
  r2_key: string;
  /** True when the prefix held more keys than one pass could carry. */
  truncated: boolean;
}

export interface ColdExportReport {
  taken_at: string;
  bundles: BundleReport[];
  /** Written last: a bundle with no manifest is a bundle nobody trusts. */
  manifest_key: string;
  what_this_does_not_prove: string[];
}

/** One pass has to stay inside a Worker's budget; say so when it caps. */
const KEYS_PER_PREFIX = 5000;

function bundleKey(taken: string, prefix: string): string {
  return `backup/${taken}/${prefix.replace(/[^a-z0-9]+/gi, "_")}.json`;
}

/**
 * Copy the irreplaceable prefixes into R2 and write a manifest over
 * what was copied. Idempotent per day: the same date rewrites the
 * same keys rather than growing an unbounded set of near-identical
 * bundles.
 */
export async function runColdExport(
  env: Env,
  now: Date = new Date(),
): Promise<ColdExportReport> {
  const takenAt = now.toISOString();
  const day = takenAt.slice(0, 10);
  const bundles: BundleReport[] = [];

  for (const subject of COLD_SUBJECTS) {
    const namespace = env[subject.namespace] as KVNamespace | undefined;
    if (!namespace || !env.CORPUS_R2) continue;

    const listed = await listKeys(namespace, {
      prefix: subject.prefix,
      cap: KEYS_PER_PREFIX,
    });

    /*
     * BULK, NOT PER-KEY. The first draft read each key in a loop and
     * the repo's own scalability audit caught it — three warnings over
     * budget, of which TWO were this loop and real. An export walks
     * the WHOLE keyspace by definition, so it is the worst place in
     * the codebase to pay a round trip per key: the shape that is
     * merely wasteful at ten rows is what makes a backup stop
     * finishing at ten thousand. (The third was the R2 write below,
     * one bundle per subject, and it was the instrument that needed
     * the fix — see BUCKET_BINDINGS in scripts/audit.mjs.)
     *
     * Nothing here needs to decide per record — every value goes into
     * the bundle unchanged — which is the audit's own stated test for
     * when a loop is allowed to keep reading one at a time.
     */
    const fetched = await bulkGetText(namespace, [...listed.names]);
    const rows: Record<string, string> = {};
    for (const [name, value] of fetched) {
      if (value !== null) rows[name] = value;
    }

    const body = JSON.stringify({
      prefix: subject.prefix,
      namespace: subject.namespace,
      taken_at: takenAt,
      stakes: subject.stakes,
      truncated: listed.truncated,
      rows,
    });
    const key = bundleKey(day, subject.prefix);
    await env.CORPUS_R2.put(key, body);

    bundles.push({
      prefix: subject.prefix,
      namespace: subject.namespace,
      keys: Object.keys(rows).length,
      sha256: await sha256Hex(body),
      r2_key: key,
      truncated: listed.truncated,
    });
  }

  const manifestKey = `backup/${day}/manifest.json`;
  const report: ColdExportReport = {
    taken_at: takenAt,
    bundles,
    manifest_key: manifestKey,
    what_this_does_not_prove: [
      "That a restore works. Nobody has run one until somebody runs one, and a backup never restored is a belief rather than a backup.",
      "That the copy is offsite. R2 and KV are separate services with separate failure modes, which is the gap this closes — but both sit in one account, and an account-level loss takes both. Pulling the manifest and bundles somewhere else is a keeper action this file cannot perform.",
      "That every key was carried. A prefix holding more than the per-pass cap is marked `truncated`, and a truncated bundle is a partial record that must never be read as a whole one.",
    ],
  };
  if (env.CORPUS_R2) {
    await env.CORPUS_R2.put(manifestKey, JSON.stringify(report));
  }
  return report;
}
