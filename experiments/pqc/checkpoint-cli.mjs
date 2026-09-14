// Local synthetic fixtures and offline verification. No production key arguments.
import { mkdir,readFile,writeFile,stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { CONTRACT,FORMAT_FIELDS,verifyCheckpoint } from './checkpoint.mjs';
import { fixture,wrongPurposeCheckpoint } from './checkpoint-fixture.mjs';

async function boundedFile(path,limit) {
  const info=await stat(path);
  if(!info.isFile() || info.size>limit) throw Error('invalid_file');
  const bytes=await readFile(path);
  if(bytes.length>limit) throw Error('invalid_file');
  return bytes;
}
try {
  const [mode,...args]=process.argv.slice(2);
  if(mode==='create-fixture' && args.length===1) {
    await mkdir(args[0]); // Refuse an existing destination, even an empty directory.
    const f=fixture();
    try {
      const files={
        'checkpoint.json':f.bytes,'snapshot.json':f.snapshot,'trust.json':f.trustBytes,
        'wrong-purpose-checkpoint.json':wrongPurposeCheckpoint(f),
        'format.json':Buffer.from(JSON.stringify({contract:CONTRACT,fields:FORMAT_FIELDS},null,2)+'\n'),
      };
      const hashes={};
      for(const [name,bytes] of Object.entries(files)) {
        await writeFile(join(args[0],name),bytes,{flag:'wx'});
        hashes[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
      }
      const report={synthetic:true,created_at:new Date().toISOString(),node:process.version,files:hashes,
        valid:verifyCheckpoint(f),wrong_purpose:verifyCheckpoint({...f,bytes:files['wrong-purpose-checkpoint.json']}),
        limits:['Caller supplies fixture trust independently; no established store identity.',
          'No anchor submission or verification, production corpus validation, custody or independent parser qualification.',
          'Private keys are not written; JavaScript memory erasure is not guaranteed.']};
      await writeFile(join(args[0],'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
      console.log(JSON.stringify({directory:args[0],valid:report.valid,wrong_purpose:report.wrong_purpose}));
    } finally {f.dispose();}
  } else if(mode==='verify' && args.length===3) {
    const [bytes,trustBytes,snapshot]=await Promise.all([
      boundedFile(args[0],CONTRACT.max_envelope_bytes),boundedFile(args[1],CONTRACT.max_trust_bytes),
      boundedFile(args[2],CONTRACT.max_snapshot_bytes)]);
    const result=verifyCheckpoint({bytes,trustBytes,snapshot});
    console.log(JSON.stringify(result));process.exitCode=result.valid?0:1;
  } else {
    console.error('Usage: checkpoint-cli.mjs create-fixture <new-directory> | verify <checkpoint> <independently-trusted-declaration> <snapshot>');
    process.exitCode=2;
  }
} catch {
  console.error('Checkpoint operation refused: invalid input, unavailable backend, or output already exists.');
  process.exitCode=1;
}
