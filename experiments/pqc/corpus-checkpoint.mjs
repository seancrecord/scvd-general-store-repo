// Offline qualification adapter. Reuses the released evidence and key-window readers.
import { createPublicKey } from 'node:crypto';
import { createEvidenceBundle,verifyEvidenceBundle,EVIDENCE_BUNDLE_HARD_MAX_BYTES } from '../../verifier/evidence-bundle.js';
import { checkKeyServiceWindow } from '../../verifier/x402-verify.js';
import { CONTRACT,parseTrust,signCheckpoint,verifyCheckpoint } from './checkpoint.mjs';

export const CORPUS_QUALIFICATION_LIMITS=Object.freeze({records:64,history_keys:64,total_bytes:EVIDENCE_BUNDLE_HARD_MAX_BYTES,history_bytes:65536});
const record=x=>x!==null && typeof x==='object' && !Array.isArray(x);
function require(value) {if(!value) throw Error('invalid_corpus_or_history');}
const norm=value=>typeof value==='string'?value.replace(/^0x/,'').toLowerCase():'';
function rawEd(spkiHex) {
  const jwk=createPublicKey({key:Buffer.from(spkiHex,'hex'),format:'der',type:'spki'}).export({format:'jwk'});
  require(jwk.crv==='Ed25519');return Buffer.from(jwk.x,'base64url').toString('hex');
}
function day(value) {
  require(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const instant=Date.parse(value+'T00:00:00.000Z');
  require(Number.isFinite(instant) && new Date(instant).toISOString().slice(0,10)===value);
  return value;
}
function historyPolicy(input,trustBytes) {
  require(record(input) && Buffer.byteLength(JSON.stringify(input))<=CORPUS_QUALIFICATION_LIMITS.history_bytes);
  require(record(input.current) && Array.isArray(input.retired) && input.retired.length<CORPUS_QUALIFICATION_LIMITS.history_keys);
  const declaration=parseTrust(trustBytes);
  const artifactKey=rawEd(declaration.keys[0].public_key),checkpointKey=rawEd(declaration.keys[1].public_key);
  const entries=[input.current,...input.retired];
  const keys=entries.map(entry=>{
    require(record(entry));const key=norm(entry.public_key);require(/^[0-9a-f]{64}$/.test(key));
    day(entry.in_service_from);return key;
  });
  require(keys[0]===artifactKey);
  require(new Set(keys).size===keys.length);
  // Even an edited/aliased history cannot authorize the checkpoint key for goods.
  require(!keys.includes(checkpointKey));
  for(const entry of input.retired) require(day(entry.retired_on)>=entry.in_service_from);
  return {keys,history:structuredClone(input)};
}

export async function readCorpusForCheckpoint({records,keyHistory,trustBytes}) {
  try {
    require(Array.isArray(records) && records.length>0 && records.length<=CORPUS_QUALIFICATION_LIMITS.records);
    const policy=historyPolicy(keyHistory,trustBytes);
    const encoded=JSON.stringify(records);
    require(Buffer.byteLength(encoded)<=CORPUS_QUALIFICATION_LIMITS.total_bytes);
    // Pin caller-owned objects before the first crypto await. A later mutation
    // must not change which record or date the successful result describes.
    const stableRecords=JSON.parse(encoded);
    let previousDigest=null,lastSnapshot;
    const readings=[];
    for(const [index,input] of stableRecords.entries()) {
      require(record(input) && record(input.snapshot));
      const s=input.snapshot;
      require(s.sequence===index+1 && s.previous_digest===previousDigest);
      const date=day(String(s.taken_at).slice(0,10));
      require(typeof s.taken_at==='string' && Number.isFinite(Date.parse(s.taken_at)));
      require(new Date(s.taken_at).toISOString().slice(0,10)===date);
      const key=norm(input.public_key);require(policy.keys.includes(key));
      const window=checkKeyServiceWindow(policy.history,key,s.taken_at);
      require(window.status==='in_service');
      const bundle=await createEvidenceBundle(input,{maxBytes:EVIDENCE_BUNDLE_HARD_MAX_BYTES});
      const canonical=bundle.artifact.signed_payload;
      // Never silently prefer one of two conflicting published byte representations.
      for(const name of ['canonical_form','signed_payload'])
        if(Object.hasOwn(input,name)) require(input[name]===canonical);
      const original=await verifyEvidenceBundle(bundle,{publicKey:key,maxBytes:EVIDENCE_BUNDLE_HARD_MAX_BYTES});
      require(original.valid);
      lastSnapshot=Buffer.from(canonical);
      require(lastSnapshot.length<=CONTRACT.max_snapshot_bytes);
      readings.push({sequence:s.sequence,digest:input.digest,original_signature:'verified',
        key:policy.keys[0]===key?'current':'retired',service_window:window.status,
        claimed_time:'within_published_window_not_independent_time_proof',
        original_timestamp:original.timestamp});
      previousDigest=input.digest;
    }
    return {valid:true,records:readings,snapshot:lastSnapshot,
      continuity:'supplied_prefix_from_genesis',key_history:'caller_supplied_not_independently_anchored',
      coverage:'Signatures, canonical snapshot bytes and prefix links; not truth or full nested round schema.'};
  } catch {return {valid:false,problem:'invalid_corpus_or_unmet_historical_key_policy'};}
}

export async function signCorpusCheckpoint({records,keyHistory,trustBytes,edPrivateKey,pqSecretKey,includeSha512=false}) {
  require(trustBytes instanceof Uint8Array && trustBytes.length<=CONTRACT.max_trust_bytes);
  const pinnedTrust=Buffer.from(trustBytes);
  const corpus=await readCorpusForCheckpoint({records,keyHistory,trustBytes:pinnedTrust});
  require(corpus.valid);
  return signCheckpoint({snapshot:corpus.snapshot,trustBytes:pinnedTrust,edPrivateKey,pqSecretKey,includeSha512});
}

export async function verifyCorpusCheckpoint({bytes,records,keyHistory,trustBytes}) {
  if(!(trustBytes instanceof Uint8Array) || trustBytes.length>CONTRACT.max_trust_bytes ||
    !(bytes instanceof Uint8Array) || bytes.length>CONTRACT.max_envelope_bytes)
    return {valid:false,problem:'invalid_checkpoint_input',production_ready:false};
  const pinnedTrust=Buffer.from(trustBytes),pinnedBytes=Buffer.from(bytes);
  const corpus=await readCorpusForCheckpoint({records,keyHistory,trustBytes:pinnedTrust});
  if(!corpus.valid) return {valid:false,corpus,production_ready:false};
  const checkpoint=verifyCheckpoint({bytes:pinnedBytes,snapshot:corpus.snapshot,trustBytes:pinnedTrust});
  const {snapshot,...reading}=corpus;
  return {valid:checkpoint.valid,corpus:reading,checkpoint,production_ready:false};
}
