import { it,expect,vi,afterEach } from 'vitest';
import { checkScreeningAttention } from '../operator/monitor';
import { ATTENTION_LIMITS } from './attention';
const reading=(signals:string[]=[],observedAtMs=100000)=>({status:'ok',assurance:'operational_reading_not_termination_evidence',signals,observedAtMs});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('quiet and informational readings do not page or mutate the service',async()=>{
 const publish=vi.fn(async()=>{}),attention=vi.fn(async()=>reading(['admissions_held','free_capacity_exhausted']));
 expect(await checkScreeningAttention({attention},publish,()=>100000)).toEqual({readingAvailable:true,submitted:0,submissionFailures:0,deliveryConfirmed:false});
 expect(attention).toHaveBeenCalledTimes(1);expect(publish).not.toHaveBeenCalled();
});
it('stable alert keys and fixed prose ignore private untrusted details',async()=>{
 const publish=vi.fn(async()=>{}),service={attention:async()=>({...reading(['hold_aging','paid_capacity_exhausted']),detail:'https://secret.invalid/credential',caseId:'private'})};
 await checkScreeningAttention(service,publish,()=>100000);await checkScreeningAttention(service,publish,()=>100001);
 expect(publish.mock.calls[0]).toEqual(publish.mock.calls[2]);expect(publish.mock.calls[1]).toEqual(publish.mock.calls[3]);
 expect(publish.mock.calls[0]).toEqual([{condition:'worker_health',key:'screening:hold_aging',detail:expect.any(String)}]);
 expect(JSON.stringify(publish.mock.calls)).not.toMatch(/secret|credential|private/);
});
for(const [name,value] of Object.entries({missing:{},stale:reading([],100000-ATTENTION_LIMITS.maxReadingAgeMs-1),future:reading([],100001),unknown:reading(['invented']),duplicate:reading(['hold_aging','hold_aging']),unavailable:{status:'unavailable'}})) {
 it(`reports ${name} reading as unavailable rather than healthy`,async()=>{
  const publish=vi.fn(async()=>{});expect(await checkScreeningAttention({attention:async()=>value},publish,()=>100000)).toMatchObject({readingAvailable:false,submitted:1});
  expect(publish.mock.calls[0]).toEqual([{condition:'worker_health',key:'screening:reading_unavailable',detail:expect.any(String)}]);
 });
}
it('a failed or silent read produces unavailable and a late read does not publish twice',async()=>{
 vi.useFakeTimers();const publish=vi.fn(async()=>{});let resolve!:(value:unknown)=>void;
 const pending=checkScreeningAttention({attention:()=>new Promise(r=>{resolve=r;})},publish,()=>100000);
 await vi.advanceTimersByTimeAsync(ATTENTION_LIMITS.readTimeoutMs);expect(await pending).toMatchObject({readingAvailable:false,submitted:1});
 resolve(reading(['hold_aging']));await Promise.resolve();expect(publish).toHaveBeenCalledTimes(1);
 expect(await checkScreeningAttention({attention:async()=>{throw Error('private');}},publish,()=>100000)).toMatchObject({readingAvailable:false});
});
it('one channel failure does not hide another signal and no email delivery is claimed',async()=>{
 const publish=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(undefined);
 expect(await checkScreeningAttention({attention:async()=>reading(['hold_aging','reservations_aging'])},publish,()=>100000)).toEqual({readingAvailable:true,submitted:1,submissionFailures:1,deliveryConfirmed:false});
});
