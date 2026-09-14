import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const buildResult=await build({entryPoints:['experiments/screening/backup/b2.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {b2Destination}=await import('data:text/javascript;base64,'+Buffer.from(buildResult.outputFiles[0].contents).toString('base64'));
function setup(){
 const dir=mkdtempSync(path.join(tmpdir(),'scvd-b2-transport-test-')),data=Buffer.from('synthetic ciphertext'),bucketId='a'.repeat(24),name='backup_fixture.age',hash=createHash('sha256').update(data).digest('hex'),sha1=createHash('sha1').update(data).digest('hex'),calls=[];
 writeFileSync(path.join(dir,'archive'),data,{mode:0o600});let authorizeCount=0;
 const state={writerCaps:['writeFiles'],readerCaps:['readFiles'],prefix:'backup_',uploadUrl:'https://pod-000-1005-03.backblaze.com/b2api/v4/b2_upload_file',downloadBody:data,downloadId:'file_version',extraJson:false};
 const options={bucketId,prefix:'backup_',writer:{keyId:'w'.repeat(25),applicationKey:'x'.repeat(31)},reader:{keyId:'r'.repeat(25),applicationKey:'y'.repeat(31)},maxBytes:1024,now:()=>100000,fetch:async(url,init)=>{
  calls.push(url);assert.equal(init.redirect,'error');assert.ok(init.signal);
  const json=v=>new Response(JSON.stringify(v));
  if(url.endsWith('b2_authorize_account')){authorizeCount++;const writer=Buffer.from(init.headers.Authorization.slice(6),'base64').toString().startsWith('w');return json({authorizationToken:'opaque_auth',applicationKeyExpirationTimestamp:200000,apiInfo:{storageApi:{apiUrl:'https://api005.backblazeb2.com',downloadUrl:'https://f005.backblazeb2.com',allowed:{buckets:[{id:bucketId}],namePrefix:state.prefix,capabilities:writer?state.writerCaps:state.readerCaps}}}});}
  if(url.includes('b2_get_upload_url'))return json({bucketId,authorizationToken:'opaque_upload',uploadUrl:state.uploadUrl});
  if(url.includes('b2_upload_file')){assert.equal(init.headers['X-Bz-Server-Side-Encryption'],'AES256');assert.equal(init.headers['X-Bz-Content-Sha1'],sha1);assert.deepEqual(Buffer.from(init.body),data);return state.extraJson?new Response(' '.repeat(65537)):json({bucketId,fileId:'file_version',fileName:name,contentLength:data.length,contentSha1:sha1,serverSideEncryption:{mode:'SSE-B2',algorithm:'AES256'}});}
  if(url.includes('b2_download_file_by_id'))return new Response(state.downloadBody,{headers:{'X-Bz-File-Id':state.downloadId,'X-Bz-File-Name':name,'X-Bz-Content-Sha1':sha1,'Content-Length':String(data.length),'X-Bz-Server-Side-Encryption':'AES256'}});
  throw Error('Unexpected transport call');
 }};
 const destination=b2Destination(options);return {dir,data,name,hash,calls,state,destination,options,clean:()=>rmSync(dir,{recursive:true,force:true})};
}
test('native B2 upload and exact-version readback preserve ciphertext and SSE-B2',async()=>{const t=setup();try{const object=await t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash);await t.destination.download(object,path.join(t.dir,'download'));assert.deepEqual(readFileSync(path.join(t.dir,'download')),t.data);assert.equal(t.calls.length,5);}finally{t.clean();}});
for(const capability of ['deleteFiles','writeKeys','writeFileRetentions','bypassGovernance'])test('writer refuses excess capability '+capability,async()=>{const t=setup();try{t.state.writerCaps.push(capability);await assert.rejects(t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash),e=>e.message==='screening_backup_transport_unavailable');assert.equal(t.calls.length,1);}finally{t.clean();}});
test('broader filename scope is refused before obtaining an upload token',async()=>{const t=setup();try{t.state.prefix='';await assert.rejects(t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash));assert.equal(t.calls.length,1);}finally{t.clean();}});
test('upload token never reaches a foreign host',async()=>{const t=setup();try{t.state.uploadUrl='https://backblazeb2.com.attacker.invalid/b2api/v4/b2_upload_file';await assert.rejects(t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash));assert.equal(t.calls.length,2);}finally{t.clean();}});
for(const failure of ['hash','version','oversize'])test('readback refuses '+failure,async()=>{const t=setup();try{const object=await t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash);if(failure==='hash')t.state.downloadBody=Buffer.alloc(t.data.length);if(failure==='version')t.state.downloadId='different';if(failure==='oversize')t.state.downloadBody=Buffer.alloc(t.data.length+1);await assert.rejects(t.destination.download(object,path.join(t.dir,'download')));assert.equal(existsSync(path.join(t.dir,'download')),false);}finally{t.clean();}});
test('oversize upload response refuses without retaining provider prose',async()=>{const t=setup();try{t.state.extraJson=true;await assert.rejects(t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash),e=>e.message==='screening_backup_transport_unavailable');}finally{t.clean();}});
test('reader with write authority is refused before the download',async()=>{const t=setup();try{const object=await t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash);t.state.readerCaps.push('writeFiles');await assert.rejects(t.destination.download(object,path.join(t.dir,'download')));assert.equal(t.calls.length,4);}finally{t.clean();}});
test('expired credential refuses before an upload URL request',async()=>{const t=setup();try{t.options.now=()=>200001;await assert.rejects(t.destination.upload(path.join(t.dir,'archive'),t.name,t.data.length,t.hash));assert.equal(t.calls.length,1);}finally{t.clean();}});
