// A new plan can pin the CLI it intends to supply. Hash equality binds local
// bytes to that plan; the separate release readback establishes publication.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const LEGACY_RECIPIENT_VERIFIER_FILES=Object.freeze(['evidence-cli.mjs','evidence-bundle.js','x402-verify.js','package.json']);
export const RECIPIENT_VERIFIER_FILES=Object.freeze([...LEGACY_RECIPIENT_VERIFIER_FILES,'evidence-report.js','payment-identity.js']);
export function recipientVerifierFiles(verifier){return Object.hasOwn(verifier.files,'evidence-report.js')?RECIPIENT_VERIFIER_FILES:LEGACY_RECIPIENT_VERIFIER_FILES;}
export function validateRecipientVerifier(plan){
 const v=plan?.recipient?.verifier;
 if(v===undefined)return null;
 if(plan.schema_version!==6||plan.recipient.input_scope!=='all-retained-and-buyer-report'||v?.name!=='x402-verify'||typeof v.version!=='string'||!/^\d+\.\d+\.\d+$/.test(v.version))throw Error('Pinned recipient verifier requires a schema 6 whole-inventory plan and explicit package version.');
 if(!v.files||JSON.stringify(Object.keys(v.files).sort())!==JSON.stringify([...recipientVerifierFiles(v)].sort())||Object.values(v.files).some(h=>typeof h!=='string'||! /^[a-f0-9]{64}$/.test(h)))throw Error('Pinned recipient verifier requires exact package file hashes.');
 return v;
}
export function readRecipientVerifier(plan){
 const v=validateRecipientVerifier(plan);if(!v)return null;
 const files=recipientVerifierFiles(v).map(file=>{
  const bytes=fs.readFileSync(new URL('../../verifier/'+file,import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==v.files[file])throw Error('Recipient verifier bytes differ from the frozen package hashes.');
  return {file,bytes};
 });
 const pkg=JSON.parse(files.find(f=>f.file==='package.json').bytes);
 if(pkg.name!==v.name||pkg.version!==v.version)throw Error('Recipient verifier package identity differs from the frozen plan.');
 // The package file inventory must include every standalone runtime module.
 // Old pinned releases retain their four-file contract; a new CLI must not
 // silently be delivered without its newly imported reporting modules.
 const runtimeFiles=[...pkg.files.filter(file=>/\.(?:mjs|js)$/.test(file)),'package.json'].sort();
 if(JSON.stringify(runtimeFiles)!==JSON.stringify(files.map(row=>row.file).sort()))throw Error('Recipient verifier runtime files differ from the package inventory.');
 return files;
}
