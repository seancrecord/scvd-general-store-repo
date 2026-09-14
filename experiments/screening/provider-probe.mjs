// One bounded, keyless protocol probe. No product/payout configuration is read.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const output=process.argv[2];
if(!output) throw Error('Usage: node provider-probe.mjs <new-result.json>');
const root=new URL('../../',import.meta.url);
const networkSource=await readFile(new URL('src/lib/payment-networks.ts',root),'utf8');
const baseNetwork=networkSource.match(/export const BASE_NETWORK = ['"]eip155:(\d+)['"]/);
assert.ok(baseNetwork);
const expectedChain='0x'+BigInt(baseNetwork[1]).toString(16);
const source=await readFile(new URL('src/lib/sanctions-oracle.ts',root),'utf8');
function oneMatch(pattern) {
  const matches=[...source.matchAll(pattern)]; assert.equal(matches.length,1);
  return matches[0][1];
}
const contract=oneMatch(/export const SANCTIONS_ORACLE_BASE\s*=\s*"(0x[0-9a-fA-F]{40})"/g);
const selector=oneMatch(/const IS_SANCTIONED_SELECTOR\s*=\s*"(0x[0-9a-fA-F]{8})"/g);
const rpcSource=await readFile(new URL('src/lib/base-rpc.ts',root),'utf8');
const baseDefinition=rpcSource.match(/export const BASE_EVM:[\s\S]*?defaultRpc:\s*"([^"]+)"/);
assert.ok(baseDefinition);
const endpoint=new URL(baseDefinition[1]);
assert.equal(endpoint.href,'https://mainnet.base.org/','only the documented keyless probe host is allowed');
const attempts=[];
async function rpc(method,params) {
  const id=attempts.length+1;
  assert.ok(id<=7,'fixed request budget');
  const start=performance.now();
  const row={id,method,params,observed_at:new Date().toISOString()};
  attempts.push(row);
  try {
    const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
      headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
    row.http_status=response.status;
    const reader=response.body?.getReader();
    if(!reader) throw Error('missing_body');
    const chunks=[];let bytes=0;
    for(;;) {const part=await reader.read();if(part.done)break;bytes+=part.value.length;
      if(bytes>262144){await reader.cancel();throw Error('response_too_large');} chunks.push(part.value);}
    row.response_bytes=bytes;
    if(!response.ok) {row.outcome='http_failure';return null;}
    const data=JSON.parse(Buffer.concat(chunks).toString());
    if(data.id!==id || data.jsonrpc!=='2.0') throw Error('invalid_rpc_envelope');
    if(data.error) {row.outcome='rpc_error';row.rpc_error_code=Number.isInteger(data.error.code)?data.error.code:null;return null;}
    if(!Object.hasOwn(data,'result')) throw Error('missing_rpc_result');
    const result=data.result;
    row.outcome='result';
    row.result=method==='eth_getBlockByNumber' && result ?
      {number:result.number,hash:result.hash,timestamp:result.timestamp,parentHash:result.parentHash}:result;
    return row.result;
  } catch {row.outcome='transport_or_parse_failure';return null;}
  finally {row.elapsed_ms=performance.now()-start;}
}
const chain=await rpc('eth_chainId',[]);
// A failed chain handshake stops the probe; silence cannot become capability evidence.
if(chain===expectedChain) {
  const latest=await rpc('eth_getBlockByNumber',['latest',false]);
  const safe=await rpc('eth_getBlockByNumber',['safe',false]);
  const finalized=await rpc('eth_getBlockByNumber',['finalized',false]);
  const call={to:contract,data:selector+'0'.repeat(64)}; // synthetic zero-address query
  for(const block of [safe,finalized]) {
    if(block && /^0x[0-9a-fA-F]{64}$/.test(block.hash)) {
      await rpc('eth_call',[call,{blockHash:block.hash,requireCanonical:true}]);
      if(latest && /^0x[0-9a-f]+$/i.test(latest.number) && /^0x[0-9a-f]+$/i.test(block.number))
        block.distance_from_sampled_latest=(BigInt(latest.number)-BigInt(block.number)).toString();
    }
  }
  await rpc('eth_call',[call,{blockHash:'0x'+'0'.repeat(64),requireCanonical:true}]);
}
const report={experimental:true,checked_at:new Date().toISOString(),endpoint:endpoint.href,contract,
  request_budget:7,attempts,qualified_for_product:false,limitations:[
    'Single keyless public endpoint, not either isolated product provider; no account quota or commercial terms qualified.',
    'A returned boolean is a response observation only, not address clearance or an independent state proof.',
    'No known-changing historical state, controlled noncanonical block or ignored-selector qualification in this sample.',
    'One bounded sample cannot establish availability, retention guarantees or production latency.'
  ]};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({result_file:output,attempts:attempts.length,outcomes:attempts.map(x=>({method:x.method,outcome:x.outcome})),qualified_for_product:false}));
