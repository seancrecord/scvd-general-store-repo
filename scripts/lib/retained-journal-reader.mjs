// Temporary authenticated remote-dev reader. Never deployed as a store route.
import {RETAINED_ITEMS,RETAINED_BYTES} from './retained-evidence-contract.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export async function readJournal(env,input) {
 if (!object(input) || !RETAINED_ITEMS.includes(input.item) ||
     ['network','settlement_tx','payer'].some(k=>typeof input[k]!=='string'||!input[k]||input[k].length>200)) return {status:'unsupported_identity'};
 try {
  const stub=env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`${input.network}:${input.settlement_tx}`));
  const identity={path:`/api/buy/${input.item}`,payer:input.payer,network:input.network,transaction:input.settlement_tx};
  const artifact=await stub.readArtifact(identity);
  let raw;
  if (artifact) raw=await stub.artifactStage(artifact.digest,'response');
  else {
   const old=await stub.readCompleted(identity);
   if (!old) return {status:'not_found'};
   raw=old.response;
  }
  if (raw===null) return {status:'response_not_retained'};
  if (typeof raw!=='string') return {status:'unreadable'};
  if (new TextEncoder().encode(raw).byteLength>RETAINED_BYTES) return {status:'oversized'};
  let value;try{value=JSON.parse(raw);}catch{return {status:'unreadable'};}
  if (!object(value)) return {status:'unreadable'};
  // Export only the evidence payloads. Recovery tokens and the rest of the
  // purchase response are not needed to check a certificate's signed digest.
  const fields=input.item==='attestation_bundle'?['attestations']:input.item==='settlement_attestation'?['attestation']:['observation'];
  const goods=Object.fromEntries(fields.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
  return {status:'readable',goods};
 } catch { return {status:'unavailable'}; }
}
async function boundedText(request,limit) {
 if (!request.body) return '';
 const reader=request.body.getReader();let length=0;const parts=[];
 try {
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('too_large');}parts.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return new TextDecoder().decode(bytes);
}
export async function handleJournalRequest(request,env) {
 const headers={'Cache-Control':'no-store'};
 const authorization=request.headers.get('Authorization')??'';
 const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 const expected=env.CAPTURE_TOKEN_HASH;
 if (!token||token.length>256||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)) return new Response('Unauthorized',{status:401,headers});
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
 const actual=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
 let different=0;for(let i=0;i<64;i++)different|=actual.charCodeAt(i)^expected.charCodeAt(i);
 if(different)return new Response('Unauthorized',{status:401,headers});
 if(request.method!=='POST'||new URL(request.url).pathname!=='/read')return new Response('Not found',{status:404,headers});
 let text;try{text=await boundedText(request,16*1024);}catch{return new Response('Too large',{status:413,headers});}
 let input;try{input=JSON.parse(text);}catch{return new Response('Invalid JSON',{status:400,headers});}
 return Response.json(await readJournal(env,input),{headers});
}
export default {fetch:handleJournalRequest};
