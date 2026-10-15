import {env, SELF, runInDurableObject} from 'cloudflare:test';
import {afterEach, expect, it, vi} from 'vitest';
import type {Env} from '@/types';
import {createEvidenceBundle, verifyEvidenceBundle} from '../verifier/evidence-bundle.js';
import {verifyMessageSignature} from '@/lib/signing';
import * as signing from '@/lib/signing';
import {jcsCanonicalize} from '@/lib/jcs';
import {sha256Hex} from '@/lib/idempotency';
const bindings = env as unknown as Env;
const now = Date.parse('2026-10-15T17:00:00Z');
const key = 'c'.repeat(64);
async function fixture(decision = 'accepted') {
  const terms = {id: `receipt-${crypto.randomUUID()}`, kind: 'package', title: 'Synthetic package check', target: 'https://scvd.store/developers', brief: 'Run two synthetic cases', acceptance: 'Trace both outcomes', reward_usd: 2.5, slots: 1, expires_at: new Date(now+86400000).toISOString(), review_days: 3, payment_days: 3};
  const store = bindings.CONTRIBUTION_TASKS!.getByName(terms.id);
  await store.create(terms, now);
  const held = await store.act('reserve', {reservation_key:key}, 'fixture', now);
  const report = {attempted:'Both cases', environment:'Synthetic fixture', expected:'Valid and tampered differ', observed:'They differ', evidence:'Private transcript', suggestion:'No change'};
  await store.act('submit', {reservation_key:key, payout_to:`0x${'3'.repeat(40)}`, report}, '', now);
  await store.act('review', {submission_id:held.data.submission_id, decision, reason:'Matches the criteria', outcome:'no_change', reference:'https://scvd.store/developers'}, '', now);
  return {store, terms, report, id:held.data.submission_id!};
}
afterEach(()=>vi.restoreAllMocks());
it('privately returns a stable verifiable acceptance receipt binding terms and evidence, never payment', async()=>{
  const {store, terms, report} = await fixture();
  const a = await store.act('status', {reservation_key:key}, '', now+1000);
  const proof = (a.data as Record<string, unknown>).acceptance_receipt as {signed_payload:string;signature:string;public_key:string;verification:string};
  expect(proof).toBeDefined();
  expect(await verifyMessageSignature(proof.signed_payload,proof.signature,proof.public_key)).toBe(true);
  const keyPath = proof.verification.match(/\/\.well-known\/[\w.-]+/)![0];
  const published = await (await SELF.fetch(`https://scvd.store${keyPath}`)).json() as {public_key:string};
  expect(proof.public_key).toBe(published.public_key);
  const bundle = await createEvidenceBundle(proof);
  expect((await verifyEvidenceBundle(bundle,{publicKey:await signing.getPublicKeyHex(bindings.SIGNING_KEY)})).valid).toBe(true);
  const originals = (a.data as Record<string, unknown>).acceptance_receipt_inputs as {terms:unknown;report:unknown};
  expect(originals).toMatchObject({terms,report});
  const statement = JSON.parse(proof.signed_payload);
  expect(statement.terms_sha256).toBe(await sha256Hex(jcsCanonicalize(terms)));
  expect(statement.report_sha256).toBe(await sha256Hex(jcsCanonicalize(report)));
  expect(statement).toMatchObject({type:'scvd.contribution-acceptance.v1',decision:'accepted',trust_model:'self_signed',payment_verified:false,issued_at:new Date(now+1000).toISOString(),reviewed_at:new Date(now).toISOString()});
  for(const changed of [{...statement,reward_usd:250},{...statement,report_sha256:'0'.repeat(64)},{...statement,payment_verified:true}]) expect(await verifyMessageSignature(jcsCanonicalize(changed),proof.signature,proof.public_key)).toBe(false);
  const b = await store.act('status', {reservation_key:key}, '', now+2000);
  expect((b.data as Record<string,unknown>).acceptance_receipt).toEqual(proof);
  expect(JSON.stringify(proof)).not.toContain(key);
  expect(JSON.stringify(proof)).not.toContain(report.evidence);
  expect(JSON.stringify(await store.publicView(now))).not.toContain(proof.signature);
  expect((await store.act('status',{reservation_key:'d'.repeat(64)},'',now)).status).toBe(404);
});
it('does not issue an acceptance receipt for rejected work',async()=>{
  const {store}=await fixture('rejected');
  expect((await store.act('status',{reservation_key:key},'',now)).data).not.toHaveProperty('acceptance_receipt');
});
it('preserves acceptance when signing fails and recovers on the same private status',async()=>{
  const {store}=await fixture();
  const sign=vi.spyOn(signing,'signMessage').mockRejectedValueOnce(new Error('secret fixture must not escape'));
  const first=await store.act('status',{reservation_key:key},'',now);
  expect(first.status).toBe(200);
  expect(first.data).toMatchObject({status:'accepted',acceptance_receipt_state:'unavailable'});
  expect(first.data).not.toHaveProperty('acceptance_receipt');
  expect(JSON.stringify(first)).not.toContain('secret fixture');
  sign.mockRestore();
  expect((await store.act('status',{reservation_key:key},'',now+1000)).data).toHaveProperty('acceptance_receipt');
});
it('concurrent pickup retains one receipt and preserves intervening progress',async()=>{
  const {store,id}=await fixture();
  await runInDurableObject(store,async(instance)=>{
    const original=signing.signMessage;
    vi.spyOn(signing,'signMessage').mockImplementationOnce(async(...args)=>{
      await instance.act('progress',{submission_id:id,update_id:'receipt-progress',outcome:'no_change',note:'Keep this note',reference:'https://scvd.store/what'},'',now);
      return original(...args);
    });
    const replies=await Promise.all([instance.act('status',{reservation_key:key},'',now+1000),instance.act('status',{reservation_key:key},'',now+2000)]);
    expect(replies[0]!.data.acceptance_receipt).toEqual(replies[1]!.data.acceptance_receipt);
  });
  expect((await store.adminView())!.reservations[0]!.updates![0]!.note).toBe('Keep this note');
});

it('does not release a receipt whose save failed and retains the original review',async()=>{
  const {store}=await fixture();
  await runInDurableObject(store,async(instance,state)=>{
    const original=state.storage.sql.exec.bind(state.storage.sql);
    const save=vi.spyOn(state.storage.sql,'exec').mockImplementation((query,...args)=>{
      if(query.startsWith('INSERT') && String(args[0]).includes('acceptance_receipt')) throw new Error('fixture save failure');
      return original(query,...args);
    });
    const result=await instance.act('status',{reservation_key:key},'',now);
    expect(result.data).toMatchObject({status:'accepted',acceptance_receipt_state:'unavailable'});
    expect(result.data).not.toHaveProperty('acceptance_receipt');
    save.mockRestore();
  });
  expect((await store.act('status',{reservation_key:key},'',now+1000)).data).toHaveProperty('acceptance_receipt');
});
