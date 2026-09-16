import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {digest} from './evidence-coverage.mjs';

/** Reconstruct only the three fields production hashes, using its own code. */
export async function catalogCandidates(root=fileURLToPath(new URL('../../',import.meta.url))) {
 const dependencies=fileURLToPath(new URL('../../node_modules',import.meta.url));
 const built=await build({absWorkingDir:root,nodePaths:[dependencies],stdin:{contents:`
  import {MENU_ITEMS} from './src/store/menu';
  import {selectedSurface} from './src/discovery/receipt-surface';
  import {jcsCanonicalize} from './src/lib/jcs';
  export const candidates=MENU_ITEMS.map(item=>({item:item.id,canonical:jcsCanonicalize(selectedSurface(item))}));
 `,resolveDir:root},bundle:true,write:false,metafile:true,platform:'node',format:'esm',logLevel:'silent'});
 const {candidates}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const inputs=[];
 for(const path of Object.keys(built.metafile.inputs).filter(path=>path!=='<stdin>').sort()) {
  inputs.push({path,sha256:digest(await readFile(resolve(root,path)))});
 }
 return {format:'scvd-catalog-candidates/v1',source_inputs:inputs,
  candidates:candidates.map(row=>({...row,sha256:digest(row.canonical)}))};
}

export function checkCatalogCandidates(record) {
 assert.equal(record.format,'scvd-catalog-candidates/v1');
 assert.ok(Array.isArray(record.candidates)&&record.candidates.length<=1000);
 const seen=new Set();
 for(const row of record.candidates) {
  assert.match(row.item,/^[a-z0-9_]+$/);
  assert.equal(typeof row.canonical,'string');assert.ok(row.canonical.length<=16384);
  assert.equal(row.sha256,digest(row.canonical),'Candidate bytes changed');
  const surface=JSON.parse(row.canonical);
  assert.deepEqual(Object.keys(surface),['price_usdc','required','route']);
  assert.ok(Number.isFinite(surface.price_usdc)&&surface.price_usdc>=0);
  assert.ok(Array.isArray(surface.required)&&surface.required.every(x=>typeof x==='string'));
  assert.equal(new Set(surface.required).size,surface.required.length);
  assert.equal(surface.route,`/api/buy/${row.item}`);
  // For this fixed schema the key order above is JCS order. Arrays retain order.
  assert.equal(JSON.stringify(surface),row.canonical,'Noncanonical candidate');
  assert.ok(!seen.has(row.sha256),'Duplicate candidate');seen.add(row.sha256);
 }
 return record.candidates;
}

/** Certificates have already passed the census signature and checksum checks. */
export function joinCatalogEvidence(certificates,record) {
 const candidates=checkCatalogCandidates(record);
 return certificates.map(c=>{
  const candidate=candidates.find(row=>row.sha256===c.saw&&row.item===c.item);
  return {cert_id:c.cert_id,item:c.item,date:c.date,
   status:!c.saw?'no_signed_saw':candidate?'matched_catalog_preimage':'unresolved_saw',
   ...(candidate?{candidate_sha256:candidate.sha256,preimage_file:`catalog-${candidate.sha256}.json`}:{})};
 });
}

export function catalogSummary(census,record,results) {
 const counts=rows=>rows.reduce((out,row)=>(out[row.status]=(out[row.status]??0)+1,out),{});
 return {source_manifest_sha256:census.source_manifest_sha256,
  captured_from:census.manifest.started_at,captured_to:census.manifest.completed_at,
  certificate_count:census.source_certificate_count,candidate_count:record.candidates.length,
  outcomes:counts(results),by_item:Object.fromEntries([...new Set(results.map(x=>x.item))].sort().map(item=>[item,counts(results.filter(x=>x.item===item))])),
  limits:[
   'This cohort is the enumerated, checksum-checked and signature-verified certificate capture, not every purchase or an earlier census.',
   'A match recovers exact catalog commitment bytes. Source reconstruction is not an archived HTTP response or proof of which deployment answered.',
   'The saw commitment covers route, list price and required inputs. It does not establish accepted payment terms, settlement, delivery or the missing attests report.',
   'Candidate provenance describes the extraction inputs, not a deployment attestation. Unmatched hashes remain unresolved; absent signed saw fields stay separate.',
   'Certificate verification uses separately supplied issuer public keys. This command does not check key service windows, Bitcoin proofs or historical issue time.',
  ]};
}
