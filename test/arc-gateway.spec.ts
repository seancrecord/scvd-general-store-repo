import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { acceptedNetworks, manifestAccepts, railAccepts } from '@/lib/payments';
import type { Env } from '@/types';
const enabled = { ...env, ARC_PAY_TO: '0x3333333333333333333333333333333333333333' } as Env;
describe('Arc Gateway checkout', () => {
  it('adds an independently configured batched offer without altering existing offers', () => {
    const prior = { ...enabled, ARC_PAY_TO: undefined };
    expect(acceptedNetworks(enabled)).toContain('eip155:5042');
    expect(railAccepts(enabled, [.01]).filter(x => x.network !== 'eip155:5042')).toEqual(railAccepts(prior, [.01]));
    const offer = manifestAccepts(enabled, [.01]).find(x => x.network === 'eip155:5042');
    expect(offer).toMatchObject({ scheme: 'exact', asset: '0x3600000000000000000000000000000000000000', amount: '10000', payTo: enabled.ARC_PAY_TO,
      extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee' } });
    expect(offer!.maxTimeoutSeconds).toBeGreaterThanOrEqual(604800);
    expect(acceptedNetworks({ ...enabled, ARC_PAY_TO: 'bad' })).not.toContain('eip155:5042');
  });
});

import { afterEach, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { installMultiPurchaseFacilitatorMock, TEST_PAYER } from './helpers/facilitator-mock';
import { decodePaymentRequired, buildPaymentSignature } from './helpers/payment';
import { app } from '@/index';
import { readGatewayTransfer, GATEWAY_ORIGIN, type GatewayState } from '@/lib/arc-gateway';
import { purchaseIntentStore, purchaseStatus, type PurchaseIntent } from '@/services/purchase-intent';
import { readGatewaySales } from '@/services/gateway-sales';
import { verifyCertificateSignature } from '@/lib/signing';
import type { Certificate } from '@/types';
import type { PaymentRequirements } from '@x402/core/types';
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-12T12:00:00Z")); });
afterAll(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());
const batch = `0x${'aa'.repeat(32)}`;
const transfers = new Map<string, Record<string, unknown>>();
beforeEach(async () => {
  transfers.clear();
  const { listKeys } = await import('@/lib/kv-list');
  for (const prefix of ['gateway_sale:', 'gateway:']) {
    const keys = await listKeys(enabled.COUNTERS, { prefix, cap: 5000 });
    for (const key of keys.names) await enabled.COUNTERS.delete(key);
  }
  await enabled.COUNTER_LEDGER!.get(enabled.COUNTER_LEDGER!.idFromName('2026-10/gateway-sales')).reset();
});
function gatewayMock() {
  const standard = installMultiPurchaseFacilitatorMock();
  const prior = globalThis.fetch;
  let settles = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== GATEWAY_ORIGIN) return prior(input, init);
    if (url.pathname.endsWith('/transfers')) return Response.json({ transfers: transfers.has(url.searchParams.get('nonce')!) ? [transfers.get(url.searchParams.get('nonce')!)] : [] });
    const body = JSON.parse(String(init?.body)) as { paymentPayload: { payload: { authorization: { nonce: string } } }; paymentRequirements: PaymentRequirements };
    if (url.pathname.endsWith('/verify')) return Response.json({ isValid: true, payer: TEST_PAYER });
    if (url.pathname.endsWith('/settle')) {
      settles++;
      const terms = body.paymentRequirements, nonce = body.paymentPayload.payload.authorization.nonce;
      transfers.set(nonce, { id: crypto.randomUUID(), status: 'received', token: 'USDC', sendingNetwork: terms.network, recipientNetwork: terms.network,
        fromAddress: TEST_PAYER, toAddress: terms.payTo, amount: terms.amount, nonce, txHash: null });
      return Response.json({ success: true, payer: TEST_PAYER, network: terms.network, transaction: crypto.randomUUID() });
    }
    throw new Error('Unexpected Circle request');
  });
  return { standard, count: () => settles };
}
interface PaidBody { charged?: boolean | null; paid_usdc?: number; accepted_usdc?: number; certificate: Certificate; signature: string; public_key: string; recovery: { purchase_id: string }; attest_this_purchase?: unknown }

