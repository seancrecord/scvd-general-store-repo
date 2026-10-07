// A local, read-only adapter: exact endpoint + recorded method, with no host-level fallback.
import { readFile } from 'node:fs/promises';
import { createEvidenceBundle, verifyEvidenceBundle } from '../verifier/evidence-bundle.js';

const [snapshotFile, keyFile, endpoint, method] = process.argv.slice(2);
if (!snapshotFile || !keyFile || !endpoint || !method) throw new Error('Usage: node examples/corpus-listing-evidence.mjs SNAPSHOT_JSON PUBLIC_KEY_JSON EXACT_URL METHOD');
const document = JSON.parse(await readFile(snapshotFile, 'utf8'));
const key = JSON.parse(await readFile(keyFile, 'utf8')).public_key;
if (!key) throw new Error('missing_public_verification_key');
const maxBytes = 64 * 1024 * 1024;
const bundle = await createEvidenceBundle(document, { maxBytes });
const checked = await verifyEvidenceBundle(bundle, { publicKey: key, maxBytes });
if (!checked.valid) throw new Error('snapshot_failed_authentication');
const snapshot = checked.signed_claims;
const candidates = snapshot.round.hosts.map((row, index) => ({ row, index }))
  .filter(({ row }) => row.url === endpoint && row.probe_method === method);
if (candidates.length !== 1) throw new Error('exact_endpoint_and_recorded_method_not_uniquely_observed');
const { row, index } = candidates[0];
console.log(JSON.stringify({
  kind: 'unsigned_listing_evidence_projection',
  source: { url: `https://scvd.store/corpus/${snapshot.sequence}.json`, digest: document.digest,
    row_pointer: `/round/hosts/${index}`, snapshot_captured_at: snapshot.taken_at },
  endpoint: row.url, method: row.probe_method, observed_at: row.observed_at ?? null,
  x402_verdict: row.verdict, battery: row.battery ?? null,
  catalog_comparison: row.catalog ?? null, protocols_spoken: row.protocols_spoken ?? null,
  verification: 'Snapshot canonical digest and Ed25519 signature verified against supplied key. Key identity, chain continuity and Bitcoin timestamp were not independently checked by this adapter.',
  does_not_establish: ['Current readiness or current catalog accuracy', 'Payment or delivery success',
    'Every endpoint at this host', 'A score, endorsement, repair cause or directory acceptance'],
}, null, 2));
