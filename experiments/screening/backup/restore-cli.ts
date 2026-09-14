import { createReadStream } from 'node:fs';
import path from 'node:path';
import { OfflineRestore } from './restore';
import { BACKUP_LIMITS,demand,type BackupManifest,type BackupRecord } from './format';

async function main() {
 const [directory,expectedSha256,output,...extra]=process.argv.slice(2);
 demand(directory&&expectedSha256&&output&&extra.length===0);
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of createReadStream(path.join(directory,'manifest.json'),{highWaterMark:65536})){bytes+=chunk.length;demand(bytes<=BACKUP_LIMITS.budgetBytes);chunks.push(chunk);}
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks))) as BackupManifest;
 const restore=new OfflineRestore(output,manifest,expectedSha256);
 try {
  let pending=Buffer.alloc(0);
  for await(const chunk of createReadStream(path.join(directory,'records.ndjson'),{highWaterMark:65536})) {
   pending=Buffer.concat([pending,chunk]);
   for(;;){const end=pending.indexOf(10);if(end<0)break;demand(end<=BACKUP_LIMITS.pageBytes);const line=pending.subarray(0,end);pending=pending.subarray(end+1);
    demand(line.length>0);const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(line);restore.append([JSON.parse(text) as BackupRecord]);
   }
   demand(pending.length<=BACKUP_LIMITS.pageBytes);
  }
  demand(pending.length===0);
  process.stdout.write(JSON.stringify(restore.finish())+'\n');
 }finally{restore.close();}
}
main().catch(()=>{process.stderr.write('Restore refused. Use a new output path and a complete archive with its independently retained manifest hash.\n');process.exitCode=1;});
