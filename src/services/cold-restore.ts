import { bulkGetText } from "@/lib/kv-bulk";
import { listKeys } from "@/lib/kv-list";
import { sha256Hex } from "@/services/anchor-log";
import type { ColdExportReport } from "@/services/cold-export";
import type { Env } from "@/types";
import { withKvRetry } from "@/lib/kv-retry";

/**
 * THE RESTORE DRILL — the half of roadmap 0.11 that was missing, and
 * the half that is the actual backup.
 *
 * `cold-export.ts` ships and has shipped weekly since 2026-08-24. Its
 * own header says the quiet part: "Writing the copy is the easy half
 * and the half that gets built; the half that matters is having
 * walked a restore before you need one." Nobody had walked one, so
 * the roadmap row stayed `[~]` and the honest description of the
 * state was a belief rather than a backup.
 *
 * THE DRILL IS READ-ONLY AND THAT IS THE POINT. `planRestore` opens
 * every bundle a manifest names, re-hashes the bytes still in the
 * bucket against the digest recorded when they were written, and
 * diffs the contents against what the live namespace holds right now.
 * It writes nothing. That means the drill can be run against
 * PRODUCTION on any ordinary Tuesday — which is the only way a drill
 * ever gets run, because a drill you have to schedule an outage for
 * is a drill nobody runs.
 *
 * WHAT A PASSING DRILL PROVES, stated narrowly because the export
 * file already had to say the same thing about itself. It proves the
 * bundles are readable, that they still hash to what the manifest
 * recorded, and that their contents cover the live keyspace. It does
 * NOT prove the account still exists, that R2 is reachable during the
 * incident that made you need it, or that anyone remembers where the
 * manifest is. Those are keeper facts and no function here can check
 * them.
 *
 * WHY A RESTORE NEVER DELETES. `apply` writes keys that are missing
 * or differ and touches nothing else. A restore that also removed
 * live keys not present in the bundle would be a rollback, which is a
 * different and far more dangerous operation: run against a stale
 * bundle it would destroy every certificate issued since the export.
 * `extra_in_kv` is therefore REPORTED and never acted on — the count
 * is usually just the records written since the backup, and reading
 * it as damage would be the wrong instinct at the worst moment.
 */

/** A bundle as it sits in the bucket, checked against its manifest row. */
export interface BundleAudit {
  r2_key: string;
  namespace: string;
  prefix: string;
  keys_in_bundle: number;
  /** `null` when the bundle could not be read or parsed at all. */
  digest_matches: boolean | null;
  truncated: boolean;
  /** In the bundle, absent from the live namespace. */
  missing_in_kv: number;
  /** In both, with different bytes. */
  differing: number;
  /** Live under this prefix, absent from the bundle. Reported, never acted on. */
  extra_in_kv: number;
  /**
   * Named reasons this bundle must not be written back. Empty means
   * restorable; non-empty is a refusal, not a warning.
   */
  refusals: string[];
}

export interface RestoreDrill {
  manifest_key: string;
  taken_at: string | null;
  bundles: BundleAudit[];
  /** True only when every bundle is readable, intact, and restorable. */
  restorable: boolean;
  what_this_does_not_prove: string[];
}

const DRILL_LIMITS: string[] = [
  "That the account survives. R2 and KV fail separately, which is the gap the export closes, but an account-level loss takes both — and this drill runs inside the same account it is auditing.",
  "That anyone can find the manifest under pressure. The path is deterministic (`backup/{YYYY-MM-DD}/manifest.json`) and that is a fact about code, not about whoever is awake at the time.",
  "That a bundle marked `truncated` is a whole record. It is a partial one, this drill refuses it, and no count here should be read as coverage of the prefix.",
];

/** Keys read per prefix when diffing live state; matches the export's cap. */
const KEYS_PER_PREFIX = 5000;

async function readJson<T>(
  bucket: R2Bucket,
  key: string,
): Promise<{ text: string; value: T } | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const text = await object.text();
  try {
    return { text, value: JSON.parse(text) as T };
  } catch {
    return null;
  }
}

interface BundleBody {
  prefix: string;
  namespace: string;
  taken_at: string;
  truncated: boolean;
  rows: Record<string, string>;
}

/**
 * Walk one day's manifest and report whether it could be restored,
 * without restoring anything. `day` is the ISO date the export used.
 */
