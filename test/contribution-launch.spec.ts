import {SELF, env, runInDurableObject} from 'cloudflare:test';
import {expect, it, beforeEach, afterEach, vi} from 'vitest';
import {adminContributionRoutes} from '@/routes/contribution-tasks';
import {renderContributionDesk} from '@/pages/admin/contribution-tasks';
import * as kvRetry from '@/lib/kv-retry';
import type {Env} from '@/types';
const bindings = env as unknown as Env;
const base = 'https://scvd.store';
const path = '/admin/bounties/contributions/launch-first-round';
const auth = {Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`};
const clock = Date.parse('2026-10-14T19:00:00Z');
const ids = ['aura', 'census', 'package', 'discovery'].map(kind => `pilot-2026-10-14-${kind}-auth`);
beforeEach(async () => {
  vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(clock);
  for (const id of [...ids, ...ids.map(id => id.replace(/-auth$/, ""))]) {
    await runInDurableObject(bindings.CONTRIBUTION_TASKS!.getByName(id), async (_instance, state) => {await state.storage.deleteAll();});
    await bindings.COUNTERS.delete(`contribution_task:${id}`);
  }
});
afterEach(() => {vi.restoreAllMocks(); vi.useRealTimers();});
function press(body = '', origin = base) {
  return adminContributionRoutes.request(base + '/launch-first-round', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded', Origin:origin}, body}, bindings);
}
it('offers one complete bounded round without asking the keeper to fill forms', () => {
  const html = renderContributionDesk({tasks:[],truncated:false,cursor:null,indexing_note:''},null,clock,base);
  expect(html).toContain(`action="${path}"`);
  expect(html).toContain('Post first round — $10 maximum');
});
it('posts four fixed briefs and safely replays without reopening closed work', async () => {
  const response = await press();
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('First round saved');
  const stores = ids.map(id => bindings.CONTRIBUTION_TASKS!.getByName(id));
  const original = await Promise.all(stores.map(s => s.adminView()));
  expect(original.every(Boolean)).toBe(true);
  expect(original.reduce((sum,s) => sum + s!.terms.reward_usd * s!.terms.slots,0)).toBe(10);
  await stores[0]!.act('close',{},'',clock);
  await bindings.COUNTERS.delete(`contribution_task:${ids[0]}`);
  expect((await press()).status).toBe(200);
  expect((await stores[0]!.adminView())!.closed).toBe(true);
  expect(await bindings.COUNTERS.get(`contribution_task:${ids[0]}`)).toBe('1');
  expect((await Promise.all(stores.map(s=>s.adminView()))).map(s=>s!.published_at)).toEqual(original.map(s=>s!.published_at));
});
it('keeps the existing admin gate and cross-origin protection', async () => {
  expect((await SELF.fetch(base+path,{method:'POST'})).status).toBe(401);
  expect((await SELF.fetch(base+path,{method:'POST',headers:{...auth,Origin:'https://other.example'}})).status).toBe(403);
  expect((await press('reward_usd=1000')).status).toBe(400);
});
it('does not open expired work but still repairs the exact existing round', async () => {
  vi.setSystemTime(Date.parse('2026-10-22T00:00:00Z'));
  expect((await press()).status).toBe(400);
  expect(await bindings.CONTRIBUTION_TASKS!.getByName(ids[0]!).adminView()).toBeNull();
  vi.setSystemTime(clock);
  expect((await press()).status).toBe(200);
  vi.setSystemTime(Date.parse('2026-10-22T00:00:00Z'));
  expect((await press()).status).toBe(200);
});

it('recovers an interrupted index save and concurrent presses without extra commitments', async () => {
  const write = vi.spyOn(kvRetry, 'kvPut').mockRejectedValueOnce(new Error('injected unavailable index'));
  const failed = await press();
  expect(failed.status).toBe(503);
  expect(await failed.text()).toContain('Some briefs may already be posted');
  expect(await bindings.CONTRIBUTION_TASKS!.getByName(ids[0]!).adminView()).not.toBeNull();
  expect(await bindings.COUNTERS.get(`contribution_task:${ids[0]}`)).toBeNull();
  write.mockRestore();
  expect((await Promise.all([press(),press()])).map(r=>r.status)).toEqual([200,200]);
  for (const id of ids) expect(await bindings.COUNTERS.get(`contribution_task:${id}`)).toBe('1');
  const records = await Promise.all(ids.map(id=>bindings.CONTRIBUTION_TASKS!.getByName(id).adminView()));
  expect(records.reduce((sum,s)=>sum+s!.terms.reward_usd*s!.terms.slots,0)).toBe(10);
});
it('preflights conflicts across the whole round before creating missing briefs', async () => {
  expect((await press()).status).toBe(200);
  const last = bindings.CONTRIBUTION_TASKS!.getByName(ids[3]!);
  const existing = (await last.adminView())!;
  for (const id of ids) await runInDurableObject(bindings.CONTRIBUTION_TASKS!.getByName(id),async (_instance,state)=>{await state.storage.deleteAll();});
  await last.create({...existing.terms,reward_usd:5},clock);
  const refused = await press();
  expect(refused.status).toBe(400);
  expect(await refused.text()).toContain('different posted terms');
  expect(await bindings.CONTRIBUTION_TASKS!.getByName(ids[0]!).adminView()).toBeNull();
  expect((await last.adminView())!.terms.reward_usd).toBe(5);
});

it('refuses to add an authorization round over legacy manual-payment commitments', async () => {
 const originalId = ids[0]!.replace(/-auth$/, '');
 await press();
 const current = (await bindings.CONTRIBUTION_TASKS!.getByName(ids[0]!).adminView())!;
 const {payment_method, ...legacyTerms} = current.terms;
 for (const id of ids) await runInDurableObject(bindings.CONTRIBUTION_TASKS!.getByName(id),async (_instance,state)=>{await state.storage.deleteAll();});
 await bindings.CONTRIBUTION_TASKS!.getByName(originalId).create({...legacyTerms,id:originalId},clock);
 expect((await press()).status).toBe(400);
 expect(await bindings.CONTRIBUTION_TASKS!.getByName(ids[0]!).adminView()).toBeNull();
 expect((await bindings.CONTRIBUTION_TASKS!.getByName(originalId).publicView(clock))!.payment_method).toBe('keeper_paid_base_usdc');
});
