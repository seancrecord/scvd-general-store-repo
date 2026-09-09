// Wire envelopes differ by protocol; assertions below intentionally inspect dynamic JSON fields.
import { SELF } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import { getMenuItem } from '@/store';
import { compactItemContract } from '@/lib/buyer-contract';
import { publicationCheckout } from '@/lib/publication-checkout';
import { CREDIT_RATE, CREDIT_FLOOR_ATOMIC } from '@/services/store-credit';
import { installFacilitatorMock } from './helpers/facilitator-mock';
const base = 'https://scvd.store';
beforeAll(() => installFacilitatorMock());
it('puts the free source, paid value and bounded freshness check at the HTTP quote', async () => {
  const res = await SELF.fetch(base + '/api/buy/spot_check?host=example.com');
  expect(res.status).toBe(402);
  const body = await res.json() as Record<string, any>;
  expect(body.buyer_guidance.free_alternative).toMatchObject({ url: base + '/corpus/host/example.com.json', payment_required: false });
  expect(body.buyer_guidance.free_alternative.paid_adds).toContain('signed');
  expect(body.buyer_guidance.freshness).toMatchObject({ url: base + '/corpus/host/example.com.json?view=stable', request_header: 'If-None-Match', unchanged_status: 304 });
  expect(body.buyer_guidance.freshness.limit).toContain('not a live probe');
  expect(body.buyer_guidance.price_effect).toMatchObject({ minimum_usdc: getMenuItem('spot_check')!.price_usdc, higher_payment_changes_scope: false });
});
it('gives both MCP payment dialects the same guidance as HTTP', async () => {
  const expected = (await (await SELF.fetch(base + '/api/buy/spot_check?host=example.com')).json() as Record<string, any>).buyer_guidance;
  for (const suffix of ['', '?payment=tool-result']) {
    const res = await SELF.fetch(base + '/mcp?view=compact&item_id=spot_check' + (suffix ? '&payment=tool-result' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({jsonrpc:'2.0', id:1, method:'tools/call', params:{ name:'buy_spot_check', arguments:{host:'example.com'} }}) });
    const rpc = await res.json() as Record<string, any>;
    const guidance = suffix ? rpc.result.structuredContent.buyer_guidance : rpc.error.data.buyer_guidance;
    expect(guidance).toEqual(expected);
  }
});
it('distinguishes commissioned labor and existing human writing without invented author dates', () => {
  const collab = compactItemContract(getMenuItem('the_collab')!, base) as Record<string, any>;
  expect(collab.buyer_guidance.production).toMatchObject({ kind:'commissioned_human_work', sla_hours:getMenuItem('the_collab')!.sla_hours });
  expect(collab.buyer_guidance.price_effect.higher_payment_changes_scope).toBe(false);
  const fortune = compactItemContract(getMenuItem('daily_fortune')!, base) as Record<string, any>;
  expect(fortune.buyer_guidance.production).toMatchObject({ kind:'prewritten_human_text', author:'the keeper' });
  expect(fortune.buyer_guidance.production.authored_at).toBeUndefined();
});
it('offers free verification and a concrete correction channel, without implying signature proves truth', async () => {
  const contract = compactItemContract(getMenuItem('spot_check')!, base) as Record<string, any>;
  expect(contract.buyer_guidance.evidence).toMatchObject({ spec_url:base+'/attestation', criteria_url:base+'/criteria', corrections_url:base+'/corrections', report_error:{method:'POST',url:base+'/api/letter',payment_required:false} });
  expect(contract.buyer_guidance.evidence.limit).toContain('truth');
  for (const key of ['spec_url','criteria_url','corrections_url']) expect((await SELF.fetch(contract.buyer_guidance.evidence[key])).status).toBe(200);
  expect(contract.buyer_guidance.recovery).toMatchObject({ status_tool:'check_purchase', requires_status_token:true });
});
it('advertises existing credit terms without promising a discount or credit on publications', async () => {
  const contract = compactItemContract(getMenuItem('spot_check')!, base) as Record<string, any>;
  expect(contract.buyer_guidance.credit).toMatchObject({ rate:CREDIT_RATE, cash_out_floor_atomic:String(CREDIT_FLOOR_ATOMIC), changes_checkout_price:false, proof_of_accrual:'store_credit in the successful fulfillment response', cash_out_wallet_kind:'EVM EOA' });
  expect((publicationCheckout(base) as Record<string, any>).buyer_guidance).toMatchObject({ credit:{ accrues:false }, price_effect:{higher_payment_changes_scope:false}, production:{kind:'existing_publication'} });
  const credit = await (await SELF.fetch(base+'/credit')).json() as Record<string, any>;
  expect(credit.terms).toEqual(contract.buyer_guidance.credit);
});
for (const path of ['/almanac/missing-guidance-fixture', '/gazette/issue-999999', '/zodiac/archive/missing/week-9999']) {
  it('an absent publication offers a free next read: '+path, async () => {
    const response = await SELF.fetch(base+path);
    expect(response.status).toBe(404);
    const body = await response.json() as Record<string, any>;
    expect(body).toMatchObject({charged:false,settlement_attempted:false,retry_same_request:false,next_step:{method:'GET',payment_required:false}});
    expect((await SELF.fetch(body.next_step.url)).status).toBe(200);
  });
}