export async function planRestore(
  env: Env,
  day: string,
): Promise<RestoreDrill> {
  const manifestKey = `backup/${day}/manifest.json`;
  const drill: RestoreDrill = {
    manifest_key: manifestKey,
    taken_at: null,
    bundles: [],
    restorable: false,
    what_this_does_not_prove: DRILL_LIMITS,
  };
  if (!env.CORPUS_R2) return drill;

  const manifest = await readJson<ColdExportReport>(env.CORPUS_R2, manifestKey);
  if (!manifest) return drill;
  drill.taken_at = manifest.value.taken_at;

  for (const row of manifest.value.bundles) {
    const audit: BundleAudit = {
      r2_key: row.r2_key,
      namespace: row.namespace,
      prefix: row.prefix,
      keys_in_bundle: 0,
      digest_matches: null,
      truncated: row.truncated,
      missing_in_kv: 0,
      differing: 0,
      extra_in_kv: 0,
      refusals: [],
    };

    const bundle = await readJson<BundleBody>(env.CORPUS_R2, row.r2_key);
    if (!bundle) {
      audit.refusals.push(
        "The bundle the manifest names is missing from the bucket or is not readable JSON. A manifest row without its bundle is a record of a backup rather than a backup.",
      );
      drill.bundles.push(audit);
      continue;
    }

    audit.digest_matches = (await sha256Hex(bundle.text)) === row.sha256;
    if (!audit.digest_matches) {
      audit.refusals.push(
        "The bytes in the bucket do not hash to the digest recorded when they were written. Whatever this is, it is not the record the manifest describes, and writing it into a live namespace would replace evidence with something unverified.",
      );
    }
    if (row.truncated || bundle.value.truncated) {
      audit.refusals.push(
        "The prefix held more keys than one export pass could carry, so this bundle is a PARTIAL record. Restoring it whole would silently publish a subset as if it were the set.",
      );
    }

    const rows = bundle.value.rows ?? {};
    const names = Object.keys(rows);
    audit.keys_in_bundle = names.length;

    const namespace = env[bundle.value.namespace as keyof Env] as
      | KVNamespace
      | undefined;
    if (!namespace || typeof namespace.list !== "function") {
      audit.refusals.push(
        `The bundle names namespace ${bundle.value.namespace}, which is not bound here. A restore cannot be planned against a binding this deployment does not have.`,
      );
      drill.bundles.push(audit);
      continue;
    }

    const live = await bulkGetText(namespace, names);
    for (const name of names) {
      const current = live.get(name) ?? null;
      if (current === null) audit.missing_in_kv += 1;
      else if (current !== rows[name]) audit.differing += 1;
    }

    const listed = await listKeys(namespace, {
      prefix: bundle.value.prefix,
      cap: KEYS_PER_PREFIX,
    });
    const held = new Set(names);
    audit.extra_in_kv = listed.names.filter((name) => !held.has(name)).length;

    drill.bundles.push(audit);
  }

  drill.restorable =
    drill.bundles.length > 0 &&
    drill.bundles.every((bundle) => bundle.refusals.length === 0);
  return drill;
}

export interface RestoreResult {
  r2_key: string;
  written: number;
  skipped_identical: number;
  refused: string[];
}

/**
 * Write one bundle's rows back into its namespace. Refuses outright on
 * anything `planRestore` would refuse — the audit is re-run here
 * rather than trusted from a caller, because the one call in this file
 * that touches live evidence is the wrong place to accept a claim
 * about whether it is safe.
 *
 * Keys already holding the bundle's exact bytes are skipped, so a
 * repeated restore is cheap and the `written` count means what it
 * says: records that were actually missing or wrong.
 */
export async function restoreBundle(
  env: Env,
  day: string,
  r2Key: string,
): Promise<RestoreResult> {
  const result: RestoreResult = {
    r2_key: r2Key,
    written: 0,
    skipped_identical: 0,
    refused: [],
  };

  const drill = await planRestore(env, day);
  const audit = drill.bundles.find((bundle) => bundle.r2_key === r2Key);
  if (!audit) {
    result.refused.push(
      `No bundle named ${r2Key} appears in ${drill.manifest_key}. A restore is only ever run from a manifest; a loose object in the bucket has nothing vouching for it.`,
    );
    return result;
  }
  if (audit.refusals.length > 0) {
    result.refused = [...audit.refusals];
    return result;
  }

  const bundle = await readJson<BundleBody>(env.CORPUS_R2!, r2Key);
  if (!bundle) {
    result.refused.push(
      "The bundle became unreadable between the audit and the write.",
    );
    return result;
  }

  const namespace = env[bundle.value.namespace as keyof Env] as KVNamespace;
  const rows = bundle.value.rows ?? {};
  const names = Object.keys(rows);
  const live = await bulkGetText(namespace, names);

  for (const name of names) {
    if (live.get(name) === rows[name]) {
      result.skipped_identical += 1;
      continue;
    }
    await withKvRetry(() => namespace.put(name, rows[name]!));
    result.written += 1;
  }
  return result;
}
