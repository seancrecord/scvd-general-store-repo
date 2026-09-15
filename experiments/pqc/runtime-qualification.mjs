// Disposable-key backend qualification, not the proposed production envelope.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const context = Buffer.from('scvd.store:corpus-checkpoint:v1');
const message = Buffer.from('SCVD-PQ-QUALIFICATION\0{"synthetic":true,"sequence":1}');
const [mode, output] = process.argv.slice(2);
const digest = value => createHash('sha256').update(value).digest('hex');
function summary(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  return {samples:values.length,min_ms:sorted[0],median_ms:sorted[Math.floor(sorted.length/2)],max_ms:sorted.at(-1),raw_ms:values};
}
function timed(fn) {
  const start = performance.now(); const value = fn();
  return {value,ms:performance.now()-start};
}

if (mode === '--child-ed' || mode === '--child-pq') {
  const cpuStart = process.cpuUsage();
  const ed = generateKeyPairSync('ed25519');
  let pq, backend, importMs = null;
  if (mode === '--child-pq') {
    const before = performance.now();
    backend = (await import('@noble/post-quantum/ml-dsa.js')).ml_dsa65;
    importMs = performance.now()-before;
    pq = backend.keygen();
  }
  try {
    const signOne = () => [sign(null,message,ed.privateKey), ...(pq ? [backend.sign(message,pq.secretKey,{context})] : [])];
    const verifyOne = signatures => {
      assert.equal(verify(null,message,ed.publicKey,signatures[0]),true);
      if (pq) assert.equal(backend.verify(signatures[1],message,pq.publicKey,{context}),true);
    };
    const first = timed(signOne), firstVerify = timed(()=>verifyOne(first.value));
    const signing=[], verifying=[];
    for (let i=0;i<50;i++) {
      const signed = timed(signOne); signing.push(signed.ms);
      verifying.push(timed(()=>verifyOne(signed.value)).ms);
    }
    console.log(JSON.stringify({mode,import_ms:importMs,first_sign_ms:first.ms,first_verify_ms:firstVerify.ms,
      signing:summary(signing),verifying:summary(verifying),signature_bytes:first.value.map(s=>s.length),
      cpu_us:process.cpuUsage(cpuStart),max_rss_kib:process.resourceUsage().maxRSS,
      sampled_memory:process.memoryUsage(),concurrency:1}));
  } finally { pq?.secretKey.fill(0); }
} else if (mode === '--entropy') {
  const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
  const pq = ml_dsa65.keygen();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'crypto');
  let calls=0;
  try {
    const a=ml_dsa65.sign(message,pq.secretKey,{context});
    const b=ml_dsa65.sign(message,pq.secretKey,{context});
    assert.notDeepEqual(a,b);
    const deterministic=ml_dsa65.sign(message,pq.secretKey,{context,extraEntropy:false});
    assert.deepEqual(deterministic,ml_dsa65.sign(message,pq.secretKey,{context,extraEntropy:false}));
    assert.equal(ml_dsa65.verify(a,message,pq.publicKey,{context}),true);
    assert.equal(ml_dsa65.verify(deterministic,message,pq.publicKey,{context}),true);
    assert.equal(ml_dsa65.verify(a,message,pq.publicKey,{context:Buffer.from('wrong')}),false);
    assert.throws(()=>ml_dsa65.sign(message,pq.secretKey,{context,extraEntropy:new Uint8Array(31)}));
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(){calls++; throw Error('synthetic_entropy_failure');}}});
    assert.throws(()=>ml_dsa65.sign(message,pq.secretKey,{context}),/synthetic_entropy_failure/);
    assert.equal(calls,1,'the entropy source must actually be exercised');
    // Positive control: deterministic mode bypasses entropy, so its verification
    // cannot be used to infer hedging. Production must forbid that fallback.
    assert.equal(ml_dsa65.verify(ml_dsa65.sign(message,pq.secretKey,{context,extraEntropy:false}),message,pq.publicKey,{context}),true);
    assert.equal(calls,1);
    console.log(JSON.stringify({randomized_signatures_differ:true,deterministic_repeats:true,
      both_verify_identically:true,wrong_context_rejected:true,wrong_entropy_length_rejected:true,
      entropy_failure_throws:true,entropy_calls:calls,deterministic_control_bypasses_entropy:true}));
  } finally {
    if(descriptor) Object.defineProperty(globalThis,'crypto',descriptor); else delete globalThis.crypto;
    pq.secretKey.fill(0);
  }
} else if (mode === 'run' && output) {
  const run = child => {
    const start=performance.now();
    // Do not hand inherited application credentials to a disposable signer.
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),child],{
      env:{PATH:process.env.PATH ?? ''},timeout:30000,maxBuffer:1024*1024});
    assert.equal(result.status,0,'qualification child failed; inspect locally without dumping key material');
    return {process_wall_ms:performance.now()-start,...JSON.parse(result.stdout.toString())};
  };
  const runs=[];
  // Serial and alternating, so the probe does not create its own CPU contention.
  for(let i=0;i<3;i++) for(const child of ['--child-ed','--child-pq']) runs.push(run(child));
  const lock=JSON.parse(await readFile(new URL('./package-lock.json',import.meta.url),'utf8'));
  const sourceFiles=['runtime-qualification.mjs','node_modules/@noble/post-quantum/ml-dsa.js','node_modules/@noble/hashes/utils.js'];
  const sources=[];
  for(const path of sourceFiles) sources.push({path,sha256:digest(await readFile(new URL(path,import.meta.url)))});
  const report={experimental:true,checked_at:new Date().toISOString(),node:process.version,
    openssl_in_node:process.versions.openssl,platform:process.platform,architecture:process.arch,
    context_hex:context.toString('hex'),message_bytes:message.length,message_sha256:digest(message),
    dependencies:Object.entries(lock.packages).filter(([path])=>path).map(([path,p])=>({path,version:p.version,integrity:p.integrity})),
    sources,runs,entropy:run('--entropy'),limitations:[
      'Backend API only: the production checkpoint format, key-purpose acceptance and custody are not implemented or qualified.',
      'Fresh-process first calls and 50 warm iterations per run on this host; no production p95, cloud-runtime or concurrency guarantee.',
      'Peak RSS is process-wide; sampled heap is not peak heap. Process wall time includes all warm measurements, not startup alone.',
      'JavaScript key erasure and constant-time execution are not guaranteed; no independent audit or FIPS module validation.',
      'No production keys, chain writes, timestamp submission or Worker import changes.'
    ]};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({result_file:output,runs:runs.length,entropy:report.entropy}));
} else {
  throw Error('Usage: node runtime-qualification.mjs run <new-result.json>');
}
