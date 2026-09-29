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
 if(plan?.package_access===undefined)return null;
 if(plan.package_access!==true||plan.schema_version!==6||!plan.cells?.length||plan.cells.some(c=>c.lane!=='directed'))throw Error('Package access requires an explicit directed schema 6 experiment.');
 const v=validateRecipientVerifier(plan);
 if(!v?.files?.['evidence-report.js'])throw Error('Package access requires a pinned reporting runtime.');
 return `npm install --ignore-scripts --no-audit --no-fund --prefix ./work/tooling --cache ./work/npm-cache --registry https://registry.npmjs.org ${v.name}@${v.version}`;
}
export function packageToolsStatement(plan){
 const command=packageInstallCommand(plan);
 return command?` This directed experiment also permits exactly this public package installation: ${command}. Run it as one standalone command, with no changes or extra arguments. It installs only the pinned verifier in this session's scratch directory with install scripts disabled. Run its CLI with node ./work/tooling/node_modules/${plan.recipient.verifier.name}/evidence-cli.mjs. Other npm commands are not granted. Installation permission is not a recommendation to spend or proof that the package's output is correct.`:'';
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
const invocations=command=>[command,...['/bin/zsh','/bin/bash','/bin/sh'].flatMap(shell=>[`${shell} -lc "${command}"`,`${shell} -lc '${command}'`])];
export function packageCapabilityPrompt(plan,fixture){
 if(!packageInstallCommand(plan))return '';
 if(!fixture)throw Error('Package qualification requires a fresh report fixture.');
 return `\n4. This directed qualification also tests the installed reporting tool, not a real merchant. ${packageToolsStatement(plan)} Save this synthetic signed original as evidence/report-original.json: ${JSON.stringify(fixture.original)}. The supplied test key is ${fixture.original.public_key}; it is not a real issuer identity. Run this exact standalone installed-CLI command: ${packageReportCommand(plan,fixture)}. Do not hand-author that report. Using node filesystem calls, copy each of these installed runtime files unchanged from ./work/tooling/node_modules/${plan.recipient.verifier.name}/ to ./evidence/installed/: ${recipientVerifierFiles(plan.recipient.verifier).join(', ')}. Keep installation/CLI errors in your report; a missing module, failed installation or missing generated report leaves this capability incomplete. Retain the original, generated report and runtime copies within the existing evidence budget. The controller compares those bytes and the generated output independently; a help screen or self-reported success alone does not qualify the package.\n`;
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
  const completed=command=>commands.some(c=>c.outcome==='completed'&&invocations(command).includes(c.command.trim()));
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