it('delivers once on HTTP, signs acceptance, and tracks later batch settlement without inflating legacy counters', async () => {
  const mock = gatewayMock();
  const url = 'https://scvd.store/api/buy/hello';
  const quote = await app.request(url, {}, enabled);
  expect(quote.status).toBe(402);
  const offer = decodePaymentRequired(quote).accepts.find(x => x.network === 'eip155:5042')!;
  expect(offer.extra).toMatchObject({ name: 'GatewayWalletBatched', verifyingContract: '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee' });
  const payment = buildPaymentSignature(offer);
  const nonce = JSON.parse(atob(payment)).payload.authorization.nonce as string;
  const headers = { 'PAYMENT-SIGNATURE': payment, 'Idempotency-Key': crypto.randomUUID() };
  const paid = await app.request(url, { headers }, enabled);
  expect(paid.status).toBe(200);
  const header = JSON.parse(atob(paid.headers.get('PAYMENT-RESPONSE')!)) as { gateway?: { settlement_pending: boolean } };
  expect(header.gateway?.settlement_pending).toBe(true);
  const body = await paid.json() as PaidBody;
  expect(body.certificate.gateway_payment).toMatchObject({ nonce, state: 'accepted' });
  expect(body.certificate.settlement_tx).toBeUndefined();
  const { deliveryFailedBody } = await import('@/lib/delivery-failed');
  expect(deliveryFailedBody(enabled.STORE_BASE_URL, { name: 'fixture' }, { paidUsdc: .01, tipUsdc: 0, transaction: body.certificate.gateway_payment!.reference, network: offer.network, settleHeaders: {}, gateway: body.certificate.gateway_payment })).toMatchObject({ charged: null, transaction: null, accepted_usdc: .01 });
  expect(body.paid_usdc).toBeUndefined();
  expect(body.accepted_usdc).toBe(Number(offer.amount) / 1e6);
  const { settlementStateFor } = await import('@/services/settlement-state');
  expect(await settlementStateFor(enabled, body.certificate)).toMatchObject({ payment_state: 'gateway_recorded_at_issue' });
  const html = await (await app.request(`https://scvd.store/api/verify/${body.certificate.cert_id}`, { headers: { Accept: 'text/html' } }, enabled)).text();
  expect(html).toContain('Gateway accepted at issue');
  expect(html).not.toContain('Free shelf — no payment moved');
  expect(body.certificate.paid_usdc).toBeUndefined();
  expect(body.certificate.accepted_usdc).toBe(Number(offer.amount) / 1e6);
  expect(body.attest_this_purchase).toBeUndefined();
  expect(await verifyCertificateSignature(body.certificate, body.signature, body.public_key)).toBe(true);
  expect(await verifyCertificateSignature({ ...body.certificate, gateway_payment: { ...body.certificate.gateway_payment!, state: 'completed' } }, body.signature, body.public_key)).toBe(false);
  const replay = await (await app.request(url, { headers }, enabled)).json() as PaidBody;
  expect(replay.certificate.cert_id).toBe(body.certificate.cert_id);
  expect(replay.charged).not.toBe(true);
  const { claimedGood } = await import('@/services/claimed-good');
  const claimed = await claimedGood(enabled, TEST_PAYER, body.certificate.cert_id);
  expect(claimed.body).toMatchObject({ recovery_state: 'ready', charged: null });
  expect(mock.count()).toBe(1);
  expect(mock.standard.settleCalls).toBe(0);
  const stub = purchaseIntentStore(enabled, body.recovery.purchase_id);
  let record = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(purchaseStatus(record)).toMatchObject({ payment_state: 'accepted', charged: null, transaction: null });
  expect((await readGatewaySales(enabled)).rows.find(r => r.purchase_id === record.id)?.payment.state).toBe('accepted');
  await runDurableObjectAlarm(stub);
  record = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(record.payment?.gateway?.state).toBe('received');
  transfers.set(nonce, { ...transfers.get(nonce), status: 'confirmed', txHash: batch });
  await runDurableObjectAlarm(stub);
  record = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(purchaseStatus(record)).toMatchObject({ payment_state: 'confirmed', charged: true, transaction: batch });
  expect(record.payment?.transaction).not.toBe(batch);
  const ledger = enabled.COUNTER_LEDGER!.get(enabled.COUNTER_LEDGER!.idFromName(`${record.created_at.slice(0,7)}/gateway-sales`));
  await runDurableObjectAlarm(ledger);
  const sales = await readGatewaySales(enabled);
  expect(sales.confirmed.purchases).toBe(1);
  const row = sales.rows.find(r => r.purchase_id === record.id)!;
  await Promise.all([ledger.recordGatewaySale(row), ledger.recordGatewaySale(row)]);
  await ledger.recordGatewaySale({ ...row, payment: { ...row.payment, state: 'accepted' } });
  await runDurableObjectAlarm(ledger);
  const { readGatewaySummary } = await import('@/services/gateway-sales');
  expect((await readGatewaySummary(enabled)).organic).toBe(1);
  await expect((async () => await ledger.recordGatewaySale({ ...row, amount_atomic: '999999' }))()).rejects.toThrow('Gateway sale evidence changed');
  const { computeStats } = await import('@/services/stats');
  const stats = await computeStats(enabled);
  expect(stats.payment_sources?.find(s => s.protocol === 'x402-gateway')).toMatchObject({ organic: 1, house: 0 });
  expect(stats.organic_by_rail?.arc).toBe(1);
  const { taxRows } = await import('@/services/tax-export');
  const exported = (await taxRows(enabled)).rows.filter(r => r.purchase_id === record.id);
  expect(exported).toHaveLength(1);
  expect(exported[0]).toMatchObject({ cert_id: body.certificate.cert_id, settlement_tx: batch, payment_protocol: 'x402-gateway', amount_usdc: Number(offer.amount) / 1e6 });
  expect(await runDurableObjectAlarm(stub)).toBe(false);
});

