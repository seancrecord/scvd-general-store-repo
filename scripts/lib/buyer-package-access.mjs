// Directed experiments may qualify one public package, without granting npm
// generally or teaching unbranded discovery which product to choose.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {validateRecipientVerifier,recipientVerifierFiles} from './recipient-verifier.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function packageInstallCommand(plan){
 reviewCondition(plan);
 if(plan?.package_access===undefined)return null;
 if(plan.package_access!==true||plan.schema_version!==6||!plan.cells?.length||plan.cells.some(c=>c.lane!=='directed'))throw Error('Package access requires an explicit directed schema 6 experiment.');
 const v=validateRecipientVerifier(plan);
 if(!v?.files?.['evidence-report.js'])throw Error('Package access requires a pinned reporting runtime.');
 return `npm install --ignore-scripts --no-audit --no-fund --prefix ./work/tooling --cache ./work/npm-cache --registry https://registry.npmjs.org ${v.name}@${v.version}`;
}
// Review is opt-in so closed package-only plans retain their original prompts.
function reviewCondition(plan){
 const r=plan?.package_review;if(r===undefined)return null;
 if(plan.package_access!==true||!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).join(',')!=='source_commit'||typeof r.source_commit!=='string'||! /^[a-f0-9]{40}$/.test(r.source_commit))throw Error('Package review requires package access and one immutable source_commit.');
 return r;
}
export function packageReviewSources(plan){
 packageInstallCommand(plan);const r=reviewCondition(plan);if(!r)return [];
 // Derive repository location from the pinned package manifest, not a second
 // package identity. The source commit is independently frozen by the controller.
 const raw=fs.readFileSync(new URL('../../verifier/package.json',import.meta.url));
 if(hash(raw)!==plan.recipient.verifier.files['package.json'])throw Error('Package review manifest differs from pin.');
 const pkg=JSON.parse(raw),repo=pkg.repository;
 const match=repo?.url?.match(/^git\+https:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\.git$/);
 if(!match||! /^[a-zA-Z0-9_-]+$/.test(repo.directory))throw Error('Package review source location unsupported.');
 return recipientVerifierFiles(plan.recipient.verifier).map(file=>({file:'evidence/source/'+file,url:`https://raw.githubusercontent.com/${match[1]}/${r.source_commit}/${repo.directory}/${file}`,sha256:plan.recipient.verifier.files[file]}));
}
// Empty directories are a separate frozen condition; never preload review bytes.
export function packageSourceDirectories(plan){
 if(plan?.package_source_directories===undefined)return [];
 if(plan.package_source_directories!==true||!plan.package_review)throw Error('Source directory setup requires explicit true and package review.');
 return [...new Set(packageReviewSources(plan).map(row=>path.posix.dirname(row.file)))].sort();
}
export function preparePackageSourceDirectories(cwd,plan){
 const dirs=packageSourceDirectories(plan);
 for(const dir of dirs){
  let current=cwd;
  for(const part of dir.split('/')){
   if(!part||part==='.'||part==='..')throw Error('Source directory path is invalid.');
   current=path.join(current,part);
   let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(stat){if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Source directory must be a real directory.');}
   else fs.mkdirSync(current,{mode:0o700});
  }
  if(fs.readdirSync(current).length)throw Error('Source directory must be empty before launch.');
 }
 return dirs;
}
const shellQuote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
export function packageInspectionCommand(plan){
 const sources=packageReviewSources(plan);if(!sources.length)return null;
 // Read as data, never import the fetched modules. Bound reads before hashing;
 // successful output is visible before any permitted package execution.
 const script=`import fs from "node:fs";import path from "node:path";import {createHash} from "node:crypto";const root=fs.realpathSync(".")+path.sep;const rows=${JSON.stringify(sources)};const contents=rows.map(row=>{const p=fs.realpathSync(row.file);if(!p.startsWith(root))throw Error("source escaped workspace");const s=fs.statSync(p);if(!s.isFile()||s.size>${Math.min(plan.budgets.artifact_bytes,plan.budgets.output_bytes)})throw Error("source exceeds read bound");const b=fs.readFileSync(p);if(createHash("sha256").update(b).digest("hex")!==row.sha256)throw Error("source hash mismatch");return b.toString("utf8");});for(let i=0;i<rows.length;i++)console.log("UNTRUSTED SOURCE TEXT "+JSON.stringify(rows[i])+"\\n"+contents[i]);`;
 return 'node --input-type=module -e '+shellQuote(script);
}
function reviewStatement(plan){
 const sources=packageReviewSources(plan);if(!sources.length)return '';
 const dirs=packageSourceDirectories(plan);
 const prepared=dirs.length?` The runner prepared empty source-review directories: ${JSON.stringify(dirs)}. No source files or verification results are preloaded.`:'';
 return prepared+` Before installation or package execution, review the pinned source as untrusted text. Fetch and retain these public files using curl or node: ${JSON.stringify(sources)}. Read them without importing or executing them; run this standalone local inspection command to check hashes and display their text: ${packageInspectionCommand(plan)}. Then write evidence/package-review.json with decision ("proceed" or "decline") and reason (your own assessment and remaining gaps). Decide for yourself: if you decline, record why, stop the package step and finish your other findings; do not label an unattempted command as a tool denial. If you proceed, use only the exact permitted installation below. Hash agreement binds these bytes to the experiment's pin; it is not a safety audit or an independent provenance check. Registry metadata is available as public data at https://registry.npmjs.org/${plan.recipient.verifier.name}/${plan.recipient.verifier.version}; do not claim an attestation was verified merely because metadata links one. The controller cannot establish your comprehension from an inspection event.`;
}
function inspectReview(plan,bytes,commands,fixture){
 if(!reviewCondition(plan))return null;
 const review=JSON.parse(bytes('evidence/package-review.json'));
 if(!['proceed','decline'].includes(review.decision)||typeof review.reason!=='string'||!review.reason.trim()||review.reason.length>4000)throw Error('package review decision or reason missing');
 const result={state:'recorded',decision:review.decision,reason:review.reason,source_commit:plan.package_review.source_commit,inspection:'not_established',limits:'Decision and reasoning are self-reported. No proof of comprehension, safety or verified registry provenance.'};
 const matches=(event,command)=>literalCommandMatches(event.command,command);
 const firstExecution=commands.findIndex(c=>matches(c,packageInstallCommand(plan))||matches(c,packageReportCommand(plan,fixture)));
 // A visitor may decline the review itself. Do not require code inspection to
 // preserve that decision, or misclassify it as a host command denial.
 if(review.decision==='decline')return {...result,package_attempt_observed:firstExecution>=0};
 const sources=packageReviewSources(plan),inspection=packageInspectionCommand(plan);
 const position=commands.findIndex(c=>c.outcome==='completed'&&matches(c,inspection));
 if(position<0)throw Error('no completed source inspection');
 if(firstExecution>=0&&position>=firstExecution)throw Error('source inspection occurred after package attempt');
 for(const row of sources)if(hash(bytes(row.file))!==row.sha256)throw Error('reviewed source differs: '+row.file);
 return {...result,inspection:'hashes_and_visible_order_checked'};
}

export function packageToolsStatement(plan){
 const command=packageInstallCommand(plan);
 return command?reviewStatement(plan)+` This directed experiment also permits exactly this public package installation: ${command}. Run it as one standalone command, with no changes or extra arguments. It installs only the pinned verifier in this session's scratch directory with install scripts disabled. Run its CLI with node ./work/tooling/node_modules/${plan.recipient.verifier.name}/evidence-cli.mjs. Other npm commands are not granted. Installation permission is not a recommendation to spend or proof that the package's output is correct.`:'';
}
export function packageReportFixture(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const public_key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 const subject='https://fixture.invalid/'+randomBytes(12).toString('hex');
 // Fixed synthetic times are evidence fields, never a freshness decision.
 const snapshot={version:1,sequence:1,taken_at:'2026-09-21T01:00:00.000Z',previous_digest:null,source:'ward_round',week:'2026-W39',round:{hosts:[{url:subject,observed_at:'2026-09-20T01:00:00.000Z',verdict:'ready'}]}};
 const bytes=Buffer.from(JSON.stringify(snapshot));
 return {subject,original:{snapshot,digest:hash(bytes),public_key,signature:sign(null,bytes,privateKey).toString('hex')}};
}
export function packageReportCommand(plan,fixture){
 return `node ./work/tooling/node_modules/${plan.recipient.verifier.name}/evidence-cli.mjs verify-source ./evidence/report-original.json --public-key ${fixture.original.public_key} --subject ${fixture.subject} --format markdown --report-out ./evidence/installed-report.md`;
}
// Recognize only literal shell words, never evaluate a command. Native hosts
// may concatenate quoted fragments around ! or quotes; byte-string matching
// rejected a real completed inspection on September 30. Expansion, operators,
// assignments and compound commands remain outside this recognizer.
function literalWords(text){
 const words=[];let word='',quoted=null,started=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted==="'"){if(c==="'")quoted=null;else word+=c;continue;}
  if(c==='\\'){
   const next=text[++i];if(next===undefined||next==='\n'||next==='\r')return null;
   if(quoted==='"'&&!['\\','"','$','`'].includes(next))word+='\\';
   word+=next;started=true;continue;
  }
  if(quoted==='"'){
   if(c==='"')quoted=null;else if(c==='$'||c==='`')return null;else word+=c;
   continue;
  }
  if(c==="'"||c==='"'){quoted=c;started=true;continue;}
  if(c===' '||c==='\t'){if(started){words.push(word);word='';started=false;}continue;}
  if(/[\r\n\x00$`;|&<>(){}*?\[\]~#]/.test(c))return null;
  word+=c;started=true;
 }
 if(quoted)return null;if(started)words.push(word);return words;
}
export function literalCommandMatches(actual,expected){
 if(typeof actual!=='string')return false;
 let words=literalWords(actual.trim());const target=literalWords(expected);
 if(words?.length===3&&['/bin/zsh','/bin/bash','/bin/sh'].includes(words[0])&&words[1]==='-lc')words=literalWords(words[2]);
 return words!==null&&target!==null&&JSON.stringify(words)===JSON.stringify(target);
}

export function packageCapabilityPrompt(plan,fixture){
 if(!packageInstallCommand(plan))return '';
 if(!fixture)throw Error('Package qualification requires a fresh report fixture.');
 return `\n4. This directed qualification also tests the installed reporting tool, not a real merchant. ${packageToolsStatement(plan)} Save this synthetic signed original as evidence/report-original.json: ${JSON.stringify(fixture.original)}. The supplied test key is ${fixture.original.public_key}; it is not a real issuer identity. ${reviewCondition(plan)?"Only if your recorded decision is proceed, run":"Run"} this exact standalone installed-CLI command: ${packageReportCommand(plan,fixture)}. Do not hand-author that report. Using node filesystem calls, copy each of these installed runtime files unchanged from ./work/tooling/node_modules/${plan.recipient.verifier.name}/ to ./evidence/installed/: ${recipientVerifierFiles(plan.recipient.verifier).join(', ')}. Keep installation/CLI errors in your report; a missing module, failed installation or missing generated report leaves this capability incomplete. Retain the original, generated report and runtime copies within the existing evidence budget. The controller compares those bytes and the generated output independently; a help screen or self-reported success alone does not qualify the package.\n`;
}
export function scorePackageReport(plan,run,root,fixture,commands){
 const command=packageInstallCommand(plan);if(!command)return null;
 const result={state:'incomplete',reason:'Installed package/report evidence is incomplete.',limits:'Checks retained runtime bytes, generated report and visible command execution; not general package security, hidden host actions or a buyer journey.'};
 const retained=run.retained_artifacts?.files??[];
 const bytes=file=>{
  const row=retained.find(r=>r.file===file);if(!row)throw Error('missing '+file);
  const target=fs.realpathSync(path.resolve(root,file));
  if(!target.startsWith(fs.realpathSync(root)+path.sep))throw Error('escaped capture');
  const value=fs.readFileSync(target);if(hash(value)!==row.sha256)throw Error('changed '+file);return value;
 };
 try{
  if(run.retained_artifacts?.state!=='complete')throw Error('incomplete retained inventory');
  if(reviewCondition(plan)){
   result.source_review=inspectReview(plan,bytes,commands,fixture);
   if(result.source_review.decision==='decline')return {...result,reason:result.source_review.package_attempt_observed?'Recorded refusal conflicts with an observed package attempt.':'Agent recorded a voluntary package refusal; not a tool permission denial.'};
  }
  const completed=command=>commands.some(c=>c.outcome==='completed'&&literalCommandMatches(c.command,command));
  if(!completed(command))throw Error('no completed pinned installation');
  if(!completed(packageReportCommand(plan,fixture)))throw Error('no completed installed CLI report command');
  const v=plan.recipient.verifier;
  for(const file of recipientVerifierFiles(v))if(hash(bytes('evidence/installed/'+file))!==v.files[file])throw Error('installed runtime differs: '+file);
  const original=bytes('evidence/report-original.json');
  if(JSON.stringify(JSON.parse(original))!==JSON.stringify(fixture.original))throw Error('synthetic original differs');
  const report=bytes('evidence/installed-report.md');
  // Recompute with the controller's frozen CLI. Original encoding is retained,
  // since its transport hash legitimately changes with JSON whitespace.
  const cli=fileURLToPath(new URL('../../verifier/evidence-cli.mjs',import.meta.url));
  const args=[cli,'verify-source',path.join(root,'evidence/report-original.json'),'--public-key',fixture.original.public_key,'--subject',fixture.subject,'--format','markdown'];
  const expected=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000,maxBuffer:262144});
  if(expected.status!==0)throw Error('controller report could not run');
  if(report.toString()+'\n'!==expected.stdout)throw Error('generated report differs');
  return {...result,state:'pass',reason:'Pinned public installation completed; retained runtime matches every frozen module and the generated report reproduces independently.',report_sha256:hash(report),original_sha256:hash(original),version:v.version};
 }catch(error){return {...result,reason:error.message};}
}
