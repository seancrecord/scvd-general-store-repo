// Read-only supplement to a verified census. No store deploy, payment or replay.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {unstable_dev,unstable_readConfig} from 'wrangler';
import {digest} from './lib/evidence-coverage.mjs';
import {unresolvedCertificates,privateOutputDirectory,boundedResponse} from './lib/retained-capture.mjs';
import {RETAINED_ITEMS,RETAINED_BYTES,RETAINED_KEY_CAP} from './lib/retained-evidence-contract.mjs';
const [source,keysFile,out]=process.argv.slice(2);
if(!source||!keysFile||!out||process.argv.length!==5)throw Error('Usage: node scripts/capture-retained-evidence.mjs <original-private-census> <trusted-keys.json> <new-private-directory>');
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await privateOutputDirectory(out);
const selected=await unresolvedCertificates(source,keysFile);
if(selected.certificates.length>RETAINED_KEY_CAP)throw Error('Targeted certificate cap exceeded; no partial capture started');
await mkdir(directory,{mode:0o700});
const manifest={format:'scvd-retained-evidence/v1',started_at:new Date().toISOString(),source_manifest_sha256:selected.source_manifest_sha256,
 source_certificate_count:selected.source_certificate_count,target_count:selected.certificates.length,byte_limit:RETAINED_BYTES,key_cap:RETAINED_KEY_CAP,families:[],reads:[],journals:[]};
const save=()=>writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
const store=async(file,bytes)=>{await writeFile(join(directory,file),bytes,{mode:0o600});return {file,sha256:digest(bytes)};};
const run=promisify(execFile);
async function kv(args){try{const {stdout}=await run(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'kv','key',...args,'--remote'],{cwd:root,encoding:'buffer',maxBuffer:RETAINED_BYTES,timeout:60000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});return stdout;}catch{return null;}}
for(const family of selected.schema.retentionFamilies){
 const bytes=await kv(['list','--binding',family.binding,'--prefix',family.prefix]);
 const entry={...family,status:'unavailable',listed:null,read:0,complete:false};manifest.families.push(entry);
 let names;try{names=JSON.parse(bytes);if(!Array.isArray(names)||names.some(x=>typeof x.name!=='string'||!x.name.startsWith(family.prefix))||new Set(names.map(x=>x.name)).size!==names.length)throw Error();}catch{await save();continue;}
 Object.assign(entry,{status:'readable',listed:names.length,complete:names.length<=RETAINED_KEY_CAP},await store(`list-${family.name}.json`,bytes));
 for(const key of names.slice(0,RETAINED_KEY_CAP)){
  const value=await kv(['get',key.name,'--binding',family.binding]);
  const row={family:family.name,key:key.name,status:value?'readable':'unavailable',read_at:new Date().toISOString()};
  if(value)Object.assign(row,await store(`record-${manifest.reads.length}.json`,value));
  manifest.reads.push(row);entry.read++;await save();
 }
 console.log(JSON.stringify({family:family.name,listed:entry.listed,read:entry.read,complete:entry.complete}));
}
const targets=selected.certificates.filter(x=>RETAINED_ITEMS.includes(x.item)&&x.item!=='bitcoin_anchor');
let worker;
const configDir=join(directory,'preview-session');await mkdir(configDir,{mode:0o700});
try{
 const config=unstable_readConfig({config:join(root,'wrangler.jsonc')});
 const binding=config.durable_objects.bindings.find(x=>x.name==='PAID_RECOVERIES');
 if(!binding||!config.name)throw Error('Recovery binding unavailable');
 const token=randomBytes(32).toString('hex');
 const configPath=join(configDir,'wrangler.json');
 await writeFile(configPath,JSON.stringify({name:'scvd-evidence-capture',main:join(root,'scripts/lib/retained-journal-reader.mjs'),compatibility_date:config.compatibility_date,
  ...(config.account_id?{account_id:config.account_id}:{}),workers_dev:false,vars:{CAPTURE_TOKEN_HASH:digest(token)},durable_objects:{bindings:[{...binding,script_name:config.name}]}}),{mode:0o600});
 worker=await unstable_dev(join(root,'scripts/lib/retained-journal-reader.mjs'),{config:configPath,local:false,ip:'127.0.0.1',logLevel:'none',inspect:false,
  experimental:{disableExperimentalWarning:true,showInteractiveDevSession:false,watch:false,liveReload:false,disableDevRegistry:true}});
 const control=await worker.fetch('http://capture.invalid/read',{method:'POST',body:'{}'});
 if(control.status!==401)throw Error('Preview authorization control failed');
 manifest.journal_transport='remote_dev_authenticated';
 for(const c of targets){
  const row={cert_id:c.cert_id,item:c.item,status:'unavailable',read_at:new Date().toISOString()};
  try{
   const response=await worker.fetch('http://capture.invalid/read',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({item:c.item,network:c.network,settlement_tx:c.settlement_tx,payer:c.payer}),signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error();const bytes=await boundedResponse(response);
   const result=JSON.parse(bytes);if(typeof result.status!=='string')throw Error();
   row.status=result.status;Object.assign(row,await store(`journal-${manifest.journals.length}.json`,bytes));
  }catch{/* Unavailable is not absence. */}
  manifest.journals.push(row);await save();
 }
}catch{
 manifest.journal_transport??='unavailable';
 for(const c of targets)if(!manifest.journals.some(x=>x.cert_id===c.cert_id))manifest.journals.push({cert_id:c.cert_id,item:c.item,status:'unavailable'});
}finally{await worker?.stop();await rm(configDir,{recursive:true,force:true});}
manifest.completed_at=new Date().toISOString();await save();
console.log(JSON.stringify({targeted_certificates:manifest.target_count,journal_transport:manifest.journal_transport,journal_states:manifest.journals.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{})}));
