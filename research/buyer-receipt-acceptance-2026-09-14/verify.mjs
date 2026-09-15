// Verify the saved artifacts, not the collector's verdict booleans. No network or wallet.
import fs from 'node:fs';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const evidence = JSON.parse(fs.readFileSync(new URL('./evidence.json', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
function signed(bytes, signature, key) {
  try {
    return verify(null, Buffer.from(bytes), createPublicKey({format: 'der', type: 'spki',
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'hex')])}),
    Buffer.from(signature, 'hex'));
  } catch { return false; }
}
function check(saved) {
  const failures = [];
  const expect = (ok, label) => { if (!ok) failures.push(label); };
  const registry = saved.historical_control.registry.key_history;
  const keys = [registry.current, ...registry.retired].map(k => k.public_key);
  for (const p of saved.payments) {
    const b = p.artifact;
    if (!b) { failures.push(`${p.id}: missing artifact`); continue; }
    const c = JSON.parse(b.signed_payload);
    expect(signed(b.signed_payload, b.signature, b.public_key), `${p.id}: certificate signature`);
    expect(keys.includes(b.public_key), `${p.id}: published signing key`);
    expect(c.item === p.item && c.purpose === p.inputs.purpose && c.name === p.inputs.agent_name,
      `${p.id}: signed buyer inputs`);
    const offer = p.quoted_terms.accepts[0];
    expect(Math.round(c.paid_usdc * 1e6) === Number(offer.amount) && c.network === offer.network &&
      c.payer.toLowerCase() === saved.payer.toLowerCase(), `${p.id}: signed payment terms`);
    expect(b.certificate ? isDeepStrictEqual(b.certificate, c) : b.cert_id === c.cert_id && b.item_id === c.item &&
      Object.keys(c).filter(k => Object.hasOwn(b, k)).every(k => isDeepStrictEqual(b[k], c[k])),
      `${p.id}: displayed certificate`);
    if (b.purchased_text) {
      const text = b.purchased_text;
      const payload = JSON.parse(text.signed_payload);
      expect(signed(text.signed_payload, text.signature, text.public_key) && text.public_key === b.public_key,
        `${p.id}: purchased text signature`);
      expect(payload.cert_id === c.cert_id && payload.item_id === p.item && payload.deliverable === b.deliverable,
        `${p.id}: exact purchased words`);
    }
    const observations = [...(b.attestation ? [b.attestation] : []), ...(b.attestations ?? []),
      ...(b.reconciliation ? [b.reconciliation] : [])];
    expect(isDeepStrictEqual(observations.map(o => o.tx_hash),
      p.inputs.tx_hashes?.split(',') ?? (p.inputs.tx_hash ? [p.inputs.tx_hash] : [])), `${p.id}: subjects`);
    for (const o of observations) {
      const signedEntries = [];
      for (const pair of Object.entries(o)) { if (pair[0] === 'signature') break; signedEntries.push(pair); }
      expect(signed(JSON.stringify(Object.fromEntries(signedEntries)), o.signature, o.public_key) && keys.includes(o.public_key),
        `${p.id}: observation signature`);
      // Reconciliation hashes its factual core; its signed prose reading is outside that core.
      const core = [];
      for (const pair of signedEntries) {
        if (pair[0] === 'evidence_hash') break;
        if (o.reconciliation_id && pair[0] === 'reading') continue;
        core.push(pair);
      }
      expect(hash(JSON.stringify(Object.fromEntries(core))) === o.evidence_hash, `${p.id}: evidence hash`);
    }
    if (observations.length) {
      const digest = b.attestations ? hash(observations.map(o => o.evidence_hash).join(',')) : observations[0].evidence_hash;
      expect(c.attests === digest, `${p.id}: certificate binds observation`);
    }
  }
  return failures;
}

const failures = check(evidence);
if (failures.length) { console.error(JSON.stringify({failures})); process.exit(1); }
const corruptions = [
  e => { const a = e.payments[0].artifact; a.signed_payload = JSON.stringify({...JSON.parse(a.signed_payload), purpose: 'changed'}); },
  e => { e.payments.find(p => p.artifact.purchased_text).artifact.deliverable = 'replacement good'; },
  e => { e.payments.find(p => p.artifact.attestation).artifact.attestation.tx_hash = '0x' + '0'.repeat(64); },
  e => { e.payments[0].artifact = null; },
];
for (const corrupt of corruptions) {
  const altered = structuredClone(evidence); corrupt(altered);
  if (!check(altered).length) throw new Error('Corruption control was not rejected');
}
console.log(JSON.stringify({payment_records_verified: evidence.payments.length,
  distinct_certificates: new Set(evidence.payments.map(p => JSON.parse(p.artifact.signed_payload).cert_id)).size,
  corruption_controls_rejected: corruptions.length,
  scope: 'Saved signatures, buyer inputs, quoted payment fields and artifact bindings. No live chain or consensus verification.'}));
