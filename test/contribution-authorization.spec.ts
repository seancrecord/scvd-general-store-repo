import {SELF,env,runInDurableObject} from 'cloudflare:test';
import {expect,it,vi,afterEach} from 'vitest';
import * as payout from '@/services/contribution-payout';
import * as rpc from '@/lib/base-rpc';
import * as launch from '@/services/launch-check';
import {authorizationTypes} from '@x402/evm';
import {verifyTypedData} from 'viem';
import {contributionQaBrief,QA_CASE_PATHS} from '@/store/contribution-qa-brief';
import {renderContributionDesk} from '@/pages/admin/contribution-tasks';
import type {Env} from '@/types';
const bindings=env as unknown as Env;
const now=Date.parse('2026-10-15T16:00:00Z');
const terms=()=>({id:`gas-${crypto.randomUUID()}`,kind:'docs',title:'Check free public contracts',target:'https://scvd.store/what',brief:'Read the agreed public cases.',acceptance:'Reproducible result or honest block.',reward_usd:6,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3,payment_method:'signed_authorization' as const});
it('publishes gas responsibility before reservation without changing legacy terms',async()=>{
 const t=terms(),s=bindings.CONTRIBUTION_TASKS!.getByName(t.id);await s.create(t,now);
 const view=await s.publicView(now);expect(view?.payment_method).toBe('signed_authorization');
 expect(view?.redemption?.store_sponsors_gas).toBe(false);
 expect(view?.redemption?.authorization_is_payment_received).toBe(false);
 const {payment_method,...old}=terms();const legacy=bindings.CONTRIBUTION_TASKS!.getByName(old.id);await legacy.create(old,now);
 expect((await legacy.publicView(now))?.payment_method).toBe('keeper_paid_base_usdc');
});
it('requires accepted work before issuing an authorization',async()=>{
 const t=terms(),s=bindings.CONTRIBUTION_TASKS!.getByName(t.id);await s.create(t,now);
 const result=await s.issueReward({submission_id:'missing'},now);
 expect(result.status).toBe(409);
 expect((await s.adminView())?.reservations).toHaveLength(0);
});

async function accepted() {
 const t=terms(),store=bindings.CONTRIBUTION_TASKS!.getByName(t.id);await store.create(t,now);
 const key='a'.repeat(64),payout_to=`0x${'3'.repeat(40)}`;
 const r=await store.act('reserve',{reservation_key:key},'fixture',now);
 await store.act('submit',{reservation_key:key,payout_to,report:{attempted:'Fixture steps',environment:'Synthetic only',expected:'A documented response',observed:'Response obtained',evidence:'Fixture timestamp and result',suggestion:'No change needed'}},'',now);
 // Retained pre-funding acceptance: these tests isolate issuance and legacy retries.
 await runInDurableObject(store,async(_,state)=>{
  const record=JSON.parse(state.storage.sql.exec<{data:string}>("SELECT data FROM task WHERE id=1").one().data);
  record.reservations[0].status='accepted';
  record.reservations[0].review={decision:'accepted',reason:'Matches the agreed criteria',outcome:'no_change',reference:'https://scvd.store/what',at:new Date(now).toISOString()};
  state.storage.sql.exec("UPDATE task SET data=? WHERE id=1",JSON.stringify(record));
 });
 return {store,key,id:r.data.submission_id!};
}

