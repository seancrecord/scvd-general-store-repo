import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const root=fileURLToPath(new URL('./',import.meta.url));
const criteria=JSON.parse(fs.readFileSync(path.join(root,'acceptance.json')));
const readers=path.join(root,'readers');
if (!fs.existsSync(readers)) throw Error('No trials: launch requires explicit transfer approval.');
const reviews=JSON.parse(fs.readFileSync(path.join(readers,'trace-review.json')));
const protocol=JSON.parse(fs.readFileSync(path.join(readers,'protocol.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function parse(text) {
 try{return JSON.parse(text);}catch{}
 const blocks=[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
 if(blocks.length!==1)throw Error('Missing or ambiguous structured final');
 return JSON.parse(blocks[0][1]);
}
const rows=[];
for(const mode of protocol.modes) for(const variant of protocol.variants) {
 const id=`${mode}-${variant}`,dir=path.join(readers,id);
 if(!fs.existsSync(path.join(dir,'run.json'))) { rows.push({id,passed:false,missing:true});continue; }
 const run=JSON.parse(fs.readFileSync(path.join(dir,'run.json')));
 const events=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 let final;try{final=parse(fs.readFileSync(path.join(dir,'final.txt'),'utf8'));}catch{final=[];}
 if(!Array.isArray(final))final=[];
 const commands=events.filter(e=>e.type==='item.completed'&&e.item?.type==='command_execution').map(e=>e.item);
 const completed=events.some(e=>e.type==='turn.completed');
 const inputsUnchanged=Object.entries(run.inputHashes).every(([n,h])=>{
  const p=path.join(dir,'workspace',n);return fs.existsSync(p)&&hash(fs.readFileSync(p))===h&&run.unchanged[n]===true;
 });
 const review=reviews[id];
 const qualified=run.exitCode===0&&!run.timedOut&&completed&&inputsUnchanged&&review?.permittedTrace===true;
 let checks;
 if(mode==='triggers') {
  checks=protocol.triggers.map(t=>{
   const matches=final.filter(f=>f.id===t.id); const f=matches[0];
   const expected=variant!=='none'&&!t.id.startsWith('unrelated-');
   return {id:t.id,expected,actual:f?.activate??null,passed:matches.length===1&&f.activate===expected};
  });
 } else {
  const callFile=path.join(dir,'workspace/calls.jsonl');
  const calls=fs.existsSync(callFile)?fs.readFileSync(callFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  const used=new Set();
  checks=Object.entries(criteria.requiredCalls).map(([caseId,required])=>{
   const matches=final.filter(f=>f.id===caseId);const f=matches[0];
   const index=calls.findIndex((call,i)=>!used.has(i)&&call.operation===required.operation&&isDeepStrictEqual(call.args,required.args)&&!call.result?.error);
   if(index>=0)used.add(index);
   return {id:caseId,requiredCallObserved:index>=0,interpretationPassed:review?.cases?.[caseId]===true,
    referencesReported:f?.referencesLoaded??null,
    passed:matches.length===1&&f.completed===true&&index>=0&&review?.cases?.[caseId]===true&&f.canAuthorizePayment===false&&f.needsWallet===false&&f.needsPackageInstall===false};
  });
 }
 rows.push({id,variant,mode,qualified,passed:qualified&&checks.every(c=>c.passed),checks,elapsedMs:run.elapsedMs,
  commandCount:commands.length,failedCommands:commands.filter(c=>c.exit_code!==0).length,
  commandOutputBytes:commands.reduce((n,c)=>n+Buffer.byteLength(c.aggregated_output??''),0),
  usage:events.findLast(e=>e.type==='turn.completed')?.usage??null,
  measurementLimits:'Usage is host-reported; command output bytes include tool results and may be truncated. Reference names are self-reported and require trace review; neither measures exact needed context.'});
}
const result={date:'2026-09-17',scope:protocol.scope,rows,newSkillPassed:rows.filter(r=>r.variant==='new').length===1&&rows.filter(r=>r.variant==='new').every(r=>r.passed)};
fs.writeFileSync(path.join(readers,'scores.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
