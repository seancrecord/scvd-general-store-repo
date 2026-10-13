import { publicationFamilyForPath } from '@/lib/door-paths';
import { ARC_NETWORK } from '@/lib/payment-networks';
import { readGatewayTransfer, gatewayNeedsCheck, isGatewayFinal, type GatewayPayment } from '@/lib/arc-gateway';
import type { PurchaseIntent } from '@/services/purchase-intent';
import { atomicToUsdc, tipFromPaid } from '@/lib/payments';
import { sendAlert } from '@/lib/alerts';
import { indexSettledSale, itemKeyFromPath } from '@/lib/metrics';
import { channelForDoor } from '@/services/mpp-sales';
import type { Env } from '@/types';

export interface GatewaySale {
  purchase_id: string;
  path: string;
  created_at: string;
  checked_at: string;
  payer: string;
  recipient: string;
  amount_atomic: string;
  tip_atomic: string;
  network: typeof ARC_NETWORK;
  house: boolean;
  item?: string;
  payment: GatewayPayment;
}

/** One row per authorization, including penny pages. Never a legacy settle
 * increment: pending receivables, confirmed batches and failed transfers stay
 * distinguishable. Re-publishing the same row is safe after a lost acknowledgement.
 */
export async function publishGatewaySale(env: Env, record: PurchaseIntent): Promise<void> {
  if (record.terms.network !== ARC_NETWORK || !record.payment?.gateway) return;
  const item = record.item?.id ?? publicationFamilyForPath(record.path);
  const tipAtomic = String(Math.round(record.payment.tipUsdc * 1e6));
  const row: GatewaySale = { purchase_id: record.id, path: record.path, created_at: record.created_at,
    checked_at: new Date().toISOString(), payer: record.payer, recipient: record.terms.payTo,
    amount_atomic: record.terms.amount, tip_atomic: tipAtomic, network: ARC_NETWORK, house: record.gateway_house === true, ...(item ? { item } : {}), payment: record.payment.gateway };
  if (!env.COUNTER_LEDGER) throw new Error("Gateway ledger unavailable");
  await env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${record.created_at.slice(0, 7)}/gateway-sales`)).recordGatewaySale(row);
  /*
   * THE SHOP WINDOW, ON FINALITY ONLY (2026-10-13). recordSettlement
   * returns before its index write for this network, so a Gateway sale
   * was counted at /stats and never shown in the glass. It hangs there
   * on the same condition the summary above counts it: a confirmed or
   * completed batch, never an accepted-but-pending one and never a
   * failed one. This function runs on every reconciliation pass, so the
   * row is keyed by the purchase's own instant and id and a repeat is
   * the same put. Swallowed on failure: decoration fails open, and a
   * KV blip here must not disturb the reconciliation that called us.
   */
  if (isGatewayFinal(record.payment.gateway)) {
    await indexSettledSale(env, {
      item: record.item?.id ?? itemKeyFromPath(record.path),
      house: row.house,
      at: record.created_at,
      id: record.id,
      channel: channelForDoor(record.door),
      payment_protocol: "x402-gateway",
      payment_network: ARC_NETWORK,
    }).catch(() => undefined);
  }
}

/** Called inside the purchase Durable Object. Empty history or an API failure
 * never authorizes another payment. Match the full transfer, not just its nonce.
 */
export async function reconcileGatewaySale(env: Env, record: PurchaseIntent): Promise<PurchaseIntent> {
  if (record.terms.network !== ARC_NETWORK || !record.authorization) throw new Error('Gateway purchase evidence missing');
  if (record.payment?.gateway && !gatewayNeedsCheck(record.payment.gateway)) {
    await publishGatewaySale(env, record);
    return record;
  }
  if (Date.now() - Date.parse(record.created_at) > 3_600_000) await sendAlert(env, {
    condition: 'settlement_failure', key: `gateway-pending:${record.id}`,
    detail: `Circle Gateway settlement remains unconfirmed for purchase ${record.id}. Read /admin/gateway and its retained purchase before acting.`,
  });
  const gateway = await readGatewayTransfer(record.terms, record.payer, record.authorization.nonce);
  if (!gateway) {
    await publishGatewaySale(env, record);
    return record;
  }
  const paidUsdc = atomicToUsdc(record.terms.amount);
  const next: PurchaseIntent = { ...record,
    // A failed batch after delivered goods is a house loss, not permission
    // to repeat fulfillment. Keep its original admission and show failed.
    state: gateway.state === 'failed' && record.state === 'unknown' ? 'not_settled' : 'settled',
    payment: { paidUsdc, tipUsdc: tipFromPaid(paidUsdc, record.publication?.minimum_usdc ?? record.item?.price_usdc ?? paidUsdc),
      payer: record.payer, network: ARC_NETWORK, transaction: gateway.reference,
      settleHeaders: record.payment?.settleHeaders ?? {}, gateway },
  };
  await publishGatewaySale(env, next);
  if (gateway.state === 'failed') await sendAlert(env, { condition: 'settlement_failure',
    key: `gateway:${record.id}`, detail: `Circle Gateway reports a failed batch payment for purchase ${record.id}. Check /admin/gateway; delivered goods do not establish settlement.` });
  return next;
}

export { gatewayNeedsCheck, isGatewayFinal };

export async function readGatewaySales(env: Env) {
  const { listKeys } = await import('@/lib/kv-list');
  const { bulkGetJson } = await import('@/lib/kv-bulk');
  const keys = await listKeys(env.COUNTERS, { prefix: 'gateway_sale:', cap: 5000 });
  const records = await bulkGetJson<GatewaySale>(env.COUNTERS, keys.names);
  const rows: GatewaySale[] = [];
  let unreadable = 0;
  for (const key of keys.names) {
    const row = records.get(key);
    if (!row || row.network !== ARC_NETWORK || !/^\d+$/.test(row.amount_atomic) ||
      row.purchase_id !== key.slice('gateway_sale:'.length) || !/^\d+$/.test(row.tip_atomic) || BigInt(row.tip_atomic) > BigInt(row.amount_atomic) || !row.payment ||
      !['accepted','received','batched','confirmed','completed','failed'].includes(row.payment.state) ||
      (isGatewayFinal(row.payment) && !/^0x[0-9a-f]{64}$/i.test(row.payment.batch_transaction ?? ''))) { unreadable++; continue; }
    rows.push(row);
  }
  const confirmed = rows.filter(row => isGatewayFinal(row.payment));
  const pending = rows.filter(row => gatewayNeedsCheck(row.payment));
  return { rows, truncated: keys.truncated, unreadable,
    confirmed: { purchases: confirmed.length, amount_atomic: confirmed.reduce((sum, row) => sum + BigInt(row.amount_atomic), 0n).toString() },
    pending: { purchases: pending.length, amount_atomic: pending.reduce((sum, row) => sum + BigInt(row.amount_atomic), 0n).toString() },
    failed: rows.filter(row => row.payment.state === 'failed').length };
}

export interface GatewaySummary {
  organic: number; house: number; organic_amount_atomic: string; house_amount_atomic: string;
  by_item: Record<string, { organic: number; house: number }>;
}
export const emptyGatewaySummary = (): GatewaySummary => ({ organic: 0, house: 0, organic_amount_atomic: "0", house_amount_atomic: "0", by_item: {} });
export async function readGatewaySummary(env: Env): Promise<GatewaySummary> {
  const { monthsSinceOpening } = await import('@/lib/metrics');
  const { bulkGetJson } = await import('@/lib/kv-bulk');
  const keys = monthsSinceOpening().map(month => `gateway:summary:${month}`);
  const rows = await bulkGetJson<GatewaySummary>(env.COUNTERS, keys);
  const total = emptyGatewaySummary();
  for (const row of rows.values()) {
    if (!row) continue;
    if (![row.organic, row.house].every(n => Number.isSafeInteger(n) && n >= 0) ||
      ![row.organic_amount_atomic, row.house_amount_atomic].every(v => typeof v === 'string' && /^\d+$/.test(v))) throw new Error('Gateway summary unreadable');
    total.organic += row.organic; total.house += row.house;
    total.organic_amount_atomic = String(BigInt(total.organic_amount_atomic) + BigInt(row.organic_amount_atomic));
    total.house_amount_atomic = String(BigInt(total.house_amount_atomic) + BigInt(row.house_amount_atomic));
    for (const [item, counts] of Object.entries(row.by_item)) {
      const target = total.by_item[item] ??= { organic: 0, house: 0 };
      target.organic += counts.organic; target.house += counts.house;
    }
  }
  return total;
}