it('also delivers and replays the same Gateway purchase through MCP', async () => {
  const mock = gatewayMock();
  const rpc = async (meta?: Record<string, unknown>) => {
    const response = await app.request('https://scvd.store/mcp?item_id=hello&payment=tool-result', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'buy_hello', arguments: {}, ...(meta ? { _meta: meta } : {}) } }) }, enabled);
    return await response.json() as { result: { isError?: boolean; structuredContent: { accepts?: PaymentRequirements[]; cert_id?: string; certificate?: Certificate } } };
  };
  const quote = await rpc(), offer = quote.result.structuredContent.accepts!.find(r => r.network === 'eip155:5042')!;
  expect(offer).toBeDefined();
  const meta = { 'x402/payment': JSON.parse(atob(buildPaymentSignature(offer))), 'x402/idempotency-key': crypto.randomUUID() };
  const first = await rpc(meta), again = await rpc(meta);
  expect(first.result.isError).not.toBe(true);
  expect(first.result.structuredContent.cert_id).toBeTruthy();
  expect(again.result.structuredContent.cert_id).toBe(first.result.structuredContent.cert_id);
  expect(mock.count()).toBe(1);
});

it.each(['amount', 'nonce', 'toAddress', 'fromAddress', 'sendingNetwork', 'recipientNetwork', 'txHash'])('refuses mismatched history field %s', async field => {
  gatewayMock();
  const nonce = `0x${'a1'.repeat(32)}`;
  const terms = { ...manifestAccepts(enabled, [.01]).find(r => r.network === 'eip155:5042')! } as PaymentRequirements;
  transfers.set(nonce, { id: crypto.randomUUID(), status: 'confirmed' satisfies GatewayState, token: 'USDC', sendingNetwork: terms.network, recipientNetwork: terms.network,
    fromAddress: TEST_PAYER, toAddress: terms.payTo, amount: terms.amount, nonce, txHash: batch, [field]: 'wrong' });
  await expect(readGatewayTransfer(terms, TEST_PAYER, nonce)).rejects.toThrow();
});

