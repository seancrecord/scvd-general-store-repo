// Host-only orchestration. An upload is not a backup until its readback matches.
import { createHash,randomUUID } from 'node:crypto';
import { closeSync,existsSync,fsyncSync,linkSync,lstatSync,mkdirSync,mkdtempSync,openSync,readFileSync,renameSync,rmSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_LIMITS,checkManifest,checkRecord,demand,size,type BackupManifest,type BackupRecord } from './format';
import { checkEncryptedCopy,sealArchive } from './encrypted';

export interface Snapshot {manifest:BackupManifest;manifestSha256:string}
export interface SnapshotSource {
 manifest():Promise<Snapshot|null>;
 capture(id:string,previous:string|null):Promise<Snapshot>;
 page(hash:string,after:number):Promise<{manifestSha256:string;records:BackupRecord[];next:number;done:boolean}>;
}
export interface RemoteObject {bucketId:string;fileId:string;name:string;bytes:number;sha256:string}
export interface ArchiveDestination {
 upload(path:string,name:string,bytes:number,sha256:string):Promise<RemoteObject>;
 download(object:RemoteObject,path:string):Promise<void>;
}
export interface CollectorPolicy {maxArchiveBytes:number;maxStoredBytes:number;maxSourceAgeMs:number;maxDownloadAttempts:number}
export const PILOT_BACKUP_POLICY:Readonly<CollectorPolicy>=Object.freeze({maxArchiveBytes:16*1024*1024,maxStoredBytes:256*1024*1024,maxSourceAgeMs:36*3600000,maxDownloadAttempts:3});
export interface BackupReceipt {version:1;snapshotId:string;capturedAtMs:number;verifiedAtMs:number;manifestSha256:string;ciphertextSha256:string;ciphertextBytes:number;recipientSha256:string;object:RemoteObject;storedBytes:number;remoteReadbackVerified:true;restorePerformed:false}
type Seal=Awaited<ReturnType<typeof sealArchive>>;
interface Pending {id:string;previous:string|null;storedBytes:number;policy:CollectorPolicy}
export interface CollectorOptions {root:string;ageBinary:string;ageSha256:string;recipient:string;policy:CollectorPolicy;now:()=>number;source:SnapshotSource;destination:ArchiveDestination}

async function sourceCall<T>(operation:()=>Promise<T>):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve().then(operation),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('source_deadline')),30000);})]);}finally{clearTimeout(timer);}
}

function syncDirectory(path:string) {const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function save(path:string,value:unknown,replace=false) {
 const parent=join(path,'..'),stage=mkdtempSync(join(parent,'.receipt-')),file=join(stage,'value');
 try{writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});const fd=openSync(file,'r');try{fsyncSync(fd);}finally{closeSync(fd);}if(replace)renameSync(file,path);else linkSync(file,path);syncDirectory(parent);}finally{rmSync(stage,{recursive:true,force:true});}
}
function read<T>(path:string):T {const s=lstatSync(path);demand(s.isFile()&&!s.isSymbolicLink()&&s.size<=BACKUP_LIMITS.budgetBytes);return JSON.parse(readFileSync(path,'utf8')) as T;}
function directory(path:string){if(!existsSync(path))mkdirSync(path,{mode:0o700});const s=lstatSync(path);demand(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0);}
function validatePolicy(p:CollectorPolicy){demand([p.maxArchiveBytes,p.maxStoredBytes,p.maxSourceAgeMs,p.maxDownloadAttempts].every(v=>Number.isSafeInteger(v)&&v>0));demand(p.maxArchiveBytes<=64*1024*1024&&p.maxStoredBytes>=p.maxArchiveBytes&&p.maxDownloadAttempts<=3);}
function checkedReceipt(r:BackupReceipt){
 demand(r.version===1&&r.remoteReadbackVerified===true&&r.restorePerformed===false&&/^backup_[a-f0-9-]{36}$/.test(r.snapshotId));
 demand([r.manifestSha256,r.ciphertextSha256,r.recipientSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)));
 demand([r.capturedAtMs,r.verifiedAtMs,r.storedBytes,r.ciphertextBytes].every(v=>Number.isSafeInteger(v)&&v>=0)&&r.verifiedAtMs>=r.capturedAtMs&&r.ciphertextBytes>0&&r.storedBytes>=r.ciphertextBytes);
 demand(r.object&&typeof r.object.fileId==='string'&&r.object.fileId.length>0&&typeof r.object.bucketId==='string'&&r.object.bucketId.length>0&&r.object.name===r.snapshotId+'.age'&&r.object.bytes===r.ciphertextBytes&&r.object.sha256===r.ciphertextSha256);return r;
}

