import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { ARC_NETWORK } from '@/lib/payment-networks';
import { withoutQuoteStamp } from '@/lib/quote-stamp';
import { extractPaymentNonce, payerOfVerifiedPayload } from '@/lib/replay-guard';
import { settlementPurchaseIdentity } from '@/lib/purchase-payment';
import { isRecord } from '@/types';

// Circle mainnet /v1/x402/supported, read 2026-10-12. This is Gateway's
// signing contract, not the ERC-20 asset. Arc's ERC-20 USDC uses six decimals.
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
export const GATEWAY_ORIGIN = 'https://gateway-api.circle.com';
export const GATEWAY_EXTRA = { name: 'GatewayWalletBatched', version: '1',
  verifyingContract: '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee', minValiditySeconds: 604800 } as const;
export const GATEWAY_WINDOW_SECONDS = GATEWAY_EXTRA.minValiditySeconds + 100;
export const GATEWAY_KIND = { x402Version: 2, scheme: 'exact', network: ARC_NETWORK, extra: GATEWAY_EXTRA } as const;
export type GatewayState = 'accepted' | 'received' | 'batched' | 'confirmed' | 'completed' | 'failed';
export interface GatewayPayment {
  reference: string;
  nonce: string;
  state: GatewayState;
  transfer_id?: string;
  batch_transaction?: string;
}
export const isGatewayFinal = (payment: GatewayPayment) => payment.state === 'confirmed' || payment.state === 'completed';
export const gatewayCharged = (payment: GatewayPayment): boolean | null => isGatewayFinal(payment) ? true : payment.state === 'failed' ? false : null;
export const gatewayNeedsCheck = (payment?: GatewayPayment) => !!payment && !isGatewayFinal(payment) && payment.state !== 'failed';

export class ArcGatewayScheme extends ExactEvmScheme {
  override async enhancePaymentRequirements(requirements: PaymentRequirements): Promise<PaymentRequirements> {
    return { ...requirements, maxTimeoutSeconds: GATEWAY_WINDOW_SECONDS, extra: { ...GATEWAY_EXTRA } };
  }
}

export async function gatewayPayment(payload: unknown, transaction: string): Promise<GatewayPayment> {
  const nonce = extractPaymentNonce(payload), payer = payerOfVerifiedPayload(payload);
  if (!nonce || !/^0x[0-9a-f]{64}$/i.test(nonce) || !payer) throw new Error('Gateway payment identity unavailable');
  const { id } = await settlementPurchaseIdentity(ARC_NETWORK, payer, nonce, 'authorization');
  const reference = `gateway:${id}`;
  if (transaction !== reference) throw new Error('Gateway payment reference mismatch');
  return { reference, nonce: nonce.toLowerCase(), state: 'accepted' };
}

function assertTerms(payload: PaymentPayload, terms: PaymentRequirements) {
  const auth = isRecord(payload.payload.authorization) ? payload.payload.authorization : {};
  if (terms.network !== ARC_NETWORK || terms.scheme !== 'exact' || terms.asset.toLowerCase() !== ARC_USDC.toLowerCase() ||
    terms.extra?.name !== GATEWAY_EXTRA.name || terms.extra?.version !== GATEWAY_EXTRA.version ||
    String(terms.extra?.verifyingContract).toLowerCase() !== GATEWAY_EXTRA.verifyingContract ||
    String(auth.to).toLowerCase() !== terms.payTo.toLowerCase() || auth.value !== terms.amount ||
    !payerOfVerifiedPayload(payload) || !/^0x[0-9a-f]{64}$/i.test(String(auth.nonce))) {
    throw new Error('Gateway terms do not match the accepted authorization');
  }
}

/** Route only Arc to Circle. No CDP credentials cross the service boundary.
 * Pinned supported metadata keeps a Circle outage from closing the other rails;
 * Circle still verifies every offered payment, and no fallback can charge it.
 * We use the existing x402 client interface without adding a signing dependency.
 */
