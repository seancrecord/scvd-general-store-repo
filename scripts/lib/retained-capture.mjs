import {readFile,lstat} from 'node:fs/promises';
import {join,basename,dirname,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest,checkCertificate,checkReport} from './evidence-coverage.mjs';
import {loadInventorySchema} from './load-inventory-schema.mjs';
import {RETAINED_BYTES} from './retained-evidence-contract.mjs';
export async function boundedFile(file) {
 const stat=await lstat(file);
 if(!stat.isFile()||stat.size>RETAINED_BYTES)throw Error('Capture file unavailable or oversized');
 const bytes=await readFile(file);if(bytes.length>RETAINED_BYTES)throw Error('Capture file oversized');return bytes;
}
export async function checkedJson(directory,row) {
 if(typeof row.file!=='string'||basename(row.file)!==row.file)throw Error('Invalid capture path');
 const bytes=await boundedFile(join(directory,row.file));
 if(digest(bytes)!==row.sha256)throw Error('Capture checksum failed');
 return JSON.parse(bytes);
}
export async function unresolvedCertificates(directory,keysFile) {
 const manifestBytes=await boundedFile(join(directory,'manifest.json'));
 const manifest=JSON.parse(manifestBytes);
 const trustedKeys=JSON.parse(await boundedFile(keysFile));
 if(!Array.isArray(trustedKeys)||!trustedKeys.length||trustedKeys.some(k=>typeof k!=='string'||!/^[a-f0-9]{64}$/.test(k)))throw Error('Expected independently selected public keys');
 const schema=await loadInventorySchema();
 const family=manifest.families?.find(x=>x.name==='certificates');
 if(manifest.format!=='scvd-private-inventory/v1'||!family?.complete)throw Error('A complete certificate enumeration is required');
 const names=await checkedJson(directory,family);
 if(!Array.isArray(names)||names.length!==family.listed||new Set(names.map(x=>x.name)).size!==names.length)throw Error('Certificate denominator mismatch');
 const hashes=new Set();
 for(const f of schema.inventoryFamilies.filter(x=>x.mode!=='certificate')){
  const listing=manifest.families.find(x=>x.name===f.name);if(!listing?.file)continue;
  const listed=await checkedJson(directory,listing);
  if(!Array.isArray(listed)||listed.length!==listing.listed)throw Error('Report denominator mismatch');
  for(const k of listed){
   if(typeof k.name!=='string'||!k.name.startsWith(f.prefix))throw Error('Invalid report key');
   const rows=manifest.reads.filter(x=>x.family===f.name&&x.key===k.name);if(rows.length>1)throw Error('Duplicate report');
   if(rows[0]?.status!=='readable')continue;
   try{const checked=checkReport(await checkedJson(directory,rows[0]),f.mode,trustedKeys);if(checked.status==='verified')hashes.add(checked.evidence_hash);}catch{/* Failed reads stay unresolved. */}
  }
 }
 const certificates=[];
 const prefix=schema.inventoryFamilies.find(x=>x.mode==='certificate').prefix;
 for(const k of names){
  if(typeof k.name!=='string'||!k.name.startsWith(prefix))throw Error('Invalid certificate key');
  const rows=manifest.reads.filter(x=>x.family==='certificates'&&x.key===k.name);
  if(rows.length!==1||rows[0].status!=='readable')throw Error('Every enumerated certificate must be readable for a targeted follow-through');
  const checked=checkCertificate(await checkedJson(directory,rows[0]),trustedKeys,schema.canonicalizeCertificate,schema.canonicalizeCertificateLegacy);
  if(checked.status!=='verified')throw Error('Certificate signature did not verify');
  const claims=JSON.parse(checked.payload);
  if(k.name!==prefix+claims.cert_id)throw Error('Certificate key mismatch');
  if(checked.attests&&!hashes.has(checked.attests))certificates.push(claims);
 }
 return {certificates,trustedKeys,schema,source_manifest_sha256:digest(manifestBytes),source_certificate_count:names.length};
}

/** Refuse every Git checkout, including sibling worktrees and symlinked paths. */
export async function privateOutputDirectory(out) {
 const parent=await realpath(dirname(resolve(out)));
 let inRepository=false;
 try { await promisify(execFile)('git',['-C',parent,'rev-parse','--show-toplevel']);inRepository=true; } catch(error) {
  if(error.code!==128||!String(error.stderr).includes('not a git repository'))throw Error('Cannot establish that capture output is outside Git');
 }
 if(inRepository)throw Error('Raw inventory must stay outside Git repositories');
 return join(parent,basename(resolve(out)));
}
export async function boundedResponse(response) {
 const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>RETAINED_BYTES){await reader.cancel();throw Error('Capture response oversized');}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
