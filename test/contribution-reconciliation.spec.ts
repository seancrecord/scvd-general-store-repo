import {env, SELF} from 'cloudflare:test';
import {afterEach, expect, it, vi} from 'vitest';
import {renderContributionDesk} from '@/pages/admin/contribution-tasks';
import type {ContributionTaskState} from '@/services/contribution-task';
import type {Env} from '@/types';
const now = Date.parse('2026-10-16T12:00:00Z');
const payer = `0x${'1'.repeat(40)}`, recipient = `0x${'2'.repeat(40)}`;
const nonce = `0x${'3'.repeat(64)}`, tx = `0x${'4'.repeat(64)}`;
function fixture(): ContributionTaskState {
  return {terms:{id:'reconcile-example',kind:'docs',title:'Read docs',target:'https://example.com',brief:'Read',acceptance:'Report',payment_method:'signed_authorization',reward_usd:2.5,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3},published_at:new Date(now).toISOString(),closed:false,reservations:[{id:'one',key_hash:'private-key',visitor_hash:'private-visitor',reserved_at:new Date(now).toISOString(),submit_by:new Date(now).toISOString(),status:'accepted',payout_to:recipient,payout:{created_at:new Date(now).toISOString(),signature:'private-signature',authorization:{from:payer,to:recipient,value:'2500000',validAfter:'0',validBefore:'1',nonce}}}]};
}
afterEach(()=>vi.restoreAllMocks());
it('offers a private read-only transaction check beside an issued reward, including after expiry',()=>{
  const html = renderContributionDesk(null,fixture(),now,'https://scvd.store');
  expect(html).toContain('/reconcile-example/reconcile');
  expect(html).toContain('Check reward transaction');
  expect(html).not.toContain('private-signature');
  const pending=fixture();delete pending.reservations[0]!.payout!.signature;
  expect(renderContributionDesk(null,pending,now,'https://scvd.store')).not.toContain('/reconcile-example/reconcile');
});

