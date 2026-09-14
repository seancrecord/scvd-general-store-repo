// Offline host only. age owns cryptography; no backup identity enters a Worker.
import { spawn,spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream,mkdtempSync,rmSync,openSync,closeSync,fsyncSync,linkSync } from 'node:fs';
import { dirname,isAbsolute,join,resolve } from 'node:path';
import { Readable,Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { OfflineRestore } from './restore';
import { demand,digest,type BackupManifest,type BackupRecord } from './format';
import { fileStream,jsonLines,readManifest } from './stream';

export const ENCRYPTED_STREAM_FORMAT='scvd-screening-age-stream-v1';
export const QUALIFIED_AGE_VERSION='v1.3.2';
// Wrangler augments ProcessEnv with required Worker bindings. An offline child
// must receive none of them, and cannot discover plugins through the host PATH.
const CHILD_ENV={PATH:'/nonexistent'} as unknown as NodeJS.ProcessEnv;

/** Check bytes downloaded from a destination; this cannot attest where they came from. */
export async function checkEncryptedCopy(inputPath:string,expectedSha256:string,expectedBytes:number) {
 demand(/^[a-f0-9]{64}$/.test(expectedSha256)&&Number.isSafeInteger(expectedBytes)&&expectedBytes>0);
 const hash=createHash('sha256');let bytes=0;
 for await(const chunk of fileStream(inputPath)){bytes+=chunk.length;demand(bytes<=expectedBytes);hash.update(chunk);}
 demand(bytes===expectedBytes&&hash.digest('hex')===expectedSha256);
 return {copyMatches:true,ciphertextSha256:expectedSha256,ciphertextBytes:bytes,remoteOriginVerified:false};
}

function qualify(binary:string) {
 demand(isAbsolute(binary));
 const result=spawnSync(binary,['--version'],{encoding:'utf8',timeout:5000,maxBuffer:1024,env:CHILD_ENV});
 demand(!result.error&&result.status===0&&result.stdout.trim()===QUALIFIED_AGE_VERSION);
}

async function runAge(binary:string,args:string[],input:AsyncIterable<Uint8Array>,consume:(out:Readable)=>Promise<void>) {
 const child=spawn(binary,args,{stdio:['pipe','pipe','ignore'],env:CHILD_ENV});
 const exited=new Promise<void>((yes,no)=>{child.once('error',no);child.once('close',code=>code===0?yes():no(Error('age_unavailable')));});
 // A wedged executable must not leave an unattended job holding authority forever.
 const timer=setTimeout(()=>child.kill('SIGKILL'),15*60*1000);
 const operations=[pipeline(Readable.from(input),child.stdin),consume(child.stdout),exited];
 try{await Promise.all(operations);}catch{child.kill('SIGKILL');child.stdin.destroy();child.stdout.destroy();await Promise.allSettled(operations);throw Error('age_unavailable');}
 finally{clearTimeout(timer);}
}

function publish(staged:string,output:string) {
 const fd=openSync(staged,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
 // Same-filesystem link is atomic and refuses an existing file or symlink.
 linkSync(staged,output);
 const parent=openSync(dirname(output),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}

/** Encrypt exactly the records checked by the verifier; publish only after age exits 0. */
export async function sealArchive(binary:string,directory:string,expectedSha256:string,recipient:string,outputPath:string) {
 qualify(binary);
 // This qualification deliberately supports one native hybrid recipient only.
 // No SSH reuse, plugins, fallback recipient or private key on the backup host.
 demand(/^age1pq1[023456789acdefghjklmnpqrstuvwxyz]{100,4096}$/.test(recipient));
 const manifest=await readManifest(join(directory,'manifest.json')) as BackupManifest;
 const output=resolve(outputPath),stage=mkdtempSync(join(dirname(output),'.screening-seal-'));
 let verifier:OfflineRestore|undefined;
 try {
  verifier=new OfflineRestore(join(stage,'verification.sqlite'),manifest,expectedSha256);
  const checked=verifier;
  async function* source() {
   yield Buffer.from(JSON.stringify({format:ENCRYPTED_STREAM_FORMAT,manifest})+'\n');
   for await(const row of jsonLines(fileStream(join(directory,'records.ndjson')))) {
    checked.append([row as BackupRecord]);yield Buffer.from(JSON.stringify(row)+'\n');
   }
   checked.finish();
  }
  const ciphertext=join(stage,'archive.age'),hash=createHash('sha256');let ciphertextBytes=0;
  await runAge(binary,['--encrypt','--recipient',recipient],source(),async out=>{
   await pipeline(out,new Transform({transform(chunk:Buffer,_encoding,callback){hash.update(chunk);ciphertextBytes+=chunk.length;callback(null,chunk);}}),createWriteStream(ciphertext,{flags:'wx',mode:0o600}));
  });
  verifier.close();verifier=undefined;
  publish(ciphertext,output);
  return {encrypted:true,manifestSha256:expectedSha256,ciphertextSha256:hash.digest('hex'),ciphertextBytes,recipientSha256:digest(recipient),ageVersion:QUALIFIED_AGE_VERSION,remoteDeliveryVerified:false};
 }finally{verifier?.close();rmSync(stage,{recursive:true,force:true});}
}

/** Authenticate the entire age stream before marking or publishing a restore. */
export async function openArchive(binary:string,inputPath:string,expectedSha256:string,identityPath:string,outputPath:string) {
 qualify(binary);
 demand(isAbsolute(identityPath));
 const output=resolve(outputPath),stage=mkdtempSync(join(dirname(output),'.screening-open-'));
 const staged=join(stage,'restore.sqlite');let restore:OfflineRestore|undefined;
 try {
  await runAge(binary,['--decrypt','--identity',identityPath],fileStream(inputPath),async out=>{
   let header=true;
   for await(const row of jsonLines(out)) {
    if(header) {
     const h=row as {format?:unknown;manifest:BackupManifest};
     demand(h&&h.format===ENCRYPTED_STREAM_FORMAT);
     restore=new OfflineRestore(staged,h.manifest,expectedSha256);header=false;
    }else restore!.append([row as BackupRecord]);
   }
   demand(!header);
  });
  // EOF alone is insufficient: age can emit authenticated chunks and fail later.
  const receipt=restore!.finish();restore!.close();restore=undefined;
  publish(staged,output);return {...receipt,ageAuthenticated:true,quarantined:true};
 }finally{restore?.close();rmSync(stage,{recursive:true,force:true});}
}
