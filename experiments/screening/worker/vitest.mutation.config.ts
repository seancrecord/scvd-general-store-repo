import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Negative-control build only. The original test assertion must fail, not setup.
const controls = {
  backup_record_integrity:{file:'/format.ts',guard:'demand(r.sha256===recordDigest(r));',replacement:''},
  attention_rollover:{file:'/budget.ts',guard:'const rollover=s.window!==window,used=',replacement:'const rollover=false,used='},
  monitor_freshness:{file:'/monitor.ts',guard:'time-r.observedAtMs>ATTENTION_LIMITS.maxReadingAgeMs||',replacement:''},
  agreement:{file:'/rpc-reader.ts',guard:'require(answers[0]!.listed === answers[1]!.listed);'},
  reserve:{file:'/budget.ts',guard:'require(!free || p.providers.every((v,i) => s.freeUsed[i]! + v.units <= v.totalUnits-v.paidReserveUnits));'},
  retention_integrity:{file:'/evidence.ts',guard:'require(value.sha256===evidenceDigest(value.content)&&value.byteLength===new TextEncoder().encode(value.content).byteLength);'},
  recovery_revision:{file:'/budget.ts',guard:'require((s.revision??0)===approval.expectedRevision);'},
  recovery_evidence:{file:'/budget.ts',guard:'require(evidence.observedAtMs>=record.openedAtMs&&evidence.observedAtMs<=time&&time-evidence.observedAtMs<=RECOVERY_LIMITS.evidenceMaxAgeMs);',replacement:'void evidence;'},
};
const mode=process.env.SCVD_SCREENING_GUARD_MUTATION;
if(mode!=='agreement' && mode!=='reserve' && mode!=='recovery_revision' && mode!=='recovery_evidence' && mode!=='retention_integrity' && mode!=='attention_rollover' && mode!=='monitor_freshness' && mode!=='backup_record_integrity')throw Error('Choose an explicit screening negative control');
const control=controls[mode];
export default defineConfig({...base,plugins:[{
  name:'screening-negative-control',enforce:'pre',
  transform(code,id){
    if(!id.endsWith(control.file))return null;
    if(!code.includes(control.guard))throw Error('Negative-control target missing');
    return code.replace(control.guard,'replacement' in control?control.replacement:'');
  }
},...(base.plugins??[])]});
