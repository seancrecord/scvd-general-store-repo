// Protocol qualification with caller-supplied fixtures/transport, never payout configuration.
export async function qualifyProvider({witnessId,rpc,fixture,timeoutMs=5000}) {
  const attempts=[];
  const result={witness_id:null,protocol_cases_passed:false,qualified_for_product:false,attempts,
    still_required:['independently validated fixture provenance','Base oracle deployment and ABI','safe-head age and historical retention policy','account quota isolation','product admission/load checks','source and RPC terms']};
  const require=value=>{if(!value) throw Error('invalid_fixture_or_provider_result');};
  const hash=x=>typeof x==='string' && /^0x[0-9a-f]{64}$/.test(x);
  const word=x=>typeof x==='string' && /^0x[0-9a-f]{64}$/.test(x);
  try {
    require(typeof witnessId==='string' && /^[a-zA-Z0-9_-]{1,48}$/.test(witnessId));
    result.witness_id=witnessId;
    require(typeof rpc==='function' && Number.isSafeInteger(timeoutMs) && timeoutMs>=1 && timeoutMs<=10000);
    require(fixture && typeof fixture.chain_id==='string' && /^0x[0-9a-f]{1,16}$/.test(fixture.chain_id));
    require(typeof fixture.contract==='string' && /^0x[0-9a-fA-F]{40}$/.test(fixture.contract) && typeof fixture.calldata==='string' && fixture.calldata.length<=2050 && /^0x(?:[0-9a-f]{2})+$/.test(fixture.calldata));
    require(hash(fixture.historical_hash) && hash(fixture.noncanonical_hash) && hash(fixture.unknown_hash));
    require(new Set([fixture.historical_hash,fixture.noncanonical_hash,fixture.unknown_hash]).size===3);
    require(word(fixture.historical_result) && word(fixture.noncanonical_result));
    require(Number.isInteger(fixture.noncanonical_error_code) && Number.isInteger(fixture.unknown_error_code));
    const call={to:fixture.contract,data:fixture.calldata};
    const request=async(method,params)=>{
      require(attempts.length<6);
      const id=attempts.length+1,entry={id,method,params};attempts.push(entry);
      const controller=new AbortController();let timer;
      try {
        // The transport must honor AbortSignal. Race also bounds a non-cooperative
        // fixture; there is no retry or next request after its timeout.
        const response=await Promise.race([
          Promise.resolve().then(()=>rpc({jsonrpc:'2.0',id,method,params},controller.signal)),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);}),
        ]);
        require(response && response.jsonrpc==='2.0' && response.id===id);
        require(Object.hasOwn(response,'result')!==Object.hasOwn(response,'error'));
        if(response.error) {
          require(Number.isInteger(response.error.code));entry.outcome='rpc_error';entry.error_code=response.error.code;
        } else {
          require(method==='eth_chainId' ? typeof response.result==='string' && /^0x[0-9a-f]{1,16}$/.test(response.result) : word(response.result));
          entry.outcome='result';entry.result=response.result;
        }
        return entry;
      } catch {entry.outcome='transport_or_invalid_response';throw Error('provider_probe_failed');}
      finally {clearTimeout(timer);}
    };
    const chain=await request('eth_chainId',[]);require(chain.outcome==='result' && chain.result===fixture.chain_id);
    const historic=await request('eth_call',[call,{blockHash:fixture.historical_hash,requireCanonical:true}]);
    require(historic.outcome==='result' && historic.result===fixture.historical_result);
    const latest=await request('eth_call',[call,'latest']);
    require(latest.outcome==='result' && word(latest.result) && latest.result!==fixture.historical_result);
    const absent=await request('eth_call',[call,{blockHash:fixture.unknown_hash,requireCanonical:true}]);
    require(absent.outcome==='rpc_error' && absent.error_code===fixture.unknown_error_code);
    const fork=await request('eth_call',[call,{blockHash:fixture.noncanonical_hash,requireCanonical:false}]);
    require(fork.outcome==='result' && fork.result===fixture.noncanonical_result);
    const rejected=await request('eth_call',[call,{blockHash:fixture.noncanonical_hash,requireCanonical:true}]);
    require(rejected.outcome==='rpc_error' && rejected.error_code===fixture.noncanonical_error_code);
    result.protocol_cases_passed=true;
  } catch {result.problem='protocol_cases_incomplete_or_failed';}
  return result;
}
