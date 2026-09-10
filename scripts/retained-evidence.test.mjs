import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {digest} from './lib/evidence-coverage.mjs';
import {checkRetainedGoods,checkProjection} from './lib/retained-evidence.mjs';
const pair=generateKeyPairSync('ed25519');
const key=pair.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
const signature=payload=>sign(null,Buffer.from(payload),pair.privateKey).toString('hex');
function attestation(n){const core={observed_at:'2026-09-09',tx_hash:String(n),status:'SETTLED'};const payload={...core,evidence_hash:digest(JSON.stringify(core)),reading:'A dated read',scope:'One transaction'};return {...payload,signature:signature(JSON.stringify(payload)),public_key:key};}
function observation(n){const signed_payload=JSON.stringify({host:`host-${n}.example`,observed_at:'2026-09-09'});return {signed_payload,evidence_hash:digest(signed_payload),signature:signature(signed_payload),public_key:key};}
test('retained single observations verify exact signed payloads and require the certificate digest',()=>{
 const a=attestation(1);assert.equal(checkRetainedGoods('settlement_attestation',{attestation:a},[key],a.evidence_hash).status,'verified_report');
 for(const item of ['spot_check','passport_refresh','trust_profile']){
  const o=observation(item);assert.equal(checkRetainedGoods(item,{observation:o},[key],o.evidence_hash).status,'verified_report');
  assert.equal(checkRetainedGoods(item,{observation:o},[],o.evidence_hash).status,'untrusted_key');
  assert.equal(checkRetainedGoods(item,{observation:o},[key],'0'.repeat(64)).status,'binding_mismatch');
  const tampered={...o,signed_payload:o.signed_payload+' '};assert.equal(checkRetainedGoods(item,{observation:tampered},[key],o.evidence_hash).status,'invalid_signature');
 }
});
test('bundle verification checks every member and its original order',()=>{
 const members=[attestation(1),attestation(2)];const hash=digest(members.map(x=>x.evidence_hash).join(','));
 assert.equal(checkRetainedGoods('attestation_bundle',{attestations:members},[key],hash).status,'verified_bundle');
 for(const changed of [[...members].reverse(),members.slice(1)])assert.equal(checkRetainedGoods('attestation_bundle',{attestations:changed},[key],hash).status,'binding_mismatch');
 const tampered=structuredClone(members);tampered[1].status='CHANGED';
 const result=checkRetainedGoods('attestation_bundle',{attestations:tampered},[key],hash);
 assert.equal(result.status,'invalid_member');assert.equal(result.members.invalid_signature,1);
});
test('an empty sheaf binding is recognized but never counted as a verified report or bundle',()=>{
 assert.equal(checkRetainedGoods('attestation_bundle',{attestations:[]},[key],digest('')).status,'empty_bundle_binding');
 assert.equal(checkRetainedGoods('attestation_bundle',{attestations:[]},[key],'f'.repeat(64)).status,'binding_mismatch');
});
test('unsigned latest projections and opaque anchors remain different from signed reports',()=>{
 const value={host:'one.example',observed_at:'2026-09-09'};
 assert.equal(checkProjection('passport_refresh',value,{attests:digest(JSON.stringify(value))}).status,'matched_unsigned_projection');
 assert.equal(checkProjection('passport_refresh',{...value,observed_at:'2026-09-10'},{attests:digest(JSON.stringify(value))}).status,'binding_mismatch');
 const cert={cert_id:'cert_one',attests:'b'.repeat(64)};
 const anchor={cert_id:cert.cert_id,digest:cert.attests,ots:{status:'complete',proof_base64:'AA=='}};
 assert.equal(checkProjection('bitcoin_anchor',anchor,cert).status,'matched_opaque_anchor');
 assert.equal(checkProjection('bitcoin_anchor',{...anchor,cert_id:'cert_other'},cert).status,'binding_mismatch');
});
test('unknown goods and malformed bundles abstain instead of searching arbitrary nested signatures',()=>{
 assert.equal(checkRetainedGoods('unknown',{observation:observation(1)},[key],observation(1).evidence_hash).status,'unsupported_shape');
 for(const value of [null,{},'a',null])assert.equal(checkRetainedGoods('attestation_bundle',{attestations:value},[key],digest('')).status,'unsupported_shape');
});