import * as rpc from '@/lib/base-rpc';
import {reconcileContributionPayment} from '@/services/contribution-reconciliation';
const bindings = env as unknown as Env;
const topic = (address: string) => `0x${address.slice(2).padStart(64,'0')}`;
function receipt(): rpc.RpcReceipt {
  return {transactionHash:tx,status:'0x1',blockNumber:'0x64',logs:[
    {address:rpc.BASE_USDC,topics:[rpc.AUTHORIZATION_USED_TOPIC,topic(payer),nonce],data:'0x'},
    {address:rpc.BASE_USDC,topics:[rpc.TRANSFER_TOPIC,topic(payer),topic(recipient)],data:`0x${(2500000).toString(16).padStart(64,'0')}`},
  ]};
}
function chain(value: rpc.RpcReceipt | null = receipt(), head = 120, chainId = '0x2105') {
  const read = vi.spyOn(rpc,'getReceipt').mockResolvedValue(value);
  vi.spyOn(rpc,'getBlockNumber').mockResolvedValue(head);
  vi.spyOn(rpc,'getChainId').mockResolvedValue(chainId);
  return read;
}
it('requires the exact retained authorization and finality, without keys, mutation or private material in the result',async()=>{
  chain();const state=fixture(),before=structuredClone(state);
  const result=await reconcileContributionPayment({...bindings,FIELD_WALLET_KEY:undefined},state,'one',tx,now);
  expect(result).toMatchObject({status:'confirmed',confirmations:20,read_at:new Date(now).toISOString(),reward_usd:2.5});
  expect(state).toEqual(before);
  expect(JSON.stringify(result)).not.toContain('private');
});
it.each(['nonce','recipient','amount','asset','payer','unpaired'] as const)('does not credit a transaction with a mismatching %s',async field=>{
  const r=receipt(),auth=r.logs[0]!,transfer=r.logs[1]!;
  if(field==='nonce') auth.topics[2]=`0x${'5'.repeat(64)}`;
  if(field==='recipient') transfer.topics[2]=topic(payer);
  if(field==='amount') transfer.data=`0x${'0'.repeat(63)}1`;
  if(field==='asset') auth.address=transfer.address=payer;
  if(field==='payer') auth.topics[1]=transfer.topics[1]=topic(recipient);
  if(field==='unpaired') r.logs.splice(1,0,{...transfer,data:`0x${'0'.repeat(63)}1`});
  chain(r);
  expect((await reconcileContributionPayment(bindings,fixture(),'one',tx,now)).status).toBe('not_matched');
});
it('does not call a consumed or canceled nonce a payment without the transfer pair',async()=>{
  const r=receipt();r.logs=[];chain(r);
  const state=vi.spyOn(rpc,'authorizationUsed').mockResolvedValue(true);
  expect((await reconcileContributionPayment(bindings,fixture(),'one',tx,now)).status).toBe('not_matched');
  expect(state).not.toHaveBeenCalled();
});
it('keeps a young matching transaction pending',async()=>{
  chain(receipt(),105);
  expect((await reconcileContributionPayment(bindings,fixture(),'one',tx,now)).status).toBe('pending_finality');
});
it.each(['missing','wrong_chain','wrong_transaction','reverted','rpc_error'] as const)('fails closed for %s',async kind=>{
  const r=receipt();if(kind==='wrong_transaction') r.transactionHash=nonce;
  if(kind==='reverted') r.status='0x0';
  const read=chain(kind==='missing'?null:r,120,kind==='wrong_chain'?'0x1':'0x2105');
  if(kind==='rpc_error') read.mockRejectedValue(new Error('private-provider-key'));
  const result=await reconcileContributionPayment(bindings,fixture(),'one',tx,now);
  expect(result.status).not.toBe('confirmed');
  expect(JSON.stringify(result)).not.toContain('private-provider-key');
});
it.each(['legacy','unsigned','wrong_terms','missing','unaccepted'] as const)('refuses %s retained records before making an RPC call',async kind=>{
  const read=chain(),s=fixture(),row=s.reservations[0]!;
  if(kind==='legacy') delete s.terms.payment_method;
  if(kind==='unsigned') delete row.payout!.signature;
  if(kind==='wrong_terms') row.payout!.authorization.value='1';
  if(kind==='missing') s.reservations=[];
  if(kind==='unaccepted') row.status='submitted';
  expect((await reconcileContributionPayment(bindings,s,'one',tx,now)).status).toBe('unavailable');
  expect(read).not.toHaveBeenCalled();
});
it('rejects malformed transaction input before contacting the chain',async()=>{
  const read=chain();
  await expect(reconcileContributionPayment(bindings,fixture(),'one','bad',now)).rejects.toThrow('Base transaction hash');
  expect(read).not.toHaveBeenCalled();
});
it('keeps the new private route authenticated and rejects cross-origin calls and unknown input',async()=>{
  const url='https://scvd.store/admin/bounties/contributions/reconcile-example/reconcile';
  expect((await SELF.fetch(url,{method:'POST'})).status).toBe(401);
  const headers={Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`,'Content-Type':'application/json'};
  expect((await SELF.fetch(url,{method:'POST',headers:{...headers,Origin:'https://elsewhere.invalid'},body:'{}'})).status).toBe(403);
  expect((await SELF.fetch(url,{method:'POST',headers,body:JSON.stringify({submission_id:'one',tx_hash:tx,extra:true})})).status).toBe(400);
});
it('serves the private JSON and browser result without changing the retained record',async()=>{
  // A retained unsigned intent exercises the complete route without any network read.
  const {runInDurableObject}=await import('cloudflare:test');
  const s=fixture();s.terms.id=`check-${crypto.randomUUID()}`;delete s.reservations[0]!.payout!.signature;
  const actor=bindings.CONTRIBUTION_TASKS!.getByName(s.terms.id);
  await runInDurableObject(actor,async(_instance,state)=>{state.storage.sql.exec('CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');state.storage.sql.exec('INSERT INTO task(id,data) VALUES(1,?)',JSON.stringify(s));});
  const url=`https://scvd.store/admin/bounties/contributions/${s.terms.id}/reconcile`;
  const auth={Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`};
  const json=await SELF.fetch(url,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({submission_id:'one',tx_hash:tx})});
  expect(json.status).toBe(200);expect(await json.json()).toMatchObject({status:'unavailable',reason:'issued_authorization_required'});
  const html=await SELF.fetch(url,{method:'POST',headers:{...auth,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({submission_id:'one',tx_hash:tx}).toString()});
  expect(html.status).toBe(200);expect(await html.text()).toContain('Payment could not be established');
  expect(html.headers.get('Cache-Control')).toBe('no-store');
  expect(await actor.adminView()).toEqual(s);
});
