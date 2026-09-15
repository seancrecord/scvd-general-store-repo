// No wallet configuration or payment headers. Input is a retained public snapshot
// set; output is always new and keeps one journal row per completed seed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { discoverBuyerLinks, inspectBuyerLink } from './lib/buyer-links.mjs';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw new Error('Supply the public snapshot directory and a new output directory.');
const acquisition=JSON.parse(fs.readFileSync(path.join(source,'acquisition.json'),'utf8'));
const evidence=[];
function read(name) {
 const bytes=fs.readFileSync(path.join(source,name+'.snapshot'));
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const record=acquisition.find(r=>r.name===name);
 if(!record||record.status!==200||record.sha256!==sha256)throw new Error('Missing or mismatched snapshot provenance: '+name);
 evidence.push({name,sha256,url:record.url,received_at:record.received_at});
 return bytes.toString('utf8');
}
const surfaces=Object.fromEntries(['home','skill','llms'].map(name=>[name,read(name)]));
const menu=JSON.parse(read('menu')),openapi=JSON.parse(read('openapi'));
const discovery=discoverBuyerLinks({surfaces,menu,openapi});
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'started.json'),JSON.stringify({at:new Date().toISOString(),source:path.relative(output,source),snapshots:evidence,payment_submitted:false},null,2)+'\n',{flag:'wx'});
const journal=fs.openSync(path.join(output,'requests.jsonl'),'wx');
const rows=[];let next=0;
try {
 await Promise.all(Array.from({length:2},async()=>{
  while(next<discovery.links.length){
   const i=next++,seed=discovery.links[i];
   const row={id:i+1,...await inspectBuyerLink(seed)};
   fs.writeSync(journal,JSON.stringify(row)+'\n');rows.push(row);
  }
 }));
} finally {fs.closeSync(journal);}
rows.sort((a,b)=>a.id-b.id);
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(rows,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(output,'unresolved-links.json'),JSON.stringify(discovery.unresolved,null,2)+'\n',{flag:'wx'});
const counts=field=>Object.fromEntries([...new Set(rows.map(r=>r[field]))].sort().map(v=>[v,rows.filter(r=>r[field]===v).length]));
const summary={at:new Date().toISOString(),seed_urls:rows.length,actual_gets:rows.reduce((n,r)=>n+r.hops.length,0),unresolved_template_occurrences:discovery.unresolved.length,by_state:counts('state'),by_code:counts('code'),findings:rows.filter(r=>r.state==='finding').map(({id,url,code})=>({id,url,code})),spend_usdc:0,recursive:false,limits:['Seeded from retained home, skill, llms, menu and concrete OpenAPI GET URLs; not all first-party pages or JSON references.','At most five same-origin redirects, twenty seconds and four MiB per seed; budget stops remain incomplete.','Only successful .json and .md destinations have a promised-format check. Other bodies are hashed but not schema-validated.','402 identifies a payment-required response; it does not establish usable offers, payment, settlement or fulfillment.','HTTP refusals and method mismatches require source-context review; no automated global buyer pass.']};
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
