import {checkReport,digest} from './evidence-coverage.mjs';
import {RETAINED_KEY_CAP} from './retained-evidence-contract.mjs';
export {RETAINED_ITEMS,RETAINED_BYTES,RETAINED_KEY_CAP} from './retained-evidence-contract.mjs';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function checkRetainedGoods(item, goods, trustedKeys, expectedHash) {
 if (!object(goods)) return {status:'unsupported_shape'};
 if (item === 'attestation_bundle') {
  const bundle=goods.attestations;
  if (!Array.isArray(bundle) || bundle.length>RETAINED_KEY_CAP) return {status:'unsupported_shape'};
  if (!bundle.length) return {status:expectedHash===digest('')?'empty_bundle_binding':'binding_mismatch'};
  const members=bundle.map(x=>checkReport(x,'core',trustedKeys));
  const counts=members.reduce((out,x)=>(out[x.status]=(out[x.status]??0)+1,out),{});
  if (members.some(x=>x.status!=='verified')) return {status:'invalid_member',members:counts};
  const hash=digest(members.map(x=>x.evidence_hash).join(','));
  return {status:hash===expectedHash?'verified_bundle':'binding_mismatch',members:counts};
 }
 const mode=item==='settlement_attestation'?'core':['spot_check','passport_refresh','trust_profile'].includes(item)?'payload':null;
 if (!mode) return {status:'unsupported_shape'};
 const doc=mode==='core'?goods.attestation:goods.observation;
 if (!object(doc)) return {status:'unsupported_shape'};
 const checked=checkReport(doc,mode,trustedKeys);
 if (checked.status!=='verified') return checked;
 return {status:checked.evidence_hash===expectedHash?'verified_report':'binding_mismatch'};
}
/** A hash-matched unsigned projection is evidence bound by the certificate,
 * but has no independently verified report signature. An opaque digest still
 * needs the buyer's bytes and an independent Bitcoin proof check. */
export function checkProjection(item, value, certificate) {
 if (!object(value)) return {status:'unsupported_shape'};
 if (item==='passport_refresh') {
  if (typeof value.host!=='string' || typeof value.observed_at!=='string') return {status:'unsupported_shape'};
  return {status:digest(JSON.stringify(value))===certificate.attests?'matched_unsigned_projection':'binding_mismatch'};
 }
 if (item==='bitcoin_anchor') {
  if (!/^[a-f0-9]{64}$/.test(value.digest??'') || typeof value.cert_id!=='string') return {status:'unsupported_shape'};
  if (value.cert_id!==certificate.cert_id || value.digest!==certificate.attests) return {status:'binding_mismatch'};
  return {status:'matched_opaque_anchor',stored_timestamp_state:['complete','pending','failed'].includes(value.ots?.status)?value.ots.status:'unreadable',proof_present:typeof value.ots?.proof_base64==='string',independently_verified:false};
 }
 return {status:'unsupported_shape'};
}
