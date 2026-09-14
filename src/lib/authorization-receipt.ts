import { AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC, isSameAddress, type EvmChain, type RpcReceipt } from "@/lib/base-rpc";

export interface AuthorizationTerms {
  network: string;
  asset: string;
  payer: string;
  recipient: string;
  nonce: string;
  amount_atomic: string;
}

export interface AuthorizationReceiptRead {
  status: "matched" | "not_matched" | "unavailable";
  reason: string;
  chain: string;
  transaction: string;
  expected: AuthorizationTerms;
  observed: AuthorizationTransferRead["observed"];
}

export interface AuthorizationTransferRead {
  status: "matched" | "not_matched";
  reason: string;
  observed: {
    authorizer: string;
    nonce: string;
    recipient: string;
    amount_atomic: string;
    /** Zero-based positions in receipt.logs, not block-wide log indices. */
    authorization_receipt_offset: number;
    transfer_receipt_offset: number;
  } | null;
}

/**
 * Circle emits AuthorizationUsed immediately before its Transfer. This is
 * canonical-USDC interpretation, not a generic ERC-3009 ordering guarantee;
 * unrecognised ordering stays unconfirmed (sources: docs/SPEC_READS.md).
 * Nonces are scoped to an authorizer. Without a payer, multiple uses are ambiguous.
 */
export function readAuthorizationTransfer(
  receipt: RpcReceipt,
  expected: { nonce: string; payer?: string; recipient?: string; amount_atomic?: string },
  chain: EvmChain,
): AuthorizationTransferRead {
  const unmatched = (reason: string): AuthorizationTransferRead => ({ status: "not_matched", reason, observed: null });
  if (receipt.status !== "0x1" || !Array.isArray(receipt.logs)) return unmatched("receipt_status_not_established");
  const address = (value: unknown): string | null =>
    typeof value === "string" && /^0x0{24}[0-9a-f]{40}$/i.test(value) ? `0x${value.slice(-40).toLowerCase()}` : null;
  const candidates = receipt.logs.map((log, offset) => ({ log, offset })).filter(({ log }) =>
    log && typeof log.address === "string" && isSameAddress(log.address, chain.usdc) && Array.isArray(log.topics) &&
    log.topics[0]?.toLowerCase() === AUTHORIZATION_USED_TOPIC &&
    (!expected.payer || address(log.topics[1]) === expected.payer.toLowerCase()) &&
    log.topics[2]?.toLowerCase() === expected.nonce.toLowerCase());
  if (candidates.length !== 1) return unmatched(candidates.length ? "ambiguous_authorization_events" : "authorization_not_found");
  const { log, offset } = candidates[0]!;
  const next = receipt.logs[offset + 1];
  if (log.topics.length !== 3 || !/^0x[0-9a-f]{64}$/i.test(log.topics[2]!) || log.data !== "0x" ||
    !next || typeof next.address !== "string" || !isSameAddress(next.address, chain.usdc) || !Array.isArray(next.topics) || next.topics.length !== 3 ||
    next.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || !/^0x[0-9a-f]{64}$/i.test(next.data)) return unmatched("paired_transfer_not_found");
  const authorizer = address(log.topics[1]);
  const payer = address(next.topics[1]);
  const recipient = address(next.topics[2]);
  if (!authorizer || payer !== authorizer || !recipient) return unmatched("paired_payer_not_matched");
  const observed = { authorizer, nonce: expected.nonce.toLowerCase(), recipient,
    amount_atomic: BigInt(next.data).toString(), authorization_receipt_offset: offset, transfer_receipt_offset: offset + 1 };
  const matched = (!expected.recipient || recipient === expected.recipient.toLowerCase()) &&
    (expected.amount_atomic === undefined || (/^\d+$/.test(expected.amount_atomic) && BigInt(observed.amount_atomic) === BigInt(expected.amount_atomic)));
  return { observed, status: matched ? "matched" : "not_matched",
    reason: matched ? "authorization_and_transfer_match" : "paired_transfer_terms_not_matched" };
}

/**
 * Circle's EIP3009 implementation emits AuthorizationUsed immediately
 * before its Transfer. Match that pair, not two independent searches over
 * a batch receipt. Unrecognised ordering stays unconfirmed. The source and
 * the limits of this interpretation are recorded in docs/SPEC_READS.md.
 */
export function readAuthorizationReceipt(
  receipt: RpcReceipt | null,
  head: number,
  reportedChain: string | null,
  transaction: string,
  expected: AuthorizationTerms,
  chain: EvmChain,
): AuthorizationReceiptRead {
  const base = { chain: chain.caip2, transaction, expected, observed: null };
  const unavailable = (reason: string): AuthorizationReceiptRead => ({ ...base, status: "unavailable", reason });
  const unmatched = (reason: string): AuthorizationReceiptRead => ({ ...base, status: "not_matched", reason });
  if (expected.network !== chain.caip2 || !isSameAddress(expected.asset, chain.usdc)) return unavailable("unsupported_terms");
  if (typeof reportedChain !== "string" || !/^0x[0-9a-f]+$/i.test(reportedChain) ||
    BigInt(reportedChain) !== BigInt(chain.caip2.split(":")[1]!)) return unavailable("chain_not_established");
  if (!receipt) return unavailable("receipt_not_found");
  if (!receipt.transactionHash || receipt.transactionHash.toLowerCase() !== transaction.toLowerCase()) return unavailable("receipt_identity_not_established");
  if (!/^0x[0-9a-f]+$/i.test(receipt.blockNumber)) return unavailable("block_not_established");
  const block = Number.parseInt(receipt.blockNumber, 16);
  if (!Number.isSafeInteger(block) || !Number.isSafeInteger(head) || block < 0 || head < block) return unavailable("block_not_established");
  if (receipt.status === "0x0") return unmatched("candidate_transaction_reverted");
  if (receipt.status !== "0x1" || !Array.isArray(receipt.logs)) return unavailable("receipt_status_not_established");

  return { ...base, ...readAuthorizationTransfer(receipt, expected, chain) };
}
