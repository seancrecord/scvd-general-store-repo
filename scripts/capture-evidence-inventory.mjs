// Read-only operator capture. Wrangler handles authentication; credentials never enter the output.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadInventorySchema} from './lib/load-inventory-schema.mjs';
import {digest} from './lib/evidence-coverage.mjs';
const run=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.argv[2];
if (!out || process.argv.length!==3) throw new Error('Usage: node scripts/capture-evidence-inventory.mjs <new-private-directory-outside-repo>');
const directory=resolve(out);
if (directory===resolve(root) || directory.startsWith(resolve(root)+'/')) throw new Error('Raw inventory must stay outside the repository');
await mkdir(directory,{mode:0o700});
const {inventoryFamilies,inventoryCounters}=await loadInventorySchema();
const bound=8*1024*1024, cap=1000;
const manifest={format:'scvd-private-inventory/v1',started_at:new Date().toISOString(),byte_limit:bound,key_cap_per_family:cap,families:[],reads:[],counters:[]};
const save=()=>writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
async function read(args) {
 try {
  const {stdout}=await run(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'kv','key',...args,'--remote'],
    {cwd:root,encoding:'buffer',maxBuffer:bound,timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
  return {status:'readable',bytes:stdout};
 } catch { return {status:'unavailable'}; }
}
for (const family of inventoryFamilies) {
 const listing=await read(['list','--binding','PATRONS','--prefix',family.prefix]);
 const entry={...family,status:listing.status,listed:null,read:0,complete:false};manifest.families.push(entry);
 let keys;
 try { keys=JSON.parse(listing.bytes.toString());if(!Array.isArray(keys)||keys.some(x=>typeof x.name!=='string'||!x.name.startsWith(family.prefix)))throw new Error(); }
 catch {entry.status='unavailable';await save();break;} // Authentication/outage is unknown, not an empty inventory.
 entry.listed=keys.length;entry.complete=keys.length<=cap;
 const listFile=`list-${family.name}.json`;
 await writeFile(join(directory,listFile),listing.bytes,{mode:0o600});
 entry.file=listFile;entry.sha256=digest(listing.bytes);
 for (const key of keys.slice(0,cap)) {
  const result=await read(['get',key.name,'--binding','PATRONS']);
  const row={family:family.name,key:key.name,status:result.status,read_at:new Date().toISOString()};
  if(result.bytes){row.file=`record-${manifest.reads.length}.json`;row.bytes=result.bytes.length;row.sha256=digest(result.bytes);await writeFile(join(directory,row.file),result.bytes,{mode:0o600});}
  manifest.reads.push(row);entry.read++;await save();
 }
 console.log(JSON.stringify({family:family.name,listed:entry.listed,read:entry.read,complete:entry.complete}));
}
for(const key of inventoryCounters){
 const result=await read(['get',key,'--binding','COUNTERS']);
 const row={key,status:result.status};
 if(result.bytes){row.file=`counter-${manifest.counters.length}.json`;row.sha256=digest(result.bytes);await writeFile(join(directory,row.file),result.bytes,{mode:0o600});}
 manifest.counters.push(row);
}
manifest.completed_at=new Date().toISOString();await save();
console.log(JSON.stringify({capture_complete:manifest.families.length===inventoryFamilies.length&&manifest.families.every(x=>x.complete),directory}));
