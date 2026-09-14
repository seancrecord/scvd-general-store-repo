// Offline only: this module is never imported by a Worker entrypoint.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { openSync,closeSync,chmodSync,unlinkSync } from 'node:fs';
import { BACKUP_LIMITS,demand,checkManifest,checkRecord,verifyBackup,type BackupManifest,type BackupRecord } from './format';

/** Fresh offline SQLite archive; it has no live budget tables or activation method. */
export class OfflineRestore {
 private db!:DatabaseSync;
 constructor(outputPath:string,private manifest:BackupManifest,private expectedSha256:string) {
  const path=resolve(outputPath);
  checkManifest(manifest,expectedSha256);
  // Exclusive creation refuses overwrite and symlinks. Contents include release tokens.
  const fd=openSync(path,'wx',0o600);closeSync(fd);
  try {
   this.db=new DatabaseSync(path);chmodSync(path,0o600);
   this.db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE restore_meta (id INTEGER PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE restore_rows (n INTEGER PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL, subkey TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(kind,key,subkey));');
   this.db.prepare('INSERT INTO restore_meta VALUES (1,?)').run(JSON.stringify({manifest,expectedSha256,verified:false,quarantined:true}));
  }catch{try{this.db!.close();}catch{}unlinkSync(path);throw Error('screening_restore_unavailable');}
 }
 append(records:BackupRecord[]) {
  demand(Array.isArray(records)&&records.length>0&&records.length<=BACKUP_LIMITS.pageRows);
  demand(new TextEncoder().encode(JSON.stringify(records)).byteLength<=BACKUP_LIMITS.pageBytes+BACKUP_LIMITS.pageRows+2);
  this.db.exec('BEGIN IMMEDIATE');
  try {
   let next=Number(this.db.prepare('SELECT count(*) AS n FROM restore_rows').get()!.n)+1;
   for(const row of records){checkRecord(row);demand(row.n===next++&&row.n<=this.manifest.rows);this.db.prepare('INSERT INTO restore_rows VALUES (?,?,?,?,?)').run(row.n,row.kind,row.key,row.subkey,JSON.stringify(row));}
   this.db.exec('COMMIT');
  }catch{this.db.exec('ROLLBACK');throw Error('screening_restore_unavailable');}
 }
 finish() {
  this.db.exec('BEGIN IMMEDIATE');
  try {
   const statement=this.db.prepare('SELECT body FROM restore_rows ORDER BY n');
   const records=function*(){for(const row of statement.iterate())yield JSON.parse(String(row.body)) as BackupRecord;};
   const lookup=(kind:BackupRecord['kind'],key:string,subkey='')=>{const row=this.db.prepare('SELECT body FROM restore_rows WHERE kind=? AND key=? AND subkey=?').get(kind,key,subkey);return row?JSON.parse(String(row.body)) as BackupRecord:undefined;};
   const receipt=verifyBackup(this.manifest,this.expectedSha256,records(),lookup);
   this.db.prepare('UPDATE restore_meta SET body=? WHERE id=1').run(JSON.stringify({manifest:this.manifest,expectedSha256:this.expectedSha256,verified:true,quarantined:true,receipt}));
   this.db.exec('COMMIT');return receipt;
  }catch{this.db.exec('ROLLBACK');throw Error('screening_restore_unavailable');}
 }
 close(){this.db.close();}
}
