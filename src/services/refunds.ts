import { listKeys } from "@/lib/kv-list";
import { newRefundId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, RefundRecord } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/** Ceiling on a refunds scan. Named because an unnamed cap is a silent one. */
const REFUND_CAP = 500;

/**
 * The refund ledger. Records stay honest about pending vs paid.
 * The Worker never holds a key and never sends money; the keeper
 * pays refunds by hand on Sundays and marks them paid here with
 * the transaction hash. Built as general back-office plumbing —
 * not tied to any novelty product.
 */

export interface CreateRefundInput {
  item: string;
  amountUsdc: number;
  payer?: string;
  /**
   * The order this refund covers, when the caller knows it. Turns the
   * refund-window detector's item+payer guess into an exact join —
   * see the note on RefundRecord.order_id.
   */
  orderId?: string;
}

export async function createRefund(
  env: Env,
  input: CreateRefundInput,
): Promise<RefundRecord> {
  const record: RefundRecord = {
    refund_id: newRefundId(),
    item: input.item,
    amount_usdc: input.amountUsdc,
    status: "refund_pending",
    created_at: new Date().toISOString(),
  };
  if (input.payer) {
    record.payer = input.payer;
  }
  if (input.orderId) {
    record.order_id = input.orderId;
  }
  await kvPut(env.ORDERS, 
    KV_KEYS.refund(record.refund_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getRefund(
  env: Env,
  refundId: string,
): Promise<RefundRecord | null> {
  return kvGetJson<RefundRecord>(env.ORDERS, KV_KEYS.refund(refundId), "json");
}

export async function listRefunds(env: Env): Promise<RefundRecord[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.refundPrefix, cap: REFUND_CAP });
  const values = await bulkGetJson<RefundRecord>(
    env.ORDERS,
    listed.names,
  );
  const refunds: RefundRecord[] = [];
  for (const record of values.values()) {
    if (record) {
      refunds.push(record);
    }
  }
  return refunds.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function markRefundPaid(
  env: Env,
  refundId: string,
  txHash: string,
): Promise<RefundRecord | null> {
  const record = await getRefund(env, refundId);
  if (!record) {
    return null;
  }
  record.status = "refund_paid";
  record.tx_hash = txHash;
  record.paid_at = new Date().toISOString();
  await kvPut(env.ORDERS, KV_KEYS.refund(refundId), JSON.stringify(record));
  return record;
}
