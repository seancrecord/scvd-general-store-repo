import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url));
const result=await build({stdin:{contents:`export {BudgetStore} from '../worker/budget';export {BackupSource} from './source';export {OfflineRestore} from './restore';export * from './format';export {budgetPolicy} from '../worker/fixtures';export {retainApprovalEvidence,fixtureApproval} from '../worker/evidence-fixtures';`,resolveDir:here,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',target:'node22',plugins:[{name:'backup-negative-control',setup(b){if(!process.env.SCVD_BACKUP_MUTATION)return;assert.equal(process.env.SCVD_BACKUP_MUTATION,'manifest');b.onLoad({filter:/backup\/format\.ts$/},args=>{const source=readFileSync(args.path,'utf8'),guard='manifestDigest(m)===expected';assert.ok(source.includes(guard));return {contents:source.replace(guard,'true'),loader:'ts'};});}},{name:'offline-test-runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class DurableObject {}'}));}}]});
export const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
function storage(db) {
 return {sql:{exec(sql,...params){const rows=db.prepare(sql).all(...params);return {toArray:()=>rows,one:()=>{assert.equal(rows.length,1);return rows[0];},*[Symbol.iterator](){yield* rows;}};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},async sync(){}};
}
export async function fixture({closed=false}={}) {
 const db=new DatabaseSync(':memory:'),s=storage(db),store=new api.BudgetStore(s,api.budgetPolicy,()=>100000);
 await store.reserve({id:'first',caller:'fixture_buyer',tier:'paid',policyId:api.budgetPolicy.id});
 await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});await api.retainApprovalEvidence(store);
 if(closed)assert.equal((await store.commitRecovery(api.fixtureApproval(store.recoveryOverview().revision))).status,'recovered');
 const source=new api.BackupSource(s,api.budgetPolicy,()=>100000),saved=await source.capture('snapshot_one',null),rows=[];let after=0;
 for(;;){const page=source.page(saved.manifestSha256,after);rows.push(...page.records);if(page.done)break;after=page.next;}
 db.close();return {...saved,rows};
}
