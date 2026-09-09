// Experimental, outside the Worker import graph. No production keys or defaults.
const ALGORITHMS = new Set(['ed25519', 'ML-DSA-65']);
const encoder = new TextEncoder();
function exactKeys(obj, names) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).sort().join(',') !== [...names].sort().join(',')) throw Error('unsupported_shape');
}
function checkedSigner(s) {
  exactKeys(s,['algorithm','key_id']);
  if (!ALGORITHMS.has(s.algorithm) || typeof s.key_id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(s.key_id)) throw Error('unsupported_signer');
  return { algorithm:s.algorithm, key_id:s.key_id };
}
export function signingBytes(header,payload) {
  exactKeys(header,['version','purpose','canonicalization','policy','signers']);
  if (header.version !== 1 || header.canonicalization !== 'scvd-envelope-v1' || header.policy !== 'all' || typeof header.purpose !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(header.purpose)) throw Error('unsupported_policy');
  if (typeof payload !== 'string' || payload.length > 1024 * 1024 || !Array.isArray(header.signers) || !header.signers.length || header.signers.length > 4) throw Error('invalid_payload_or_signers');
  const signers = header.signers.map(checkedSigner);
  if (new Set(signers.map(s=>s.key_id)).size !== signers.length || new Set(signers.map(s=>s.algorithm)).size !== signers.length) throw Error('duplicate_signer');
  return encoder.encode('SCVD-EXPERIMENTAL-ENVELOPE\0'+JSON.stringify({ protected:{version:1,purpose:header.purpose,canonicalization:header.canonicalization,policy:'all',signers}, payload }));
}
export async function verifyEnvelope(envelope,options) {
  const checks=[];
  try {
    exactKeys(envelope,['protected','payload','signatures']);
    const bytes=signingBytes(envelope.protected,envelope.payload);
    if (!options || !Array.isArray(options.signers) || options.purpose !== envelope.protected.purpose) throw Error('expected_policy_required');
    const expected=options.signers.map(s=>checkedSigner({algorithm:s.algorithm,key_id:s.key_id}));
    if (JSON.stringify(expected) !== JSON.stringify(envelope.protected.signers.map(checkedSigner))) throw Error('signer_policy_mismatch');
    if (!Array.isArray(envelope.signatures) || envelope.signatures.length !== expected.length) throw Error('missing_or_extra_signature');
    for (const [i,signer] of expected.entries()) {
      const entry=envelope.signatures[i];
      exactKeys(entry,['algorithm','key_id','signature']);
      if (entry.algorithm !== signer.algorithm || entry.key_id !== signer.key_id || typeof entry.signature !== 'string' || !/^(?:[a-f0-9]{2}){1,8192}$/i.test(entry.signature)) throw Error('signature_binding_mismatch');
      const backend=Object.hasOwn(options.verifiers ?? {},signer.algorithm) ? options.verifiers[signer.algorithm] : undefined;
      if (typeof backend !== 'function' || !options.signers[i].public_key) throw Error('backend_or_trusted_key_missing');
      const signature=Uint8Array.from(entry.signature.match(/../g),x=>parseInt(x,16));
      const valid=(await backend(bytes,signature,options.signers[i].public_key)) === true;
      checks.push({...signer,valid});
      if (!valid) throw Error('invalid_signature');
    }
    return { valid:true, checks, scope:'All expected signatures cover the exact payload, purpose and signer policy. Experimental format; no timestamp or factual claim is verified.' };
  } catch { return {valid:false,checks,problem:'invalid_envelope_or_unmet_verification_policy'}; }
}
