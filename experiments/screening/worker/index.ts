export { ScreeningBudget } from './budget';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createBaseReader, type Admission } from './rpc-reader';
import type { EvidenceSubmission } from './evidence';
import type { ReviewRequest,RecoveryApproval,RecoveryCancellation } from './recovery';

const BUDGET_ID='screening-product-provider-pair';

/** Internal qualification entrypoint. Only a trusted service may choose a tier. */
export class ScreeningReader extends WorkerEntrypoint<ScreeningQualificationEnv> {
  async observe(input: {network:string;address:string}, admission: Omit<Admission,'policyId'>) {
    try {
      const read=createBaseReader({
        providers:JSON.parse(this.env.SCREENING_PROVIDERS),policy:JSON.parse(this.env.SCREENING_READER_POLICY),
        // The coordination identity cannot come from the caller or a policy version.
        budget:this.env.SCREENING_BUDGET.getByName(BUDGET_ID),
        now:Date.now,waitUntil:p=>this.ctx.waitUntil(p),
      });
      return await read(input,admission);
    } catch {return {status:'unavailable',production_ready:false};}
  }
}

/** Separately bind only to an authenticated operator service, never the buyer path. */
export class ScreeningRecovery extends WorkerEntrypoint<ScreeningQualificationEnv> {
  private budget() {return this.env.SCREENING_BUDGET.getByName(BUDGET_ID);}
  async attention() {try{return await this.budget().attention();}catch{return {status:'unavailable'};}}
  async overview() {try{return await this.budget().recoveryOverview();}catch{return {status:'unavailable'};}}
  async history(afterSequence=0) {try{return await this.budget().recoveryHistory(afterSequence);}catch{return {status:'unavailable'};}}
  async inspect(caseId:string) {try{return await this.budget().inspectRecovery(caseId);}catch{return {status:'unavailable'};}}
  async begin(request:ReviewRequest) {try{return await this.budget().beginRecovery(request);}catch{return {status:'unavailable'};}}
  async retainEvidence(request:EvidenceSubmission) {try{return await this.budget().retainRecoveryEvidence(request);}catch{return {status:'unavailable'};}}
  async evidence(caseId:string,reference:string) {try{return await this.budget().recoveryEvidence(caseId,reference);}catch{return {status:'unavailable'};}}
  async evidenceList(caseId:string) {try{return await this.budget().recoveryEvidenceList(caseId);}catch{return {status:'unavailable'};}}
  async commit(request:RecoveryApproval) {try{return await this.budget().commitRecovery(request);}catch{return {status:'unavailable'};}}
  async cancel(request:RecoveryCancellation) {try{return await this.budget().cancelRecovery(request);}catch{return {status:'unavailable'};}}
}

/** Monitoring gets a read-only entrypoint, not the recovery authority. */
export class ScreeningMonitor extends WorkerEntrypoint<ScreeningQualificationEnv> {
  async attention() {try{return await this.env.SCREENING_BUDGET.getByName(BUDGET_ID).attention();}catch{return {status:'unavailable'};}}
}

/** Private backup authority includes sensitive raw state; bind independently. */
export class ScreeningBackup extends WorkerEntrypoint<ScreeningQualificationEnv> {
  private budget(){return this.env.SCREENING_BUDGET.getByName(BUDGET_ID);}
  async capture(id:string,previous:string|null) {try{return await this.budget().captureBackup(id,previous);}catch{return {status:'unavailable'};}}
  async manifest() {try{return await this.budget().backupManifest();}catch{return {status:'unavailable'};}}
  async page(digest:string,after=0) {try{return await this.budget().backupPage(digest,after);}catch{return {status:'unavailable'};}}
}

// Qualification Worker only. No public route can reserve, read, sign or settle.
export default { fetch() { return new Response('Not available', {status:404}); } };
