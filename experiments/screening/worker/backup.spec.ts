import { env,runInDurableObject } from 'cloudflare:test';
import { it,expect } from 'vitest';
import { BudgetStore } from './budget';
import { budgetPolicy } from './fixtures';
import { retainApprovalEvidence,fixtureApproval } from './evidence-fixtures';
import { BackupSource } from '../backup/source';
import { verifyBackup,type BackupRecord } from '../backup/format';
const stub=()=>env.SCREENING_BUDGET.getByName(crypto.randomUUID());
const request=(id:string)=>({id,caller:id,tier:'paid' as const,policyId:budgetPolicy.id});
const collect=(source:BackupSource,sha:string)=>{const rows:BackupRecord[]=[];let after=0;for(;;){const p=source.page(sha,after);rows.push(...p.records);if(p.done)return rows;after=p.next;}};
it('a frozen paginated backup preserves raw bytes and remains unchanged after live completion',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);const lease=await store.reserve(request('first'));
  await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});await retainApprovalEvidence(store);
  const before=store.snapshot(),source=new BackupSource(state.storage,budgetPolicy,()=>100000),saved=await source.capture('snapshot_one',null);
  const rows=collect(source,saved.manifestSha256);expect(saved.manifest.counts).toEqual({budget:1,cases:1,evidence:3});
  expect(verifyBackup(saved.manifest,saved.manifestSha256,rows,(kind,key,subkey='')=>rows.find(r=>r.kind===kind&&r.key===key&&r.subkey===subkey))).toMatchObject({verified:true,admissionsEnabled:false});
  expect(rows[0]!.body).toContain(lease!.token);expect(store.snapshot()).toEqual(before);
  await store.release(lease!.token);expect(collect(source,saved.manifestSha256)).toEqual(rows);
  expect(await source.capture('snapshot_one',null)).toEqual(saved);
  expect(await new BackupSource(state.storage,budgetPolicy,()=>200000).capture('snapshot_one',null)).toEqual(saved);
 });
});
it('replacing staging requires the current digest and never erases canonical history',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);await store.reserve(request('first'));
  const source=new BackupSource(state.storage,budgetPolicy,()=>100000),first=await source.capture('one',null);
  await expect(source.capture('two',null)).rejects.toThrow('screening_backup_unavailable');expect(source.manifest()).toEqual(first);
  const next=await source.capture('two',first.manifestSha256);expect(next.manifest.snapshotId).toBe('two');expect(store.snapshot().active).toBe(1);
  expect(()=>source.page(first.manifestSha256,0)).toThrow();expect(()=>source.page(next.manifestSha256,99)).toThrow();
 });
});
it('completed recovery retains approval documents and refuses edited or missing evidence on export',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);await store.reserve(request('first'));await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});await retainApprovalEvidence(store);
  expect((await store.commitRecovery(fixtureApproval(store.recoveryOverview().revision))).status).toBe('recovered');
  const source=new BackupSource(state.storage,budgetPolicy,()=>100000),saved=await source.capture('valid',null);
  const original=state.storage.sql.exec<{body:string}>("SELECT body FROM screening_evidence WHERE reference='executor_evidence'").one().body;
  const changed=JSON.parse(original);changed.content='edited';state.storage.sql.exec("UPDATE screening_evidence SET body=? WHERE reference='executor_evidence'",JSON.stringify(changed));
  await expect(source.capture('edited',saved.manifestSha256)).rejects.toThrow();expect(source.manifest()).toEqual(saved);
  state.storage.sql.exec("DELETE FROM screening_evidence WHERE reference='executor_evidence'");
  await expect(source.capture('missing',saved.manifestSha256)).rejects.toThrow();expect(source.manifest()).toEqual(saved);
 });
});
it('snapshot write failure rolls back staging and leaves live state untouched',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);await store.reserve(request('first'));
  const source=new BackupSource(state.storage,budgetPolicy,()=>100000),saved=await source.capture('first',null),rows=collect(source,saved.manifestSha256),before=store.snapshot();
  state.storage.sql.exec("CREATE TRIGGER refuse_export BEFORE INSERT ON screening_export_rows BEGIN SELECT RAISE(ABORT,'fixture_failure'); END");
  await expect(source.capture('next',saved.manifestSha256)).rejects.toThrow();expect(source.manifest()).toEqual(saved);expect(collect(source,saved.manifestSha256)).toEqual(rows);expect(store.snapshot()).toEqual(before);
 });
});
it('snapshot paging is bounded and cannot silently mix revisions or omit its trailing row',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);
  for(let i=0;i<20;i++){now+=budgetPolicy.windowMs;const l=await store.reserve(request('request_'+i));await store.beginRecovery({caseId:'case_'+i,operator:'keeper',requestIds:['request_'+i]});await store.cancelRecovery({caseId:'case_'+i,operator:'keeper',expectedRevision:store.recoveryOverview().revision});await store.release(l!.token);}
  const source=new BackupSource(state.storage,budgetPolicy,()=>now),saved=await source.capture('paged',null),first=source.page(saved.manifestSha256);
  expect(first.done).toBe(false);expect(first.records.length).toBeLessThan(saved.manifest.rows);expect(collect(source,saved.manifestSha256)).toHaveLength(saved.manifest.rows);
  state.storage.sql.exec('DELETE FROM screening_export_rows WHERE n=?',saved.manifest.rows);
  expect(()=>collect(source,saved.manifestSha256)).toThrow();
 });
});
it('empty state has a complete export and backwards time cannot create a replacement',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);let time=100000;const source=new BackupSource(state.storage,budgetPolicy,()=>time),saved=await source.capture('empty',null);
  expect(collect(source,saved.manifestSha256)[0]!.body).toBe('null');await store.reserve(request('first'));time--;
  await expect(source.capture('past',saved.manifestSha256)).rejects.toThrow();expect(source.manifest()).toEqual(saved);
 });
});
it('snapshot paging refuses modified staged bytes before returning them',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);await store.reserve(request('first'));const source=new BackupSource(state.storage,budgetPolicy,()=>100000),saved=await source.capture('snapshot',null);
  const body=state.storage.sql.exec<{body:string}>('SELECT body FROM screening_export_rows WHERE n=1').one().body;
  state.storage.sql.exec('UPDATE screening_export_rows SET body=? WHERE n=1',body+' ');expect(()=>source.page(saved.manifestSha256)).toThrow();
 });
});
it('oversized rows refuse capture without replacing the previous snapshot',async()=>{
 const {BACKUP_LIMITS}=await import('../backup/format');
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);await store.reserve(request('first'));await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});
  const source=new BackupSource(state.storage,budgetPolicy,()=>100000),saved=await source.capture('initial',null);
  const body=JSON.parse(state.storage.sql.exec<{body:string}>('SELECT body FROM screening_recovery').one().body);body.padding='x'.repeat(BACKUP_LIMITS.caseBytes);
  state.storage.sql.exec('UPDATE screening_recovery SET body=?',JSON.stringify(body));
  await expect(source.capture('oversized',saved.manifestSha256)).rejects.toThrow();expect(source.manifest()).toEqual(saved);
 });
});
it('backup authority is absent from recovery, monitoring and buyer entrypoints',async()=>{
 const {ScreeningReader,ScreeningRecovery,ScreeningMonitor,ScreeningBackup}=await import('./index');
 for(const Class of [ScreeningReader,ScreeningRecovery,ScreeningMonitor])for(const method of ['capture','manifest','page'])expect(Object.hasOwn(Class.prototype,method)).toBe(false);
 expect(Object.getOwnPropertyNames(ScreeningBackup.prototype).filter(n=>!['constructor','budget'].includes(n)).sort()).toEqual(['capture','manifest','page']);
});
it('captures a review opened after the accounting window without resetting credit',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);await store.reserve(request('old'));
  const spent=store.snapshot().used;now+=budgetPolicy.windowMs;
  await store.beginRecovery({caseId:'late_review',operator:'keeper',requestIds:['old']});
  const source=new BackupSource(state.storage,budgetPolicy,()=>now);
  await expect(source.capture('late_snapshot',null)).resolves.toMatchObject({manifest:{counts:{budget:1,cases:1,evidence:0}}});
  expect(store.snapshot().used).toEqual(spent);expect(store.recoveryOverview().admissionsHeld).toBe(true);
 });
});
