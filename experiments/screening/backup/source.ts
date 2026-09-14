import { createHash } from 'node:crypto';
import type { BudgetPolicy } from '../worker/budget';
import { label } from '../worker/rpc-reader';
import { BACKUP_FORMAT,BACKUP_LIMITS,demand,size,recordDigest,manifestDigest,checkRecord,verifyBackup,type BackupManifest,type BackupRecord } from './format';

/** One replaceable export staging copy; not an independent backup destination. */
export class BackupSource {
 constructor(private storage:DurableObjectStorage,private policy:BudgetPolicy,private now:()=>number) {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS screening_export_meta (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS screening_export_rows (n INTEGER PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL, subkey TEXT NOT NULL, sequence INTEGER NOT NULL, body TEXT NOT NULL, sha256 TEXT NOT NULL, UNIQUE(kind,key,subkey))');
 }
 manifest() {const row=this.storage.sql.exec<{body:string}>('SELECT body FROM screening_export_meta WHERE id=1').toArray()[0];return row?JSON.parse(row.body) as {manifest:BackupManifest;manifestSha256:string}:null;}
 private *records():Generator<BackupRecord> {for(const row of this.storage.sql.exec<BackupRecord>('SELECT n,kind,key,subkey,sequence,body,sha256 FROM screening_export_rows ORDER BY n'))yield row;}
 private lookup=(kind:BackupRecord['kind'],key:string,subkey='')=>{
  return this.storage.sql.exec<BackupRecord>('SELECT n,kind,key,subkey,sequence,body,sha256 FROM screening_export_rows WHERE kind=? AND key=? AND subkey=?',kind,key,subkey).toArray()[0];
 };
 async capture(snapshotId:string,expectedPreviousSha256:string|null) {
  demand(label(snapshotId));
  const result=this.storage.transactionSync(()=>{
   const previous=this.manifest();
   if(previous?.manifest.snapshotId===snapshotId)return previous;
   demand((previous?.manifestSha256??null)===expectedPreviousSha256);
   const createdAtMs=this.now();demand(Number.isSafeInteger(createdAtMs)&&createdAtMs>=0);
   // Replace only staging rows, never the canonical budget, cases or evidence.
   this.storage.sql.exec('DELETE FROM screening_export_rows');
   const root=createHash('sha256');let n=0,bodyBytes=0,cases=0,evidence=0;
   const add=(kind:BackupRecord['kind'],key:string,subkey:string,sequence:number,body:string)=>{
    demand(++n<=BACKUP_LIMITS.maxRows);const value={n,kind,key,subkey,sequence,body};const row={...value,sha256:recordDigest(value)};checkRecord(row);
    bodyBytes+=size(body);root.update(row.sha256+'\n');this.storage.sql.exec('INSERT INTO screening_export_rows VALUES (?,?,?,?,?,?,?)',n,kind,key,subkey,sequence,body,row.sha256);
   };
   const budget=this.storage.sql.exec<{body:string}>('SELECT body FROM screening_budget WHERE id=1').toArray()[0];
   add('budget','state','',0,budget?.body??'null');
   for(const r of this.storage.sql.exec<{sequence:number;case_id:string;body:string}>('SELECT sequence,case_id,body FROM screening_recovery ORDER BY sequence')){cases++;add('case',r.case_id,'',r.sequence,r.body);}
   for(const r of this.storage.sql.exec<{case_id:string;reference:string;body:string}>('SELECT case_id,reference,body FROM screening_evidence ORDER BY case_id,reference')){evidence++;add('evidence',r.case_id,r.reference,0,r.body);}
   const sequence=this.storage.sql.exec<{seq:number}>("SELECT seq FROM sqlite_sequence WHERE name='screening_recovery'").toArray()[0]?.seq??0;
   const manifest:BackupManifest={format:BACKUP_FORMAT,snapshotId,createdAtMs,policy:JSON.stringify(this.policy),counts:{budget:1,cases,evidence},rows:n,bodyBytes,sequence,recordsSha256:root.digest('hex')};
   const manifestSha256=manifestDigest(manifest);verifyBackup(manifest,manifestSha256,this.records(),this.lookup);
   const captured={manifest,manifestSha256};this.storage.sql.exec('INSERT INTO screening_export_meta VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',JSON.stringify(captured));return captured;
  });
  await this.storage.sync();return result;
 }
 page(expectedSha256:string,after=0) {
  const saved=this.manifest();demand(saved&&saved.manifestSha256===expectedSha256&&manifestDigest(saved.manifest)===expectedSha256);
  demand(Number.isSafeInteger(after)&&after>=0&&after<=saved.manifest.rows);
  const records:BackupRecord[]=[];let bytes=0;
  for(const row of this.storage.sql.exec<BackupRecord>('SELECT n,kind,key,subkey,sequence,body,sha256 FROM screening_export_rows WHERE n>? ORDER BY n LIMIT ?',after,BACKUP_LIMITS.pageRows)) {
   const length=size(JSON.stringify(row));if(records.length&&bytes+length>BACKUP_LIMITS.pageBytes)break;
   demand(bytes+length<=BACKUP_LIMITS.pageBytes);const value=checkRecord(row);demand(value.n===after+records.length+1);records.push(value);bytes+=length;
  }
  const next=after+records.length;demand(next===saved.manifest.rows||records.length>0);
  return {manifestSha256:expectedSha256,records,next,done:next===saved.manifest.rows};
 }
}
