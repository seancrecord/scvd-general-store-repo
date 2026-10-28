import {env,SELF,runInDurableObject} from 'cloudflare:test';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import * as rpc from '@/lib/base-rpc';
import * as launch from '@/services/launch-check';
import {FieldWalletAllocations,allocationLedger} from '@/services/field-wallet-allocations';
import {accrueCredit,redeemCredit} from '@/services/store-credit';
import type {CreditRecord} from '@/services/store-credit';
import {KV_KEYS} from '@/lib/kv-keys';
import {creditTerms} from '@/lib/credit-terms';
import type {Env} from '@/types';
const bindings=env as unknown as Env,now=new Date('2026-10-22T12:00:00Z');
// Public Hardhat fixtures, never production wallets or keys.
const fieldKey='0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const owner=privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const wallet=owner.address.toLowerCase(),payer=privateKeyToAccount(fieldKey).address.toLowerCase();
const key=KV_KEYS.credit(wallet),base='https://scvd.store';
const testEnv={...bindings,FIELD_WALLET_KEY:'synthetic-test-config'};
const screen=vi.fn(async()=>({listed:false as const,source:'test screen'}));
let signer:launch.FieldSigner;
const ledger=()=>allocationLedger(bindings,payer);
const record=async()=>JSON.parse((await bindings.COUNTERS.get(key))!) as CreditRecord;
const issue=()=>redeemCredit(testEnv,wallet,{screen,now});
const recover=()=>redeemCredit({...bindings,FIELD_WALLET_KEY:undefined},wallet,{recoveryOnly:true,now});
beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
  await runInDurableObject(ledger(),async(_,state)=>{for(const table of ['credit_payouts','manual_contribution_holds','contribution_work_holds','contribution_releases','contribution_commitments','allocations','allocation_meta'])state.storage.sql.exec(`DELETE FROM ${table}`);});
  await bindings.COUNTERS.delete(key);await bindings.COUNTERS.delete(KV_KEYS.creditOutstanding);await bindings.COUNTERS.delete(KV_KEYS.creditChallenge(wallet));
  vi.spyOn(rpc,'getFinalizedBlockNumber').mockResolvedValue(100);
  vi.spyOn(rpc,'getBlockTimestamp').mockResolvedValue(new Date(now.getTime()-1000));
  vi.spyOn(rpc,'usdcBalanceOf').mockResolvedValue(10000000n);
  signer=await launch.fieldSignerFromKey(fieldKey);vi.spyOn(signer,'signTypedData');
  vi.spyOn(launch,'fieldSignerFromKey').mockResolvedValue(signer);screen.mockClear();
  await accrueCredit(bindings,wallet,40,now);
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('recovers identical saved bytes after wallet rotation, without signing, screening, spending new credit or expiring it',async()=>{
  const first=await issue();await accrueCredit(bindings,wallet,40,now);
  const before=await bindings.COUNTERS.get(key),outstanding=await bindings.COUNTERS.get(KV_KEYS.creditOutstanding);
  vi.mocked(signer.signTypedData).mockClear();screen.mockClear();vi.mocked(launch.fieldSignerFromKey).mockRejectedValue(new Error('retired key'));
  vi.mocked(rpc.getFinalizedBlockNumber).mockRejectedValue(new Error('chain offline'));
  vi.setSystemTime(new Date('2027-03-01T12:00:00Z'));
  expect(await recover()).toEqual(first);expect(await recover()).toEqual(first);
  expect(signer.signTypedData).not.toHaveBeenCalled();expect(screen).not.toHaveBeenCalled();
  expect(await bindings.COUNTERS.get(key)).toBe(before);expect(await bindings.COUNTERS.get(KV_KEYS.creditOutstanding)).toBe(outstanding);
  expect(first.payout.how_to_redeem).not.toContain('signature is the payment');
});
it('recovers a committed journal save whose reply was lost, without changing the unresolved aggregate',async()=>{
  const original=FieldWalletAllocations.prototype.saveCreditPayout;
  vi.spyOn(FieldWalletAllocations.prototype,'saveCreditPayout').mockImplementationOnce(function(this:FieldWalletAllocations,...args){original.apply(this,args);throw new Error('lost save reply');});
  await expect(issue()).rejects.toThrow();
  expect((await record()).balance_atomic).toBe('0');
  const result=await recover();expect(result.payout.authorization.value).toBe('2000000');
  expect(signer.signTypedData).toHaveBeenCalledOnce();
  expect(await bindings.COUNTERS.get(KV_KEYS.creditOutstanding)).toBe('2000000');
  expect((await ledger().summary()).held_atomic).toBe('2000000');
});
it('keeps a post-signature failed save unresolved instead of restoring credit or signing a replacement',async()=>{
  vi.spyOn(FieldWalletAllocations.prototype,'saveCreditPayout').mockImplementationOnce(()=>{throw new Error('save failed');});
  await expect(issue()).rejects.toThrow();expect((await record()).balance_atomic).toBe('0');
  await expect(recover()).rejects.toThrow('no saved authorization');
  await expect(issue()).rejects.toThrow('floor');expect(signer.signTypedData).toHaveBeenCalledOnce();
});
it('preserves the previous recovery pointer when a subsequent signing attempt fails',async()=>{
  const first=await issue(),pointer=(await record()).cashout_recovery;
  await accrueCredit(bindings,wallet,40,now);vi.mocked(signer.signTypedData).mockRejectedValueOnce(new Error('signing failed'));
  await expect(issue()).rejects.toThrow('signing failed');
  expect((await record()).cashout_recovery).toEqual(pointer);expect((await record()).balance_atomic).toBe('2000000');
  expect(await recover()).toEqual(first);
});
it('requires an existing exact credit allocation and permanently binds claim, recipient and nonce',async()=>{
  const result=await issue(),pointer=(await record()).cashout_recovery!;
  const args=vi.mocked(signer.signTypedData).mock.calls[0]![0];
  await runInDurableObject(ledger(),async(i,state)=>{
    expect(i.saveCreditPayout(payer,pointer.claim_id,args,result.payout.signature,now.getTime())).toEqual({authorization:result.payout.authorization,signature:result.payout.signature});
    expect(()=>i.readCreditPayout(payer,pointer.claim_id,payer)).toThrow();
    expect(()=>i.saveCreditPayout(payer,`0x${'8'.repeat(64)}`,args,result.payout.signature,now.getTime())).toThrow();
    expect(()=>i.saveCreditPayout(payer,pointer.claim_id,{...args,message:{...args.message,value:'1'}},result.payout.signature,now.getTime())).toThrow();
    expect(()=>i.saveCreditPayout(payer,`0x${'9'.repeat(64)}`,{...args,message:{...args.message,nonce:`0x${'a'.repeat(64)}`}},result.payout.signature,now.getTime())).toThrow();
    const other={...args,message:{...args.message,nonce:`0x${'b'.repeat(64)}`}};
    await i.reserve(payer,'studies',other,now.getTime());
    expect(()=>i.saveCreditPayout(payer,`0x${'c'.repeat(64)}`,other,result.payout.signature,now.getTime())).toThrow();
    // Recovery survives allocation pruning and a new actor instance.
    state.storage.sql.exec('DELETE FROM allocations');
    const restarted=new FieldWalletAllocations(state,bindings);
    expect(restarted.readCreditPayout(payer,pointer.claim_id,wallet)).toEqual({authorization:result.payout.authorization,signature:result.payout.signature});
  });
});
it.each(['missing','wrong_wallet','wrong_recipient'] as const)('refuses %s recovery references without creating a payout',async kind=>{
  await issue();const r=await record();
  if(kind==='missing')delete r.cashout_recovery;
  if(kind==='wrong_wallet')r.cashout_recovery!.wallet=`0x${'7'.repeat(40)}`;
  if(kind==='wrong_recipient')r.wallet=payer;
  await bindings.COUNTERS.put(key,JSON.stringify(r));vi.mocked(signer.signTypedData).mockClear();
  await expect(recover()).rejects.toThrow();expect(signer.signTypedData).not.toHaveBeenCalled();
});
async function challenge(recoveryOnly:boolean){
  const r=await SELF.fetch(`${base}/api/credit/challenge`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:wallet,recovery_only:recoveryOnly})});
  expect(r.status).toBe(200);return (await r.json()) as {challenge:string};
}
async function send(signature:string,recoveryOnly:boolean){return SELF.fetch(`${base}/api/credit/redeem`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:wallet,signature,recovery_only:recoveryOnly})});}
it('returns the original payout only after a fresh earning-wallet recovery signature',async()=>{
  const first=await issue(),c=await challenge(true);expect(c.challenge).toContain('does not authorize a new cash-out');
  const signature=await owner.signMessage({message:c.challenge});
  const response=await send(signature,true);expect(response.status).toBe(200);expect(await response.json()).toEqual(first);
  expect((await send(signature,true)).status).toBe(400);expect(signer.signTypedData).toHaveBeenCalledOnce();
});
it.each([true,false])('refuses a challenge-mode substitution from recovery=%s',async mode=>{
  const c=await challenge(mode),signature=await owner.signMessage({message:c.challenge});
  const nonce=await bindings.COUNTERS.get(KV_KEYS.creditChallenge(wallet));
  const response=await send(signature,!mode);
  expect(response.status).toBe(400);expect(await response.text()).toContain('The challenge mode differs');
  expect(await bindings.COUNTERS.get(KV_KEYS.creditChallenge(wallet))).toBe(nonce);
  expect(signer.signTypedData).not.toHaveBeenCalled();
});
it('refuses a different wallet signature and does not publish recovery pointers on the public balance',async()=>{
  await issue();const c=await challenge(true),other=privateKeyToAccount(fieldKey);
  expect((await send(await other.signMessage({message:c.challenge}),true)).status).toBe(403);
  const response=await SELF.fetch(`${base}/api/credit/${wallet}`),body=await response.text();
  expect(body).not.toContain('cashout_recovery');expect(body).not.toContain((await record()).cashout_recovery!.claim_id);
});
it('documents the recovery mode in the shared terms and credit room',async()=>{
  expect(creditTerms(base).cash_out_recovery).toMatchObject({recovery_only:true,requires_wallet_signature:true});
  const html=await (await SELF.fetch(`${base}/credit`,{headers:{Accept:'text/html'}})).text();
  expect(html).toContain('recovery_only');expect(html).toContain('original nonce and expiry');
});

