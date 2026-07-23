import { newRefundId } from "@/lib/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, RefundRecord } from "@/types";

/**
 * The refund ledger, born with a_secret (the scam that refunds).
 * Records are created after settle. The Worker never holds a key
 * and never sends money; the keeper pays refunds by hand on Sundays
 * and marks them paid here with the transaction hash. The status
 * route tells the truth about pending vs paid, always.
 */

export interface CreateRefundInput {
  item: string;
  amountUsdc: number;
  payer?: string;
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
  await env.ORDERS.put(
    KV_KEYS.refund(record.refund_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getRefund(
  env: Env,
  refundId: string,
): Promise<RefundRecord | null> {
  return env.ORDERS.get<RefundRecord>(KV_KEYS.refund(refundId), "json");
}

export async function listRefunds(env: Env): Promise<RefundRecord[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.refundPrefix });
  const refunds: RefundRecord[] = [];
  for (const key of listed.keys) {
    const record = await env.ORDERS.get<RefundRecord>(key.name, "json");
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
  await env.ORDERS.put(KV_KEYS.refund(refundId), JSON.stringify(record));
  return record;
}