/** Unknown uploads keep the pending generation frozen; no blind automatic resend. */
export async function collectBackup(o:CollectorOptions):Promise<BackupReceipt> {
 validatePolicy(o.policy);directory(o.root);
 demand(/^[a-f0-9]{64}$/.test(o.ageSha256)&&createHash('sha256').update(readFileSync(o.ageBinary)).digest('hex')===o.ageSha256);
 const lock=join(o.root,'.collector-lock');mkdirSync(lock,{mode:0o700});
 let plaintext:string|undefined;
 try {
  const headPath=join(o.root,'head.json'),pendingPath=join(o.root,'pending.json');
  const head=existsSync(headPath)?checkedReceipt(read<BackupReceipt>(headPath)):null;
  let pending:Pending;
  if(existsSync(pendingPath))pending=read<Pending>(pendingPath);
  else {
   const current=await sourceCall(()=>o.source.manifest());
   if(current)checkManifest(current.manifest,current.manifestSha256);
   demand((current?.manifestSha256??null)===(head?.manifestSha256??null));
   pending={id:'backup_'+randomUUID(),previous:head?.manifestSha256??null,storedBytes:head?.storedBytes??0,policy:o.policy};
   save(pendingPath,pending);
  }
  demand(/^backup_[a-f0-9-]{36}$/.test(pending.id)&&JSON.stringify(pending.policy)===JSON.stringify(o.policy));
  const job=join(o.root,pending.id);directory(job);
  const receiptPath=join(job,'receipt.json');
  if(existsSync(receiptPath)) {
   const receipt=checkedReceipt(read<BackupReceipt>(receiptPath));demand(receipt.snapshotId===pending.id);
   save(headPath,receipt,true);rmSync(pendingPath);syncDirectory(o.root);return receipt;
  }
  demand(pending.previous===(head?.manifestSha256??null)&&pending.storedBytes===(head?.storedBytes??0));
  // Reserve a full generation before capture; never silently prune to make room.
  demand(pending.storedBytes+o.policy.maxArchiveBytes<=o.policy.maxStoredBytes);
  const capturePath=join(job,'capture.json');
  const captured=existsSync(capturePath)?read<Snapshot>(capturePath):await sourceCall(()=>o.source.capture(pending.id,pending.previous));
  checkManifest(captured.manifest,captured.manifestSha256);demand(captured.manifest.snapshotId===pending.id);
  const now=o.now();demand(Number.isSafeInteger(now)&&captured.manifest.createdAtMs<=now&&now-captured.manifest.createdAtMs<=o.policy.maxSourceAgeMs);
  if(!existsSync(capturePath))save(capturePath,captured);
  const archive=join(job,'archive.age'),sealPath=join(job,'seal.json');let seal:Seal;
  if(existsSync(sealPath))seal=read<Seal>(sealPath);
  else {
   // A crash may leave a completed archive without its receipt. Reconcile it by hand.
   demand(!existsSync(archive));plaintext=mkdtempSync(join(job,'.plaintext-'));
   writeFileSync(join(plaintext,'manifest.json'),JSON.stringify(captured.manifest),{mode:0o600,flag:'wx'});
   const fd=openSync(join(plaintext,'records.ndjson'),'wx',0o600);let after=0,bytes=0;
   try{for(;;){const page=await sourceCall(()=>o.source.page(captured.manifestSha256,after));
    demand(page.manifestSha256===captured.manifestSha256&&Array.isArray(page.records)&&page.records.length>0&&page.records.length<=BACKUP_LIMITS.pageRows);
    let pageBytes=0;for(const row of page.records){checkRecord(row);demand(row.n===++after);const line=JSON.stringify(row)+'\n';pageBytes+=size(line);bytes+=size(line);demand(pageBytes<=BACKUP_LIMITS.pageBytes+BACKUP_LIMITS.pageRows&&bytes<=o.policy.maxArchiveBytes);writeFileSync(fd,line);}
    demand(page.next===after&&after<=captured.manifest.rows&&page.done===(after===captured.manifest.rows));if(page.done)break;
   }fsyncSync(fd);}finally{closeSync(fd);}
   seal=await sealArchive(o.ageBinary,plaintext,captured.manifestSha256,o.recipient,archive);
   save(sealPath,seal);rmSync(plaintext,{recursive:true,force:true});plaintext=undefined;
  }
  demand(seal.manifestSha256===captured.manifestSha256&&seal.recipientSha256===createHash('sha256').update(o.recipient).digest('hex')&&seal.ciphertextBytes<=o.policy.maxArchiveBytes);
  await checkEncryptedCopy(archive,seal.ciphertextSha256,seal.ciphertextBytes);
  const objectPath=join(job,'object.json'),intentPath=join(job,'upload-intent.json');let object:RemoteObject;
  if(existsSync(objectPath))object=read<RemoteObject>(objectPath);
  else {
   demand(!existsSync(intentPath));save(intentPath,{name:pending.id+'.age',bytes:seal.ciphertextBytes,sha256:seal.ciphertextSha256});
   object=await o.destination.upload(archive,pending.id+'.age',seal.ciphertextBytes,seal.ciphertextSha256);
   demand(object.name===pending.id+'.age'&&object.bytes===seal.ciphertextBytes&&object.sha256===seal.ciphertextSha256&&typeof object.fileId==='string'&&object.fileId.length>0);
   save(objectPath,object);
  }
  demand(object.name===pending.id+'.age'&&object.bytes===seal.ciphertextBytes&&object.sha256===seal.ciphertextSha256);
  const attemptsPath=join(job,'readback-attempts.json'),attempts=existsSync(attemptsPath)?read<number>(attemptsPath):0;
  demand(Number.isSafeInteger(attempts)&&attempts>=0&&attempts<o.policy.maxDownloadAttempts);save(attemptsPath,attempts+1,true);
  const download=join(job,'readback_'+randomUUID()+'.age');
  try{await o.destination.download(object,download);await checkEncryptedCopy(download,seal.ciphertextSha256,seal.ciphertextBytes);}finally{rmSync(download,{force:true});}
  const verifiedAtMs=o.now();demand(Number.isSafeInteger(verifiedAtMs)&&verifiedAtMs>=now);
  const receipt:BackupReceipt={version:1,snapshotId:pending.id,capturedAtMs:captured.manifest.createdAtMs,verifiedAtMs,manifestSha256:captured.manifestSha256,ciphertextSha256:seal.ciphertextSha256,ciphertextBytes:seal.ciphertextBytes,recipientSha256:seal.recipientSha256,object,storedBytes:pending.storedBytes+seal.ciphertextBytes,remoteReadbackVerified:true,restorePerformed:false};
  save(receiptPath,receipt);save(headPath,receipt,true);rmSync(pendingPath);syncDirectory(o.root);return receipt;
 }catch{throw Error('screening_backup_collection_unavailable');}
 finally{if(plaintext)rmSync(plaintext,{recursive:true,force:true});rmSync(lock,{recursive:true,force:true});}
}

/** Run from a separate observer; completion of an old capture does not make it fresh. */
export function backupFreshness(receipt:BackupReceipt|null,now:number,maxAgeMs:number) {
 try{demand(Number.isSafeInteger(now)&&now>=0&&Number.isSafeInteger(maxAgeMs)&&maxAgeMs>0);if(!receipt)return {state:'missing' as const};checkedReceipt(receipt);demand(receipt.verifiedAtMs<=now);return {state:now-receipt.capturedAtMs>maxAgeMs?'stale' as const:'fresh' as const,capturedAtMs:receipt.capturedAtMs,verifiedAtMs:receipt.verifiedAtMs};}catch{return {state:'unavailable' as const};}
}
