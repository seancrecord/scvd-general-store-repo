// Offline audit of an operator capture. Publish the aggregate, never the raw private records.
import {readFile,writeFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {loadInventorySchema} from './lib/load-inventory-schema.mjs';
import {checkCertificate,checkReport,summarizeCoverage,digest} from './lib/evidence-coverage.mjs';
const [directory,keysFile]=process.argv.slice(2);
if(!directory||!keysFile||process.argv.length!==4)throw new Error('Usage: node scripts/evidence-coverage.mjs <private-capture-directory> <trusted-public-key-array.json>');
const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
const trustedKeys=JSON.parse(await readFile(keysFile,'utf8'));
if(!Array.isArray(trustedKeys)||!trustedKeys.length||trustedKeys.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))throw new Error('Expected independently selected public keys');
const {inventoryFamilies,canonicalizeCertificate,canonicalizeCertificateLegacy}=await loadInventorySchema();
const certificates=[],reports=[];
let complete=manifest.format==='scvd-private-inventory/v1'&&manifest.families.length===inventoryFamilies.length;
const checkedRead=async row=>{
 if(!row.file||basename(row.file)!==row.file)throw new Error('Invalid capture path');
 const bytes=await readFile(join(directory,row.file));
 if(bytes.length>manifest.byte_limit||digest(bytes)!==row.sha256)throw new Error('Capture checksum failed');
 return JSON.parse(bytes);
};
for(const family of inventoryFamilies){
 const listing=manifest.families.find(x=>x.name===family.name);
 if(!listing?.complete)complete=false;
 if(!listing?.file)continue;
 const keys=await checkedRead(listing);
 if(!Array.isArray(keys)||keys.length!==listing.listed)throw new Error('Inventory denominator mismatch');
 const seen=new Set();
 for(const key of keys){
  if(typeof key.name!=='string'||!key.name.startsWith(family.prefix)||seen.has(key.name))throw new Error('Invalid inventory key');seen.add(key.name);
  const rows=manifest.reads.filter(x=>x.family===family.name&&x.key===key.name);
  if(rows.length>1)throw new Error('Duplicate capture row');
  const row=rows[0];let checked={status:row?.status??'not_read'};
  if(row?.status==='readable'){
   try { const value=await checkedRead(row);checked=family.mode==='certificate'?checkCertificate(value,trustedKeys,canonicalizeCertificate,canonicalizeCertificateLegacy):checkReport(value,family.mode,trustedKeys); }
   catch{checked={status:'unreadable'};}
  }
  (family.mode==='certificate'?certificates:reports).push(checked);
 }
}
const counterValues=[];
for(const row of manifest.counters ?? []){
 let value=null;
 if(row.status==='readable'){
  try{
   const raw=await checkedRead(row);
   if(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0)value=raw;
   else if(raw&&typeof raw==='object'){
    const counters=raw.counters??raw;
    value=Object.fromEntries(Object.entries(counters).filter(([key,v])=>/^[a-z_]+$/.test(key)&&((typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)||typeof v==='boolean')));
    if(typeof raw.observed_at==='string'&&Number.isFinite(Date.parse(raw.observed_at)))value.observed_at=raw.observed_at;
   }
  }catch{ /* Counter failures stay unavailable, never turn into zero lag. */ }
 }
 counterValues.push({key:row.key,status:value===null?'unavailable':'readable',value});
}
const summary={captured_from:manifest.started_at,captured_to:manifest.completed_at,checked_at:new Date().toISOString(),...summarizeCoverage(certificates,reports,complete),
 certificate_inventory_complete:manifest.families.some(x=>x.name==='certificates'&&x.complete),
 unenumerated_families:inventoryFamilies.filter(f=>!manifest.families.some(x=>x.name===f.name&&x.file)).map(x=>x.name),
 families:manifest.families.map(({name,status,listed,read,complete})=>({name,status,listed,read,complete})),counter_reads:counterValues};
await writeFile(join(directory,'coverage-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
console.log(JSON.stringify(summary,null,2));
