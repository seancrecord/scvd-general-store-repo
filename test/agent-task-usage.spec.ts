import {SELF, env} from 'cloudflare:test';
import {expect, it} from 'vitest';
import {agentJourneyStep} from '@/lib/agent-journey';
import type {Env} from '@/types';

it('offers a fixed destination handoff without allowing an arbitrary redirect', async () => {
  const response = await SELF.fetch('https://scvd.store/go/task/preflight?url=https://attacker.invalid', {redirect:'manual'});
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('https://scvd.store/api/preflight/v1?task=preflight');
  expect((await SELF.fetch('https://scvd.store/go/task/unknown', {redirect:'manual'})).status).toBe(404);
});
it('records bounded declared task context without inventing a visitor or search source', () => {
  const step = agentJourneyStep(new Request('https://scvd.store/what?task=expenses&arrival=manual_pointer&secret=private'), 200);
  expect(step).toMatchObject({join:'unlinked', task:{id:'expenses', step:'guide', arrival:'manual_pointer', outcome:'ok'}});
  expect(JSON.stringify(step)).not.toContain('private');
  const unknown = agentJourneyStep(new Request('https://scvd.store/what?task=expenses&arrival=private-query'), 200);
  expect(unknown).toMatchObject({task:{arrival:'unknown'}});
  expect(agentJourneyStep(new Request('https://scvd.store/what?task=private-query'),200)).not.toHaveProperty('task');
});
it('keeps usage and funding details behind the existing admin gate', async () => {
  expect((await SELF.fetch('https://scvd.store/admin/bounties/contributions/reports/usage')).status).toBe(401);
  const auth = {Authorization:`Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}`};
  const response = await SELF.fetch('https://scvd.store/admin/bounties/contributions/reports/usage',{headers:auth});
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Requests, not people');
  expect((await SELF.fetch('https://scvd.store/admin/bounties/contributions/reports/funding')).status).toBe(401);
  const funding = await SELF.fetch('https://scvd.store/admin/bounties/contributions/reports/funding',{headers:auth});
  expect(funding.status).toBe(200);
  expect(await funding.text()).toContain('No spendable balance');
});

it('records task requests without adding another porch visit', async () => {
  const {recordAgentTaskUsage, readAgentTaskUsage} = await import('@/lib/metrics');
  const {KV_KEYS} = await import('@/lib/kv-keys');
  const runtime = env as unknown as Env;
  const month = '2099-01';
  const key = KV_KEYS.metric(month, 'task', 'expenses:guide:unknown:ok');
  await runtime.COUNTERS.delete(key);
  await recordAgentTaskUsage(runtime, {id:'expenses',step:'guide',arrival:'unknown',outcome:'ok'}, {}, new Date('2099-01-02T00:00:00Z'));
  const result = await readAgentTaskUsage(runtime, month);
  expect(result.rows).toContainEqual({task:'expenses',step:'guide',arrival:'unknown',outcome:'ok',bucket:'organic',count:1});
  expect(await runtime.COUNTERS.get(KV_KEYS.metric(month,'porch','agent-task'))).toBeNull();
  await runtime.COUNTERS.delete(key);
});
it('discloses unreadable usage counters rather than converting them into zero requests', async () => {
  const {readAgentTaskUsage} = await import('@/lib/metrics');
  const runtime = {...env, COUNTERS:{list:async()=>({keys:[{name:'metric:2099-02:task:expenses:guide:unknown:ok'}],list_complete:true}),get:async()=>null}} as unknown as Env;
  const result = await readAgentTaskUsage(runtime,'2099-02');
  expect(result.rows).toEqual([]);
  expect(result.unreadable).toBe(1);
});
