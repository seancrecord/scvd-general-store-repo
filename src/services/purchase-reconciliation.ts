import { publicationDelivery } from "@/lib/publication-recovery";
import { observationCheckpoint } from "@/services/purchase-observation";
import type { Env } from "@/types";
import type { PurchaseIntent } from "@/services/purchase-intent";
import { atomicToUsdc, tipFromPaid } from "@/lib/payments";
import { evmChainOf, getFinalizedBlockNumber, getBlockTimestamp, findAuthorizationUseInRange,
  getReceipt, usdcAuthorizations, usdcTransfers, isSameAddress, type EvmChain } from "@/lib/base-rpc";
import { httpArtifactDigest, supportsArtifactRecovery, supportsObservationRecovery } from "@/lib/artifact-checkpoint";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { purchaseInputFrom, queryArgs, toolArgs } from "@/lib/purchase-args";
import { fulfillPurchase } from "@/services/fulfillment";
import { reconcileSolanaPurchase } from "@/services/solana-purchase-reconciliation";

/** Find a real timestamp boundary, not an estimate based on another chain's block rate. */
async function firstBlock(env: Env, chain: EvmChain, head: number, since: number): Promise<number> {
  let low = 0, high = head;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const at = await getBlockTimestamp(env, mid, chain);
    if (!at || !Number.isFinite(at.getTime())) throw new Error("Block time unavailable");
    if (at.getTime() < since) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** A nonce event alone does not prove that this buyer paid these terms. */
export async function reconcilePurchase(env: Env, record: PurchaseIntent): Promise<Pick<PurchaseIntent, "payment" | "reconciliation">> {
  if (record.state !== "unknown") return {};
  if (record.solana) return reconcileSolanaPurchase(env, record);
  const chain = evmChainOf(record.terms.network);
  if (!chain || !record.authorization || !isSameAddress(chain.usdc, record.terms.asset)) return {};
  let head = await getFinalizedBlockNumber(env, chain);
  // The purchase is committed before submission. Include ten minutes before
  // capture for clock skew; never infer "unpaid" from an empty historical scan.
  const since = Date.parse(record.created_at) - 600_000;
  if (!Number.isFinite(since)) throw new Error("Purchase time unavailable");
  const start = record.reconciliation?.start_block ?? await firstBlock(env, chain, head, since);
  const until = (Number(record.authorization.valid_before) + 600) * 1000;
  if (Number.isFinite(until) && until < Date.now()) head = await firstBlock(env, chain, head, until);
  let from = record.reconciliation?.next_block ?? start;
  for (let chunk = 0; chunk < 4 && from <= head; chunk++) {
    const to = Math.min(head, from + chain.logSpan - 1);
    const found = await findAuthorizationUseInRange(env, record.payer, record.authorization.nonce, from, to, chain);
    const transaction = found?.txHash;
    if (transaction) {
      if (!/^0x[0-9a-f]{64}$/i.test(transaction)) throw new Error("Invalid reconciliation transaction");
      const receipt = await getReceipt(env, transaction, chain);
      const block = Number.parseInt(receipt?.blockNumber ?? "", 16);
      if (!receipt || receipt.status !== "0x1" || !Number.isSafeInteger(block) || block < from || block > to ||
        !("transactionHash" in receipt) || String(receipt.transactionHash).toLowerCase() !== transaction.toLowerCase()) {
        throw new Error("Settlement receipt not established");
      }
      const authorized = usdcAuthorizations(receipt, chain).some(a =>
        isSameAddress(a.authorizer, record.payer) && a.nonce === record.authorization!.nonce.toLowerCase());
      const transferred = usdcTransfers(receipt, chain).some(t =>
        isSameAddress(t.from, record.payer) && isSameAddress(t.to, record.terms.payTo) && t.amount === BigInt(record.terms.amount));
      if (!authorized || !transferred) throw new Error("Settlement does not match purchase");
      const paidUsdc = atomicToUsdc(record.terms.amount);
      return { payment: { paidUsdc, tipUsdc: tipFromPaid(paidUsdc, record.publication?.minimum_usdc ?? record.item?.price_usdc ?? paidUsdc),
        payer: record.payer, network: record.terms.network, transaction,
        // This is chain evidence. Do not invent a lost facilitator receipt.
        settleHeaders: {} }, reconciliation: { start_block: start, next_block: from, checked_at: new Date().toISOString() } };
    }
    from = to + 1;
  }
  // Repeat the bounded authorization window when caught up. An RPC may lag
  // in indexing logs even after it serves a finalized header; absence is not
  // permission to abandon the purchase or to submit another payment.
  return { reconciliation: { start_block: start, next_block: from > head ? start : from, checked_at: new Date().toISOString() } };
}

/** Resume only goods whose partial effects already have a durable checkpoint. */
export async function deliverRecordedPurchase(env: Env, record: PurchaseIntent): Promise<Record<string, unknown> | null> {
  const { item, payment } = record;
  if (record.state !== "settled" || !payment) return null;
  if (payment.network !== record.terms.network || !payment.transaction || !payment.payer ||
    (payment.network.startsWith("eip155:") ? !isSameAddress(payment.payer, record.payer) : payment.payer !== record.payer)) {
    throw new Error("Recorded payment identity mismatch");
  }
  const { recordedHumanResolution, resolvedHumanDelivery } = await import("@/services/resolved-human-purchase");
  const resolution = await recordedHumanResolution(env, record);
  if (resolution) return resolvedHumanDelivery(resolution);
  if (record.publication) return publicationDelivery(record) ?? null;
  if (!item || !supportsArtifactRecovery(item)) return null;
  if (record.commission) {
    const { fulfillCommissionPurchase } = await import("@/services/commission-purchase");
    const digest = await httpArtifactDigest(`${env.STORE_BASE_URL}${record.path}?${record.request}`);
    return fulfillCommissionPurchase(env, item, { ...payment, settle: async () => payment }, record.commission,
      { path: record.path, digest, purchasedAt: record.created_at });
  }
  // A commission with no retained quote must never become a generic collab.
  if (record.path.startsWith("/api/commission/pay/")) return null;
  const query = new URLSearchParams(record.request);
  const args = record.door === "mcp" ? JSON.parse(record.request) as Record<string, unknown> : null;
  const input = purchaseInputFrom(item, args ? toolArgs(args) : queryArgs(name => query.get(name) ?? undefined));
  if (record.door === "mcp") input.source = "mcp";
  const digest = args ? await sha256Hex(jcsCanonicalize(args))
    : await httpArtifactDigest(`${env.STORE_BASE_URL}${record.path}?${record.request}`);
  return fulfillPurchase(env, item, { ...payment, observation: supportsObservationRecovery(item) ? observationCheckpoint(env, record.id, record.path, digest, true) : undefined, settle: async () => payment }, input,
    { path: record.path, digest, purchasedAt: record.created_at });
}
