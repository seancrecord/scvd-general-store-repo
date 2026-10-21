import {env, SELF} from 'cloudflare:test';
import {describe, expect, it, vi} from 'vitest';
import {readCreditInventory, CREDIT_INVENTORY_SCAN_CAP} from '@/services/credit-inventory';
import {renderCreditInventory} from '@/pages/admin/contribution-tasks';
import {CREDIT_IDLE_EXPIRY_DAYS} from '@/lib/credit-terms';
import {KV_KEYS} from '@/lib/kv-keys';
import type {Env} from '@/types';

const now = Date.UTC(2026, 9, 21, 12);
const wallet = '0x1111111111111111111111111111111111111111';
const row = (balance = '2500000', at = now) => ({wallet, balance_atomic: balance, updated_at: new Date(at).toISOString()});
function runtime(entries: [string, unknown][], truncated = false) {
  const values = new Map(entries);
  const put = vi.fn(), remove = vi.fn();
  const list = vi.fn(async ({prefix, limit}: {prefix:string;limit:number}) => {
    expect(prefix).toBe(KV_KEYS.creditPrefix);
    expect(limit).toBe(CREDIT_INVENTORY_SCAN_CAP);
    return {keys:entries.map(([name]) => ({name})), list_complete:!truncated};
  });
  const get = vi.fn(async (key:string|string[]) => Array.isArray(key) ? new Map(key.map(k=>[k,values.get(k)??null])) : values.get(key)??null);
  return {env:{...env,COUNTERS:{list,get,put,delete:remove}} as unknown as Env, list,get,put,remove};
}
function expectReadOnly(test: ReturnType<typeof runtime>) {
  expect(test.put).not.toHaveBeenCalled(); expect(test.remove).not.toHaveBeenCalled();
}

describe('private accrued credit inventory',()=>{
  it('retains idle balances, exact dust and claim markers without expiring or redeeming anything',async()=>{
    const second = '0x2222222222222222222222222222222222222222';
    const third = '0x3333333333333333333333333333333333333333';
    const test=runtime([
      [KV_KEYS.credit(wallet),row('2500000',now-CREDIT_IDLE_EXPIRY_DAYS*86400000)],
      [KV_KEYS.credit(second),{...row('1'),wallet:second}],
      [KV_KEYS.credit(third),{...row('0'),wallet:third,claimed_by:'private-claim-marker'}],
    ]);
    const data=await readCreditInventory(test.env,now);
    expect(data.scan_complete).toBe(true);
    expect(data.retained_balance_atomic).toBe('2500001');
    expect(data.retained_balance_usdc).toBe('2.500001');
    expect(data.observed).toMatchObject({idle_expiry_due_subset_atomic:'2500000',claim_marker_records:1});
    expect(data.coverage).toMatchObject({records_read:3,valid_records:3});
    expect(JSON.stringify(data)).not.toContain(wallet);
    expect(JSON.stringify(data)).not.toContain('private-claim-marker');
    expectReadOnly(test);
  });
  it('does not expire a balance a millisecond before its idle boundary',async()=>{
    const test=runtime([[KV_KEYS.credit(wallet),row('1',now-CREDIT_IDLE_EXPIRY_DAYS*86400000+1)]]);
    expect((await readCreditInventory(test.env,now)).observed.idle_expiry_due_subset_atomic).toBe('0');
    expectReadOnly(test);
  });
  it('labels truncation and refuses a complete total while retaining the observed subset',async()=>{
    const test=runtime([[KV_KEYS.credit(wallet),row()]],true);
    const data=await readCreditInventory(test.env,now);
    expect(data.scan_complete).toBe(false);
    expect(data.retained_balance_atomic).toBeNull();
    expect(data.retained_balance_usdc).toBeNull();
    expect(data.observed.retained_balance_atomic).toBe('2500000');
    expect(data.gaps).toContain('credit_truncated');
    expect(renderCreditInventory(data)).toContain('Stored balance total: Unavailable');
    expect(renderCreditInventory(data)).toContain('only readable records');
    expectReadOnly(test);
  });
  it.each([
    null,
    {...row(),balance_atomic:'-1'},
    {...row(),balance_atomic:1},
    {...row(),balance_atomic:'1.1'},
    {...row(),balance_atomic:'1e6'},
    {...row(),balance_atomic:'9'.repeat(79)},
    {...row(),wallet:'wrong-key'},
    {...row(),updated_at:'not-a-date'},
    row('1',now+1),
    {...row(),claimed_by:123},
  ])('refuses a complete total for unreadable or invalid retained data %#',async(value)=>{
    const test=runtime([[KV_KEYS.credit(wallet),value]]);
    const data=await readCreditInventory(test.env,now);
    expect(data.scan_complete).toBe(false);
    expect(data.retained_balance_atomic).toBeNull();
    expect(data.gaps).toContain(value===null?'credit_record_unavailable':'credit_record_invalid');
    expectReadOnly(test);
  });
  it('does not round large balances or turn a claim marker into received revenue',async()=>{
    const test=runtime([[KV_KEYS.credit(wallet),{...row('9007199254740993'),claimed_by:'private-marker'}]]);
    const data=await readCreditInventory(test.env,now);
    expect(data.retained_balance_usdc).toBe('9007199254.740993');
    expect(data.observed.claim_marker_records).toBe(1);
    expect(renderCreditInventory(data)).toContain('do not establish payment');
    expectReadOnly(test);
  });
  it('reports an empty completed scan as zero but storage failure as unavailable',async()=>{
    const test=runtime([]);
    expect((await readCreditInventory(test.env,now)).retained_balance_atomic).toBe('0');
    test.list.mockRejectedValue(new Error('private-storage-error'));
    const data=await readCreditInventory(test.env,now);
    expect(data.retained_balance_atomic).toBeNull();
    expect(data.gaps).toEqual(['credit_unavailable']);
    expect(JSON.stringify(data)).not.toContain('private-storage-error');
  });
  it('renders credit and manual terms only behind the existing admin gate',async()=>{
    const url='https://scvd.store/admin/bounties/contributions/reports/funding';
    expect((await SELF.fetch(url)).status).toBe(401);
    const response=await SELF.fetch(url,{headers:{Authorization:`Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}`}});
    expect(response.status).toBe(200);
    const html=await response.text();
    expect(html).toContain('Accrued store credit');
    expect(html).toContain('Accepted manual-payment terms');
    expect(html).toContain('Credit accrual is not reserved');
  });
});
