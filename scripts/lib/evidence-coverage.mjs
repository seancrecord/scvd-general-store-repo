import { createHash, createPublicKey, verify } from 'node:crypto';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function signatureValid(payload, signature, key) {
  if (!/^[a-f0-9]{64}$/i.test(key ?? '') || !/^[a-f0-9]{128}$/i.test(signature ?? '')) return false;
  try {
    return verify(null,Buffer.from(payload),createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')]),type:'spki',format:'der'}),Buffer.from(signature,'hex'));
  } catch { return false; }
}
export function checkCertificate(value, trustedKeys, canonicalize, legacyCanonicalize) {
  if (!object(value?.certificate)) return {status:'unreadable'};
  if (!trustedKeys.includes(value.public_key)) return {status:'untrusted_key'};
  let payload = canonicalize(value.certificate);
  let form = 'current';
  if (!signatureValid(payload,value.signature,value.public_key)) {
    payload = legacyCanonicalize(value.certificate);form = 'legacy';
    if (!signatureValid(payload,value.signature,value.public_key)) return {status:'invalid_signature'};
  }
  const claims = JSON.parse(payload);
  const anchor = value.anchor;
  return {status:'verified',form,payload,artifact_hash:digest(payload),
    attests:claims.attests ?? null,saw:claims.saw ?? null,
    anchor:!anchor ? 'absent' : ['pending','failed','complete'].includes(anchor.ots?.status) ? anchor.ots.status : 'unreadable',
    anchor_digest_matches:anchor ? anchor.digest === digest(payload) : null,
    proof_present:typeof anchor?.ots?.proof_base64 === 'string',
  };
}
const before = (value, field) => {
  const entries = Object.entries(value);const end=entries.findIndex(([k])=>k===field);
  if (end < 0) throw new Error('unsupported_shape');
  return Object.fromEntries(entries.slice(0,end));
};
/** Named storage adapters only; an unknown schema is not guessed into validity. */
export function checkReport(value, mode, trustedKeys) {
  try {
    const candidates = object(value) ? [value,...Object.values(value).filter(object)].filter(x=>typeof x.signature==='string') : [];
    if (candidates.length !== 1) return {status:'unsupported_shape'};
    const doc = candidates[0];
    if (!trustedKeys.includes(doc.public_key)) return {status:'untrusted_key'};
    const payload = mode === 'payload' ? doc.signed_payload : JSON.stringify(before(doc,'signature'));
    if (typeof payload !== 'string' || !signatureValid(payload,doc.signature,doc.public_key)) return {status:'invalid_signature'};
    let core;
    if (mode === 'payload') core = payload;
    else {
      const fields=before(JSON.parse(payload),'evidence_hash');
      if (mode === 'reconciliation') delete fields.reading;
      core=JSON.stringify(fields);
    }
    const hash=digest(core);
    if (hash !== doc.evidence_hash) return {status:'hash_mismatch'};
    return {status:'verified',evidence_hash:hash};
  } catch { return {status:'unreadable'}; }
}
const counts = rows => rows.reduce((out,row)=>(out[row.status]=(out[row.status]??0)+1,out),{});
export function summarizeCoverage(certificates,reports,listsComplete) {
  const hashes=new Set(reports.filter(x=>x.status==='verified').map(x=>x.evidence_hash));
  const signed=certificates.filter(x=>x.status==='verified');
  const linked=signed.filter(x=>x.attests);
  return {
    inventory_lists_complete:listsComplete,
    certificates:{listed:certificates.length,...counts(certificates)},
    reports:{listed:reports.length,...counts(reports)},
    links:{signed_certificates_with_attests:linked.length,matched_verified_report:linked.filter(x=>hashes.has(x.attests)).length,
      not_found_in_verified_inventory:linked.filter(x=>!hashes.has(x.attests)).length,
      signed_saw_not_collected:signed.filter(x=>x.saw).length},
    timestamps:{eligible_signed_certificates:signed.length,stored_states:signed.reduce((out,x)=>(out[x.anchor]=(out[x.anchor]??0)+1,out),{}),
      digest_mismatches:signed.filter(x=>x.anchor_digest_matches===false).length,
      proof_present:signed.filter(x=>x.proof_present).length,independently_verified:0},
    limits:[
      'Denominator: keys enumerated in the recorded storage reads; not all purchases, not proof no records were withheld. KV listings and values can change during capture.',
      'Reports cover the declared immutable PATRONS storage families only. Hosted latest-wins projections, recovery-only observations, caller-held attestations, sheaves, A2A journals and historical saw preimages are not collected. An unresolved hash is not proof its report never existed.',
      'Signature and report hash checks use independently supplied issuer keys, not keys selected by records. No key service-window or factual-truth claim.',
      'Stored complete and a matching digest do not verify a Bitcoin timestamp. Independently verified stays zero unless a separate proof/header pass is recorded.',
    ],
  };
}
