import { env,SELF,createExecutionContext } from 'cloudflare:test';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import type { Env } from '@/types';
import { ADMIN_USERNAME,ADMIN_THROTTLE_AT } from '@/lib/admin-auth';
import { KV_KEYS } from '@/lib/kv-keys';
import { createScreeningOperatorGateway,OPERATOR_PATH,OPERATOR_ACTION_HEADER,OPERATOR_ACTION_VALUE,OPERATOR_LIMITS,readOperatorBody,type RecoveryService } from '../experiments/screening/operator/gateway';
import { RECOVERY_ACK } from '../experiments/screening/worker/recovery';

const bindings=env as Env,origin='https://scvd.store',ip='203.0.113.211';
const auth='Basic '+btoa(ADMIN_USERNAME+':test-admin-password');
function service() {
  return {attention:vi.fn(async()=>({status:'ok',signals:[]})),overview:vi.fn(async()=>({active:[]})),history:vi.fn(async(_after:number)=>({cases:[]})),inspect:vi.fn(async(_case:string)=>({status:'review'})),
    begin:vi.fn(async(_input)=>({status:'review'})),retainEvidence:vi.fn(async(_input)=>({status:'retained'})),
    evidence:vi.fn(async(_case:string,_reference:string)=>({contentTrust:'untrusted_operator_submission',evidence:{content:'<script>fixture()</script>'}})),
    evidenceList:vi.fn(async(_case:string)=>({documents:[]})),commit:vi.fn(async(_input)=>({status:'recovered'})),cancel:vi.fn(async(_input)=>({status:'cancelled'}))} satisfies RecoveryService;
}
function setup() {
  const remote=service(),resolve=vi.fn(()=>remote),app=createScreeningOperatorGateway({enabled:true,service:resolve});
  async function request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}) {
    return app.fetch(new Request(origin+OPERATOR_PATH+path,{method,headers:{Authorization:auth,'CF-Connecting-IP':ip,
      ...(method==='POST'?{'content-type':'application/json',Origin:origin,[OPERATOR_ACTION_HEADER]:OPERATOR_ACTION_VALUE}:{}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}),bindings,createExecutionContext());
  }
  return {app,remote,resolve,request};
}
beforeEach(async()=>{await bindings.COUNTERS.delete('admin_auth_fails');await bindings.COUNTERS.delete(KV_KEYS.adminFailByIp(ip));});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('gateway is disabled by default and requires both a binding and an admin secret',async()=>{
  const remote=service(),req=new Request(origin+OPERATOR_PATH+'/overview',{headers:{Authorization:auth}});
  for(const options of [{},{service:()=>remote},{enabled:true},{enabled:true,service:()=>undefined}])
    expect((await createScreeningOperatorGateway(options).fetch(req,bindings,createExecutionContext())).status).toBe(404);
  expect((await createScreeningOperatorGateway({enabled:true,service:()=>remote}).fetch(req,{...bindings,ADMIN_PASSWORD:''},createExecutionContext())).status).toBe(404);
  expect(remote.overview).not.toHaveBeenCalled();
});
it('every read and action requires the existing admin login before service lookup',async()=>{
  const {request,resolve}=setup();
  for(const [path,method] of [['/contract','GET'],['/attention','GET'],['/overview','GET'],['/history','GET'],['/cases/case_one','GET'],['/cases/case_one/evidence','GET'],['/cases/case_one/evidence/ref','GET'],['/begin','POST'],['/evidence','POST'],['/commit','POST'],['/cancel','POST']]) {
    const response=await request(path!,method!,method==='POST'?{}:undefined,{Authorization:''});
    // Reset each failure so this test checks auth, not the separately tested throttle.
    expect(response.status).toBe(401);await bindings.COUNTERS.delete(KV_KEYS.adminFailByIp(ip));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  expect(resolve).not.toHaveBeenCalled();
});
it('wrong passwords and usernames are rejected and counted by the shared gate',async()=>{
  const {request,resolve}=setup();
  expect((await request('/overview','GET',undefined,{Authorization:'Basic '+btoa(ADMIN_USERNAME+':wrong')})).status).toBe(401);
  expect((await request('/overview','GET',undefined,{Authorization:'Basic '+btoa('other:test-admin-password')})).status).toBe(401);
  expect(await bindings.COUNTERS.get(KV_KEYS.adminFailByIp(ip))).toBe('2');expect(resolve).not.toHaveBeenCalled();
});
it('existing throttles apply before the screening service is reached',async()=>{
  const {request,resolve}=setup();await bindings.COUNTERS.put(KV_KEYS.adminFailByIp(ip),String(ADMIN_THROTTLE_AT));
  const response=await request('/overview');expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBeTruthy();
  expect(resolve).not.toHaveBeenCalled();
});
it('authenticating here clears the shared failure counters',async()=>{
  const {request}=setup();await bindings.COUNTERS.put(KV_KEYS.adminFailByIp(ip),'1');await bindings.COUNTERS.put('admin_auth_fails','1');
  expect((await request('/overview')).status).toBe(200);expect(await bindings.COUNTERS.get(KV_KEYS.adminFailByIp(ip))).toBeNull();
  expect(await bindings.COUNTERS.get('admin_auth_fails')).toBeNull();
});
for(const mode of ['cross_origin','null_origin','missing_origin','cross_site','same_site','missing_action_header','wrong_action_header','form','plain_text']) {
  it(`refuses operator action ${mode} before service lookup`,async()=>{
    const {request,resolve}=setup(),headers:Record<string,string>={};
    if(mode==='cross_origin')headers.Origin='https://other.invalid';
    if(mode==='null_origin')headers.Origin='null';
    if(mode==='missing_origin')headers.Origin='';
    if(mode==='cross_site')headers['sec-fetch-site']='cross-site';
    if(mode==='same_site')headers['sec-fetch-site']='same-site';
    if(mode==='missing_action_header')headers[OPERATOR_ACTION_HEADER]='';
    if(mode==='wrong_action_header')headers[OPERATOR_ACTION_HEADER]='another-action';
    if(mode==='form')headers['content-type']='application/x-www-form-urlencoded';
    if(mode==='plain_text')headers['content-type']='text/plain';
    expect([403,415]).toContain((await request('/begin','POST',{caseId:'case_one',requestIds:['first']},headers)).status);
    expect(resolve).not.toHaveBeenCalled();
  });
}
it('foreign origins cannot read evidence even with cached credentials',async()=>{
  const {request,resolve}=setup();expect((await request('/cases/case_one/evidence/ref','GET',undefined,{Origin:'https://other.invalid'})).status).toBe(403);
  expect(resolve).not.toHaveBeenCalled();
});
it('the configured HTTPS origin is required and host/forwarded headers cannot replace it',async()=>{
  const {app,remote}=setup();
  for(const target of ['http://scvd.store','https://other.invalid']) {
    const response=await app.fetch(new Request(target+OPERATOR_PATH+'/overview',{headers:{Authorization:auth,Host:'scvd.store','X-Forwarded-Host':'scvd.store'}}),bindings,createExecutionContext());
    expect(response.status).toBe(404);
  }
  expect(remote.overview).not.toHaveBeenCalled();
});
it('each action assigns the authenticated operator and forwards the exact reviewed payload',async()=>{
  const {request,remote}=setup();
  const begin={caseId:'case_one',requestIds:['first']},evidence={caseId:'case_one',reference:'ref',kind:'executor_terminated',witnessId:null,observedAtMs:100,content:'Synthetic evidence'},
    commit={caseId:'case_one',expectedRevision:5,acknowledgement:RECOVERY_ACK,executor:{reference:'ref'},providers:[]},cancel={caseId:'case_one',expectedRevision:5};
  for(const [path,body,method] of [['/begin',begin,remote.begin],['/evidence',evidence,remote.retainEvidence],['/commit',commit,remote.commit],['/cancel',cancel,remote.cancel]] as const) {
    expect((await request(path,'POST',body)).status).toBe(200);expect(method).toHaveBeenCalledWith({...body,operator:ADMIN_USERNAME});
    expect((await request(path,'POST',{...body,operator:'forged'})).status).toBe(400);expect(method).toHaveBeenCalledTimes(1);
  }
});
it('unknown fields and missing acknowledgements cannot silently become a decision',async()=>{
  const {request,remote}=setup();
  for(const body of [{caseId:'x',requestIds:['first'],service:'other'},{caseId:'x'},JSON.parse('{"caseId":"x","requestIds":["first"],"__proto__":{"operator":"forged"}}')]) {
    const response=await request('/begin','POST',body);expect(response.status).toBe(400);
  }
  expect((await request('/commit','POST',{caseId:'case_one',expectedRevision:1,executor:{},providers:[]})).status).toBe(400);
  expect(remote.begin).not.toHaveBeenCalled();expect(remote.commit).not.toHaveBeenCalled();
});
it('the contract derives operator identity, acknowledgement and limits from their implementation',async()=>{
  const {request}=setup(),response=await request('/contract'),body=await response.json() as {operator:string;acknowledgement:string;uploadLimits:unknown};
  expect(body.operator).toBe(ADMIN_USERNAME);expect(body.acknowledgement).toBe(RECOVERY_ACK);expect(body.uploadLimits).toEqual(OPERATOR_LIMITS);
});
it('private evidence is JSON with no-store and cannot execute as an HTML document',async()=>{
  const {request,remote}=setup(),response=await request('/cases/case_one/evidence/ref');
  expect(remote.evidence).toHaveBeenCalledWith('case_one','ref');
  expect(response.headers.get('content-type')).toContain('application/json');expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(await response.json()).toMatchObject({contentTrust:'untrusted_operator_submission'});
});
it('service failures return fixed prose without echoing exception details or invoking another method',async()=>{
  const {request,remote}=setup();remote.overview.mockRejectedValueOnce(new Error('fixture-private-provider-token'));
  const response=await request('/overview');expect(response.status).toBe(503);expect(await response.json()).toEqual({status:'unavailable'});
  expect(remote.overview).toHaveBeenCalledTimes(1);expect(remote.begin).not.toHaveBeenCalled();
});
it('strict bounded history cursors cannot silently fall back to a different page',async()=>{
  const {request,remote}=setup();
  expect((await request('/history?after=12')).status).toBe(200);expect(remote.history).toHaveBeenCalledWith(12);
  for(const query of ['after=-1','after=1.5','after=NaN','after=9007199254740992','after=1&after=2','other=1'])expect((await request('/history?'+query)).status).toBe(400);
  expect(remote.history).toHaveBeenCalledTimes(1);
});
it('the production store has no screening operator route mounted',async()=>{
  expect((await SELF.fetch(origin+OPERATOR_PATH+'/overview',{headers:{Authorization:auth,'CF-Connecting-IP':'203.0.113.212'}})).status).toBe(404);
});
it('unsupported methods cannot call a recovery operation',async()=>{
  const {request,remote}=setup();
  for(const method of ['GET','PUT','DELETE','OPTIONS'])expect((await request('/commit',method)).status).toBe(404);
  expect(remote.commit).not.toHaveBeenCalled();
});
it('upload limits enforce actual streamed bytes even when Content-Length lies',async()=>{
  for(const length of [undefined,'1']) {
    let cancelled=false;
    const bytes=new TextEncoder().encode(JSON.stringify('x'.repeat(OPERATOR_LIMITS.bodyBytes)));
    const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(bytes.slice(0,OPERATOR_LIMITS.bodyBytes));c.enqueue(bytes.slice(OPERATOR_LIMITS.bodyBytes));},cancel(){cancelled=true;}});
    const request=new Request(origin,{method:'POST',body,headers:length?{'Content-Length':length}:{}});
    await expect(readOperatorBody(request)).rejects.toMatchObject({status:413});expect(cancelled).toBe(true);
  }
});
it('oversized declared bodies are refused before reading and malformed UTF-8 or JSON never parses',async()=>{
  await expect(readOperatorBody(new Request(origin,{method:'POST',body:'{}',headers:{'Content-Length':String(OPERATOR_LIMITS.bodyBytes+1)}}))).rejects.toMatchObject({status:413});
  for(const body of ['not-json',new Uint8Array([0xff])])await expect(readOperatorBody(new Request(origin,{method:'POST',body}))).rejects.toMatchObject({status:400});
});
it('stalled upload deadlines cancel the stream instead of waiting indefinitely',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});let cancelled=false;
  const pending=readOperatorBody(new Request(origin,{method:'POST',body:new ReadableStream({cancel(){cancelled=true;}})}));
  const rejected=expect(pending).rejects.toMatchObject({status:408});await vi.advanceTimersByTimeAsync(OPERATOR_LIMITS.bodyTimeoutMs);await rejected;
  expect(cancelled).toBe(true);
});

