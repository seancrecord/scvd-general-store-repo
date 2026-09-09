// Recheck the saved public evidence. No network reads or production writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = join(root, 'research/verification-2026-09-09');
const old = join(root, 'research/verification-2026-09-08');
const python = process.argv[2] ?? 'python3';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await readJson(join(directory, 'capture-manifest.json'));
const headers = await readJson(join(directory, 'bitcoin-headers.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const captured = new Map();
for (const row of manifest.reads) {
  if (row.error) continue;
  const bytes = gunzipSync(await readFile(join(directory, row.file)), { maxOutputLength: manifest.bound_bytes_per_read });
  assert.equal(bytes.length, row.bytes, row.file);
  assert.equal(hash(bytes), row.sha256, row.file);
  captured.set(row.file, bytes);
}
const json = name => JSON.parse(captured.get(name + '.json.gz'));
// Use the production canonicalizer, not another manually maintained field list.
const built = await build({ stdin: { contents: 'export { canonicalizeCorpusSnapshot } from "./src/services/corpus.ts";',
  resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { canonicalizeCorpusSnapshot } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const trustedKey = (await readJson(join(old, 'key.json'))).data.public_key;
const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(trustedKey, 'hex')]), type: 'spki', format: 'der' });
const temp = await mkdtemp(join(tmpdir(), 'scvd-header-report-'));
const checkHeader = async (payload, proof, height, selections) => {
  assert.equal(selections.length, 2, 'two outside header selections required');
  for (const row of selections) { assert.equal(row.error, undefined); assert.equal(row.height, height); }
  assert.equal(selections[0].hash, selections[1].hash, 'outside height mappings disagree');
  assert.equal(selections[0].header, selections[1].header, 'outside headers disagree');
  await writeFile(join(temp, 'payload'), payload);
  await writeFile(join(temp, 'header'), selections[0].header);
  const result = JSON.parse(execFileSync(python, [join(root, 'scripts/verify_ots_header.py'),
    '--payload', join(temp, 'payload'), '--proof', proof, '--header', join(temp, 'header'),
    '--block-hash', selections[0].hash, '--height', String(height)], { encoding: 'utf8' }));
  return { ...result, sources: selections.map(row => row.source), source_reads: selections.map(row => row.read_at) };
};
try {
  const index = json('corpus-index');
  assert.equal(index.entries, index.index.length);
  let previous = null;
  const corpus = [];
  for (const [offset, entry] of index.index.entries()) {
    assert.equal(entry.sequence, offset + 1);
    const saved = captured.get(`corpus-${entry.sequence}.json.gz`);
    if (!saved) { corpus.push({ sequence: entry.sequence, error: 'unreadable' }); previous = entry.digest; continue; }
    const record = JSON.parse(saved);
    const payload = Buffer.from(canonicalizeCorpusSnapshot(record.snapshot));
    assert.equal(hash(payload), record.digest);
    assert.equal(record.digest, entry.digest);
    assert.equal(record.snapshot.previous_digest, previous);
    assert.equal(record.public_key, trustedKey);
    assert.ok(verify(null, payload, publicKey, Buffer.from(record.signature, 'hex')));
    previous = record.digest;
    const capturedRow = manifest.corpus.find(row => row.sequence === entry.sequence);
    const height = capturedRow.bitcoin_attestations[0].block_height;
    const proof = join(directory, `corpus-${entry.sequence}.payload.json.ots`);
    const checked = await checkHeader(payload, proof, height, headers.filter(row => row.height === height));
    corpus.push({ sequence: entry.sequence, digest: record.digest, signature_valid: true,
      chain_link_valid: true, published_status: record.ots?.status ?? 'absent',
      local_upgrade: checked, issue_to_block_header_ms: Date.parse(checked.block_header_time) - Date.parse(record.snapshot.taken_at) });
  }
  const receiptSelections = ['blockstream.info', 'mempool.space'].map(source => ({ source, height: 965852,
    read_at: manifest.reads.find(row => row.file === `receipt-${source}.header.txt.gz`).read_at,
    hash: captured.get(`receipt-${source}.hash.txt.gz`).toString().trim(),
    header: captured.get(`receipt-${source}.header.txt.gz`).toString().trim() }));
  const receipt = await checkHeader(await readFile(join(old, 'receipt.payload.json')),
    join(old, 'receipt.payload.json.ots'), 965852, receiptSelections);
  const oldJoin = await readJson(join(old, 'observation-result.json'));
  const directoryListing = json('listing').data;
  const origin = oldJoin.settlement.transaction_origin;
  const coinbase = json('coinbase').data;
  const tracked = coinbase.settlers.some(row => row.enabled && row.network_caip2 === oldJoin.settlement.network && row.address.toLowerCase() === origin.toLowerCase());
  const payout = oldJoin.settlement.transfer.to.toLowerCase();
  const containsPayout = value => typeof value === 'string' ? value.toLowerCase() === payout :
    value && typeof value === 'object' ? Object.values(value).some(containsPayout) : false;
  const report = {
    capture_completed_at: manifest.captured_at,
    receipt,
    corpus: { denominator: index.index.length,
      denominator_means: 'Every sequence in the captured public index. Does not prove the absence of withheld records or count issued certificates.',
      signatures_verified: corpus.filter(row => row.signature_valid).length,
      published_completed: corpus.filter(row => row.published_status === 'complete').length,
      outside_header_verified_after_local_upgrade: corpus.filter(row => row.local_upgrade?.proof_matches_header).length,
      unreadable: corpus.filter(row => row.error).length, entries: corpus },
    directory: { assessment: directoryListing.assessment.traction, tracked_coinbase_origin: tracked,
      advertised_payout_matches: Boolean(containsPayout(directoryListing)),
      commercial_limit: 'The settlement remains the keeper checkout canary, not independent demand. The historical Base transaction capture is reused; directory mappings were refreshed. No note sent.' },
    remaining_limits: ['No local Bitcoin consensus chain was validated; height and chain membership rely on the two named HTTPS explorers.',
      'Receipt saw evidence is still absent. No population-wide receipt or linked-report census was performed.',
      'Local calendar upgrades do not change production records.',
      'Captured corpus index exceeds the 8 MiB evidence-CLI input cap; this report deliberately uses a separately bounded larger read.'],
  };
  await writeFile(join(directory, 'verified-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ receipt_header_verified: receipt.proof_matches_header,
    corpus_denominator: report.corpus.denominator, corpus_signatures_verified: report.corpus.signatures_verified,
    corpus_headers_verified: report.corpus.outside_header_verified_after_local_upgrade,
    directory_status: report.directory.assessment.status }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