test('offline supplement keeps missing and tampered journal evidence in the original denominator',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const {loadInventorySchema}=await import('./lib/load-inventory-schema.mjs');
 const {canonicalizeCertificate,inventoryFamilies,retentionFamilies}=await loadInventorySchema();
 const dir=await mkdtemp(join(tmpdir(),'scvd-retained-test-'));
 const save=async(file,data)=>{const bytes=JSON.stringify(data);await writeFile(join(dir,file),bytes);return {file,sha256:digest(bytes)};};
 const o=observation(1),members=[attestation(1),attestation(2)];
 const c1={cert_id:'cert_one',item:'spot_check',date:'2026-09-09',patron_number:1,attests:o.evidence_hash};
 const c2={cert_id:'cert_two',item:'attestation_bundle',date:'2026-09-09',patron_number:2,attests:digest(members.map(x=>x.evidence_hash).join(','))};
 const certs=[c1,c2];const prefix=inventoryFamilies.find(x=>x.mode==='certificate').prefix;
 try{
  await save('keys.json',[key]);
  const families=[{name:'certificates',complete:true,listed:2,...await save('cert-list.json',certs.map(c=>({name:prefix+c.cert_id})))}];
  const reads=[];
  for(const c of certs)reads.push({family:'certificates',key:prefix+c.cert_id,status:'readable',...await save(`${c.cert_id}.json`,{certificate:c,signature:signature(canonicalizeCertificate(c)),public_key:key})});
  const original={format:'scvd-private-inventory/v1',families,reads};
  const base=await save('manifest.json',original);
  const {mkdir}=await import('node:fs/promises');const supplement=join(dir,'retained');await mkdir(supplement);
  const write=async(file,value)=>{const bytes=JSON.stringify(value);await writeFile(join(supplement,file),bytes);return {file,sha256:digest(bytes)};};
  const manifest={format:'scvd-retained-evidence/v1',source_manifest_sha256:base.sha256,target_count:2,reads:[],families:[],journals:[]};
  for(const f of retentionFamilies)manifest.families.push({name:f.name,status:'readable',listed:0,read:0,complete:true,...await write(`list-${f.name}.json`,[])});
  for(const [i,goods] of [{observation:o},{attestations:members}].entries())manifest.journals.push({cert_id:certs[i].cert_id,item:certs[i].item,status:'readable',...await write(`journal-${i}.json`,{status:'readable',goods})});
  const run=async()=>{await write('manifest.json',manifest);await promisify(execFile)(process.execPath,[new URL('./retained-evidence-coverage.mjs',import.meta.url).pathname,dir,supplement,join(dir,'keys.json')]);return JSON.parse(await readFile(join(supplement,'retention-summary.json')));};
  const first=await run();assert.deepEqual(first.outcomes,{verified_report:1,verified_bundle:1});
  await rm(join(supplement,'journal-0.json'));
  Object.assign(manifest.journals[1],await write('journal-1.json',{status:'readable',goods:{attestations:[...members].reverse()}}));
  const changed=await run();assert.equal(changed.original_unmatched_bindings,2);assert.deepEqual(changed.outcomes,{unresolved_binding:2});assert.equal(changed.journal_states.unreadable,1);
  manifest.source_manifest_sha256='0'.repeat(64);await assert.rejects(run());
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('private capture refuses a Git checkout and bounds response bytes while streaming',async()=>{
 const {privateOutputDirectory,boundedResponse}=await import('./lib/retained-capture.mjs');
 const {RETAINED_BYTES}=await import('./lib/retained-evidence-contract.mjs');
 await assert.rejects(privateOutputDirectory(new URL('../must-not-write',import.meta.url).pathname),/outside Git/);
 let cancelled=false;
 const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(RETAINED_BYTES+1));},cancel(){cancelled=true;}}));
 await assert.rejects(boundedResponse(response),/oversized/);assert.equal(cancelled,true);
});

test('capture output guard fails closed when Git cannot establish repository membership',async()=>{
 const {privateOutputDirectory}=await import('./lib/retained-capture.mjs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const prior=process.env.PATH;
 try{process.env.PATH='';await assert.rejects(privateOutputDirectory(join(tmpdir(),'must-not-write')),/Cannot establish/);}
 finally{if(prior===undefined)delete process.env.PATH;else process.env.PATH=prior;}
});
