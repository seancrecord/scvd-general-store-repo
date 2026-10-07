import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('listing adapter authenticates exact endpoint/method evidence and refuses tampering or ambiguous matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scvd-listing-'));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const row = { host: 'door.test', url: 'https://door.test/upload', probe_method: 'POST',
    observed_at: '2026-09-21T00:00:00Z', verdict: 'ready', catalog: { state: 'differs' } };
  const signed = hosts => {
    const snapshot = { version: 1, sequence: 1, taken_at: '2026-09-27T00:00:00Z', previous_digest: null,
      source: 'ward_round', week: '2026-W39', round: { at: '2026-09-27T00:00:00Z', hosts } };
    const bytes = Buffer.from(JSON.stringify(snapshot));
    return { snapshot, digest: createHash('sha256').update(bytes).digest('hex'),
      signature: sign(null, bytes, privateKey).toString('hex'), public_key: key };
  };
  const run = async (doc, endpoint = row.url, method = 'POST', suppliedKey = key) => {
    await writeFile(join(dir, 'snapshot.json'), JSON.stringify(doc));
    await writeFile(join(dir, 'key.json'), JSON.stringify({ public_key: suppliedKey }));
    return promisify(execFile)(process.execPath, [new URL('../examples/corpus-listing-evidence.mjs', import.meta.url).pathname,
      join(dir, 'snapshot.json'), join(dir, 'key.json'), endpoint, method]);
  };
  try {
    const doc = signed([row]);
    const result = JSON.parse((await run(doc)).stdout);
    assert.equal(result.observed_at, row.observed_at);
    assert.equal(result.source.snapshot_captured_at, doc.snapshot.taken_at);
    assert.equal(result.source.digest, doc.digest);
    assert.equal(result.source.row_pointer, '/round/hosts/0');
    assert.equal(result.kind, 'unsigned_listing_evidence_projection');
    await assert.rejects(run(doc, 'https://door.test/other'), /not_uniquely_observed/);
    await assert.rejects(run(doc, row.url, 'GET'), /not_uniquely_observed/);
    await assert.rejects(run(signed([row, row])), /not_uniquely_observed/);
    const tampered = structuredClone(doc); tampered.snapshot.round.hosts[0].verdict = 'not_ready';
    await assert.rejects(run(tampered), /corpus_digest_mismatch/);
    const forged = structuredClone(doc); forged.signature = '00'.repeat(64);
    await assert.rejects(run(forged), /snapshot_failed_authentication/);
    await assert.rejects(run(doc, row.url, 'POST', '01'.repeat(32)), /snapshot_failed_authentication/);
    const undated = { ...row }; delete undated.observed_at;
    assert.equal(JSON.parse((await run(signed([undated]))).stdout).observed_at, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
