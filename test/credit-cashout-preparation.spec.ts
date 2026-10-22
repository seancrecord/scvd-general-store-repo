import {env} from 'cloudflare:test';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as launch from '@/services/launch-check';
import {accrueCredit,creditOutstandingAtomic,getCredit,redeemCredit} from '@/services/store-credit';
import {KV_KEYS} from '@/lib/kv-keys';
import type {Env} from '@/types';

const bindings=env as unknown as Env;
const wallet=`0x${'2'.repeat(40)}`,payingWallet=`0x${'1'.repeat(40)}`;
const now=new Date('2026-10-22T12:00:00Z');
const clearScreen=async()=>({listed:false as const,source:'test screen'});
const nonce=`0x${'3'.repeat(64)}`;
const key=KV_KEYS.credit(wallet);

beforeEach(async()=>{
  await bindings.COUNTERS.delete(key);
  await bindings.COUNTERS.delete(KV_KEYS.creditOutstanding);
  await accrueCredit(bindings,wallet,40,now);
});
afterEach(()=>vi.restoreAllMocks());

it.each(['signer','nonce'] as const)('restores the claimed credit when %s preparation fails before signing',async failure=>{
  const sign=vi.fn(async()=> '0xsynthetic-signature');
  const signer={address:payingWallet,signTypedData:sign};
  const factory=vi.spyOn(launch,'fieldSignerFromKey').mockImplementation(async()=>{
    // The preparation failure really occurs after the claim, not at a
    // provision/floor/screen refusal that never exercised recovery.
    expect((await getCredit(bindings,wallet,now)).balance_atomic).toBe('0');
    if(failure==='signer')throw new Error('signer unavailable');
    return signer;
  });
  let calls=0;
  const randomNonce=()=>{if(++calls===2 && failure==='nonce')throw new Error('nonce unavailable');return nonce;};
  await expect(redeemCredit({...bindings,FIELD_WALLET_KEY:'test-only-configuration'},wallet,{screen:clearScreen,now,randomNonce})).rejects.toThrow(`${failure} unavailable`);
  expect(factory).toHaveBeenCalledOnce();expect(sign).not.toHaveBeenCalled();
  const after=await getCredit(bindings,wallet,now);
  expect(after.balance_atomic).toBe('2000000');expect(after.redeemed_total_atomic).toBe('0');expect(after.claimed_by).toBeUndefined();
  expect(await creditOutstandingAtomic(bindings)).toBe(2000000n);
  const retried=await redeemCredit(bindings,wallet,{signer,screen:clearScreen,now,randomNonce:()=>nonce});
  expect(retried.payout.authorization).toMatchObject({from:payingWallet,to:wallet,value:'2000000'});
  expect(sign).toHaveBeenCalledOnce();expect(await creditOutstandingAtomic(bindings)).toBe(0n);
});

it('still restores credit when signing itself throws',async()=>{
  const sign=vi.fn(async()=>{throw new Error('signing unavailable');});
  await expect(redeemCredit(bindings,wallet,{signer:{address:payingWallet,signTypedData:sign},screen:clearScreen,now})).rejects.toThrow('signing unavailable');
  expect(sign).toHaveBeenCalledOnce();
  expect(await getCredit(bindings,wallet,now)).toMatchObject({balance_atomic:'2000000',redeemed_total_atomic:'0'});
  expect(await creditOutstandingAtomic(bindings)).toBe(2000000n);
});

it('does not restore spendable credit after a signature succeeds but aggregate bookkeeping fails',async()=>{
  const counters=bindings.COUNTERS;
  const failed={...bindings,COUNTERS:{
    get:counters.get.bind(counters),delete:counters.delete.bind(counters),list:counters.list.bind(counters),
    put:async(name:string,value:string)=>{if(name===KV_KEYS.creditOutstanding)throw new Error('aggregate unavailable');await counters.put(name,value);},
  } as unknown as KVNamespace};
  const sign=vi.fn(async()=> '0xsynthetic-signature');
  await expect(redeemCredit(failed,wallet,{signer:{address:payingWallet,signTypedData:sign},screen:clearScreen,now})).rejects.toThrow('aggregate unavailable');
  expect(sign).toHaveBeenCalledOnce();
  expect(await getCredit(bindings,wallet,now)).toMatchObject({balance_atomic:'0',redeemed_total_atomic:'2000000'});
});
