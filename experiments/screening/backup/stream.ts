import { createReadStream } from 'node:fs';
import { BACKUP_LIMITS,demand } from './format';

// Bound bytes as they arrive, including an unterminated final line.
export async function* jsonLines(input:AsyncIterable<Uint8Array>,limit=BACKUP_LIMITS.pageBytes):AsyncGenerator<unknown> {
 let pending=Buffer.alloc(0);
 for await(const chunk of input) {
  demand(chunk.byteLength<=65536);
  pending=Buffer.concat([pending,chunk]);
  for(;;) {
   const end=pending.indexOf(10);if(end<0)break;
   demand(end>0&&end<=limit);
   yield JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(pending.subarray(0,end)));
   pending=pending.subarray(end+1);
  }
  demand(pending.length<=limit);
 }
 demand(pending.length===0);
}
export function fileStream(path:string){return createReadStream(path,{highWaterMark:65536});}
export async function readManifest(path:string):Promise<unknown> {
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of fileStream(path)){bytes+=chunk.length;demand(bytes<=BACKUP_LIMITS.budgetBytes);chunks.push(chunk);}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks)));
}
