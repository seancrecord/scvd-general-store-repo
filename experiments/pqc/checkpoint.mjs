// Synthetic checkpoint contract. No Worker imports, key storage, or anchor claims.
import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

export const CONTRACT = Object.freeze({
  version:1, purpose:'corpus-checkpoint', canonicalization:'scvd-pq-checkpoint-draft-v1',
  policy:'all', mldsa_mode:'pure', signing_variant:'hedged',
  context:'scvd.store:corpus-checkpoint:v1',
  snapshot_canonicalization:'scvd-corpus-canonical-input-v1',
  max_envelope_bytes:16384, max_snapshot_bytes:16*1024*1024, max_trust_bytes:16384,
});
export const FORMAT_FIELDS=Object.freeze(Object.fromEntries(Object.entries({
  envelope:['protected','payload','signatures'],
  header:['version','purpose','canonicalization','policy','signers','mldsa_mode','signing_variant','context'],
  payload:['corpus_version','sequence','week','snapshot_canonicalization','canonical_sha256','canonical_sha512','key_announcement_sha256'],
  signer:['algorithm','key_id'],signature:['algorithm','key_id','signature'],
  trust:['version','purpose','keys'],key:['algorithm','key_id','purpose','encoding','public_key'],
}).map(([name,fields])=>[name,Object.freeze(fields)])));
const HEADER=FORMAT_FIELDS.header, PAYLOAD=FORMAT_FIELDS.payload;
const prefix=Buffer.from('SCVD-PQ-CORPUS-CHECKPOINT\0');
const context=Buffer.from(CONTRACT.context);
const hex=(value,length)=>typeof value==='string' && value.length===length*2 && /^[0-9a-f]+$/.test(value);
const hash=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest('hex');
function require(condition) { if(!condition) throw Error('invalid_checkpoint_contract'); }
function ordered(value,names) {
  require(value && typeof value==='object' && !Array.isArray(value));
  require(Object.keys(value).length===names.length && names.every(n=>Object.hasOwn(value,n)));
  return Object.fromEntries(names.map(n=>[n,value[n]]));
}
function text(bytes,limit) {
  require(bytes instanceof Uint8Array && bytes.length>0 && bytes.length<=limit);
  // Preserve a BOM for the subsequent canonical equality check to reject it.
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
function parsed(bytes,limit,normalize) {
  const raw=text(bytes,limit);
  const value=normalize(JSON.parse(raw));
  // No signature/trust decision uses parsed data before exact reconstruction.
  // Duplicate keys, alternate escapes/numbers, whitespace and order all differ.
  require(JSON.stringify(value)===raw);
  return value;
}
function signer(entry) {
  const s=ordered(entry,FORMAT_FIELDS.signer);
  require(typeof s.key_id==='string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(s.key_id));
  require(s.algorithm==='ed25519' || s.algorithm==='ML-DSA-65');
  return s;
}
function header(value) {
  const h=ordered(value,HEADER);
  for(const key of HEADER.filter(k=>k!=='signers')) require(h[key]===CONTRACT[key]);
  require(Array.isArray(h.signers) && h.signers.length===2);
  h.signers=h.signers.map(signer);
  require(h.signers[0].algorithm==='ed25519' && h.signers[1].algorithm==='ML-DSA-65');
  require(h.signers[0].key_id!==h.signers[1].key_id);
  return h;
}
function payload(value) {
  const p=ordered(value,PAYLOAD);
  require(p.corpus_version===1 && Number.isSafeInteger(p.sequence) && p.sequence>=1);
  require(typeof p.week==='string' && /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/.test(p.week));
  require(p.snapshot_canonicalization===CONTRACT.snapshot_canonicalization);
  require(hex(p.canonical_sha256,32) && hex(p.key_announcement_sha256,32));
  require(p.canonical_sha512===null || hex(p.canonical_sha512,64));
  return p;
}
function envelope(value) {
  const e=ordered(value,FORMAT_FIELDS.envelope);
  e.protected=header(e.protected);
  require(typeof e.payload==='string');
  parsed(Buffer.from(e.payload),CONTRACT.max_envelope_bytes,payload);
  require(Array.isArray(e.signatures) && e.signatures.length===2);
  e.signatures=e.signatures.map((entry,i)=>{
    const s=ordered(entry,FORMAT_FIELDS.signature);
    const expected=e.protected.signers[i];
    require(s.algorithm===expected.algorithm && s.key_id===expected.key_id);
    require(hex(s.signature,i===0?64:ml_dsa65.lengths.signature));
    return s;
  });
  return e;
}
function edKey(publicHex) {
  require(hex(publicHex,44)); // canonical Ed25519 SubjectPublicKeyInfo DER
  const key=createPublicKey({key:Buffer.from(publicHex,'hex'),format:'der',type:'spki'});
  require(key.asymmetricKeyType==='ed25519');
  require(key.export({format:'der',type:'spki'}).toString('hex')===publicHex);
  return key;
}
function trust(value) {
  const d=ordered(value,FORMAT_FIELDS.trust);
  require(d.version===1 && d.purpose==='synthetic-checkpoint-trust');
  require(Array.isArray(d.keys) && d.keys.length===3);
  d.keys=d.keys.map(entry=>{
    const k=ordered(entry,FORMAT_FIELDS.key);
    signer({algorithm:k.algorithm,key_id:k.key_id});
    require(k.purpose==='artifact' || k.purpose==='checkpoint');
    if(k.algorithm==='ed25519') { require(k.encoding==='spki-der-hex');edKey(k.public_key); }
    else {require(k.purpose==='checkpoint' && k.encoding==='raw-hex' && hex(k.public_key,ml_dsa65.lengths.publicKey));}
    return k;
  });
  require(d.keys.map(k=>k.algorithm+':'+k.purpose).join(',')==='ed25519:artifact,ed25519:checkpoint,ML-DSA-65:checkpoint');
  require(new Set(d.keys.map(k=>k.key_id)).size===d.keys.length);
  // IDs are aliases; separation must hold for the actual public key bytes too.
  require(d.keys[0].public_key!==d.keys[1].public_key);
  return d;
}
export const parseTrust=bytes=>parsed(bytes,CONTRACT.max_trust_bytes,trust);
export const encodeTrust=value=>Buffer.from(JSON.stringify(trust(value)));
function authorizedKey(declaration,id,algorithm,purpose) {
  const entry=declaration.keys.find(k=>k.key_id===id && k.algorithm===algorithm);
  require(entry);
  require(entry.purpose===purpose);
  return entry;
}
function snapshotInfo(bytes) {
  // The original corpus verifier owns its schema and canonicalization. Here we
  // bind the supplied bytes and cross-check the three advertised identifiers.
  const value=JSON.parse(text(bytes,CONTRACT.max_snapshot_bytes));
  require(value && typeof value==='object' && !Array.isArray(value));
  require(JSON.stringify(value)===text(bytes,CONTRACT.max_snapshot_bytes));
  return {corpus_version:value.version,sequence:value.sequence,week:value.week};
}
export function checkpointMessage(protectedHeader,payloadText) {
  const h=header(protectedHeader);
  require(typeof payloadText==='string');
  parsed(Buffer.from(payloadText),CONTRACT.max_envelope_bytes,payload);
  return Buffer.concat([prefix,Buffer.from(JSON.stringify({protected:h,payload:payloadText}))]);
}
export function signCheckpoint({snapshot,trustBytes,edPrivateKey,pqSecretKey,includeSha512=false}) {
  require(typeof includeSha512==='boolean');
  const declaration=parseTrust(trustBytes);
  const [ed,pq]=declaration.keys.slice(1);
  require(createPublicKey(edPrivateKey).export({format:'der',type:'spki'}).toString('hex')===ed.public_key);
  require(Buffer.from(ml_dsa65.getPublicKey(pqSecretKey)).toString('hex')===pq.public_key);
  const h=header({...Object.fromEntries(HEADER.map(k=>[k,CONTRACT[k]])),
    signers:[ed,pq].map(({algorithm,key_id})=>({algorithm,key_id}))});
  const p=JSON.stringify(payload({...snapshotInfo(snapshot),snapshot_canonicalization:CONTRACT.snapshot_canonicalization,
    canonical_sha256:hash(snapshot),canonical_sha512:includeSha512?hash(snapshot,'sha512'):null,
    key_announcement_sha256:hash(trustBytes)}));
  const message=checkpointMessage(h,p);
  // No caller option for deterministic mode or custom entropy on this path.
  const signatures=[sign(null,message,edPrivateKey),ml_dsa65.sign(message,pqSecretKey,{context})];
  const bytes=Buffer.from(JSON.stringify(envelope({protected:h,payload:p,
    signatures:h.signers.map((s,i)=>({...s,signature:Buffer.from(signatures[i]).toString('hex')}))})));
  require(bytes.length<=CONTRACT.max_envelope_bytes);
  require(verifyCheckpoint({bytes,snapshot,trustBytes}).valid);
  return bytes;
}
export function verifyCheckpoint({bytes,snapshot,trustBytes}) {
  try {
    const declaration=parseTrust(trustBytes);
    const e=parsed(bytes,CONTRACT.max_envelope_bytes,envelope);
    const p=JSON.parse(e.payload), info=snapshotInfo(snapshot);
    require(p.key_announcement_sha256===hash(trustBytes));
    for(const key of Object.keys(info)) require(p[key]===info[key]);
    require(p.canonical_sha256===hash(snapshot));
    require(p.canonical_sha512===null || p.canonical_sha512===hash(snapshot,'sha512'));
    const keys=e.protected.signers.map(s=>authorizedKey(declaration,s.key_id,s.algorithm,'checkpoint'));
    const message=checkpointMessage(e.protected,e.payload);
    require(verify(null,message,edKey(keys[0].public_key),Buffer.from(e.signatures[0].signature,'hex')));
    require(ml_dsa65.verify(Buffer.from(e.signatures[1].signature,'hex'),message,Buffer.from(keys[1].public_key,'hex'),{context}));
    return {valid:true,signatures:'both_valid',snapshot_bytes:'bound',key_purposes:'authorized_by_supplied_trust',
      signing_variant:'issuer_claim_only',anchoring:'not_checked',production_ready:false};
  } catch {return {valid:false,problem:'invalid_checkpoint_or_unmet_trust_policy',production_ready:false};}
}
export function verifyArtifactSignature({bytes,signature,keyId,trustBytes}) {
  // Experimental acceptance seam, not the production artifact schema verifier.
  try {
    require(bytes instanceof Uint8Array && bytes.length<=CONTRACT.max_snapshot_bytes);
    require(signature instanceof Uint8Array && signature.length===64);
    const key=authorizedKey(parseTrust(trustBytes),keyId,'ed25519','artifact');
    return verify(null,bytes,edKey(key.public_key),signature);
  } catch {return false;}
}
