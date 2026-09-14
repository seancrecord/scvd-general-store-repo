// Fixture-only policy model. No network transport, Worker state or payment hooks.
const require=value=>{if(!value) throw Error('invalid_fixture_policy');};
const label=x=>typeof x==='string' && /^[a-zA-Z0-9_-]{1,48}$/.test(x);
const positive=x=>Number.isSafeInteger(x) && x>0;
const hash=x=>typeof x==='string' && /^0x[0-9a-f]{64}$/.test(x);
const address=x=>typeof x==='string' && /^0x[0-9a-f]{40}$/.test(x);
const clockValue=now=>{const t=now();require(Number.isSafeInteger(t) && t>=0);return t;};

export function createFixtureBudget({policy,now}) {
  const p=structuredClone(policy);
  for(const key of ['windowMs','maxRequests','maxFreeRequests','maxPerCaller','maxCallers','maxConcurrent','reservedPaidConcurrent']) require(positive(p[key]));
  require(p.maxFreeRequests<p.maxRequests && p.reservedPaidConcurrent<p.maxConcurrent);
  require(Array.isArray(p.providers) && p.providers.length===2);
  require(new Set(p.providers.map(x=>x.id)).size===2);
  for(const v of p.providers) {
    require(label(v.id) && positive(v.unitsPerObservation) && positive(v.totalUnits) && positive(v.reservedPaidUnits));
    require(v.unitsPerObservation<=v.reservedPaidUnits && v.reservedPaidUnits<v.totalUnits);
  }
  let window=-1,lastTime=-1,requests=0,freeRequests=0,active=0,freeActive=0;
  let callers={free:new Map(),paid:new Map()},used=p.providers.map(()=>0),freeUsed=p.providers.map(()=>0);
  return Object.freeze({
    reserve({tier,callerId,witnessIds}) {
      try {
        require(tier==='free' || tier==='paid');require(label(callerId));
        require(Array.isArray(witnessIds) && witnessIds.length===2 && witnessIds.every((id,i)=>id===p.providers[i].id));
        const time=clockValue(now);require(time>=lastTime);lastTime=time;
        const next=Math.floor(time/p.windowMs);
        if(next!==window) {
          window=next;requests=0;freeRequests=0;callers={free:new Map(),paid:new Map()};used=p.providers.map(()=>0);freeUsed=p.providers.map(()=>0);
        }
        const free=tier==='free',bucket=callers[tier];
        require(requests<p.maxRequests && active<p.maxConcurrent);
        require(!free || (freeRequests<p.maxFreeRequests && freeActive<p.maxConcurrent-p.reservedPaidConcurrent));
        require((bucket.get(callerId)??0)<p.maxPerCaller && (bucket.has(callerId) || bucket.size<p.maxCallers));
        require(p.providers.every((v,i)=>used[i]+v.unitsPerObservation<=v.totalUnits));
        require(!free || p.providers.every((v,i)=>freeUsed[i]+v.unitsPerObservation<=v.totalUnits-v.reservedPaidUnits));
        // All-or-nothing reservation happens synchronously before either witness.
        requests++;active++;if(free){freeRequests++;freeActive++;}
        bucket.set(callerId,(bucket.get(callerId)??0)+1);
        p.providers.forEach((v,i)=>{used[i]+=v.unitsPerObservation;if(free)freeUsed[i]+=v.unitsPerObservation;});
        let released=false;
        return Object.freeze({release(){if(!released){released=true;active--;if(free)freeActive--;}}});
      } catch {return null;}
    },
    snapshot(){return {requests,freeRequests,active,freeActive,callerEntries:callers.free.size+callers.paid.size,
      providers:p.providers.map((v,i)=>({id:v.id,used:used[i],freeUsed:freeUsed[i]}))};},
  });
}

