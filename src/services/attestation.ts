import {
  authorizationNonces,
  BASE_CHAIN,
  getBlockNumber,
  getReceipt,
  isSameAddress,
  usdcFromUnits,
  usdcTransfers,
} from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * SETTLEMENT ATTESTATION (DEMAND_SYNTHESIS Part 7, Move 1).
 *
 * An independent, stateless, SIGNED OBSERVATION of whether an x402
 * payment settled on Base. A snapshot of public chain state at a
 * moment, and nothing else.
 *
 * WHAT IT IS NOT, and these are load-bearing:
 *   - not reconciliation
 *   - not delivery verification
 *   - not escrow
 *   - not a dispute resolution
 *   - not a promise that a NOT_FOUND won't settle later
 *
 * WHY ANYONE WOULD PAY FOR A FREE RPC READ: the read is free and the
 * INDEPENDENT SIGNED RECEIPT is the product. A party to a payment
 * cannot produce a neutral observation of it — that is the whole
 * value, and it is why this is deliberately automated. NO HUMAN
 * TOUCHES IT. Automated and disinterested IS the claim; implying a
 * keeper looked would make the artifact worth less, not more, and a
 * test enforces that the copy never does.
 *
 * Stateless by construction: one RPC read, no database, no polling,
 * no retry, no custody, no contract. Retrying until the answer
 * improves would turn an observation into a poll, and a poll into an
 * implied promise that we waited for the right answer.
 */

export type SettlementStatus =
  | "SETTLED"
  | "NOT_FOUND"
  | "PENDING_FINALITY"
  | "INSUFFICIENT_MATCH"
  | "REVERTED";

/**
 * Blocks behind the head before we will call a receipt settled rather
 * than pending. Base builds fast; this is a plain depth rule, stated
 * on the artifact so a reader can apply their own instead.
 */
export const FINALITY_BLOCKS = 12;

export interface AttestationQuery {
  txHash?: string;
  payer?: string;
  recipient?: string;
  nonce?: string;
  /** Expected amount in whole USDC. */
  amountUsdc?: number;
}

export interface SettlementObservation {
  observed_at: string;
  chain: string;
  tx_hash: string | null;
  recipient: string | null;
  payer: string | null;
  amount_usdc: number | null;
  status: SettlementStatus;
  block_height: number | null;
  /** Head at the moment of the read, so depth is checkable. */
  chain_head: number | null;
  confirmations: number | null;
  /** What was asked, echoed so the answer cannot be re-pointed later. */
  query: AttestationQuery;
  /** Stable digest of the observed facts. */
  evidence_hash: string;
  /** Plain words for each status, so a reader need not guess. */
  reading: string;
  scope: string;
}

export interface SignedAttestation extends SettlementObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

const SCOPE =
  "This observes public Base chain state at the moment shown and nothing else. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND payment will never settle — only that it had not at observed_at. It resolves no dispute and takes no custody. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.";

const READINGS: Record<SettlementStatus, string> = {
  SETTLED:
    "A matching USDC transfer is on Base, in a mined transaction that did not revert, at the depth shown.",
  NOT_FOUND:
    "Base has no receipt for that transaction hash at the moment observed. It may be unbroadcast, dropped, or simply not yet mined — this says nothing about later.",
  PENDING_FINALITY:
    "The transaction is mined and matches, but sits fewer than the stated number of blocks behind the head. Real, and not yet as deep as the rule asks.",
  INSUFFICIENT_MATCH:
    "The transaction exists and succeeded, but its USDC transfers do not match what was asked about — wrong recipient, wrong amount, or no USDC movement at all. The gap is the finding.",
  REVERTED: "The transaction was mined and failed. No value moved.",
};

/** A short, stable digest of the observed facts. */
async function evidenceHash(
  observation: Omit<
    SettlementObservation,
    "evidence_hash" | "reading" | "scope"
  >,
): Promise<string> {
  const canonical = JSON.stringify(observation);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function classify(
  receipt: RpcReceipt | null,
  query: AttestationQuery,
  head: number,
): {
  status: SettlementStatus;
  recipient: string | null;
  payer: string | null;
  amountUsdc: number | null;
  blockHeight: number | null;
  confirmations: number | null;
} {
  if (!receipt) {
    return {
      status: "NOT_FOUND",
      recipient: null,
      payer: null,
      amountUsdc: null,
      blockHeight: null,
      confirmations: null,
    };
  }
  const blockHeight = Number.parseInt(receipt.blockNumber, 16);
  const confirmations = Number.isFinite(blockHeight)
    ? Math.max(0, head - blockHeight)
    : null;

  // status "0x0" is a reverted transaction. Nothing moved.
  if (receipt.status !== "0x1") {
    return {
      status: "REVERTED",
      recipient: null,
      payer: null,
      amountUsdc: null,
      blockHeight,
      confirmations,
    };
  }

  const transfers = usdcTransfers(receipt);
  const nonces = authorizationNonces(receipt);

  // Narrow by whatever the caller actually gave us. Every unstated
  // field widens the match, which is why the query is echoed onto the
  // artifact: the answer is only as tight as the question.
  const matches = transfers.filter((transfer) => {
    if (query.recipient && !isSameAddress(transfer.to, query.recipient)) {
      return false;
    }
    if (query.payer && !isSameAddress(transfer.from, query.payer)) {
      return false;
    }
    if (query.amountUsdc !== undefined) {
      const expected = BigInt(Math.round(query.amountUsdc * 1_000_000));
      if (transfer.amount !== expected) return false;
    }
    return true;
  });

  const nonceOk = !query.nonce || nonces.includes(query.nonce.toLowerCase());

  const match = matches[0];
  if (!match || !nonceOk) {
    return {
      status: "INSUFFICIENT_MATCH",
      recipient: transfers[0]?.to ?? null,
      payer: transfers[0]?.from ?? null,
      amountUsdc: transfers[0] ? usdcFromUnits(transfers[0].amount) : null,
      blockHeight,
      confirmations,
    };
  }

  return {
    status:
      confirmations !== null && confirmations < FINALITY_BLOCKS
        ? "PENDING_FINALITY"
        : "SETTLED",
    recipient: match.to,
    payer: match.from,
    amountUsdc: usdcFromUnits(match.amount),
    blockHeight,
    confirmations,
  };
}

/**
 * One read, one verdict, one signature. Throws only if the RPC itself
 * is unreachable — the gate turns that into a refund-shaped refusal
 * rather than selling an observation we could not make.
 */
export async function observeSettlement(
  env: Env,
  query: AttestationQuery,
): Promise<SignedAttestation> {
  const txHash = query.txHash ?? null;
  const [receipt, head] = await Promise.all([
    txHash ? getReceipt(env, txHash) : Promise.resolve(null),
    getBlockNumber(env),
  ]);

  const verdict = classify(receipt, query, head);
  const core = {
    observed_at: new Date().toISOString(),
    chain: BASE_CHAIN,
    tx_hash: txHash,
    recipient: verdict.recipient,
    payer: verdict.payer,
    amount_usdc: verdict.amountUsdc,
    status: verdict.status,
    block_height: verdict.blockHeight,
    chain_head: head,
    confirmations: verdict.confirmations,
    query,
  };
  const observation: SettlementObservation = {
    ...core,
    evidence_hash: await evidenceHash(core),
    reading: READINGS[verdict.status],
    scope: SCOPE,
  };

  const { signature, publicKey } = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature,
    public_key: publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}
