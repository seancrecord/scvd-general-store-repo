import 'dotenv/config';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {privateKeyToAccount} from 'viem/accounts';
import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm';

const root='research/deployment-boundary-2026-09-11',priv='/private/tmp/scvd-deployment-boundary-2026-09-11';
const plan=JSON.parse(fs.readFileSync(root+'/plan.json')),comparison=JSON.parse(fs.readFileSync(root+'/staged-comparison.json'));
const origin='https://scvd.store',network='eip155:8453',worker='scvd-general-store-repo';
const cli=process.cwd()+'/node_modules/wrangler/bin/wrangler.js',cwd=priv+'/'+worker;
const account=privateKeyToAccount(process.env.BUYER_PRIVATE_KEY);
if(!process.env.HOUSE_SECRET||!JSON.parse(fs.readFileSync('src/store/house-wallets.json')).wallets.some(w=>w.address.toLowerCase()===account.address.toLowerCase()))throw new Error('Declared house buyer unavailable');
if(!comparison.all_module_bytes_identical||!comparison.runtime_equal||!comparison.bindings_equal)throw new Error('Staged release differs beyond permitted scope');
const lock=fs.openSync(priv+'/live-run-started','wx');fs.closeSync(lock);
const client=new x402Client().register(network,new ExactEvmScheme(account));
const rows=[],payments=[],deployments=[];let paid=0,serial=0,active=0,maxActive=0;
function redact(v){if(typeof v==='string'&&v.trim().startsWith('{')){try{return JSON.stringify(redact(JSON.parse(v)));}catch{return v;}}if(Array.isArray(v))return v.map(redact);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/status_token|payment-signature|x402\/payment$/.test(k)?'[withheld]':redact(x)]));return v;}
const save=()=>{fs.writeFileSync(priv+'/responses.json',JSON.stringify(rows,null,2)+'\n',{mode:0o600});fs.writeFileSync(root+'/responses.json',JSON.stringify(redact(rows),null,2)+'\n');fs.writeFileSync(root+'/deployment-timeline.json',JSON.stringify(deployments,null,2)+'\n');};
async function command(args,label){
 const started_at=new Date().toISOString();let text='',stderr='';const child=spawn(process.execPath,[cli,...args],{cwd,env:{...process.env,WRANGLER_LOG_PATH:priv+'/wrangler.log'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{text+=b});child.stderr.on('data',b=>{stderr+=b});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
 fs.writeFileSync(priv+'/'+label+'.log',text+'\n'+stderr,{mode:0o600});if(code!==0)throw new Error('Deployment command failed: '+label);
 return {started_at,completed_at:new Date().toISOString(),text};
}
async function current(){const r=await command(['deployments','list','--json'],'current-'+serial++);const list=JSON.parse(r.text);return list.sort((a,b)=>Date.parse(a.created_on)-Date.parse(b.created_on)).at(-1);}
async function deploy(specs,label){const event={phase:label,started_at:new Date().toISOString(),versions:specs};deployments.push(event);save();const r=await command(['versions','deploy',...specs,'--yes','--message','Buyer audit 22: '+label],label);event.completed_at=r.completed_at;event.observed=await current();save();return event;}
function headers(id,override){return {'X-House':process.env.HOUSE_SECRET,'X-Buyer-Audit':plan.run_id,'X-Buyer-Audit-Request':id,...(override?{'Cloudflare-Workers-Version-Overrides':`${worker}="${override}"`}:{})};}
async function request(door,args,phase,kind,payment,key,override){
 const id='r'+serial++,h=headers(id,override);let url,init;
 if(door==='http'){url=new URL('/api/buy/small_blessing',origin);Object.entries(args).forEach(([k,v])=>url.searchParams.set(k,v));if(payment)Object.assign(h,{'PAYMENT-SIGNATURE':payment,'Idempotency-Key':key});init={headers:h};}
 else{url=origin+'/mcp';init={method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'buy_small_pleasure',arguments:{item_id:'small_blessing',...args},...(payment?{_meta:{'x402/payment':payment,'x402/idempotency-key':key}}:{})}})};}
 const row={id,door,phase,kind,args,paid:Boolean(payment),key:key??null,requested_version:override??null,sent_at:new Date().toISOString(),url:String(url)};active++;maxActive=Math.max(maxActive,active);
 if(payment){if(++paid>20)throw new Error('Hard paid-request cap exceeded');}
 try{const response=await fetch(url,{...init,signal:AbortSignal.timeout(60000)});row.http_status=response.status;row.headers=Object.fromEntries(response.headers);row.raw=await response.json();row.body=door==='http'?row.raw:row.raw.error?.data??row.raw.result?.structuredContent??{};row.protocol_error=door==='http'?response.status>=400:Boolean(row.raw.error||row.raw.result?.isError);}
 catch(e){row.transport_error=e.name;}
 finally{row.received_at=new Date().toISOString();active--;rows.push(row);save();}return row;
}
function required(row){const wire=row.headers?.['payment-required'];const q=wire?JSON.parse(Buffer.from(wire,'base64').toString()):row.raw?.error?.data?.['x402/payment-required'];const offer=q?.accepts?.find(o=>o.network===network);if(!offer||BigInt(offer.amount)!==5000n)throw new Error('No half-cent Base quote');return {...q,accepts:[offer]};}
async function prepare(door,phase,purpose){const args={agent_name:'deployment boundary audit',purpose};const quote=await request(door,args,phase,'quote');const q=required(quote);const payload=await client.createPaymentPayload(q);const wire=Buffer.from(JSON.stringify(payload)).toString('base64'),key=crypto.randomUUID();const p={door,args,wire,key,quote_id:quote.id,offer:q.accepts[0],nonce:payload.payload.authorization.nonce,valid_before:payload.payload.authorization.validBefore};payments.push(p);fs.writeFileSync(priv+'/payments.json',JSON.stringify(payments,null,2)+'\n',{mode:0o600});return p;}
async function send(p,phase,kind){const row=await request(p.door,p.args,phase,kind,p.wire,p.key);Object.assign(row,{quote_id:p.quote_id,offer:p.offer,nonce:p.nonce});save();return row;}
async function buy(door,phase,index){return send(await prepare(door,phase,`Audit22 ${plan.run_id} ${phase} ${index}`),phase,'purchase');}
async function verifyCert(id,phase,override){const rid='r'+serial++,url=origin+'/api/verify/'+id;const row={id:rid,door:'http',phase,kind:'certificate_verify',paid:false,requested_version:override??null,url,sent_at:new Date().toISOString()};const r=await fetch(url,{headers:headers(rid,override),signal:AbortSignal.timeout(20000)});Object.assign(row,{http_status:r.status,headers:Object.fromEntries(r.headers),body:await r.json(),received_at:new Date().toISOString()});rows.push(row);save();return row;}
let switched=false;
async function rpc(method,params=[]){const r=await fetch('https://mainnet.base.org',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});const d=await r.json();if(d.error||!d.result)throw new Error('Chain preflight unavailable');return d.result;}
try{
 const startBlock=await rpc('eth_blockNumber');
 const balance=await rpc('eth_call',[{to:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',data:'0x70a08231'+account.address.slice(2).toLowerCase().padStart(64,'0')},'latest']);
 if(BigInt(balance)<100000n)throw new Error('Insufficient balance for capped run');
 fs.writeFileSync(root+'/chain-window.json',JSON.stringify({start_block:startBlock,payer:account.address,at:new Date().toISOString()},null,2)+'\n');
 const initial=await current();fs.writeFileSync(root+'/initial-deployment.json',JSON.stringify(initial,null,2)+'\n');
 if(initial.versions.length!==1||initial.versions[0].version_id!==plan.old_store_version)throw new Error('Another release changed production; refusing to overwrite it');
 // Zero-weight inclusion permits an explicit smoke read of the new artifact
 // while ordinary buyer traffic continues to use the original version.
 const stage=await deploy([comparison.old+'@100',comparison.new+'@0'],'stage-zero-percent');
 const smoke=await verifyCert('cert_ggn2ancf5r','staged-smoke',comparison.new);
 if(smoke.body.valid!==true)throw new Error('Staged release cannot verify known certificate');
 const before=[];for(const door of ['http','mcp'])before.push(await buy(door,'before',before.length));
 const oldQuotes=[];for(const door of ['http','mcp'])oldQuotes.push(await prepare(door,'before',`Audit22 ${plan.run_id} held ${door} quote`));
 if((await current()).id!==stage.observed.id)throw new Error('Another deployment intervened; refusing traffic shift');
 const first=buy('http','transition',0);
 const rollout=deploy([comparison.new+'@100'],'rollout').then(value=>{switched=true;return {value};},error=>({error}));
 await first;
 for(let i=1;i<12;i++){await new Promise(r=>setTimeout(r,600));await buy(i%2?'mcp':'http','transition',i);}
 const rolled=await rollout;if(rolled.error)throw rolled.error;
 for(const p of oldQuotes)await send(p,'after','old_quote_purchase');
 for(const door of ['http','mcp'])await buy(door,'after',door);
 for(const sale of before){const id=sale.body?.cert_id??sale.body?.certificate?.cert_id;if(id)await verifyCert(id,'after');}
 const final=await current();fs.writeFileSync(root+'/final-deployment.json',JSON.stringify(final,null,2)+'\n');
 const window=JSON.parse(fs.readFileSync(root+'/chain-window.json'));window.end_block=await rpc('eth_blockNumber');fs.writeFileSync(root+'/chain-window.json',JSON.stringify(window,null,2)+'\n');
 fs.writeFileSync(root+'/live-summary.json',JSON.stringify({completed:true,paid_requests:paid,maximum_usdc:0.10,maximum_exposed_usdc:paid*0.005,max_client_inflight:maxActive,final_version:final.versions,old_quote_ids:oldQuotes.map(q=>q.quote_id),at:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({completed:true,paid_requests:paid,delivered:rows.filter(r=>r.paid&&(r.body?.cert_id||r.body?.certificate?.cert_id)).length,final_version:final.versions}));
}catch(e){save();fs.writeFileSync(root+'/live-interruption.json',JSON.stringify({error:e.message,paid_requests:paid,switched,at:new Date().toISOString(),recovery:'Original payment authorizations retained privately. No automatic paid retry or rollback over a potentially concurrent release.'},null,2)+'\n');console.log(JSON.stringify({interrupted:true,error:e.message,paid_requests:paid,switched}));process.exitCode=2;}