it('completed oversized JSON is refused before parsing',async()=>{
  const request=new Request(origin,{method:'POST',body:JSON.stringify('x'.repeat(OPERATOR_LIMITS.bodyBytes))});
  await expect(readOperatorBody(request)).rejects.toMatchObject({status:413});
});
it('the review page and browser module use the same login gate',async()=>{
  const {request,resolve}=setup();
  for(const path of ['', '/client.js'])expect((await request(path,'GET',undefined,{Authorization:''})).status).toBe(401);
  expect(resolve).not.toHaveBeenCalled();
});
it('the review page uses per-response CSP nonces and has no preselected consent',async()=>{
  const {request}=setup(),first=await request(''),second=await request('');
  expect(first.status).toBe(200);expect(first.headers.get('content-type')).toContain('text/html');
  const csp=first.headers.get('content-security-policy')!,html=await first.text(),nonce=csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();expect(html).toContain('nonce="'+nonce+'"');expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain('unsafe-inline');expect(csp).not.toContain('unsafe-eval');expect(csp).toContain("form-action 'none'");
  expect(second.headers.get('content-security-policy')).not.toBe(csp);expect(html).not.toContain(' checked');
  expect(html).toContain('id="approve" type="button" disabled');expect(html).toContain('id="cancel" type="button" disabled');
});
it('the browser module is served as executable source behind no-store',async()=>{
  const {request}=setup(),response=await request('/client.js'),source=await response.text();
  expect(response.headers.get('content-type')).toContain('text/javascript');expect(response.headers.get('cache-control')).toBe('no-store');
  expect(source).toContain('export function createReviewController');expect(source).toContain('export function mountReview');
});

