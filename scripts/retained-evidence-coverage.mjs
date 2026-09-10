// Offline join. Every target comes from a verified signed certificate in the
// original census; storage labels and dates cannot substitute for its digest.
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {unresolvedCertificates,boundedFile,checkedJson} from './lib/retained-capture.mjs';
import {checkRetainedGoods,checkProjection} from './lib/retained-evidence.mjs';
import {digest} from './lib/evidence-coverage.mjs';
const [source,capture,keysFile]=process.argv.slice(2);
if(!source||!capture||!keysFile||process.argv.length!==5)throw Error('Usage: node scripts/retained-evidence-coverage.mjs <original-private-census> <retained-capture> <trusted-keys.json>');
const selected=await unresolvedCertificates(source,keysFile);
const manifest=JSON.parse(await boundedFile(join(capture,'manifest.json')));
if(manifest.format!=='scvd-retained-evidence/v1'||manifest.source_manifest_sha256!==selected.source_manifest_sha256||manifest.target_count!==selected.certificates.length)throw Error('Capture is not bound to this census');
const projections=[];const familyStates=[];
for(const family of selected.schema.retentionFamilies){
 const entries=manifest.families.filter(x=>x.name===family.name);if(entries.length>1)throw Error('Duplicate family');
 const entry=entries[0];familyStates.push({name:family.name,status:entry?.status??'not_read',listed:entry?.listed??null,read:entry?.read??0,complete:entry?.complete===true});
 if(!entry?.file)continue;
 const list=await checkedJson(capture,entry);
 if(!Array.isArray(list)||list.length!==entry.listed||new Set(list.map(x=>x.name)).size!==list.length)throw Error('Projection denominator mismatch');
 for(const key of list){
  if(typeof key.name!=='string'||!key.name.startsWith(family.prefix))throw Error('Invalid projection key');
  const rows=manifest.reads.filter(x=>x.family===family.name&&x.key===key.name);if(rows.length>1)throw Error('Duplicate projection record');
  const row=rows[0];const result={family:family.name,status:row?.status??'not_read'};
  if(row?.status==='readable')try{result.value=await checkedJson(capture,row);}catch{result.status='unreadable';}
  projections.push(result);
 }
}
const results=[];
const rank=['verified_report','verified_bundle','matched_unsigned_projection','matched_opaque_anchor','empty_bundle_binding'];
const targetIds=new Set(selected.certificates.map(x=>x.cert_id));
if(manifest.journals.some(x=>!targetIds.has(x.cert_id)))throw Error('Unexpected journal target');
for(const cert of selected.certificates){
 const candidates=[];
 const journals=manifest.journals.filter(x=>x.cert_id===cert.cert_id);if(journals.length>1)throw Error('Duplicate journal record');
 const journal=journals[0];let journalStatus=journal?.status??(cert.item==='bitcoin_anchor'?'not_applicable':'not_read');
 if(journal?.file){
  try{
   const value=await checkedJson(capture,journal);
   if(value.status!==journal.status)throw Error('Journal state mismatch');
   if(value.status==='readable')candidates.push({source:'purchase_journal',...checkRetainedGoods(cert.item,value.goods,selected.trustedKeys,cert.attests)});
  }catch{journalStatus='unreadable';}
 }
 for(const row of projections.filter(x=>x.family===cert.item)){
  if(row.status!=='readable'){candidates.push({source:'projection',status:row.status});continue;}
  const checked=cert.item==='trust_profile'?checkRetainedGoods(cert.item,{observation:row.value},selected.trustedKeys,cert.attests):checkProjection(cert.item,row.value,cert);
  candidates.push({source:'projection',...checked});
 }
 const matched=rank.map(status=>candidates.find(x=>x.status===status)).find(Boolean);
 const status=matched?.status??(cert.item==='attestation_bundle'&&cert.attests===digest('')?'empty_digest_without_members':'unresolved_binding');
 results.push({cert_id:cert.cert_id,item:cert.item,status,journal_status:journalStatus,candidates});
}
const count=rows=>rows.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{});
const summary={checked_at:new Date().toISOString(),captured_from:manifest.started_at,captured_to:manifest.completed_at,
 original_certificate_count:selected.source_certificate_count,original_unmatched_bindings:selected.certificates.length,
 outcomes:count(results),by_item:Object.fromEntries([...new Set(results.map(x=>x.item))].sort().map(item=>[item,count(results.filter(x=>x.item===item))])),
 journal_states:results.reduce((o,r)=>(o[r.journal_status]=(o[r.journal_status]??0)+1,o),{}),
 projection_rows:count(projections),families:familyStates,
 limits:[
  'Targets are the unmatched signed attests bindings from the earlier certificate census, not a new census of all purchases.',
  'A verified report or bundle must match the exact certificate digest. Projections can contain later observations; matching only a host does not recover historical evidence.',
  'Unsigned projection matches and opaque buyer-digest anchor records are counted separately from independently signed reports. This command does not verify Bitcoin proofs or buyer-held digest preimages.',
  'Recovery reads use existing transaction-identity RPC methods and retained responses only, including the legacy completion reader. No replay, new observation, signing, settlement or storage write is invoked. Observation-only journals and hosted grant history without a purchase identity remain outside this collector.',
  'Not found means these identity-matched recovery methods returned no completed record, not proof the original goods never existed. Unavailable, unreadable and capped reads remain explicit.',
  'KV listing and later reads do not form a consistent historical snapshot. No factual-truth or exact-issue-time claim.',
 ]};
await writeFile(join(capture,'retention-results.json'),JSON.stringify(results,null,2),{mode:0o600});
await writeFile(join(capture,'retention-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
console.log(JSON.stringify(summary,null,2));
