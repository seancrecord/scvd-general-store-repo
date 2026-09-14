// Disabled unless explicitly composed on a dedicated host with the backup binding.
// This is machine authority, separate from the operator's recovery/admin authority.
import { BACKUP_LIMITS,demand } from './format';
import type { SnapshotSource } from './collector';
export const BACKUP_GATEWAY_PATH='/internal/screening-backup';
export const BACKUP_GATEWAY_LIMITS=Object.freeze({requestBytes:2048,responseBytes:BACKUP_LIMITS.pageBytes+BACKUP_LIMITS.budgetBytes,deadlineMs:30000});
async function bounded(response:Request|Response,limit:number,signal?:AbortSignal){demand(response.body);const reader=response.body.getReader(),chunks:Uint8Array[]=[];let n=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});try{for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;demand(n<=limit);chunks.push(v.value);}const data=new Uint8Array(n);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data)) as Record<string,unknown>;}finally{signal?.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}}
async function deadline<T>(fn:(signal:AbortSignal)=>Promise<T>){const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'));},BACKUP_GATEWAY_LIMITS.deadlineMs);})]);}finally{clearTimeout(timer);}}
function response(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});}
function fields(v:Record<string,unknown>,names:string[]){demand(v&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k)));}
async function authorized(request:Request,secret:string){if(!/^[a-f0-9]{64}$/.test(secret))return false;const supplied=request.headers.get('Authorization');if(!supplied||!/^Bearer [a-f0-9]{64}$/.test(supplied))return false;const hashes=await Promise.all([secret,supplied.slice(7)].map(v=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));const a=new Uint8Array(hashes[0]!),b=new Uint8Array(hashes[1]!);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]!^b[i]!;return diff===0;}
export function backupGateway(config:{enabled?:boolean;secret?:string;source:()=>SnapshotSource}) {
 return async(request:Request):Promise<Response>=>{
  try{
   const url=new URL(request.url);
   if(!config.enabled||url.protocol!=='https:'||url.pathname!==BACKUP_GATEWAY_PATH||url.search||request.method!=='POST')return response({status:'unavailable'},404);
   if(!await authorized(request,config.secret??''))return response({status:'unavailable'},401);
   if(request.headers.has('Origin')||request.headers.has('Sec-Fetch-Site')||request.headers.get('Content-Type')!=='application/json')return response({status:'unavailable'},403);
   const body=await deadline(signal=>bounded(request,BACKUP_GATEWAY_LIMITS.requestBytes,signal));let result:unknown;
   if(body.action==='manifest'){fields(body,['action']);result=await deadline(()=>config.source().manifest());}
   else if(body.action==='capture'){
    fields(body,['action','id','previous']);demand(typeof body.id==='string'&&/^backup_[a-f0-9-]{36}$/.test(body.id));demand(body.previous===null||typeof body.previous==='string'&&/^[a-f0-9]{64}$/.test(body.previous));
    const id=body.id,previous=body.previous;result=await deadline(()=>config.source().capture(id,previous));
   }else if(body.action==='page'){
    fields(body,['action','hash','after']);demand(typeof body.hash==='string'&&/^[a-f0-9]{64}$/.test(body.hash)&&typeof body.after==='number'&&Number.isSafeInteger(body.after)&&body.after>=0&&body.after<=BACKUP_LIMITS.maxRows);
    const hash=body.hash,after=body.after;result=await deadline(()=>config.source().page(hash,after));
   }else return response({status:'unavailable'},400);
   const encoded=JSON.stringify(result);demand(typeof encoded==='string'&&new TextEncoder().encode(encoded).length<=BACKUP_GATEWAY_LIMITS.responseBytes);return response(result);
  }catch{return response({status:'unavailable'},503);}
 };
}
export function backupSourceClient(config:{url:string;secret:string;fetch:typeof fetch}):SnapshotSource {
 const u=new URL(config.url);demand(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname===BACKUP_GATEWAY_PATH&&/^[a-f0-9]{64}$/.test(config.secret));
 async function call<T>(body:unknown):Promise<T>{try{return await deadline(async(signal)=>{const reply=await config.fetch(u.href,{method:'POST',redirect:'error',signal,headers:{Authorization:'Bearer '+config.secret,'Content-Type':'application/json'},body:JSON.stringify(body)});if(reply.status!==200){await reply.body?.cancel();throw Error('unavailable');}return await bounded(reply,BACKUP_GATEWAY_LIMITS.responseBytes,signal) as T;});}catch{throw Error('screening_backup_source_unavailable');}}
 return {manifest:()=>call({action:'manifest'}),capture:(id,previous)=>call({action:'capture',id,previous}),page:(hash,after)=>call({action:'page',hash,after})};
}
