import fs from 'node:fs';
const [operation, raw = '{}'] = process.argv.slice(2);
let args; try { args = JSON.parse(raw); } catch { console.error('Arguments must be JSON'); process.exit(1); }
const exclusions = ['merchant identity beyond the checked key','payment settlement','delivery','authorization of the signing key for resourceUrl, now or at issuance'];
let result;
if (operation === 'check_conformance' && ['sample-good','sample-es256'].includes(args.artifact)) {
  const unsupported = args.artifact === 'sample-es256';
  result = { status: unsupported ? 'unsupported' : 'valid', reasonCodes: unsupported ? ['unsupported_algorithm','signature_not_checked'] : [], scope: unsupported ? 'ES256 signature not checked by this instrument.' : 'Signature verified against the supplied public test key.', doesNotEstablish: exclusions };
} else if (operation === 'preflight_endpoint' && ['https://merchant.example.test/paid','https://mpp.example.test/pay'].includes(args.url)) {
  const mpp = args.url.includes('mpp.');
  result = {url:args.url,observed_at:'2026-09-17T12:00:00Z',verdict:mpp?'not_ready':'ready',protocols_spoken:mpp?['mpp']:['x402'],checks:[{name:'x402-header',ok:!mpp}],mpp:{spoken:mpp,checks:mpp?[{name:'mpp-challenge-present',ok:true}]:[]},does_not_establish:['payment settlement','delivery','permission to spend']};
} else if (operation === 'check_order' && args.order_id === 'order-sample') {
  result={order_id:args.order_id,status:'pending',settlement:'unobserved',delivery:'unobserved',retry_key:'original-retry-123'};
} else if(operation==='http_get' && args.url==='https://scvd.store/corpus/host/merchant.example.test.json') {
  result={host:'merchant.example.test',rows:[{observed_at:'2026-09-10T12:00:00Z',verdict:'ready',snapshot_url:'https://scvd.store/corpus/2026-W37.json'}],gaps:[{reason:'listed_not_walked',week:'2026-W38'}],fresh_request_to_subject:false};
} else result={error:'operation or arguments not available in this fixture-backed environment'};
fs.appendFileSync('calls.jsonl',JSON.stringify({operation,args,result})+'\n');
console.log(JSON.stringify(result));
