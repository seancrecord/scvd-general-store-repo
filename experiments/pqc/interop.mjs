// Disposable-key probe. Private keys travel through memory/pipes, never output files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signingBytes } from './envelope.mjs';
const output = process.argv[2];
if (!output) throw Error('Usage: node interop.mjs <new-public-result.json>');
const executable = process.env.PQC_OPENSSL ?? 'openssl';
function invoke(args, input) {
  const r = spawnSync(executable, args, {input, timeout:15000, maxBuffer:1024*1024});
  if (r.error || r.signal) throw Error('openssl_process_unavailable');
  return r;
}
function checked(args, input) {
  const r = invoke(args, input);
  if (r.status !== 0) throw Error('openssl_operation_failed');
  return r.stdout;
}
const version = checked(['version']).toString().trim();
assert.match(checked(['list','-signature-algorithms']).toString(), /2\.16\.840\.1\.101\.3\.4\.3\.18.*ML-DSA-65/);
const temporary = await mkdtemp(join(tmpdir(),'scvd-pq-interop-'));
const file = name => join(temporary,name);
let nativeSecret, nobleKeys;
try {
  nativeSecret = checked(['genpkey','-algorithm','ML-DSA-65']);
  const nativePublic = checked(['pkey','-pubout','-outform','DER'],nativeSecret);
  await writeFile(file('native.der'),nativePublic);
  assert.match(checked(['asn1parse','-inform','DER','-in',file('native.der')]).toString(),/OBJECT\s+:ML-DSA-65/);
  // Bridge only the exact locally generated SPKI shape; this is not a public-input parser.
  const keyLength = ml_dsa65.lengths.publicKey;
  const rawNative = nativePublic.subarray(-keyLength);
  const prefix = nativePublic.subarray(0,nativePublic.length-keyLength);
  const length = n => n<128 ? Buffer.from([n]) : Buffer.from([0x82,n>>8,n&255]);
  const oid = Buffer.from('0609608648016503040312','hex'); // OpenSSL id-ml-dsa-65, asserted above
  const algorithm = Buffer.concat([Buffer.from([0x30,oid.length]),oid]);
  const bitHeader = Buffer.concat([Buffer.from([3]),length(keyLength+1),Buffer.from([0])]);
  assert.deepEqual(prefix,Buffer.concat([Buffer.from([0x30]),length(algorithm.length+bitHeader.length+keyLength),algorithm,bitHeader]));
  nobleKeys = ml_dsa65.keygen();
  const noblePublic = Buffer.concat([prefix,nobleKeys.publicKey]);
  await writeFile(file('noble.der'),noblePublic);
  assert.deepEqual(checked(['pkey','-pubin','-inform','DER','-in',file('noble.der'),'-pubout','-outform','DER']),noblePublic);
  const header = {version:1,purpose:'corpus-checkpoint-pilot',canonicalization:'scvd-envelope-v1',policy:'all',signers:[{algorithm:'ed25519',key_id:'interop-ed'},{algorithm:'ML-DSA-65',key_id:'interop-pq'}]};
  const message = Buffer.from(signingBytes(header,'{"experimental":true,"subject":"independent-implementation-check"}'));
  const contexts = [Buffer.alloc(0),Buffer.from('SCVD-PQC-INTEROP-v1')];
  const contextArgs = context => context.length ? ['-pkeyopt',`hexcontext-string:${context.toString('hex')}`] : [];
  async function nativeVerify(signature, bytes, publicFile, context) {
    await writeFile(file('message'),bytes); await writeFile(file('signature'),signature);
    const r = invoke(['pkeyutl','-verify','-pubin','-keyform','DER','-inkey',file(publicFile),'-in',file('message'),'-sigfile',file('signature'),...contextArgs(context)]);
    if (r.status===0) return true;
    // Setup errors cannot masquerade as successful tamper rejection.
    if (r.status===1 && /Signature Verification Failure/.test(r.stdout.toString())) return false;
    throw Error('openssl_verification_not_completed');
  }
  const cases=[];
  for(const context of contexts) {
    await writeFile(file('message'),message);
    const ns=checked(['pkeyutl','-sign','-inkey','/dev/stdin','-in',file('message'),...contextArgs(context)],nativeSecret);
    const js=Buffer.from(ml_dsa65.sign(message,nobleKeys.secretKey,{context}));
    assert.equal(ns.length,ml_dsa65.lengths.signature);
    assert.equal(ml_dsa65.verify(ns,message,rawNative,{context}),true);
    assert.equal(await nativeVerify(js,message,'noble.der',context),true);
    const wrong=Buffer.concat([message,Buffer.from(' ')]);
    const alteredNative=Buffer.from(ns); alteredNative[0]^=1;
    const alteredNoble=Buffer.from(js); alteredNoble[0]^=1;
    const wrongContext=Buffer.concat([context,Buffer.from('x')]);
    const rejected={
      noble_wrong_message:!ml_dsa65.verify(ns,wrong,rawNative,{context}),
      noble_changed_signature:!ml_dsa65.verify(alteredNative,message,rawNative,{context}),
      noble_wrong_context:!ml_dsa65.verify(ns,message,rawNative,{context:wrongContext}),
      noble_wrong_key:!ml_dsa65.verify(ns,message,nobleKeys.publicKey,{context}),
      openssl_wrong_message:!await nativeVerify(js,wrong,'noble.der',context),
      openssl_changed_signature:!await nativeVerify(alteredNoble,message,'noble.der',context),
      openssl_wrong_context:!await nativeVerify(js,message,'noble.der',wrongContext),
      openssl_wrong_key:!await nativeVerify(js,message,'native.der',context),
    };
    for(const [name,valid] of Object.entries(rejected)) assert.equal(valid,true,name);
    cases.push({context_hex:context.toString('hex'),openssl_signed_noble_verified:true,noble_signed_openssl_verified:true,rejected,openssl_signature_hex:ns.toString('hex'),noble_signature_hex:js.toString('hex')});
  }
  const manifest=JSON.parse(await readFile(new URL('./node_modules/@noble/post-quantum/package.json',import.meta.url),'utf8'));
  const report={experimental:true,checked_at:new Date().toISOString(),node:process.version,openssl:version,noble:manifest.version,mode:'Pure ML-DSA-65; randomized signing; empty and nonempty context',message_hex:message.toString('hex'),message_sha256:createHash('sha256').update(message).digest('hex'),public_keys:{openssl_spki_hex:nativePublic.toString('hex'),openssl_raw_hex:rawNative.toString('hex'),noble_spki_hex:noblePublic.toString('hex'),noble_raw_hex:Buffer.from(nobleKeys.publicKey).toString('hex')},cases,limitations:['Two generated fixtures, not the full FIPS/ACVP vectors or a security audit.','Only ML-DSA signatures cross implementations; the envelope verifier and Ed25519 leg are not independently implemented here.','No Worker resource or latency measurement, production keys, custody exercise or FIPS module validation.','Best-effort buffer clearing is not a JavaScript memory-erasure guarantee.']};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({experimental:true,openssl:version,noble:manifest.version,cases:cases.map(({context_hex,rejected,openssl_signed_noble_verified,noble_signed_openssl_verified})=>({context_hex,rejected,openssl_signed_noble_verified,noble_signed_openssl_verified})),result_file:output}));
} finally {
  nativeSecret?.fill(0); nobleKeys?.secretKey.fill(0);
  await rm(temporary,{recursive:true,force:true});
}