it('recovers the saved authorization after post-signature aggregate bookkeeping fails',async()=>{
  const counters=bindings.COUNTERS;
  const failed={...testEnv,COUNTERS:{get:counters.get.bind(counters),delete:counters.delete.bind(counters),list:counters.list.bind(counters),
    put:async(name:string,value:string)=>{if(name===KV_KEYS.creditOutstanding)throw new Error('aggregate failed');await counters.put(name,value);},
  } as unknown as KVNamespace};
  await expect(redeemCredit(failed,wallet,{screen,now})).rejects.toThrow('aggregate failed');
  const result=await recover();expect(result.payout.authorization.value).toBe('2000000');
  expect((await record()).balance_atomic).toBe('0');expect(signer.signTypedData).toHaveBeenCalledOnce();
  expect(await bindings.COUNTERS.get(KV_KEYS.creditOutstanding)).toBe('2000000');
});
it('does not sign if retaining the recovery pointer fails',async()=>{
  const counters=bindings.COUNTERS;
  const failed={...testEnv,COUNTERS:{get:counters.get.bind(counters),delete:counters.delete.bind(counters),list:counters.list.bind(counters),
    put:async(name:string,value:string)=>{if(name===key && value.includes('cashout_recovery'))throw new Error('pointer failed');await counters.put(name,value);},
  } as unknown as KVNamespace};
  await expect(redeemCredit(failed,wallet,{screen,now})).rejects.toThrow('pointer failed');
  expect((await record()).balance_atomic).toBe('2000000');expect(signer.signTypedData).not.toHaveBeenCalled();
  expect((await ledger().summary()).held_atomic).toBe('0');
});
it('describes both write modes and the actual authorization fields in OpenAPI',async()=>{
  const result=await issue();
  const api=await (await SELF.fetch(`${base}/openapi.json`)).json() as {paths:Record<string,unknown>};
  for(const path of ['/api/credit/challenge','/api/credit/redeem'])expect(api.paths[path]).toMatchObject({post:{requestBody:{content:{'application/json':{schema:{properties:{recovery_only:{type:'boolean'}}}}}}}});
  expect(api.paths['/api/credit/redeem']).toMatchObject({post:{responses:{'200':{content:{'application/json':{schema:{properties:{payout:{properties:{authorization:{required:expect.arrayContaining(Object.keys(result.payout.authorization))}}}}}}}}}}});
});