export class ArcGatewayFacilitator extends HTTPFacilitatorClient {
  constructor(private readonly standard: HTTPFacilitatorClient) { super({ url: `${GATEWAY_ORIGIN}/v1/x402`, timeoutMs: 15000 }); }
  override async getSupported() {
    const supported = await this.standard.getSupported();
    return { ...supported, kinds: [...supported.kinds.filter(k => k.network !== ARC_NETWORK), GATEWAY_KIND] };
  }
  override async verify(payload: PaymentPayload, terms: PaymentRequirements) {
    if (terms.network !== ARC_NETWORK) return this.standard.verify(payload, terms);
    assertTerms(payload, terms);
    const result = await gatewayPost('verify', payload, terms);
    if (!isRecord(result) || typeof result.isValid !== 'boolean') throw new Error('Gateway verification unavailable');
    if (!result.isValid) return { isValid: false, invalidReason: 'gateway_verification_declined' };
    const payer = payerOfVerifiedPayload(payload)!;
    if (typeof result.payer !== 'string' || result.payer.toLowerCase() !== payer.toLowerCase()) throw new Error('Gateway payer mismatch');
    return { isValid: true, payer };
  }
  override async settle(payload: PaymentPayload, terms: PaymentRequirements) {
    if (terms.network !== ARC_NETWORK) return this.standard.settle(payload, terms);
    assertTerms(payload, terms);
    const result = await gatewayPost('settle', payload, terms);
    if (isRecord(result) && result.success === false && !result.transaction) return { success: false, network: ARC_NETWORK as typeof ARC_NETWORK, transaction: '', errorReason: 'gateway_payment_declined' };
    // An unrecognized response is uncertainty, never a refusal permitting repayment.
    if (!isRecord(result) || result.success !== true || result.network !== ARC_NETWORK ||
      typeof result.payer !== 'string' || result.payer.toLowerCase() !== payerOfVerifiedPayload(payload)?.toLowerCase()) {
      throw new Error('Gateway acceptance not established; read purchase status');
    }
    const nonce = extractPaymentNonce(payload)!;
    const { id } = await settlementPurchaseIdentity(ARC_NETWORK, result.payer, nonce, 'authorization');
    // A batch hash cannot identify an individual purchase. This namespaced
    // reference coordinates recovery; it must never become settlement_tx.
    return { success: true, network: ARC_NETWORK as typeof ARC_NETWORK, payer: result.payer,
      transaction: `gateway:${id}`, gateway: { state: 'accepted', nonce, settlement_pending: true } };
  }
}

async function gatewayPost(lane: 'verify' | 'settle', payload: PaymentPayload, requirements: PaymentRequirements): Promise<unknown> {
  try {
    const response = await fetch(`${GATEWAY_ORIGIN}/v1/x402/${lane}`, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ paymentPayload: withoutQuoteStamp(payload), paymentRequirements: requirements }) });
    if (!response.ok) throw new Error('Gateway unavailable');
    return await response.json();
  } catch { throw new Error(`Gateway ${lane} unavailable`); }
}

/** Read-only transfer history. No key, signature, or payment is sent here. */
export async function readGatewayTransfer(terms: PaymentRequirements, payer: string, nonce: string): Promise<GatewayPayment | null> {
  const { id } = await settlementPurchaseIdentity(ARC_NETWORK, payer, nonce, 'authorization');
  const query = new URLSearchParams({ network: ARC_NETWORK, nonce, from: payer, to: terms.payTo, pageSize: '2' });
  const response = await fetch(`${GATEWAY_ORIGIN}/v1/x402/transfers?${query}`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Gateway history unavailable');
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.transfers)) throw new Error('Gateway history unreadable');
  if (!body.transfers.length) return null;
  if (body.transfers.length !== 1 || (isRecord(body.pagination) && body.pagination.pageAfter) || response.headers.get('Link')?.includes('rel="next"')) throw new Error('Gateway transfer identity ambiguous');
  const transfer: unknown = body.transfers[0];
  if (!isRecord(transfer) || typeof transfer.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(transfer.id) ||
    transfer.token !== 'USDC' || transfer.sendingNetwork !== ARC_NETWORK || transfer.recipientNetwork !== ARC_NETWORK ||
    String(transfer.fromAddress).toLowerCase() !== payer.toLowerCase() || String(transfer.toAddress).toLowerCase() !== terms.payTo.toLowerCase() ||
    String(transfer.nonce).toLowerCase() !== nonce.toLowerCase() || !gatewayAmountMatches(transfer.amount, terms.amount) ||
    !['received', 'batched', 'confirmed', 'completed', 'failed'].includes(String(transfer.status))) {
    throw new Error('Gateway transfer does not match purchase');
  }
  const state = transfer.status as GatewayState;
  const tx = typeof transfer.txHash === 'string' && /^0x[0-9a-f]{64}$/i.test(transfer.txHash) ? transfer.txHash : undefined;
  if ((state === 'confirmed' || state === 'completed') && !tx) throw new Error('Gateway batch transaction unavailable');
  return { reference: `gateway:${id}`, nonce: nonce.toLowerCase(), state, transfer_id: transfer.id, ...(tx ? { batch_transaction: tx } : {}) };
}

// Transfer history uses atomic USDC. Verified against Circle's public Arc
// transfer 707fbaaf-779a-4e27-ab0f-a86892d26903 and its batch's 500-unit credit.
export function gatewayAmountMatches(amount: unknown, atomic: string): boolean {
  return typeof amount === 'string' && /^\d+$/.test(amount) && /^\d+$/.test(atomic) && BigInt(amount) === BigInt(atomic);
}
