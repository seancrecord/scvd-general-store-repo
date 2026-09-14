import { demand } from './format';
import { sealArchive,openArchive,checkEncryptedCopy } from './encrypted';

async function main() {
 if(process.argv[2]==='check-copy') {
  const [input,hash,bytes,...extra]=process.argv.slice(3);
  demand(input&&hash&&bytes&&extra.length===0&&/^[1-9][0-9]*$/.test(bytes));
  process.stdout.write(JSON.stringify(await checkEncryptedCopy(input,hash,Number(bytes)))+'\n');return;
 }
 const [mode,binary,input,hash,keyFile,output,...extra]=process.argv.slice(2);
 demand(binary&&input&&hash&&keyFile&&output&&extra.length===0);
 if(mode==='seal') {
  // Public recipient only. Bound the actual read rather than trusting file metadata.
  const {openSync,readSync,closeSync}=await import('node:fs');
  const fd=openSync(keyFile,'r'),bytes=Buffer.alloc(4098);let size:number;
  try{size=readSync(fd,bytes,0,bytes.length,null);}finally{closeSync(fd);}
  demand(size<bytes.length);
  const recipient=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.subarray(0,size)).trim();
  process.stdout.write(JSON.stringify(await sealArchive(binary,input,hash,recipient,output))+'\n');
 }else {
  demand(mode==='open');
  process.stdout.write(JSON.stringify(await openArchive(binary,input,hash,keyFile,output))+'\n');
 }
}
main().catch(()=>{process.stderr.write('Encrypted backup refused. Check the qualified tool, key selection, archive and independently retained manifest hash; use a fresh output path.\n');process.exitCode=1;});
