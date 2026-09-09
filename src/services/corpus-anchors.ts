import { KV_KEYS } from '@/lib/kv-keys';
import { listKeys } from '@/lib/kv-list';
import { bulkGetJson } from '@/lib/kv-bulk';
import { verifyMessageSignature } from '@/lib/signing';
import { CORPUS_SCAN_CAP, isPointer, resolveRecord } from '@/services/corpus-list';
import type { CorpusRecord, CorpusPointer } from '@/services/corpus-list';
import { canonicalizeCorpusSnapshot, putCorpusRecord } from '@/services/corpus';
import { sha256Hex } from '@/services/anchor-log';
import { submitDigestToOts, upgradeDigestOts } from '@/services/anchor-submit';
import type { SubmitOptions } from '@/services/anchor-submit';
import { findBitcoinAttestations } from '@/services/ots-proof';
import type { Env } from '@/types';

export const CORPUS_ANCHORS_PER_PASS = 10;

/**
 * Finish delivery of existing timestamps. The weekly freeze submitted
 * digests but nobody revisited the corpus proofs after Bitcoin mined.
 * Read metadata first, then at most one full snapshot at a time; a large
 * R2 corpus must not become an hourly all-snapshots memory allocation.
 * Newest first: one completed proof can bound the history behind it.
 */
export async function sweepCorpusAnchors(env: Env, options: SubmitOptions = {}) {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.corpusPrefix, cap: CORPUS_SCAN_CAP,
  });
  const stored = await bulkGetJson<CorpusRecord | CorpusPointer>(env.COUNTERS, listed.names);
  const summary = { at: (options.now ?? new Date()).toISOString(), listed: listed.names.length,
    truncated: listed.truncated, attempted: 0, submitted: 0, upgraded: 0,
    deferred: 0, unreadable: 0, invalid: 0, unchanged: 0 };
  for (const name of [...listed.names].reverse()) {
    const value = stored.get(name);
    if (value?.ots?.status === 'complete') continue;
    if (summary.attempted >= CORPUS_ANCHORS_PER_PASS) { summary.deferred++; continue; }
    summary.attempted++;
    let record: CorpusRecord | null;
    try { record = await resolveRecord(env, value ?? null); }
    catch { summary.unreadable++; continue; }
    if (!record) { summary.unreadable++; continue; }
    let valid = false;
    try {
      const payload = canonicalizeCorpusSnapshot(record.snapshot);
      valid = record.snapshot.sequence === Number(name.slice(KV_KEYS.corpusPrefix.length)) &&
        (!value || !isPointer(value) ||
          (value.sequence === record.snapshot.sequence && value.week === record.snapshot.week &&
            value.digest === record.digest && value.signature === record.signature && value.public_key === record.public_key)) &&
        await sha256Hex(payload) === record.digest &&
        await verifyMessageSignature(payload, record.signature, record.public_key);
    } catch { /* A malformed stored row must not stop the rest of the pass. */ }
    if (!valid) {
      summary.invalid++; continue;
    }
    // Recover a prior R2-success/KV-failure without changing signed bytes.
    if (record.ots?.status === 'complete') {
      await putCorpusRecord(env, record);
      summary.unchanged++;
      continue;
    }
    if (!record.ots || record.ots.status === 'failed') {
      const ots = await submitDigestToOts(record.digest, options);
      await putCorpusRecord(env, { ...record, ots });
      if (ots.status === 'pending') summary.submitted++;
      else summary.unchanged++;
      continue;
    }
    const ots = await upgradeDigestOts(record.digest, record.ots, options);
    // A calendar can return another pending subtree with HTTP 200.
    // Only a parsed Bitcoin attestation closes this delivery task;
    // chain verification still belongs to an independent verifier.
    const raw = ots?.proof_base64 ? Uint8Array.from(atob(ots.proof_base64), c => c.charCodeAt(0)) : null;
    if (!ots || !raw || !(await findBitcoinAttestations(raw, record.digest))?.length) {
      summary.unchanged++; continue;
    }
    await putCorpusRecord(env, { ...record, ots });
    summary.upgraded++;
  }
  return summary;
}
