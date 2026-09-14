import type { AlertInput } from '../../../src/lib/alerts';
import { ATTENTION_LIMITS,ATTENTION_MESSAGES,type AttentionCode } from '../worker/attention';

export interface MonitorService {attention():Promise<unknown>}
const informational=new Set<AttentionCode>(['admissions_held','free_capacity_exhausted']);
const unavailable:AlertInput={condition:'worker_health',key:'screening:reading_unavailable',detail:'The screening operational reading is unavailable or stale. Check the monitor and private service; silence is not evidence of available capacity.'};

/** Unscheduled adapter. The host supplies its existing deduplicated alert channel. */
export async function checkScreeningAttention(service:MonitorService,publish:(input:AlertInput)=>Promise<void>,now:()=>number=Date.now) {
  let timer:ReturnType<typeof setTimeout>|undefined,inputs:AlertInput[]=[unavailable],readingAvailable=false;
  try {
    const value=await Promise.race([service.attention(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('reading_timeout')),ATTENTION_LIMITS.readTimeoutMs);})]);
    if(!value||typeof value!=='object')throw Error('invalid_reading');
    const r=value as Record<string,unknown>,time=now();
    if(r.status!=='ok'||r.assurance!=='operational_reading_not_termination_evidence'||!Number.isSafeInteger(time)||
      typeof r.observedAtMs!=='number'||!Number.isSafeInteger(r.observedAtMs)||r.observedAtMs<0||time<r.observedAtMs||time-r.observedAtMs>ATTENTION_LIMITS.maxReadingAgeMs||
      !Array.isArray(r.signals)||r.signals.length>Object.keys(ATTENTION_MESSAGES).length||new Set(r.signals).size!==r.signals.length||
      !r.signals.every(c=>typeof c==='string'&&Object.hasOwn(ATTENTION_MESSAGES,c)))throw Error('invalid_reading');
    readingAvailable=true;
    inputs=(r.signals as AttentionCode[]).filter(code=>!informational.has(code)).map(code=>({condition:'worker_health',key:'screening:'+code,detail:ATTENTION_MESSAGES[code]}));
  }catch {/* Fixed prose only: no provider/service error or private evidence in alerts. */}
  finally {clearTimeout(timer);}
  const outcomes=await Promise.allSettled(inputs.map(input=>Promise.resolve().then(()=>publish(input))));
  return {readingAvailable,submitted:outcomes.filter(r=>r.status==='fulfilled').length,submissionFailures:outcomes.filter(r=>r.status==='rejected').length,
    // The existing channel may log, deduplicate or suppress email. It does not acknowledge delivery.
    deliveryConfirmed:false as const};
}
