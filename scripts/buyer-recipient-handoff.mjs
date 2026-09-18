// Prepare a new offline recipient workspace, without launching a model.
// Every retained file gets an explicit selection; omitted is not absent.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,readEvidence,readEvidenceBytes,normalizeTrace,inventoryRecipientPrompt,recipientLaunch} from './lib/buyer-cold.mjs';
const ROLES=['signature_candidate','issuer_key','unsigned_context','other'];
export function prepareHandoff(root,selection,out,frozen=null) {
  const runBytes=fs.readFileSync(path.join(root,'run.json')),run=JSON.parse(runBytes);
  if(run.runtime?.state!=='completed'||run.runtime.exit_code!==0||run.runtime.budget_stop)throw Error('Buyer did not complete; intermediate messages are not a final handoff.');
  const retained=run.retained_artifacts?.files;
  if(!Array.isArray(retained)||!['complete','incomplete'].includes(run.retained_artifacts.state))throw Error('No retained capture inventory.');
  if(selection?.schema_version!==1||!['signature_subset','buyer_report'].includes(selection.scope)||!Array.isArray(selection.files))throw Error('Declare a versioned handoff scope and every file selection.');
  // This optional path joins the preparer to the protocol frozen before the
  // buyer ran. Historical standalone preparation keeps its original contract.
  if(frozen){
    const expected=recipientLaunch(frozen.plan,'<recipient>','<output>',{codex:{disabled_skills:[]}});
    const r=frozen.plan.recipient,p=frozen.protocol;
    if(r.input_scope!=='all-retained-and-buyer-report'||selection.scope!=='buyer_report'||selection.files.some(row=>row.supply!==true))throw Error('Frozen scope requires every retained file supplied for the buyer report.');
    if(run.subject!==frozen.plan.subject)throw Error('Buyer subject differs from the frozen plan.');
    if(!p||p.protocol_sha256!==expected.protocol_sha256||p.prompt_sha256!==hash(expected.prompt)||frozen.prompt!==expected.prompt||JSON.stringify(p.inputs)!==JSON.stringify(expected.inputs)||Object.keys(r).some(key=>JSON.stringify(p[key])!==JSON.stringify(r[key])))throw Error('Recipient protocol or prompt differs from the frozen plan.');
  }
  const unclassified=selection.citation_policy==='unclassified';
  if(selection.citation_policy!==undefined&&!unclassified)throw Error('Unknown citation policy.');
  const choices=new Map(selection.files.map(row=>[row.file,row]));
  if(choices.size!==selection.files.length||choices.size!==retained.length||new Set(retained.map(row=>row.file)).size!==retained.length||retained.some(row=>!choices.has(row.file)))throw Error('Selection must name each retained file exactly once.');
  const inputs=retained.map((ref,i)=>{
    const row=choices.get(ref.file);
    if(typeof row.supply!=='boolean'||(unclassified?selection.scope!=='buyer_report'||!row.supply||row.cited!==null||row.role!=='other':typeof row.cited!=='boolean')||!ROLES.includes(row.role))throw Error('Each file needs supply/cited booleans and a known declared role.');
    if(selection.scope==='buyer_report'&&row.cited&&!row.supply)throw Error('A cited file is omitted from a whole-report handoff.');
    const bytes=readEvidenceBytes(root,ref);
    if(bytes.length!==ref.bytes)throw Error('Retained file size disagrees with capture.');
    return {bytes,row:{source:ref.file,sha256:ref.sha256,bytes:ref.bytes,retained:true,supplied:row.supply,cited_in_report:row.cited,declared_role:row.role,destination:row.supply?`artifacts/${i}-${path.basename(ref.file)}`:null}};
  });
  const trace=readEvidence(root,{file:'events.jsonl',sha256:run.trace_sha256}).toString();
  if(!['codex','claude'].includes(run.cell?.host)||normalizeTrace(run.cell.host,trace).malformed_lines)throw Error('Unrecognized host or malformed trace.');
  const events=trace.split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line));
  const terminal=run.cell.host==='codex'?events.some(e=>e.type==='turn.completed'):events.some(e=>e.type==='result'&&!e.is_error);
  if(!terminal)throw Error('No successful terminal event in the buyer trace.');
  const final=run.cell.host==='codex'?events.filter(e=>e.type==='item.completed'&&e.item?.type==='agent_message').at(-1)?.item.text:events.filter(e=>e.type==='result').at(-1)?.result;
  if(typeof final!=='string'||!final.trim())throw Error('No buyer final report to hand off.');
  const machinery=['evidence-bundle.js','x402-verify.js'].map(file=>({file,bytes:fs.readFileSync(new URL('../verifier/'+file,import.meta.url))}));
  const manifest={...(frozen?{protocol_sha256:frozen.protocol.protocol_sha256,plan_content_sha256:hash(JSON.stringify(frozen.plan))}:{}),schema_version:1,scope:selection.scope,citation_policy:unclassified?'unclassified':'reviewer_declared',subject:run.subject,run_sha256:hash(runBytes),trace_sha256:run.trace_sha256,
    selection_sha256:hash(JSON.stringify(selection)),capture_state:run.retained_artifacts.state,capture_issues:run.retained_artifacts.issues??[],
    files:inputs.map(x=>x.row),buyer_report:{file:'buyer-handoff.md',sha256:hash(final),source:'Verbatim final buyer text from the hash-checked host trace.'},
    machinery:machinery.map(x=>({file:x.file,sha256:hash(x.bytes),source:'Public verifier supplied by the reviewer, not a buyer-exported artifact.'})),
    preparer_sha256:hash(fs.readFileSync(new URL(import.meta.url))),
    limit:'The inventory verifies capture bytes, not signatures. Declared roles and citation choices are reviewer labels; independently check them against the report and contents. One signed artifact does not authenticate other retained history. Retained but omitted files are unavailable to this recipient, not missing from the buyer capture.'};
  const prompt=frozen?.prompt??inventoryRecipientPrompt(run.subject,selection.scope,{unclassified});
  // Finish all validation before creating the workspace; existing acquisitions
  // are never rewritten, even on a repeated preparation command.
  fs.mkdirSync(out,{mode:0o700});fs.mkdirSync(path.join(out,'artifacts'),{mode:0o700});
  const write=(file,bytes)=>fs.writeFileSync(path.join(out,file),bytes,{flag:'wx',mode:0o600});
  for(const input of inputs)if(input.row.supplied)write(input.row.destination,input.bytes);
  for(const module of machinery)write(module.file,module.bytes);
  write('buyer-handoff.md',final);write('package.json','{"type":"module"}\n');write('recipient-prompt.txt',prompt);
  manifest.prompt_sha256=hash(prompt);write('input-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),at=args.indexOf('--frozen-cohort');
  let frozen=null;
  if(at>=0){
    if(at!==3||args.length!==5)throw Error('Expected RUN_DIRECTORY SELECTION_JSON NEW_RECIPIENT_DIRECTORY --frozen-cohort COHORT_DIRECTORY');
    const cohort=path.resolve(args[4]);
    const read=name=>fs.readFileSync(path.join(cohort,name));
    const planBytes=read('plan.json'),qualification=JSON.parse(read('capability.json'));
    if(hash(planBytes)!==qualification.plan_sha256)throw Error('Frozen plan differs from host qualification.');
    frozen={plan:JSON.parse(planBytes),protocol:JSON.parse(read('recipient-protocol.json')),prompt:read('recipient-prompt.txt').toString()};
    const source=path.resolve(args[0]),cell=frozen.plan.cells.find(cell=>path.join(cohort,cell.id)===source);
    const run=JSON.parse(fs.readFileSync(path.join(source,'run.json')));
    if(!cell||JSON.stringify(cell)!==JSON.stringify(run.cell))throw Error('Buyer is not the frozen cohort cell.');
    args.splice(3);
  }
  const [root,selection,out,...rest]=args;
  if(!root||!selection||!out||rest.length)throw Error('Usage: node scripts/buyer-recipient-handoff.mjs RUN_DIRECTORY SELECTION_JSON NEW_RECIPIENT_DIRECTORY (prepares files only; no model launch)');
  const m=prepareHandoff(path.resolve(root),JSON.parse(fs.readFileSync(selection)),path.resolve(out),frozen);
  console.log(JSON.stringify({scope:m.scope,supplied:m.files.filter(f=>f.supplied).length,retained:m.files.length,capture_state:m.capture_state}));
}