export function createFixturePairReader({witnesses,budget,policy,now,schedule=setTimeout,cancel=clearTimeout}) {
  const p=structuredClone(policy);
  require(Array.isArray(witnesses) && witnesses.length===2);
  const pair=witnesses.map(w=>({id:w.id,operator:w.operator,budgetId:w.budgetId,read:w.read}));
  for(const field of ['id','operator','budgetId']) {
    require(pair.every(w=>label(w[field])));require(new Set(pair.map(w=>w[field])).size===2);
  }
  require(pair.every(w=>typeof w.read==='function'));
  require(typeof budget?.reserve==='function' && typeof now==='function');
  require(typeof p.chain==='string' && /^eip155:[1-9][0-9]{0,15}$/.test(p.chain));
  require(address(p.contract) && typeof p.selector==='string' && /^0x[0-9a-f]{8}$/.test(p.selector));
  require(positive(p.maxAgeMs) && positive(p.deadlineMs) && p.deadlineMs<=10000);
  // These labels are fixture declarations, never evidence of real account isolation.
  return async function observe({tier,callerId,input}) {
    const unavailable={status:'unavailable',production_ready:false};
    let lease,timer,controller,allDone;
    try {
      const stable=structuredClone(input),start=clockValue(now);
      if(stable.chain!==p.chain || !address(stable.address)) return {status:'unsupported',production_ready:false};
      const block=stable.block;
      require(block && Number.isSafeInteger(block.number) && block.number>=0 && hash(block.hash));
      require(Number.isSafeInteger(block.timestampMs) && block.timestampMs>=0 && block.timestampMs<=start && start-block.timestampMs<=p.maxAgeMs);
      const request=Object.freeze({chain:p.chain,contract:p.contract,address:stable.address,
        calldata:p.selector+stable.address.slice(2).padStart(64,'0'),
        block:Object.freeze({number:block.number,hash:block.hash,timestampMs:block.timestampMs}),
        selector:Object.freeze({blockHash:block.hash,requireCanonical:true})});
      const reservation=budget.reserve({tier,callerId,witnessIds:pair.map(w=>w.id)});
      if(!reservation) return unavailable;
      require(typeof reservation.release==='function');lease=reservation;
      controller=new AbortController();
      const deadline=new Promise((_,reject)=>{
        timer=schedule(()=>{controller.abort();reject(Error('deadline'));},p.deadlineMs);
      });
      const tasks=pair.map(w=>Promise.resolve().then(async()=>{
        if(controller.signal.aborted) throw Error('cancelled');
        // A future RPC adapter owns handshake, safe-head resolution, canonicality
        // and byte limits. Here its completed receipt is intentionally synthetic.
        const r=await w.read(request,controller.signal);
        require(r && r.chain===request.chain && r.contract===request.contract && r.calldata===request.calldata);
        require(r.block?.number===block.number && r.block?.hash===block.hash && r.block?.timestampMs===block.timestampMs);
        require(r.canonical===true && Number.isSafeInteger(r.safeHeadNumber) && r.safeHeadNumber>=block.number);
        require(r.raw==='0x'+'0'.repeat(64) || r.raw==='0x'+'0'.repeat(63)+'1');
        return {id:w.id,raw:r.raw};
      }));
      // Track actual adapter completion separately from the observation deadline.
      // A timed-out, non-cooperative read must keep its concurrency reservation.
      allDone=Promise.allSettled(tasks);
      const answers=await Promise.race([Promise.all(tasks),deadline]);
      require(answers[0].raw===answers[1].raw);
      const end=clockValue(now);require(end>=start && end-start<p.deadlineMs && end-block.timestampMs<=p.maxAgeMs);
      return {status:'observed_unsigned',production_ready:false,request,witnesses:answers,
        result:answers[0].raw.endsWith('1')?'listed':'not_listed',observedAtMs:end};
    } catch {return unavailable;}
    finally {
      if(timer!==undefined) cancel(timer);
      controller?.abort();
      if(lease) {
        if(!allDone) lease.release();
        else void allDone.then(()=>lease.release());
      }
    }
  };
}
