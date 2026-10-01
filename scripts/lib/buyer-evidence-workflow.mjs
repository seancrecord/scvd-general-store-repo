// Explicit experimental assistance; absent flags leave closed prompts intact.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readRecipientVerifier} from './recipient-verifier.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const quote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
export const EVIDENCE_WORKFLOW='sources-and-draft-v1';
const DRAFT='evidence/recipient-draft.md',REQUEST='evidence/recipient-check-request.json',REPORT='evidence/recipient-check.json';
export function evidenceWorkflow(plan){
 if(plan?.evidence_workflow===undefined)return false;
 const v=plan.recipient?.verifier;
 if(plan.evidence_workflow!==EVIDENCE_WORKFLOW||plan.schema_version!==6||plan.package_access!==true||plan.cells?.some(c=>c.lane!=='directed')||v?.name!=='x402-verify'||v.version!=='1.11.0'||!v.files?.['evidence-report.js'])throw Error('Evidence workflow requires a directed schema 6 package experiment pinned to verifier 1.11.0.');
 return true;
}
export function sourceWorkflowPrompt(plan,cli,supplied=false){
 if(!evidenceWorkflow(plan))return '';
 return `\nExplicit ${EVIDENCE_WORKFLOW} assistance: ${supplied?"using the supplied offline tooling":"after your voluntary package review/install decision"}, the pinned CLI supports node ${cli} sources SAVED_JSON --subject EXACT_ENDPOINT. Run it on a saved snapshot index or exact-URL host history to extract candidate original URLs. Inspect those URLs and choose originals yourself. Candidate links and empty results are unsigned discovery hints, never authenticated observations or proof of absence. It fetches nothing. Verify each chosen original separately and apply the unchanged observation-age policy.\n`;
}
export function draftCheckCommand(plan){
 const code=`const fs=require("node:fs"),{spawnSync}=require("node:child_process");const r=JSON.parse(fs.readFileSync("${REQUEST}","utf8"));if(!/^artifacts\\/[^/\\\\]+$/.test(r.original)||!/^[a-f0-9]{64}$/.test(r.public_key))throw Error("Select an inventory original and a public verification key");const p=spawnSync(process.execPath,["./evidence-cli.mjs","verify-source",r.original,"--public-key",r.public_key,"--subject",${JSON.stringify(plan.subject)},"--max-bytes","${plan.budgets.artifact_bytes}","--check-identifiers","${DRAFT}"],{encoding:"utf8",timeout:10000,maxBuffer:${Math.min(plan.recipient.budgets.output_bytes,2097152)}});fs.writeFileSync("${REPORT}",p.stdout||"");fs.writeFileSync("evidence/recipient-check-stderr.txt",p.stderr||"");if(p.error)throw p.error;process.exit(p.status===null?2:p.status);`;
 return 'node -e '+quote(code);
}
export function recipientWorkflowPrompt(plan){
 if(!evidenceWorkflow(plan))return '';
 return sourceWorkflowPrompt(plan,'./evidence-cli.mjs',true)+`\nBefore your final answer, save its exact UTF-8 text as ${DRAFT} (at most ${Math.min(plan.budgets.artifact_bytes,131072)} bytes). Save ${REQUEST} as {"original":"artifacts/SELECTED_INVENTORY_FILE","public_key":"PUBLIC_VERIFICATION_KEY_HEX"}, selecting an original from input-manifest.json and stating the key's evidential basis in the draft. These are public verification keys, never wallet secrets. Run this standalone command to retain the computed identifier check and stderr:\n\n${draftCheckCommand(plan)}\n\nThis independently re-verifies the selected original and compares long hexadecimal tokens in the saved draft; it does not verify labels, dates, issuer identity, interpretation or prose. An unrecognized token may be legitimate outside the reference set. Review gaps honestly. If you change the draft, check it again within the same budget. Return the saved draft byte-for-byte as your final answer, including its whitespace; do not add an introduction or code fence. If no original/key can be selected or the check cannot finish, preserve your draft and explain the incomplete check. The runner retains both draft and final and detects differences; no additional calls or time are granted.\n`;
}
export function sourceCheckCommand(plan,fixture){
 const cli=`./work/tooling/node_modules/${plan.recipient.verifier.name}/evidence-cli.mjs`;
 const index={format:'scvd-corpus-index/v1',entries:[{sequence:1,url:fixture.subject}],has_more:false};
 const code=`const fs=require("node:fs"),{spawnSync}=require("node:child_process");fs.writeFileSync("evidence/source-index.json",${JSON.stringify(JSON.stringify(index))});const p=spawnSync(process.execPath,[${JSON.stringify(cli)},"sources","evidence/source-index.json","--subject",${JSON.stringify(fixture.subject)}],{encoding:"utf8",timeout:10000,maxBuffer:131072});fs.writeFileSync("evidence/source-candidates.json",p.stdout||"");if(p.error)throw p.error;process.exit(p.status===null?2:p.status);`;
 return 'node -e '+quote(code);
}
export function sourceQualificationPrompt(plan,fixture){
 return evidenceWorkflow(plan)?`\nThis condition also qualifies candidate extraction on synthetic data, not merchant evidence. After proceeding with package review and installation, run this standalone command, retaining its generated index and output: ${sourceCheckCommand(plan,fixture)}. It performs no additional fetch. Source metadata is not authenticated; keep the existing budget.\n`:'';
}
export function checkSourceQualification(plan,fixture,bytes,completed,root){
 if(!evidenceWorkflow(plan))return;
 if(!completed(sourceCheckCommand(plan,fixture)))throw Error('No completed source helper qualification command.');
 const index=bytes('evidence/source-index.json'),report=JSON.parse(bytes('evidence/source-candidates.json'));
 const expected={format:'scvd-corpus-index/v1',entries:[{sequence:1,url:fixture.subject}],has_more:false};
 if(JSON.stringify(JSON.parse(index))!==JSON.stringify(expected)||report.source_sha256!==hash(index)||report.authenticated!==false||report.subject_presence!=='not_checked'||report.candidate_links!==1||report.candidates?.[0]?.url!==fixture.subject)throw Error('Source helper qualification differs from synthetic input.');
 const replay=spawnSync(process.execPath,[fileURLToPath(new URL('../../verifier/evidence-cli.mjs',import.meta.url)),'sources',path.join(root,'evidence/source-index.json'),'--subject',fixture.subject],{encoding:'utf8',timeout:10000,maxBuffer:131072});
 if(replay.status!==0||bytes('evidence/source-candidates.json').toString()!==replay.stdout)throw Error('Source helper output differs from independent replay.');
}
// Capture uses the existing bounded, symlink-refusing evidence collector. The
// independent replay reads immutable handoff inputs, never the agent workspace.
export function assessRecipientDraft(plan,run,root,commands,matches){
 if(!evidenceWorkflow(plan))return null;
 const result={state:'incomplete',condition:EVIDENCE_WORKFLOW,prose_verified:false,reason:'Checked draft evidence is incomplete.'};
 try {
  if(run.runtime?.state!=='completed'||run.runtime.exit_code!==0||run.runtime.budget_stop||run.timing?.interruption)throw Error('Recipient did not complete without interruption.');
  if(run.retained_artifacts?.state!=='complete')throw Error('Recipient evidence capture is incomplete.');
  const bytes=(base,file,limit,expected)=>{
   if(typeof file!=='string'||path.isAbsolute(file)||file.split(/[\\/]/).some(x=>x==='..'||x===''))throw Error('Unsafe retained path.');
   const p=path.join(base,file),s=fs.lstatSync(p),real=fs.realpathSync(p);
   if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1||!real.startsWith(fs.realpathSync(base)+path.sep)||s.size>limit)throw Error('Unbounded or linked retained file.');
   const b=fs.readFileSync(p);if(b.length>limit||expected&&hash(b)!==expected)throw Error('Retained bytes changed.');return b;
  };
  const retained=(file,limit)=>{const ref=run.retained_artifacts.files.find(r=>r.file===file);if(!ref)throw Error('Missing '+file);return bytes(root,file,limit,ref.sha256);};
  const draft=retained(DRAFT,Math.min(plan.budgets.artifact_bytes,131072));new TextDecoder('utf-8',{fatal:true}).decode(draft);
  const trace=bytes(root,'events.jsonl',plan.recipient.budgets.output_bytes,run.trace_sha256).toString();
  const events=trace.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));
  if(!events.some(e=>e.type==='turn.completed')||events.some(e=>e.type==='turn.failed'))throw Error('No completed final recipient event.');
  const final=events.filter(e=>e.type==='item.completed'&&e.item?.type==='agent_message').at(-1)?.item.text;
  if(typeof final!=='string'||!final.trim())throw Error('Missing final recipient text.');
  result.draft_sha256=hash(draft);result.final_sha256=hash(final);result.final_matches_draft=Buffer.from(final).equals(draft);
  const request=JSON.parse(retained(REQUEST,16384));
  if(!request||Object.keys(request).sort().join(',')!=='original,public_key'||!/^artifacts\/[^/\\]+$/.test(request.original)||! /^[a-f0-9]{64}$/.test(request.public_key))throw Error('Invalid draft check request.');
  const inputs=path.join(root,'inputs'),manifest=JSON.parse(bytes(inputs,'input-manifest.json',2097152,run.input_manifest_sha256));
  const selected=manifest.files.find(f=>f.supplied===true&&f.destination===request.original);
  if(!selected||manifest.subject!==plan.subject)throw Error('Selected original is not a supplied subject input.');
  bytes(inputs,selected.destination,plan.budgets.artifact_bytes,selected.sha256);
  readRecipientVerifier(plan);
  const cli=fileURLToPath(new URL('../../verifier/evidence-cli.mjs',import.meta.url));
  const check=spawnSync(process.execPath,[cli,'verify-source',path.join(inputs,selected.destination),'--public-key',request.public_key,'--subject',plan.subject,'--max-bytes',String(plan.budgets.artifact_bytes),'--check-identifiers',path.join(root,DRAFT)],{encoding:'utf8',timeout:10000,maxBuffer:Math.min(plan.recipient.budgets.output_bytes,2097152)});
  const report=retained(REPORT,Math.min(plan.recipient.budgets.output_bytes,2097152));
  result.replay_exit=check.status;result.saved_check_matches_replay=report.toString()===check.stdout;
  result.command_observed=commands.some(c=>c.outcome==='completed'&&matches(c.command,draftCheckCommand(plan)));
  if(!result.saved_check_matches_replay)throw Error('Saved identifier check differs from independent replay.');
  const reading=JSON.parse(check.stdout);result.identifier_status=reading.identifier_check?.status;
  if(check.status!==0||reading.valid!==true||reading.identifier_check?.draft_sha256!==result.draft_sha256||reading.identifier_check?.status!=='all_candidates_recognized')throw Error('Draft identifier check requires review.');
  if(!result.command_observed)throw Error('No completed draft check command is visible.');
  if(!result.final_matches_draft)throw Error('Final answer differs from the checked draft.');
  return {...result,state:'pass',reason:'Checked draft reproduced independently and final bytes match; semantic review remains required.'};
 }catch(error){return {...result,reason:error.message};}
}
export function prepareDraftQualification(plan,cwd,root,fixture){
 if(!evidenceWorkflow(plan))return '';
 const inputs=path.join(root,'inputs');fs.mkdirSync(inputs);fs.mkdirSync(path.join(inputs,'artifacts'));
 const original=Buffer.from(JSON.stringify(fixture.original));fs.writeFileSync(path.join(inputs,'artifacts/0-original.json'),original);
 const manifest={subject:fixture.subject,files:[{supplied:true,destination:'artifacts/0-original.json',sha256:hash(original)}],scope:'Synthetic qualification only; not buyer evidence.'};
 fs.writeFileSync(path.join(inputs,'input-manifest.json'),JSON.stringify(manifest));
 for(const file of readRecipientVerifier(plan))fs.writeFileSync(path.join(inputs,file.file),file.bytes);
 fs.cpSync(inputs,cwd,{recursive:true});
 return `\nThis condition additionally qualifies the draft check with a synthetic signed original at artifacts/0-original.json, public verification key ${fixture.original.public_key} and subject ${fixture.subject}. Compute its original-file hash for your draft, explain that it is synthetic, and follow the saved-draft workflow.\n`+recipientWorkflowPrompt({...plan,subject:fixture.subject});
}
