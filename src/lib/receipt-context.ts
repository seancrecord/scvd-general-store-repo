import type { EvmChain, RpcReceipt } from "@/lib/base-rpc";

export class ReceiptEvidenceUnavailable extends Error {
  constructor(readonly reason: string) {
    super("Receipt evidence not established");
  }

  /** Only served by a purchase caller that knows settlement has not happened. */
  body() {
    return { code: "receipt_evidence_unavailable", reason: this.reason, charged: false,
      settlement_attempted: false, retry_safe: true, retry_with_same_payment: true,
      temporary: null, verify_url: null,
      error: "The chain response could not establish the requested receipt. This request submitted no payment. Retry the same request and payment later. We cannot tell whether the provider problem is temporary; no observation is available to verify." };
  }
}

/** Provider faults must not become signed conclusions about a payment. */
export function assertReportedChain(reported: unknown, chain: EvmChain): void {
  if (typeof reported !== "string" || !/^0x[0-9a-f]+$/i.test(reported) ||
    BigInt(reported) !== BigInt(chain.caip2.split(":")[1]!)) {
    throw new ReceiptEvidenceUnavailable("chain_not_established");
  }
}

/** Shared by direct and batched observations; null alone means not found. */
export function assertReceiptContext(receipt: RpcReceipt | null, head: number, transaction: string | undefined): void {
  if (!Number.isSafeInteger(head) || head < 0) throw new ReceiptEvidenceUnavailable("head_not_established");
  if (receipt === null) return;
  if (!receipt || typeof receipt !== "object" || typeof transaction !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(transaction) || typeof receipt.transactionHash !== "string" ||
    receipt.transactionHash.toLowerCase() !== transaction.toLowerCase()) throw new ReceiptEvidenceUnavailable("receipt_identity_not_established");
  if (typeof receipt.blockNumber !== "string" || !/^0x[0-9a-f]+$/i.test(receipt.blockNumber)) {
    throw new ReceiptEvidenceUnavailable("block_not_established");
  }
  const block = Number.parseInt(receipt.blockNumber, 16);
  if (!Number.isSafeInteger(block) || block < 0 || block > head) throw new ReceiptEvidenceUnavailable("block_not_established");
  if ((receipt.status !== "0x0" && receipt.status !== "0x1") || !Array.isArray(receipt.logs)) {
    throw new ReceiptEvidenceUnavailable("receipt_status_not_established");
  }
}