it('authenticates an expired Gateway authorization for recovery using its Gateway signing contract', async () => {
  const { privateKeyToAccount } = await import('viem/accounts');
  const { authorizationTypes } = await import('@x402/evm');
  const { paymentRecoverySigners } = await import('@/lib/payment-recovery-signature');
  const { GATEWAY_EXTRA } = await import('@/lib/arc-gateway');
  const signer = privateKeyToAccount(`0x${'01'.repeat(32)}`);
  const accepted = manifestAccepts(enabled, [.01]).find(r => r.network === 'eip155:5042')!;
  const authorization = { from: signer.address, to: enabled.ARC_PAY_TO as `0x${string}`, value: '10000', validAfter: '0', validBefore: '1', nonce: `0x${'a2'.repeat(32)}` as `0x${string}` };
  const signature = await signer.signTypedData({ domain: { name: GATEWAY_EXTRA.name, version: GATEWAY_EXTRA.version, verifyingContract: GATEWAY_EXTRA.verifyingContract, chainId: 5042 },
    types: authorizationTypes, primaryType: 'TransferWithAuthorization', message: { ...authorization, value: 10000n, validAfter: 0n, validBefore: 1n } });
  const wire = { x402Version: 2, accepted, payload: { signature, authorization } };
  expect(await paymentRecoverySigners(wire)).toEqual({ network: accepted.network, payers: [signer.address.toLowerCase()] });
  expect(await paymentRecoverySigners({ ...wire, accepted: { ...accepted, extra: { ...accepted.extra, verifyingContract: accepted.asset } } })).toBeNull();
});

it('distinguishes two payments that eventually share the same batch hash', async () => {
  gatewayMock();
  const terms = manifestAccepts(enabled, [.01]).find(r => r.network === 'eip155:5042')! as PaymentRequirements;
  const receipts = [];
  for (const byte of ['a3', 'a4']) {
    const nonce = `0x${byte.repeat(32)}`;
    transfers.set(nonce, { id: crypto.randomUUID(), status: 'completed', token: 'USDC', sendingNetwork: terms.network, recipientNetwork: terms.network,
      fromAddress: TEST_PAYER, toAddress: terms.payTo, amount: terms.amount, nonce, txHash: batch });
    receipts.push(await readGatewayTransfer(terms, TEST_PAYER, nonce));
  }
  expect(receipts[0]?.batch_transaction).toBe(receipts[1]?.batch_transaction);
  expect(receipts[0]?.reference).not.toBe(receipts[1]?.reference);
});

