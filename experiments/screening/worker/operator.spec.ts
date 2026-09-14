import { env,createExecutionContext } from 'cloudflare:test';
import { it,expect,vi } from 'vitest';
import type { Env } from '../../../src/types';
import { ADMIN_USERNAME } from '../../../src/lib/admin-auth';
import { createScreeningOperatorGateway,OPERATOR_PATH,OPERATOR_ACTION_HEADER,OPERATOR_ACTION_VALUE,type RecoveryService } from '../operator/gateway';
import { budgetPolicy } from './fixtures';
import { evidenceInputs,fixtureApproval } from './evidence-fixtures';

it('authenticated gateway retains real SQLite evidence and releases only the reviewed lease',async()=>{
  const now=vi.spyOn(Date,'now').mockReturnValue(100000);
  try {
    const budget=env.SCREENING_BUDGET.getByName(crypto.randomUUID());
    const input={id:'first',caller:'buyer',tier:'paid' as const,policyId:budgetPolicy.id};
    const lease=await budget.reserve(input);expect(lease).not.toBeNull();
    const initial=await budget.snapshot();
    const service:RecoveryService={attention:()=>budget.attention(),overview:()=>budget.recoveryOverview(),history:n=>budget.recoveryHistory(n),inspect:id=>budget.inspectRecovery(id),
      begin:r=>budget.beginRecovery(r),retainEvidence:r=>budget.retainRecoveryEvidence(r),evidence:(id,ref)=>budget.recoveryEvidence(id,ref),
      evidenceList:id=>budget.recoveryEvidenceList(id),commit:r=>budget.commitRecovery(r),cancel:r=>budget.cancelRecovery(r)};
    const app=createScreeningOperatorGateway({enabled:true,service:()=>service});
    const origin='https://scvd.store';
    // These are real local namespaces configured only by vitest, absent from deployment Env.
    const kv=(name:string)=>Reflect.get(env,name) as KVNamespace;
    const bindings:Env={COUNTERS:kv('COUNTERS'),ORDERS:kv('ORDERS'),GUESTBOOK:kv('GUESTBOOK'),PATRONS:kv('PATRONS'),
      ADMIN_PASSWORD:'test-admin-password',STORE_BASE_URL:origin,PAY_TO_ADDRESS:'',CDP_API_KEY_ID:'',CDP_API_KEY_SECRET:'',SIGNING_KEY:''};
    async function request(path:string,body?:unknown) {
      return app.fetch(new Request(origin+OPERATOR_PATH+path,{method:body===undefined?'GET':'POST',headers:{
        Authorization:'Basic '+btoa(ADMIN_USERNAME+':test-admin-password'),'CF-Connecting-IP':'203.0.113.220',
        Origin:origin,'Content-Type':'application/json',[OPERATOR_ACTION_HEADER]:OPERATOR_ACTION_VALUE},
        ...(body===undefined?{}:{body:JSON.stringify(body)})}),bindings,createExecutionContext());
    }
    expect((await request('/begin',{caseId:'case_one',requestIds:['first']})).status).toBe(200);
    const held=await budget.inspectRecovery('case_one');
    const noBytes=fixtureApproval(held.revision),{operator:discard,...unsigned}=noBytes;void discard;
    expect((await request('/commit',unsigned)).status).toBe(503);expect((await budget.recoveryOverview()).admissionsHeld).toBe(true);
    for(const {operator,...document} of evidenceInputs()){void operator;expect((await request('/evidence',document)).status).toBe(200);}
    const inspected=await request('/cases/case_one'),review=await inspected.json() as {revision:number};
    const {operator,...approval}=fixtureApproval(review.revision);void operator;
    expect((await request('/commit',{...approval,operator:'forged'})).status).toBe(400);
    const response=await request('/commit',approval);expect(response.status).toBe(200);
    const receipt=await response.json();expect(await (await request('/commit',approval)).json()).toEqual(receipt);
    expect(receipt).toMatchObject({record:{final:{operator:ADMIN_USERNAME,slotsReleased:1,creditsRefunded:false,evidenceRetention:'private_bytes_checked_at_decision_v1'}}});
    const after=await budget.snapshot();expect(after.active).toBe(0);expect(after.used).toEqual(initial.used);expect(after.requests).toBe(initial.requests);
    const documentResponse=await request('/cases/case_one/evidence/'+evidenceInputs()[0]!.reference);
    expect(documentResponse.headers.get('cache-control')).toBe('no-store');
    expect(await documentResponse.json()).toMatchObject({contentTrust:'untrusted_operator_submission',evidence:{content:evidenceInputs()[0]!.content}});
  } finally {now.mockRestore();}
});
