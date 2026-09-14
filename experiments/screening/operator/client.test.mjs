import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
let source=await readFile(new URL('./client.txt',import.meta.url),'utf8');
const mutation=process.env.SCVD_REVIEW_UI_MUTATION;
if(mutation){
  const controls={ack:['if(!state.ack||!ready())','if(!ready())'],retry:['const {path,body}=clone(state.pending);','const {path,body}=clone(state.pending);body.expectedRevision=state.review.revision;']};
  assert.ok(controls[mutation],'Choose an explicit UI negative control');const [before,after]=controls[mutation];assert.ok(source.includes(before));source=source.replace(before,after);
}
const {createReviewController}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const hash=s=>createHash('sha256').update(s).digest('hex');
function setup({held=true}={}) {
  let time=100000;
  const record={caseId:'case_one',status:'open',policyId:'test_policy',openedAtMs:100000,targets:[{id:'first',tier:'paid'}],witnessIds:['alpha','beta']};
  const review={revision:2,admissionsHeld:true,record,stillActive:['first']};
  const documents=[{reference:'executor',kind:'executor_terminated',witnessId:null},...record.witnessIds.map(witnessId=>({reference:witnessId,kind:'no_active_provider_requests',witnessId}))].map(d=>({...d,caseId:record.caseId,observedAtMs:100000,scopeSha256:'scope',content:'Fixture evidence '+d.reference})).map(d=>({...d,sha256:hash(d.content)}));
  const overview={caseId:held?'case_one':null,admissionsHeld:held,active:[{id:'first',tier:'paid',ageMs:0}]};
  const contract={acknowledgement:'Fixture acknowledgement',recoveryLimits:{evidenceMaxAgeMs:300000},evidenceLimits:{maxBytes:16384}};
  const calls=[];let postImpl=async(path,body)=>{
    if(path==='/commit'){review.record.status='recovered';review.record.final={approval:structuredClone(body)};review.admissionsHeld=false;overview.admissionsHeld=false;overview.caseId=null;return {status:'recovered'};}
    if(path==='/begin'){overview.admissionsHeld=true;overview.caseId=body.caseId;record.caseId=body.caseId;return {status:'review'};}
    if(path==='/cancel')return {status:'cancelled'};
    if(path==='/evidence')return {status:'retained'};
  };
  let getImpl=async path=>{
    if(path==='/contract')return contract;
    if(path==='/overview')return overview;
    if(path.startsWith('/history'))return {cases:[],retained:0,returned:0,nextSequence:0};
    if(path==='/cases/'+record.caseId)return review;
    if(path==='/cases/'+record.caseId+'/evidence')return {documents:documents.map(({content,...metadata})=>metadata)};
    const d=documents.find(d=>path==='/cases/'+record.caseId+'/evidence/'+d.reference);
    if(d)return {contentTrust:'untrusted_operator_submission',evidence:d};
    throw Error('unknown fixture path');
  };
  const controller=createReviewController({get:async path=>{calls.push({method:'GET',path});return structuredClone(await getImpl(path));},post:async(path,body)=>{calls.push({method:'POST',path,body:structuredClone(body)});return postImpl(path,body);},now:()=>time});
  return {controller,calls,record,review,documents,overview,contract,setTime:n=>time=n,setPost:fn=>postImpl=fn,setGet:fn=>getImpl=fn,posts:()=>calls.filter(c=>c.method==='POST')};
}
async function ready(f) {await f.controller.load();for(const d of f.documents){await f.controller.readDocument(d.reference);f.controller.useViewed();}f.controller.acknowledge(true);assert.equal(f.controller.snapshot().canApprove,true);}
test('loading and reading never send a mutation',async()=>{const f=setup();await f.controller.load();await f.controller.history(0);await f.controller.readDocument('executor');assert.equal(f.posts().length,0);});
test('approval needs every document read and selected plus explicit acknowledgement',async()=>{const f=setup();await f.controller.load();f.controller.acknowledge(true);await f.controller.commit();assert.equal(f.posts().length,0);for(const d of f.documents){await f.controller.readDocument(d.reference);f.controller.useViewed();}await f.controller.commit();assert.equal(f.posts().length,0);f.controller.acknowledge(true);await f.controller.commit();assert.equal(f.posts().length,1);});
test('approval sends the exact displayed revision, roles and document digests',async()=>{const f=setup();await ready(f);await f.controller.commit();const body=f.posts()[0].body;assert.equal(body.expectedRevision,2);assert.equal(body.caseId,'case_one');assert.equal(body.acknowledgement,f.contract.acknowledgement);assert.equal(body.executor.sha256,f.documents[0].sha256);assert.deepEqual(body.providers.map(v=>v.witnessId),f.record.witnessIds);assert.equal('operator' in body,false);assert.equal(f.controller.snapshot().ack,false);});
test('refreshing or replacing a selection clears consent',async()=>{const f=setup();await ready(f);await f.controller.readDocument('executor');assert.equal(f.controller.snapshot().ack,false);f.controller.useViewed();f.controller.acknowledge(true);assert.equal(f.controller.snapshot().canApprove,true);await f.controller.load();assert.equal(f.controller.snapshot().canApprove,false);assert.deepEqual(f.controller.snapshot().selected,{});});
test('expired evidence cannot be approved even after the checkbox was ticked',async()=>{const f=setup();await ready(f);f.setTime(400001);await f.controller.commit();assert.equal(f.posts().length,0);assert.equal(f.controller.snapshot().ack,false);});
test('normal completion or wrong target lists prevent approval',async()=>{const f=setup();f.review.stillActive=[];await f.controller.load();for(const d of f.documents){await f.controller.readDocument(d.reference);f.controller.useViewed();}f.controller.acknowledge(true);await f.controller.commit();assert.equal(f.posts().length,0);});
test('tampered document bytes cannot become a reviewed selection',async()=>{const f=setup();await f.controller.load();f.documents[0].content='Altered bytes';await f.controller.readDocument('executor');f.controller.useViewed();assert.deepEqual(f.controller.snapshot().selected,{});assert.equal(f.controller.snapshot().viewed,null);});
test('a document from another case or changed metadata cannot be selected',async()=>{for(const field of ['caseId','scopeSha256','observedAtMs']){const f=setup();await f.controller.load();f.documents[0][field]=field==='observedAtMs'?100001:'other';await f.controller.readDocument('executor');f.controller.useViewed();assert.deepEqual(f.controller.snapshot().selected,{});}});
test('lost decision response pauses all mutations and never retries automatically',async()=>{const f=setup();await ready(f);f.setPost(async()=>{throw Error('lost');});await f.controller.commit();await f.controller.cancel();await f.controller.upload({reference:'new'});await f.controller.hold('new_case',['first']);await f.controller.retry();assert.equal(f.posts().length,1);assert.equal(f.controller.snapshot().pending.path,'/commit');assert.equal(f.controller.snapshot().ack,false);});
test('explicit retry after inspection preserves the original payload including stale revision',async()=>{const f=setup();await ready(f);f.setPost(async()=>{throw Error('lost');});await f.controller.commit();f.review.revision=5;await f.controller.load();assert.equal(f.posts().length,1);await f.controller.retry();assert.deepEqual(f.posts()[1],f.posts()[0]);assert.equal(f.posts()[1].body.expectedRevision,2);});
test('setting aside an inspected attempt demands a fresh document review and acknowledgement',async()=>{const f=setup();await ready(f);f.setPost(async()=>{throw Error('refused');});await f.controller.commit();f.controller.discardAttempt();assert.ok(f.controller.snapshot().pending);f.review.revision=5;await f.controller.load();f.controller.discardAttempt();assert.equal(f.controller.snapshot().pending,null);await f.controller.commit();assert.equal(f.posts().length,1);assert.equal(f.controller.snapshot().ack,false);assert.deepEqual(f.controller.snapshot().selected,{});});
test('a lost successful commit can be inspected and explicitly replayed after the hold is gone',async()=>{const f=setup();await ready(f);let original;f.setPost(async(path,body)=>{original=body;f.record.status='recovered';f.review.admissionsHeld=false;f.overview.admissionsHeld=false;f.overview.caseId=null;throw Error('lost');});await f.controller.commit();await f.controller.load();assert.equal(f.controller.snapshot().review.record.status,'recovered');f.controller.discardAttempt();assert.ok(f.controller.snapshot().pending);f.setPost(async(path,body)=>{assert.deepEqual(body,original);return {status:'recovered'};});await f.controller.retry();assert.equal(f.controller.snapshot().pending,null);assert.equal(f.posts().length,2);});
test('duplicate clicks during an outstanding action produce one request',async()=>{const f=setup();await ready(f);let finish;f.setPost(()=>new Promise(resolve=>{finish=resolve;}));const first=f.controller.commit();await f.controller.commit();await f.controller.cancel();assert.equal(f.posts().length,1);finish({status:'recovered'});await first;});
test('a failed refresh removes old actionable state',async()=>{const f=setup();await ready(f);f.setGet(async()=>{throw Error('unavailable');});await f.controller.load();assert.equal(f.controller.snapshot().overview,null);assert.equal(f.controller.snapshot().review,null);await f.controller.commit();await f.controller.hold('other',['first']);assert.equal(f.posts().length,0);});
test('cancel requires its own explicit decision and uses the displayed revision',async()=>{const f=setup();await f.controller.load();await f.controller.cancel();assert.equal(f.posts().length,0);f.controller.acknowledgeCancel(true);await f.controller.cancel();assert.deepEqual(f.posts()[0].body,{caseId:'case_one',expectedRevision:2});});
test('holds use only explicitly selected active IDs and preserve a lost attempt',async()=>{const f=setup({held:false});await f.controller.load();await f.controller.hold('case_two',[]);await f.controller.hold('case_two',['unknown']);assert.equal(f.posts().length,0);f.setPost(async()=>{throw Error('lost');});await f.controller.hold('case_two',['first']);assert.deepEqual(f.controller.snapshot().pending.body,{caseId:'case_two',requestIds:['first']});});
test('evidence upload is tied to the shown case and clears approval',async()=>{const f=setup();await ready(f);f.setPost(async()=>{throw Error('lost');});await f.controller.upload({caseId:'forged',reference:'new_document',content:'fixture'});assert.equal(f.posts()[0].body.caseId,'case_one');assert.equal(f.controller.snapshot().ack,false);});
test('an unrecognized success-shaped action response is uncertain',async()=>{const f=setup();await ready(f);f.setPost(async()=>({status:'ok'}));await f.controller.commit();assert.ok(f.controller.snapshot().pending);assert.equal(f.controller.snapshot().ack,false);});
test('a successful recovery keeps its final case visible after admissions reopen',async()=>{const f=setup();await ready(f);await f.controller.commit();assert.equal(f.controller.snapshot().review?.record.status,'recovered');assert.equal(f.controller.snapshot().overview.admissionsHeld,false);});
test('approval and cancellation confirmations are mutually exclusive',async()=>{const f=setup();await ready(f);f.controller.acknowledgeCancel(true);assert.equal(f.controller.snapshot().ack,false);f.controller.acknowledge(true);assert.equal(f.controller.snapshot().cancelAck,false);});

// The rendered text comes from the served module, including unavailable/stale state.
test('attention wording treats missing and stale readings as unavailable',async()=>{
 const {describeAttention}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const contract={attentionLimits:{maxReadingAgeMs:1000},attentionMessages:{held:'Held <script>literal</script>'}};
 assert.match(describeAttention(null,contract,10000),/unavailable/);
 assert.match(describeAttention({status:'ok',observedAtMs:8999,signals:[]},contract,10000),/stale/);
 assert.match(describeAttention({status:'ok',observedAtMs:10000,signals:['unknown']},contract,10000),/unavailable/);
 assert.match(describeAttention({status:'ok',observedAtMs:10000,signals:['held']},contract,10000),/Held <script>literal<\/script>/);
 assert.match(describeAttention({status:'ok',observedAtMs:10000,signals:[]},contract,10000),/does not test providers/);
});