it('private attention reading shares the gate and does not invoke recovery actions',async()=>{
 const {request,remote}=setup();const response=await request('/attention');
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toEqual({status:'ok',signals:[]});expect(remote.attention).toHaveBeenCalledTimes(1);
 expect(remote.begin).not.toHaveBeenCalled();expect(remote.commit).not.toHaveBeenCalled();expect(remote.cancel).not.toHaveBeenCalled();
 remote.attention.mockRejectedValueOnce(Error('private provider URL'));
 const failed=await request('/attention');expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('provider');
});
it('monitor submissions reuse the existing deduplicated local alert register without email',async()=>{
 const {checkScreeningAttention}=await import('../experiments/screening/operator/monitor');
 const {sendAlert}=await import('@/lib/alerts');
 const openKey='alert_open:worker_health:screening:hold_aging';await bindings.COUNTERS.delete(openKey);
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No network in this test'));
 const service={attention:async()=>({status:'ok',observedAtMs:100000,assurance:'operational_reading_not_termination_evidence',signals:['hold_aging']})};
 const publish=(input:import('@/lib/alerts').AlertInput)=>sendAlert({...bindings,RESEND_API_KEY:'',ALERT_EMAIL:''},input);
 await checkScreeningAttention(service,publish,()=>100000);
 const firstKey=await bindings.COUNTERS.get(openKey);expect(firstKey).toBeTruthy();
 await checkScreeningAttention(service,publish,()=>100000);
 expect(await bindings.COUNTERS.get(openKey)).toBe(firstKey);
 expect(await bindings.COUNTERS.get(firstKey!,'json')).toMatchObject({repeats:2});expect(fetch).not.toHaveBeenCalled();
 await bindings.COUNTERS.delete(openKey);await bindings.COUNTERS.delete(firstKey!);
});
