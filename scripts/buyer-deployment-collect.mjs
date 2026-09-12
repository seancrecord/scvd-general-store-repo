// Read-only collection. Never imports a signer or submits a payment.
import fs from 'node:fs';
import {toEventSelector} from 'viem';
import {parseTail} from './buyer-deployment-score.mjs';
const root='research/deployment-boundary-2026-09-11',priv='/private/tmp/scvd-deployment-boundary-2026-09-11';
const rows=JSON.parse(fs.readFileSync(priv+'/responses.json')),payments=JSON.parse(fs.readFileSync(priv+'/payments.json')),window=JSON.parse(fs.readFileSync(root+'/chain-window.json'));
const plan=JSON.parse(fs.readFileSync(root+'/plan.json'));
const asset='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const auth=toEventSelector('AuthorizationUsed(address,bytes32)'),transfer=toEventSelector('Transfer(address,address,uint256)');
async function rpc(method,params=[]){const r=await fetch('https://mainnet.base.org',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(25000)});const d=await r.json();if(d.error)throw new Error(JSON.stringify(d.error));return d.result;}
const block=await rpc('eth_blockNumber'),blockInfo=await rpc('eth_getBlockByNumber',[block,false]);
const logs=[];for(let from=BigInt(window.start_block);from<=BigInt(block);from+=500n){const to=from+499n<BigInt(block)?from+499n:BigInt(block);logs.push(...await rpc('eth_getLogs',[{address:asset,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16),topics:[auth,'0x'+window.payer.slice(2).toLowerCase().padStart(64,'0')]}]));}
const proofs=[];const addr=t=>'0x'+t.slice(-40).toLowerCase();
for(const row of rows.filter(r=>r.paid)){
 let cert;try{cert=JSON.parse(row.body.signed_payload);}catch{proofs.push({id:row.id,missing_good:true});continue;}
 const receipt=await rpc('eth_getTransactionReceipt',[cert.settlement_tx]);
 const response=await fetch('https://scvd.store/api/verify/'+cert.cert_id,{headers:{'X-Buyer-Audit':plan.run_id,'X-Buyer-Audit-Request':'verify-'+row.id},signal:AbortSignal.timeout(20000)});
 const verification=await response.json(),nonceLogs=logs.filter(l=>l.topics[2]?.toLowerCase()===row.nonce.toLowerCase());
 const matches=(receipt?.logs??[]).filter(l=>l.address.toLowerCase()===asset);
 proofs.push({id:row.id,transaction:cert.settlement_tx,amount_atomic:Number(row.offer.amount),verification,receipt,chain_transfer:receipt?.status==='0x1'&&matches.some(l=>l.topics[0]===transfer&&addr(l.topics[1])===window.payer.toLowerCase()&&addr(l.topics[2])===row.offer.payTo.toLowerCase()&&BigInt(l.data)===BigInt(row.offer.amount)),chain_nonce:matches.some(l=>l.topics[0]===auth&&addr(l.topics[1])===window.payer.toLowerCase()&&l.topics[2]?.toLowerCase()===row.nonce.toLowerCase()),nonce_transactions:[...new Set(nonceLogs.map(l=>l.transactionHash))]});
}
fs.writeFileSync(root+'/proofs.json',JSON.stringify(proofs,null,2)+'\n');
const final={start_block:window.start_block,end_block:block,end_block_timestamp:Number(BigInt(blockInfo.timestamp)),last_authorization_expiry:Math.max(...payments.map(p=>Number(p.valid_before))),authorization_logs:logs};final.authorization_window_closed=final.end_block_timestamp>final.last_authorization_expiry;fs.writeFileSync(root+'/chain-final.json',JSON.stringify(final,null,2)+'\n');
const events=['store','doors'].flatMap(name=>parseTail(fs.readFileSync(priv+'/'+name+'-tail.jsonl','utf8'))).filter(e=>e.event?.request?.headers?.['x-buyer-audit']===plan.run_id||e.event?.request?.headers?.['X-Buyer-Audit']===plan.run_id).map(e=>{const h=Object.fromEntries(Object.entries(e.event.request.headers).map(([k,v])=>[k.toLowerCase(),v]));return {request_id:h['x-buyer-audit-request'],worker:e.scriptName,version:e.scriptVersion?.id,status:e.event.response?.status,outcome:e.outcome,truncated:e.truncated,timestamp:e.eventTimestamp,url:e.event.request.url,wall_ms:e.wallTime};});fs.writeFileSync(root+'/version-events.json',JSON.stringify(events,null,2)+'\n');
console.log(JSON.stringify({proofs:proofs.length,events:events.length,authorization_window_closed:final.authorization_window_closed}));
