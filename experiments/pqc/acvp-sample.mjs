// Check selected public NIST sample vectors. No production key or external request.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw Error('Usage: node acvp-sample.mjs <download-directory> <new-result.json>');
const sources = JSON.parse(await readFile(join(directory,'sources.json'),'utf8'));
const datasets = {};
for (const source of sources.files) {
  assert.match(source.filename,/^(keyGen|sigGen|sigVer)-(prompt|expectedResults)\.json$/);
  const bytes = await readFile(join(directory,source.filename));
  assert.equal(bytes.length,source.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
  datasets[source.filename] = JSON.parse(bytes.toString());
}
function hex(value) {
  assert.equal(typeof value,'string'); assert.match(value,/^(?:[0-9a-fA-F]{2})*$/);
  return Buffer.from(value,'hex');
}
const passed=[], excluded=[], totals={};
for(const mode of ['keyGen','sigGen','sigVer']) {
  const prompt=datasets[`${mode}-prompt.json`], expected=datasets[`${mode}-expectedResults.json`];
  assert.equal(prompt.algorithm,'ML-DSA'); assert.equal(prompt.revision,'FIPS204');
  assert.equal(prompt.isSample,expected.isSample); assert.equal(prompt.vsId,expected.vsId);
  const groups=new Map(expected.testGroups.map(g=>[g.tgId,new Map(g.tests.map(t=>[t.tcId,t]))]));
  totals[mode]={all_parameter_sets:0,ml_dsa65:0,checked:0,excluded:0};
  for(const group of prompt.testGroups) {
    const counts=totals[mode]; counts.all_parameter_sets+=group.tests.length;
    if(group.parameterSet!=='ML-DSA-65') continue;
    counts.ml_dsa65+=group.tests.length;
    // The pilot uses the external Pure ML-DSA API. Other modes remain explicitly untested.
    if(mode!=='keyGen' && (group.signatureInterface!=='external' || group.preHash!=='pure')) {
      counts.excluded+=group.tests.length;
      excluded.push({mode,tgId:group.tgId,tests:group.tests.length,signatureInterface:group.signatureInterface,preHash:group.preHash,externalMu:group.externalMu});
      continue;
    }
    for(const test of group.tests) {
      const answer=groups.get(group.tgId)?.get(test.tcId);
      assert.ok(answer,`missing expected ${mode}/${group.tgId}/${test.tcId}`);
      const label=`${mode}/${group.tgId}/${test.tcId}`;
      let expectedValid;
      if(mode==='keyGen') {
        const key=ml_dsa65.keygen(hex(test.seed));
        try {
          assert.equal(Buffer.from(key.publicKey).equals(hex(answer.pk)),true,`${label} public key`);
          assert.equal(Buffer.from(key.secretKey).equals(hex(answer.sk)),true,`${label} secret key`);
        } finally { key.secretKey.fill(0); }
      } else if(mode==='sigGen') {
        const sk=hex(test.sk);
        try {
          const signature=ml_dsa65.sign(hex(test.message),sk,{context:hex(test.context),extraEntropy:group.deterministic ? false : hex(test.rnd)});
          assert.equal(Buffer.from(signature).equals(hex(answer.signature)),true,`${label} signature`);
        } finally { sk.fill(0); }
      } else {
        assert.equal(typeof answer.testPassed,'boolean'); expectedValid=answer.testPassed;
        assert.equal(ml_dsa65.verify(hex(test.signature),hex(test.message),hex(test.pk),{context:hex(test.context)}),expectedValid,label);
      }
      counts.checked++; passed.push({mode,tgId:group.tgId,tcId:test.tcId,expected_valid:expectedValid});
    }
    assert.ok(group.tests.length>0);
  }
  assert.ok(totals[mode].checked>0,`${mode} exercised nothing`);
}
const manifest=JSON.parse(await readFile(new URL('./node_modules/@noble/post-quantum/package.json',import.meta.url),'utf8'));
const report={experimental:true,checked_at:new Date().toISOString(),node:process.version,noble:manifest.version,sources,totals,passed,excluded,limitations:['Selected ML-DSA-65 NIST public sample cases only; prehash, internal interfaces and other parameter sets are excluded.','No ACVP certification, FIPS module validation, security audit or production implementation approval.','The checked inputs include publicly known test seeds/secret keys; none is a production key.','No Worker resource, customer latency or key-custody measurement.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({experimental:true,noble:manifest.version,totals,passed:passed.length,expected_valid:passed.filter(x=>x.expected_valid===true).length,expected_invalid:passed.filter(x=>x.expected_valid===false).length,result_file:output}));
