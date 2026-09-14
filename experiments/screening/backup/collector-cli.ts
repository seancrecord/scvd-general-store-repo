// Private host configuration contains paths, never command-line credentials.
import { lstatSync,readFileSync,existsSync } from 'node:fs';
import { isAbsolute,join } from 'node:path';
import { collectBackup,backupFreshness,type CollectorPolicy,type BackupReceipt } from './collector';
import { b2Destination,type B2Credential } from './b2';
import { backupSourceClient } from './gateway';
import { demand } from './format';
interface HostConfig {enabled:boolean;root:string;ageBinary:string;ageSha256:string;recipientPath:string;sourceUrl:string;sourceSecretPath:string;writerCredentialPath:string;readerCredentialPath:string;bucketId:string;prefix:string;policy:CollectorPolicy}
function privateText(path:string,limit=8192){demand(typeof path==='string'&&isAbsolute(path));const s=lstatSync(path);demand(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&s.size<=limit);return readFileSync(path,'utf8').trim();}
function credentials(path:string):B2Credential {const lines=privateText(path).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);demand(lines.length===2);return {keyId:lines[0]!,applicationKey:lines[1]!};}
async function main(){
 const [mode,path,...extra]=process.argv.slice(2);demand(path&&!extra.length&&(mode==='run'||mode==='check'));
 const config=JSON.parse(privateText(path)) as HostConfig;
 if(config.enabled!==true){process.stdout.write('{"state":"disabled"}\n');process.exitCode=1;return;}
 demand(typeof config.root==='string'&&isAbsolute(config.root));
 if(mode==='check'){
  const head=join(config.root,'head.json');
  const receipt=existsSync(head)?JSON.parse(privateText(head)) as BackupReceipt:null;
  const status=backupFreshness(receipt,Date.now(),config.policy.maxSourceAgeMs);process.stdout.write(JSON.stringify(status)+'\n');if(status.state!=='fresh')process.exitCode=1;return;
 }
 const source=backupSourceClient({url:config.sourceUrl,secret:privateText(config.sourceSecretPath),fetch});
 const destination=b2Destination({bucketId:config.bucketId,prefix:config.prefix,writer:credentials(config.writerCredentialPath),reader:credentials(config.readerCredentialPath),maxBytes:config.policy.maxArchiveBytes,now:Date.now,fetch});
 const receipt=await collectBackup({root:config.root,ageBinary:config.ageBinary,ageSha256:config.ageSha256,recipient:privateText(config.recipientPath),policy:config.policy,now:Date.now,source,destination});
 process.stdout.write(JSON.stringify({state:'verified',snapshotId:receipt.snapshotId,capturedAtMs:receipt.capturedAtMs,verifiedAtMs:receipt.verifiedAtMs,bytes:receipt.ciphertextBytes,restorePerformed:false})+'\n');
}
main().catch(()=>{process.stdout.write('{"state":"unavailable"}\n');process.exitCode=1;});
