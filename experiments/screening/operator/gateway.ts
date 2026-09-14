import { Hono } from 'hono';
import { ATTENTION_LIMITS,ATTENTION_MESSAGES } from '../worker/attention';
import clientSource from './client.txt';
import { renderReviewPage } from './page';
import { HTTPException } from 'hono/http-exception';
import { adminGate,ADMIN_USERNAME } from '../../../src/lib/admin-auth';
import type { HonoEnv } from '../../../src/types';
import { label } from '../worker/rpc-reader';
import { EVIDENCE_LIMITS,type EvidenceSubmission } from '../worker/evidence';
import { RECOVERY_ACK,RECOVERY_LIMITS,type ReviewRequest,type RecoveryApproval,type RecoveryCancellation } from '../worker/recovery';

export const OPERATOR_PATH='/admin/screening';
export const OPERATOR_LIMITS=Object.freeze({bodyBytes:EVIDENCE_LIMITS.maxBytes*6+4096,bodyTimeoutMs:5000});
export const OPERATOR_ACTION_HEADER='x-scvd-operator-action';
export const OPERATOR_ACTION_VALUE='screening-recovery';
// The service remains authoritative for all nested payload and state validation.
export interface RecoveryService {
  attention():Promise<unknown>;overview():Promise<unknown>;history(afterSequence:number):Promise<unknown>;inspect(caseId:string):Promise<unknown>;
  begin(input:ReviewRequest):Promise<unknown>;retainEvidence(input:EvidenceSubmission):Promise<unknown>;
  evidence(caseId:string,reference:string):Promise<unknown>;evidenceList(caseId:string):Promise<unknown>;
  commit(input:RecoveryApproval):Promise<unknown>;cancel(input:RecoveryCancellation):Promise<unknown>;
}
function badRequest():never {throw new HTTPException(400,{message:'Invalid screening operator request.'});}
function fields(input:unknown,names:string[]):asserts input is Record<string,unknown> {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==names.length||!names.every(k=>Object.hasOwn(input,k)))badRequest();
}
export async function readOperatorBody(request:Request):Promise<unknown> {
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>OPERATOR_LIMITS.bodyBytes))
    throw new HTTPException(413,{message:'Screening operator request is too large.'});
  if(!request.body)badRequest();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new HTTPException(408,{message:'Screening operator upload timed out.'})),OPERATOR_LIMITS.bodyTimeoutMs);});
  try {
    while(true) {
      const part=await Promise.race([reader.read(),deadline]);if(part.done)break;
      size+=part.value.byteLength;
      if(size>OPERATOR_LIMITS.bodyBytes)throw new HTTPException(413,{message:'Screening operator request is too large.'});
      chunks.push(part.value);
    }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{badRequest();}
  } finally {
    clearTimeout(timer);void reader.cancel().catch(()=>undefined);
  }
}

