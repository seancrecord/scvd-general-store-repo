// Recover exact catalog preimages without signing, paying or querying a service.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifiedCertificateCensus,privateOutputDirectory,boundedFile,checkedJson} from './lib/retained-capture.mjs';
import {catalogCandidates,joinCatalogEvidence,catalogSummary} from './lib/catalog-evidence.mjs';
import {digest} from './lib/evidence-coverage.mjs';
const args=process.argv.slice(2),verifyOnly=args[0]==='--verify';
if(verifyOnly)args.shift();
let candidatesFile;
if(!verifyOnly&&args[0]==='--candidates'){args.shift();candidatesFile=args.shift();}
const [source,keysFile,out]=args;
if(args.length!==3)throw Error('Usage: node scripts/catalog-evidence.mjs [--verify | --candidates CANDIDATES_JSON] <private-census> <trusted-public-keys.json> <new-private-output-or-existing-supplement>');
const census=await verifiedCertificateCensus(source,keysFile);
assert.ok(census.manifest.completed_at,'Capture must have finished');
let record,manifest;
if(verifyOnly) {
 manifest=JSON.parse(await boundedFile(join(out,'manifest.json')));
 assert.equal(manifest.format,'scvd-catalog-evidence/v1');
 assert.equal(manifest.source_manifest_sha256,census.source_manifest_sha256,'Different census');
 record=await checkedJson(out,manifest.candidates);
}else record=candidatesFile?JSON.parse(await boundedFile(candidatesFile)):await catalogCandidates();
const results=joinCatalogEvidence(census.certificates,record);
const summary=catalogSummary(census,record,results);
const matched=record.candidates.filter(c=>results.some(row=>row.candidate_sha256===c.sha256));
if(verifyOnly) {
 assert.deepEqual(await checkedJson(out,manifest.results),results,'Stored results disagree');
 assert.deepEqual(await checkedJson(out,manifest.summary),summary,'Stored summary disagrees');
 assert.deepEqual(manifest.preimages,matched.map(c=>({file:`catalog-${c.sha256}.json`,sha256:c.sha256})));
 for(const c of matched)assert.equal((await boundedFile(join(out,`catalog-${c.sha256}.json`))).toString(),c.canonical,'Detached preimage changed');
}else {
 const directory=await privateOutputDirectory(out);await mkdir(directory,{mode:0o700});
 const save=async(file,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(join(directory,file),bytes,{mode:0o600,flag:'wx'});return {file,sha256:digest(bytes)};};
 const preimages=[];
 for(const c of matched) {
  const file=`catalog-${c.sha256}.json`;
  await writeFile(join(directory,file),c.canonical,{mode:0o600,flag:'wx'});
  preimages.push({file,sha256:c.sha256});
 }
 manifest={format:'scvd-catalog-evidence/v1',checked_at:new Date().toISOString(),source_manifest_sha256:census.source_manifest_sha256,preimages,
  candidates:await save('candidates.json',record),results:await save('results.json',results),summary:await save('summary.json',summary)};
 await save('manifest.json',manifest);
}
console.log(JSON.stringify({verified_stored_supplement:verifyOnly,...summary},null,2));
