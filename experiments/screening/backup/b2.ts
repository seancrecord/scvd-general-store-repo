// Native B2 transport for the host collector; no credential or private key in receipts.
import { createHash } from 'node:crypto';
import { openSync,closeSync,readSync,writeFileSync,fsyncSync } from 'node:fs';
import { demand } from './format';
import type { ArchiveDestination,RemoteObject } from './collector';
export interface B2Credential {keyId:string;applicationKey:string}
export interface B2Options {bucketId:string;prefix:string;writer:B2Credential;reader:B2Credential;maxBytes:number;now:()=>number;fetch:typeof fetch}
interface Authorization {authorizationToken:string;applicationKeyExpirationTimestamp:number;apiInfo:{storageApi:{apiUrl:string;downloadUrl:string;allowed:{buckets:{id:string}[];namePrefix:string;capabilities:string[]}}}}
interface UploadLocation {bucketId:string;uploadUrl:string;authorizationToken:string}
interface Uploaded {bucketId:string;fileName:string;contentLength:number;contentSha1:string;fileId:string;serverSideEncryption:{mode:string;algorithm:string}}
const readonly=new Set(['readFiles','listFiles','listBuckets','readBuckets','readBucketEncryption','readBucketRetentions','readBucketReplications','readBucketNotifications','readBucketLogging','readBucketLifecycleRules','readFileLegalHolds','readFileRetentions','shareFiles']);
const sha=(data:Uint8Array,algorithm='sha256')=>createHash(algorithm).update(data).digest('hex');
function endpoint(value:string,upload=false){const u=new URL(value);demand(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash);demand(upload?/^(?:pod-[a-z0-9-]+\.backblaze\.com|[a-z0-9-]+\.backblazeb2\.com)$/.test(u.hostname):/^[a-z0-9-]+\.backblazeb2\.com$/.test(u.hostname));return u;}
async function bytes(response:Response,limit:number){if(response.status!==200){await response.body?.cancel();throw Error('refused');}demand(response.body);const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;try{for(;;){const v=await reader.read();if(v.done)break;total+=v.value.length;demand(total<=limit);parts.push(v.value);}return Buffer.concat(parts);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
async function json<T>(response:Response):Promise<T>{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await bytes(response,65536)));}
function localBytes(file:string,max:number){const fd=openSync(file,'r'),data=Buffer.alloc(max+1);try{let n=0;for(;;){const got=readSync(fd,data,n,data.length-n,null);if(!got)break;n+=got;demand(n<=max);}return data.subarray(0,n);}finally{closeSync(fd);}}

export function b2Destination(o:B2Options):ArchiveDestination {
 demand(/^[a-f0-9]{24}$/.test(o.bucketId)&&/^backup_[a-z0-9_-]*$/.test(o.prefix)&&Number.isSafeInteger(o.maxBytes)&&o.maxBytes>0&&o.maxBytes<=64*1024*1024);
 async function request(url:string,init:RequestInit={}) {return o.fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(30000)});}
 async function authorize(credential:B2Credential,mode:'read'|'write') {
  demand(/^[A-Za-z0-9]{15,100}$/.test(credential.keyId)&&/^[A-Za-z0-9+/=_-]{15,200}$/.test(credential.applicationKey));
  const auth=await json<Authorization>(await request('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:'Basic '+Buffer.from(credential.keyId+':'+credential.applicationKey).toString('base64')}}));
  const api=auth.apiInfo.storageApi,a=api.allowed;
  demand(Array.isArray(a.buckets)&&a.buckets.length===1&&a.buckets[0]?.id===o.bucketId&&a.namePrefix===o.prefix);
  demand(Array.isArray(a.capabilities)&&a.capabilities.includes(mode==='write'?'writeFiles':'readFiles')&&a.capabilities.every((c:string)=>mode==='write'?c==='writeFiles':readonly.has(c)));
  // Long-lived unattended keys require an explicit later policy, not a silent default.
  demand(Number.isSafeInteger(auth.applicationKeyExpirationTimestamp)&&auth.applicationKeyExpirationTimestamp>o.now()&&auth.applicationKeyExpirationTimestamp<=o.now()+31*86400000);
  demand(typeof auth.authorizationToken==='string'&&auth.authorizationToken.length>0);
  const apiUrl=endpoint(api.apiUrl),downloadUrl=endpoint(api.downloadUrl);demand(apiUrl.pathname==='/'&&!apiUrl.search&&downloadUrl.pathname==='/'&&!downloadUrl.search);
  return {token:auth.authorizationToken as string,apiUrl:apiUrl.origin,downloadUrl:downloadUrl.origin};
 }
 return {
  async upload(file,name,length,hash) {try{
   demand(name.startsWith(o.prefix)&&/^backup_[a-z0-9_-]+\.age$/.test(name)&&Number.isSafeInteger(length)&&length>0&&length<=o.maxBytes&&/^[a-f0-9]{64}$/.test(hash));
   const data=localBytes(file,length);demand(data.length===length&&sha(data)===hash);
   const auth=await authorize(o.writer,'write');
   const info=await json<UploadLocation>(await request(auth.apiUrl+'/b2api/v4/b2_get_upload_url?bucketId='+encodeURIComponent(o.bucketId),{headers:{Authorization:auth.token}}));
   demand(info.bucketId===o.bucketId&&typeof info.authorizationToken==='string');
   const upload=endpoint(info.uploadUrl,true);demand(upload.pathname.startsWith('/b2api/')&&upload.pathname.includes('/b2_upload_file'));
   const sha1=sha(data,'sha1');
   const result=await json<Uploaded>(await request(upload.href,{method:'POST',headers:{Authorization:info.authorizationToken,'Content-Type':'application/octet-stream','Content-Length':String(length),'X-Bz-File-Name':encodeURIComponent(name),'X-Bz-Content-Sha1':sha1,'X-Bz-Server-Side-Encryption':'AES256'},body:data}));
   demand(result.bucketId===o.bucketId&&result.fileName===name&&result.contentLength===length&&result.contentSha1===sha1&&typeof result.fileId==='string'&&result.fileId.length>0&&result.serverSideEncryption?.mode==='SSE-B2'&&result.serverSideEncryption?.algorithm==='AES256');
   return {bucketId:o.bucketId,fileId:result.fileId,name,bytes:length,sha256:hash};
  }catch{throw Error('screening_backup_transport_unavailable');}},
  async download(object:RemoteObject,file:string) {try{
   demand(object.bucketId===o.bucketId&&object.name.startsWith(o.prefix)&&/^backup_[a-z0-9_-]+\.age$/.test(object.name)&&Number.isSafeInteger(object.bytes)&&object.bytes>0&&object.bytes<=o.maxBytes&&/^[a-f0-9]{64}$/.test(object.sha256));
   const auth=await authorize(o.reader,'read');
   const response=await request(auth.downloadUrl+'/b2api/v4/b2_download_file_by_id?fileId='+encodeURIComponent(object.fileId),{headers:{Authorization:auth.token}});
   try{demand(response.headers.get('X-Bz-File-Id')===object.fileId&&decodeURIComponent(response.headers.get('X-Bz-File-Name')??'')===object.name&&response.headers.get('Content-Length')===String(object.bytes)&&response.headers.get('X-Bz-Server-Side-Encryption')==='AES256');}catch{await response.body?.cancel();throw Error('refused');}
   const data=await bytes(response,object.bytes);demand(data.length===object.bytes&&sha(data)===object.sha256&&sha(data,'sha1')===response.headers.get('X-Bz-Content-Sha1'));
   const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}
  }catch{throw Error('screening_backup_transport_unavailable');}}
 };
}