it('quotes and completes an Arc platform checkout with the same recovery and receipt rules', async () => {
  const mock = gatewayMock();
  const { variantGid } = await import('@/lib/ucp/ids');
  const { ucpCheckoutStore } = await import('@/services/ucp-checkout-store');
  const prefix = 'https://scvd.store/ucp/v1/checkout-sessions';
  const created = await app.request(prefix, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line_items: [{ item: { id: variantGid('hello') }, quantity: 1 }], 'store.scvd': { network: 'eip155:5042' } }) }, enabled);
  expect(created.status, await created.clone().text()).toBe(201);
  const checkout = await created.json() as { id: string };
  const stored = await ucpCheckoutStore(enabled, checkout.id).readUcpCheckout();
  expect(stored?.quote?.terms.network).toBe('eip155:5042');
  const { frozenRequirements } = await import('@/lib/ucp/checkout/requirements');
  const offer = frozenRequirements(enabled, 'eip155:5042', stored!.quote!.terms.amount_atomic);
  const credential = JSON.parse(atob(buildPaymentSignature(offer)));
  const completed = await app.request(`${prefix}/${checkout.id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment: { instruments: [{ type: 'x402', credential }] } }) }, enabled);
  expect(completed.status).toBe(200);
  const done = await ucpCheckoutStore(enabled, checkout.id).readUcpCheckout();
  expect(done?.status).toBe('completed');
  const record = JSON.parse((await purchaseIntentStore(enabled, done!.completion!.payment_identity).existingPurchase())!) as PurchaseIntent;
  expect(record.payment?.gateway?.state).toBe('accepted');
  expect(record.payment?.transaction).toBe(`gateway:${record.id}`);
  expect(mock.count()).toBe(1);
});

it('recovers an accepted payment after a lost settle response without submitting it again', async () => {
  const mock = gatewayMock();
  const wrapped = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const result = await wrapped(input, init);
    if (url === `${GATEWAY_ORIGIN}/v1/x402/settle`) throw new Error('Lost acknowledgement');
    return result;
  });
  const url = 'https://scvd.store/api/buy/hello';
  const quote = decodePaymentRequired(await app.request(url, {}, enabled));
  const offer = quote.accepts.find(r => r.network === 'eip155:5042')!;
  const wire = buildPaymentSignature(offer);
  const nonce = JSON.parse(atob(wire)).payload.authorization.nonce as string;
  const { settlementPurchaseIdentity } = await import('@/lib/purchase-payment');
  const { id } = await settlementPurchaseIdentity(offer.network, TEST_PAYER, nonce, 'authorization');
  const response = await app.request(url, { headers: { 'PAYMENT-SIGNATURE': wire } }, enabled);
  expect(response.status).toBe(503);
  const stub = purchaseIntentStore(enabled, id);
  expect((JSON.parse((await stub.existingPurchase())!) as PurchaseIntent).state).toBe('unknown');
  await runDurableObjectAlarm(stub);
  const recovered = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(recovered.payment?.gateway?.state).toBe('received');
  expect(recovered.delivery).toBeTruthy();
  expect(mock.count()).toBe(1);
  expect(purchaseStatus(recovered).charged).toBeNull();
});

it('keeps a failed batch out of revenue without delivering or charging again', async () => {
  const mock = gatewayMock();
  const url = 'https://scvd.store/api/buy/hello';
  const offer = decodePaymentRequired(await app.request(url, {}, enabled)).accepts.find(r => r.network === 'eip155:5042')!;
  const wire = buildPaymentSignature(offer), headers = { 'PAYMENT-SIGNATURE': wire };
  const nonce = JSON.parse(atob(wire)).payload.authorization.nonce as string;
  const first = await (await app.request(url, { headers }, enabled)).json() as PaidBody;
  const stub = purchaseIntentStore(enabled, first.recovery.purchase_id);
  transfers.set(nonce, { ...transfers.get(nonce), status: 'failed' });
  await runDurableObjectAlarm(stub);
  const record = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(purchaseStatus(record)).toMatchObject({ payment_state: 'failed', charged: false, delivery_state: 'delivered' });
  const replay = await (await app.request(url, { headers }, enabled)).json() as PaidBody;
  expect(replay.certificate.cert_id).toBe(first.certificate.cert_id);
  expect(mock.count()).toBe(1);
  const { taxRows } = await import('@/services/tax-export');
  expect((await taxRows(enabled)).rows.some(row => row.purchase_id === record.id)).toBe(false);
  expect(await runDurableObjectAlarm(stub)).toBe(false);
});

it('offers and retains a paid publication with no certificate', async () => {
  const mock = gatewayMock();
  const { ALMANAC_ENTRIES } = await import('@/store/almanac');
  const url = `https://scvd.store/almanac/${ALMANAC_ENTRIES[0]!.slug}`;
  const quote = await app.request(url, {}, enabled);
  expect(quote.status).toBe(402);
  const offer = decodePaymentRequired(quote).accepts.find(r => r.network === 'eip155:5042')!;
  const wire = buildPaymentSignature(offer), headers = { 'PAYMENT-SIGNATURE': wire };
  const response = await app.request(url, { headers }, enabled);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('text/markdown');
  const page = await response.text();
  expect(await (await app.request(url, { headers }, enabled)).text()).toBe(page);
  const recovery = JSON.parse(atob(response.headers.get('Purchase-Recovery')!)) as { purchase_id: string };
  const row = (await readGatewaySales(enabled)).rows.find(r => r.purchase_id === recovery.purchase_id)!;
  expect(row.item).toBe('almanac');
  expect(row.payment.state).toBe('accepted');
  expect(mock.count()).toBe(1);
});

