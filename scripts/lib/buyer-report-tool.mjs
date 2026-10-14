// A declared, hash-pinned runtime for directed studies. This measures use with
// the tool supplied, not registry installation or independent discovery.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash, generateKeyPairSync, randomBytes, sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {validateRecipientVerifier, readRecipientVerifier} from './recipient-verifier.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const REPORT_TOOL_DIR='work/report-tool';
export const REPORT_TOOL_CLI=`./${REPORT_TOOL_DIR}/evidence-cli.mjs`;
const PROBE_DIR='work/report-probe';
export function validateBuyerTool(plan){
 if(plan?.buyer_tool===undefined)return null;
 const v=validateRecipientVerifier(plan);
 if(JSON.stringify(plan.buyer_tool)!==JSON.stringify({mode:'provisioned-pinned-runtime'})||!v?.files['evidence-report.js']||plan.cells?.some(c=>c.lane!=='directed'))throw Error('Provisioned report tool requires a directed plan, explicit mode and pinned report verifier.');
 return v;
}
export function buyerToolStatement(plan){
 const v=validateBuyerTool(plan);if(!v)return '';
 return `The controller has provisioned ${v.name}@${v.version} at ${REPORT_TOOL_DIR}, with runtime hashes frozen in the plan. You may read and execute this supplied public tool; it contains no merchant evidence. Invoke it with node ${REPORT_TOOL_CLI} (for example --help). Use a standalone shell command: node ${REPORT_TOOL_CLI} verify-source ./evidence/saved-response.json for a saved response, or node ${REPORT_TOOL_CLI} verify ./evidence/bundle.json for an exported bundle, with the independently trusted --public-key and desired report options from --help. A detached payload.json has no signature envelope. Do not append echo or chain bookkeeping commands to the verifier invocation. This is a tool-supplied directed condition, not independent tool discovery or registry installation. Keep originals and generated reports under ./evidence. Do not modify the supplied tool.\n`;
}
export function provisionBuyerTool(plan,cwd){
 const v=validateBuyerTool(plan);if(!v)return null;
 const files=readRecipientVerifier(plan); // Validate every byte before writing.
 const destination=path.join(cwd,REPORT_TOOL_DIR);
 fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
 fs.mkdirSync(destination,{mode:0o700});
 for(const {file,bytes} of files)fs.writeFileSync(path.join(destination,file),bytes,{flag:'wx',mode:0o400});
 return {mode:plan.buyer_tool.mode,name:v.name,version:v.version,directory:REPORT_TOOL_DIR,files:v.files,bytes:files.reduce((n,f)=>n+f.bytes.length,0)};
}
export function checkBuyerTool(plan,cwd){
 const v=validateBuyerTool(plan);if(!v)return null;
 try{
  const dir=path.join(cwd,REPORT_TOOL_DIR);
  if(!fs.lstatSync(dir).isDirectory()||JSON.stringify(fs.readdirSync(dir).sort())!==JSON.stringify(Object.keys(v.files).sort()))throw Error('inventory');
  for(const [file,digest] of Object.entries(v.files)){
   const name=path.join(dir,file),stat=fs.lstatSync(name);
   if(!stat.isFile()||stat.size>1024*1024||sha(fs.readFileSync(name))!==digest)throw Error('bytes');
  }
  return {state:'pass'};
 }catch{return {state:'fail',reason:'Provisioned report runtime missing, changed or replaced at completion.'};}
}
export function reportProbePrompt(plan){
 if(!validateBuyerTool(plan))return '';
 return `${buyerToolStatement(plan)}Also qualify the installed report path: read ./${PROBE_DIR}/inputs.json, which names two synthetic signed originals and their test public key and exact subject. Use node ${REPORT_TOOL_CLI} verify-source INPUT --public-key KEY --subject SUBJECT --format markdown --report-out OUTPUT as a separate standalone shell command once per entry, replacing placeholders with that entry's values. Retain both generated Markdown files in ./evidence at the named outputs. Let the CLI produce the reports; do not author, edit or reconstruct them. A signature rejection may return exit 1 with a report; distinguish this from a command error. These fixtures establish no real merchant facts. Read and report their actual findings. Do this within the same total session budget.\n`;
}
export function prepareReportProbe(plan,cwd){
 if(!validateBuyerTool(plan))return null;
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const key=publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const subject=`https://merchant.example/${randomBytes(12).toString('hex')}`;
 const row={url:subject,observed_at:'2026-09-21T02:30:40.084Z',gaps:['Synthetic observation; no payment made.']};
 const snapshot={version:1,sequence:100,taken_at:'2026-09-27T11:00:00Z',previous_digest:null,source:'ward_round',week:'2026-W39',round:{hosts:[row]}};
 const payload=JSON.stringify(snapshot),signature=sign(null,Buffer.from(payload),privateKey).toString('hex');
 const directory=path.join(cwd,PROBE_DIR);fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const controller=fs.mkdtempSync(path.join(os.tmpdir(),'report-reference-'));
 try{
  // Randomize the valid member, so file naming never gives away the answer.
  const validIndex=randomBytes(1)[0]&1,inputs=[],expected=[];
  for(const [i,id] of ['a','b'].entries()){
   const valid=i===validIndex,doc={snapshot:structuredClone(snapshot),digest:sha(payload),public_key:key,signature,history:[row,row,row]};
   if(!valid){const changed=Buffer.from(signature,'hex');changed[7]^=0x5a;doc.signature=changed.toString('hex');}
   const input=`./${PROBE_DIR}/${id}.json`,output=`./evidence/report-${id}.md`,bytes=Buffer.from(JSON.stringify(doc));
   fs.writeFileSync(path.join(cwd,input),bytes,{flag:'wx',mode:0o600});
   const out=path.join(controller,`${id}.md`);
   const checked=spawnSync(process.execPath,[path.join(cwd,REPORT_TOOL_CLI),'verify-source',path.join(cwd,input),'--public-key',key,'--subject',subject,'--format','markdown','--report-out',out],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
   if(checked.status!==(valid?0:1))throw Error('Controller report fixture did not produce its expected signature outcome.');
   const report=fs.readFileSync(out),data=JSON.parse(report.toString().match(/```json\n([\s\S]*?)\n```/)[1]);
   if(data.source_sha256!==sha(bytes)||data.corpus_snapshots_verified!==(valid?1:0)||data.subject_evidence.matched_observations!==(valid?1:null))throw Error('Controller report fixture scope differs from independent expectation.');
   inputs.push({input,output,public_key:key,subject});
   expected.push({file:output.slice(2),sha256:sha(report),source_sha256:sha(bytes),valid,corpus_snapshots_verified:valid?1:0});
  }
  fs.writeFileSync(path.join(directory,'inputs.json'),JSON.stringify(inputs,null,2)+'\n',{flag:'wx',mode:0o600});
  return {inputs,expected};
 }finally{fs.rmSync(controller,{recursive:true,force:true});}
}
export function scoreReportProbe(root,run,probe,commands){
 const observations=probe.expected.map(expected=>{
  const retained=run.retained_artifacts?.files?.find(f=>f.file===expected.file);
  let matches=false;
  try{
   const file=path.join(root,expected.file),stat=fs.lstatSync(file);
   matches=stat.isFile()&&stat.size<=1024*1024&&fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep)&&retained?.sha256===expected.sha256&&sha(fs.readFileSync(file))===expected.sha256;
  }catch{ /* Missing capture cannot pass. */ }
  const invocation=commands.some(c=>c.command.includes(REPORT_TOOL_CLI)&&c.command.includes('verify-source')&&c.command.includes(expected.file)&&c.outcome===(expected.valid?'completed':'failed'));
  return {file:expected.file,state:matches&&invocation?'pass':'incomplete',report_matches:matches,invocation_observed:invocation,expected_sha256:expected.sha256};
 });
 return {state:observations.every(o=>o.state==='pass')&&run.buyer_tool_check?.state==='pass'?'pass':'incomplete',observations,runtime_check:run.buyer_tool_check??null,limits:['Exact reports match controller execution on independently signed valid/tampered fixtures; command events and final runtime hashes do not prove every hidden operation. Provisioned runtime use does not qualify registry installation, public discovery or a buyer journey.']};
}