/** Unmounted qualification gateway. No binding or enabled flag means no route. */
export function createScreeningOperatorGateway(options:{enabled?:boolean;service?:(env:HonoEnv['Bindings'])=>RecoveryService|undefined}={}) {
  type GatewayEnv=HonoEnv & {Variables:HonoEnv['Variables'] & {screeningRecovery:RecoveryService;screeningPageNonce?:string}};
  const app=new Hono<GatewayEnv>();
  app.onError((error,c)=>error instanceof HTTPException?error.getResponse():c.json({status:'unavailable'},503));
  app.use('*',async(c,next)=>{
    await next();
    c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');
    const nonce=c.get('screeningPageNonce');
    c.header('Content-Security-Policy',nonce?`default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`:"default-src 'none'; frame-ancestors 'none'");c.header('Referrer-Policy','no-referrer');
  });
  app.use('*',async(c,next)=>{
    if(!options.enabled||!options.service||!c.env.ADMIN_PASSWORD)return c.notFound();
    let origin:string;try{origin=new URL(c.env.STORE_BASE_URL).origin;}catch{return c.notFound();}
    if(!origin.startsWith('https://')||new URL(c.req.url).origin!==origin)return c.notFound();
    const site=c.req.header('sec-fetch-site'),suppliedOrigin=c.req.header('origin');
    if((site!==undefined&&site!=='same-origin'&&site!=='none')||(suppliedOrigin!==undefined&&suppliedOrigin!==origin))
      return c.json({status:'cross_origin_refused'},403);
    if(c.req.method==='POST') {
      if(suppliedOrigin!==origin||c.req.header(OPERATOR_ACTION_HEADER)!==OPERATOR_ACTION_VALUE)return c.json({status:'action_context_required'},403);
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(c.req.header('content-type')??''))return c.json({status:'json_required'},415);
    }
    await next();
  });
  app.use('*',adminGate);
  // Binding lookup is after authentication and never selected by request data.
  app.use('*',async(c,next)=>{
    const service=options.service?.(c.env);if(!service)return c.notFound();
    c.set('screeningRecovery',service);await next();
  });
  async function call(service:RecoveryService,operation:(service:RecoveryService)=>Promise<unknown>) {
    try {
      const result=await operation(service);
      const unavailable=!!result&&typeof result==='object'&&Reflect.get(result,'status')==='unavailable';
      return new Response(JSON.stringify(result),{status:unavailable?503:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
    }catch{return Response.json({status:'unavailable'},{status:503});}
  }
  function caseId(value:string|undefined):string {if(typeof value!=='string'||!label(value))badRequest();return value;}
  app.get(OPERATOR_PATH,c=>{const nonce=crypto.randomUUID();c.set('screeningPageNonce',nonce);return c.html(renderReviewPage(OPERATOR_PATH,nonce));});
  app.get(OPERATOR_PATH+'/client.js',c=>{c.header('Content-Type','text/javascript; charset=utf-8');return c.body(clientSource);});
  app.get(OPERATOR_PATH+'/contract',c=>c.json({operator:ADMIN_USERNAME,acknowledgement:RECOVERY_ACK,evidenceLimits:EVIDENCE_LIMITS,uploadLimits:OPERATOR_LIMITS,recoveryLimits:RECOVERY_LIMITS,actionHeader:OPERATOR_ACTION_HEADER,actionValue:OPERATOR_ACTION_VALUE,experimental:true,attentionLimits:ATTENTION_LIMITS,attentionMessages:ATTENTION_MESSAGES}));
  app.get(OPERATOR_PATH+'/attention',c=>call(c.get('screeningRecovery'),s=>s.attention()));
  app.get(OPERATOR_PATH+'/overview',c=>call(c.get('screeningRecovery'),s=>s.overview()));
  app.get(OPERATOR_PATH+'/history',c=>{
    const params=new URL(c.req.url).searchParams,after=params.get('after')??'0';
    if([...params.keys()].some(k=>k!=='after')||params.getAll('after').length>1||!/^\d+$/.test(after)||!Number.isSafeInteger(Number(after)))badRequest();
    return call(c.get('screeningRecovery'),s=>s.history(Number(after)));
  });
  app.get(OPERATOR_PATH+'/cases/:caseId',c=>{const id=caseId(c.req.param('caseId'));return call(c.get('screeningRecovery'),s=>s.inspect(id));});
  app.get(OPERATOR_PATH+'/cases/:caseId/evidence',c=>{const id=caseId(c.req.param('caseId'));return call(c.get('screeningRecovery'),s=>s.evidenceList(id));});
  app.get(OPERATOR_PATH+'/cases/:caseId/evidence/:reference',c=>{const id=caseId(c.req.param('caseId')),reference=caseId(c.req.param('reference'));return call(c.get('screeningRecovery'),s=>s.evidence(id,reference));});
  app.post(OPERATOR_PATH+'/begin',async c=>{
    const body=await readOperatorBody(c.req.raw);fields(body,['caseId','requestIds']);
    return call(c.get('screeningRecovery'),s=>s.begin({...body as Omit<ReviewRequest,'operator'>,operator:ADMIN_USERNAME}));
  });
  app.post(OPERATOR_PATH+'/evidence',async c=>{
    const body=await readOperatorBody(c.req.raw);fields(body,['caseId','reference','kind','witnessId','observedAtMs','content']);
    return call(c.get('screeningRecovery'),s=>s.retainEvidence({...body as Omit<EvidenceSubmission,'operator'>,operator:ADMIN_USERNAME}));
  });
  app.post(OPERATOR_PATH+'/commit',async c=>{
    const body=await readOperatorBody(c.req.raw);fields(body,['caseId','expectedRevision','acknowledgement','executor','providers']);
    return call(c.get('screeningRecovery'),s=>s.commit({...body as Omit<RecoveryApproval,'operator'>,operator:ADMIN_USERNAME}));
  });
  app.post(OPERATOR_PATH+'/cancel',async c=>{
    const body=await readOperatorBody(c.req.raw);fields(body,['caseId','expectedRevision']);
    return call(c.get('screeningRecovery'),s=>s.cancel({...body as Omit<RecoveryCancellation,'operator'>,operator:ADMIN_USERNAME}));
  });
  return app;
}