it('prepares goods before submitting a Gateway payment', async () => {
  const mock = gatewayMock();
  const { Hono } = await import('hono');
  const { paymentGate } = await import('@/lib/payment-gate');
  const broken = new Hono<import('@/types').HonoEnv>();
  broken.use('/api/buy/*', paymentGate);
  broken.get('/api/buy/hello', c => c.json({ error: 'preparation unavailable' }, 503));
  const url = 'https://scvd.store/api/buy/hello';
  const offer = decodePaymentRequired(await broken.request(url, {}, enabled)).accepts.find(r => r.network === 'eip155:5042')!;
  expect((await broken.request(url, { headers: { 'PAYMENT-SIGNATURE': buildPaymentSignature(offer) } }, enabled)).status).toBe(503);
  expect(mock.count()).toBe(0);
});

it('keeps an unreadable Gateway settlement pending rather than permitting repayment', async () => {
  const mock = gatewayMock();
  const prior = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/v1/x402/settle')) return Response.json({ success: true, network: 'eip155:8453', payer: TEST_PAYER });
    return prior(input, init);
  });
  const url = 'https://scvd.store/api/buy/hello';
  const offer = decodePaymentRequired(await app.request(url, {}, enabled)).accepts.find(r => r.network === 'eip155:5042')!;
  const wire = buildPaymentSignature(offer), headers = { 'PAYMENT-SIGNATURE': wire };
  const result = await app.request(url, { headers }, enabled);
  expect(result.status).toBe(503);
  const nonce = JSON.parse(atob(wire)).payload.authorization.nonce as string;
  const { settlementPurchaseIdentity } = await import('@/lib/purchase-payment');
  const { id } = await settlementPurchaseIdentity(offer.network, TEST_PAYER, nonce, 'authorization');
  const stub = purchaseIntentStore(enabled, id);
  await runDurableObjectAlarm(stub);
  expect(purchaseStatus(JSON.parse((await stub.existingPurchase())!) as PurchaseIntent)).toMatchObject({ payment_state: 'unknown', charged: null });
  expect(mock.count()).toBe(0);
});

it('signs queued work as Gateway acceptance and qualifies its refund amount', async () => {
  const { createOrder, completeOrder } = await import('@/services/orders');
  const { MENU_ITEMS } = await import('@/store/menu');
  const { orderStatusBody } = await import('@/lib/order-status');
  const order = await createOrder(enabled, { item: MENU_ITEMS.find(item => item.fulfillment === 'human_queue' && !item.stocked)!, paidUsdc: 25, tipUsdc: 0,
    certId: 'cert_gateway_order', patronNumber: 500, payer: TEST_PAYER,
    gatewayPayment: { reference: `gateway:${'b1'.repeat(32)}`, nonce: `0x${'b2'.repeat(32)}`, state: 'accepted' } });
  const proof = JSON.parse(order.commission!.signed_payload);
  expect(proof.accepted_usdc).toBe(25);
  expect(proof.paid_usdc).toBeUndefined();
  expect(proof.gateway_payment_at_issue.state).toBe('accepted');
  expect(await completeOrder(enabled, order.order_id, 'Completed fixture work')).toBeTruthy();
  const status = orderStatusBody(enabled.STORE_BASE_URL, order, Date.parse(order.created_at) + (order.sla_hours + 1) * 3600000);
  expect(status.window_breached).toMatchObject({ settlement_check_required: true, refund_ceiling_usdc: 25 });
  expect(status.window_breached).not.toHaveProperty('owed_usdc');
});


it('keeps Gateway accounting behind keeper authentication and prevents response caching', async () => {
  const missing = await app.request('https://scvd.store/admin/gateway', {}, enabled);
  expect(missing.status).toBe(401);
  expect(missing.headers.get('Cache-Control')).toBe('no-store');
  const reading = await app.request('https://scvd.store/admin/gateway', { headers: {
    Authorization: `Basic ${btoa(`keeper:${enabled.ADMIN_PASSWORD}`)}`, Accept: 'application/json',
  } }, enabled);
  expect(reading.status).toBe(200);
  expect(reading.headers.get('Cache-Control')).toBe('no-store');
  expect(await reading.json()).toMatchObject({ rows: [], pending: { purchases: 0 }, confirmed: { purchases: 0 } });
});