afterEach(()=>vi.restoreAllMocks());
async function signerFixture() {
 // Public synthetic test key, never a configured wallet.
 return launch.fieldSignerFromKey('11'.repeat(32));
}
it('persists one nonce across concurrent presses, failures and private status retries',async()=>{
 const {store,key,id}=await accepted();const signer=await signerFixture();
 vi.spyOn(payout,'contributionSigner').mockResolvedValue(signer);
 vi.spyOn(rpc,'usdcBalanceOf').mockResolvedValue(100000000n);
 vi.spyOn(launch,'oracleScreen').mockReturnValue(async()=>({listed:false,source:'fixture'}));
 const sign=vi.spyOn(payout,'signContributionReward');
 sign.mockRejectedValueOnce(new Error('fixture interrupted signing'));
 expect((await store.issueReward({submission_id:id},now)).status).toBe(503);
 const intent=(await store.adminView())!.reservations[0]!.payout!;
 expect(intent.signature).toBeUndefined();
 const replies=await Promise.all([store.issueReward({submission_id:id},now),store.issueReward({submission_id:id},now)]);
 expect(replies.map(r=>r.status)).toEqual([200,200]);
 const status=await store.act('status',{reservation_key:key},'',now);
 const signed=(await store.adminView())!.reservations[0]!.payout!;
 expect(signed.authorization).toEqual(intent.authorization);
 expect(signed.authorization.value).toBe('6000000');
 const a=signed.authorization;
 expect(await verifyTypedData({address:a.from as `0x${string}`,domain:{name:'USD Coin',version:'2',chainId:8453,verifyingContract:rpc.BASE_USDC},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:{from:a.from as `0x${string}`,to:a.to as `0x${string}`,value:BigInt(a.value),validAfter:BigInt(a.validAfter),validBefore:BigInt(a.validBefore),nonce:a.nonce as `0x${string}`},signature:signed.signature as `0x${string}`})).toBe(true);
 expect(status.data.payout?.state).toBe('authorization_issued');
 expect(JSON.stringify(await store.publicView(now))).not.toContain(a.nonce);
 expect(JSON.stringify(await store.publicView(now))).not.toContain(signed.signature);
 const calls=sign.mock.calls.length;
 expect((await store.issueReward({submission_id:id},now)).data.payout).toEqual(status.data.payout);
 expect(sign).toHaveBeenCalledTimes(calls);
 expect((await store.act('payment',{submission_id:id,tx_hash:`0x${'4'.repeat(64)}`},'',now)).status).toBe(409);
 expect((await store.act('status',{reservation_key:'b'.repeat(64)},'',now)).status).toBe(404);
 expect((await store.act('status',{reservation_key:key},'',now+8*86400000)).data.payout?.state).toBe('expired');
});
it('fails closed on screening, balance and signer failures without releasing a signature',async()=>{
 const {store,id}=await accepted(),signer=await signerFixture();
 vi.spyOn(payout,'contributionSigner').mockResolvedValue(signer);
 const screen=vi.spyOn(launch,'oracleScreen').mockReturnValue(async()=>({listed:null,source:'fixture'}));
 const balance=vi.spyOn(rpc,'usdcBalanceOf').mockResolvedValue(100000000n);
 const sign=vi.spyOn(signer,'signTypedData');
 expect((await store.issueReward({submission_id:id},now)).status).toBe(503);expect(sign).not.toHaveBeenCalled();
 screen.mockReturnValue(async()=>({listed:true,source:'fixture'}));
 expect((await store.issueReward({submission_id:id},now)).status).toBe(503);expect(sign).not.toHaveBeenCalled();
 screen.mockReturnValue(async()=>({listed:false,source:'fixture'}));balance.mockResolvedValue(0n);
 expect((await store.issueReward({submission_id:id},now)).status).toBe(503);expect(sign).not.toHaveBeenCalled();
 balance.mockRejectedValue(new Error('fixture RPC failure'));
 expect((await store.issueReward({submission_id:id},now)).status).toBe(503);expect(sign).not.toHaveBeenCalled();
 expect((await store.adminView())!.reservations[0]!.payout?.signature).toBeUndefined();
 expect((await store.issueReward({submission_id:id},now+8*86400000)).status).toBe(409);
});
it('preserves intervening follow-through when signing yields',async()=>{
 const {store,id}=await accepted(),signer=await signerFixture();
 vi.spyOn(payout,'contributionSigner').mockResolvedValue(signer);
 await runInDurableObject(store,async(instance)=>{
  vi.spyOn(payout,'signContributionReward').mockImplementation(async()=>{
   await instance.act('progress',{submission_id:id,update_id:'fixture-note',outcome:'fixed',note:'Preserve this update',reference:'https://scvd.store/what'},'',now);
   return 'fixture-signature';
  });
  expect((await instance.issueReward({submission_id:id},now)).status).toBe(200);
 });
 expect((await store.adminView())!.reservations[0]!.updates?.[0]?.note).toBe('Preserve this update');
});
it('retains the signing intent after a failed signature save, then retries the same nonce',async()=>{
 const {store,id}=await accepted(),signer=await signerFixture();
 vi.spyOn(payout,'contributionSigner').mockResolvedValue(signer);
 vi.spyOn(payout,'signContributionReward').mockResolvedValue('fixture-signature');
 await runInDurableObject(store,async(instance,state)=>{
  const original=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,'exec').mockImplementation((query,...args)=>{
   if(query.startsWith('INSERT') && String(args[0]).includes('fixture-signature')) throw new Error('fixture save failed');
   return original(query,...args);
  });
  expect((await instance.issueReward({submission_id:id},now)).status).toBe(503);spy.mockRestore();
 });
 const intent=(await store.adminView())!.reservations[0]!.payout!;
 expect(intent.signature).toBeUndefined();
 await store.issueReward({submission_id:id},now);
 expect((await store.adminView())!.reservations[0]!.payout?.authorization.nonce).toBe(intent.authorization.nonce);
});
it('protects issuance with admin authentication and same-origin checks',async()=>{
 const {store,id}=await accepted();const taskId=(await store.publicView(now))!.id;
 const path=`https://scvd.store/admin/bounties/contributions/${taskId}/authorize`;
 const body=JSON.stringify({submission_id:id});
 expect((await SELF.fetch(path,{method:'POST',body})).status).toBe(401);
 expect((await SELF.fetch(path,{method:'POST',body,headers:{Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`,Origin:'https://other.example','Content-Type':'application/json'}})).status).toBe(403);
});
it('prepares the bounded QA offer without posting it or silently raising program caps',()=>{
 const draft=contributionQaBrief('https://scvd.store',now);
 expect(draft.reward_usd).toBe(6);expect(draft.slots).toBe(1);expect(QA_CASE_PATHS).toHaveLength(12);
 expect(draft.brief).toContain('GET only');expect(draft.acceptance).toContain('SCVD sponsors no gas');
 const html=renderContributionDesk({tasks:[],truncated:false,cursor:null,indexing_note:''},null,now,'https://scvd.store');
 expect(html).toContain('name="payment_method" value="signed_authorization"');
 expect(html).toContain('value="6"');expect(html).toContain('proposes $16 total');
 expect(html).toContain('Raising those caps does not create open work or fund contributions');
});

it('refuses wallet rotation after intent persistence rather than signing another payer',async()=>{
 const {store,id}=await accepted(),signer=await signerFixture();
 const wallet=vi.spyOn(payout,'contributionSigner').mockResolvedValue(signer);
 const sign=vi.spyOn(payout,'signContributionReward').mockRejectedValueOnce(new Error('fixture failure'));
 expect((await store.issueReward({submission_id:id},now)).status).toBe(503);
 wallet.mockResolvedValue({...signer,address:`0x${'5'.repeat(40)}`});
 expect((await store.issueReward({submission_id:id},now)).data.code).toBe('payout_wallet_changed');
 expect(sign).toHaveBeenCalledTimes(1);
});
it('describes the private authorization and public gas policy in the published schema',async()=>{
 const response=await SELF.fetch('https://scvd.store/openapi.json');
 const api=await response.json() as {components:{schemas:Record<string,{properties:Record<string,unknown>}>}};
 expect(api.components.schemas.ContributionState!.properties.payout).toEqual({$ref:'#/components/schemas/ContributionPayout'});
 expect(api.components.schemas.ContributionTask!.properties.redemption).toEqual({$ref:'#/components/schemas/ContributionRedemption'});
});
