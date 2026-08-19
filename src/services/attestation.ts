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
import { extractPaymentNonce } from "@/lib/replay-guard";
import { signMessage } from "@/lib/signing";
import { JCS_SIGNATURE_COVERS, signJcs } from "@/lib/jcs";
import {
  getSlot,
  isSolanaSignature,
  SOLANA_CHAIN,
  solanaTransactionFacts,
} from "@/lib/solana-rpc";
import type { Env } from "@/types";

/**
 * SETTLEMENT ATTESTATION (DEMAND_SYNTHESIS Part 7, Move 1).
 *
 * THE NORTH STAR, quoted rather than paraphrased because an outside
 * security paper specified this product back at us:
 *
 *   "Hardening x402 against those adversaries would likely require
 *   client-visible settlement receipts or independent on-chain
 *   verification, rather than facilitator trust alone."
 *   — arXiv:2605.11781, "Five Attacks on x402 Agentic Payment Protocol"
 *
 * That citation lives HERE and never on the storefront. Register
 * separation: the registrar's voice cites a paper, the keeper's voice
 * writes the customer-facing line, and neither borrows the other's
 * authority.
 *
 * An independent, stateless, SIGNED OBSERVATION of whether an x402
 * payment settled — on Base or, since 2026-08-19, on Solana; the
 * identifier's shape picks the chain. A snapshot of public chain state at a
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
 *
 * KILL CRITERIA, written before shipping rather than after, so the
 * decision to stop is already made and does not have to be argued for
 * by whoever is holding the sunk cost:
 *
 *   - NEAR-ZERO CALLS IN 30 DAYS (by ~2026-08-27) — demand unproven.
 *     Park it. Do not reprice, do not re-market, do not "give it more
 *     time." The census and the decline desk are where calls show.
 *   - A CLONE APPEARS AT <= $0.002 — the thin moat is realized.
 *     Stop investing further; the RPC read was never the moat, and a
 *     price war over it is a war over nothing.
 *   - DOUBLE DOWN ONLY IF agents call it INSIDE RETRY OR
 *     RECONCILIATION LOOPS. One-off curiosity buys are not the signal
 *     and must not be read as one.
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

/**
 * Slots behind the head before a Solana transaction reads settled
 * rather than pending — 32, the depth at which the cluster's own
 * finalized commitment sits. Same posture as FINALITY_BLOCKS: a plain
 * depth rule, stated on the artifact so a reader can apply their own.
 */
export const SOLANA_FINALITY_SLOTS = 32;

export interface AttestationQuery {
  txHash?: string;
  payer?: string;
  recipient?: string;
  nonce?: string;
  /** Expected amount in whole USDC. */
  amountUsdc?: number;
}

/**
 * A caller checking their own payment already holds the payload they
 * sent — making them dig the nonce out of it by hand would be asking
 * them to reimplement what the store's replay guard already does.
 * So take the base64 PAYMENT-SIGNATURE verbatim and read it with the
 * SAME extractPaymentNonce the gate uses to refuse double-spends.
 *
 * Returns null rather than throwing: a payload we cannot read is a
 * narrower question, not a failed one, and the observation still
 * stands on whatever else was given.
 */
export function nonceFromPaymentPayload(encoded: string): string | null {
  try {
    return extractPaymentNonce(JSON.parse(atob(encoded)));
  } catch {
    return null;
  }
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
  /**
   * RFC 8785 dual-emit over the same observation — this is one of the
   * three classes that live in the receipts race's territory, and the
   * reason the dual-emit exists at all. See lib/jcs.ts.
   */
  signature_jcs: string;
  signature_jcs_covers: string;
}

const SCOPE =
  "This observes public Base chain state at the moment shown and nothing else. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND payment will never settle — only that it had not at observed_at. It resolves no dispute and takes no custody. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.";

/**
 * The Solana scope carries two facts its Base sibling does not need:
 * the observation reads settled BALANCE OUTCOMES (pre/post token
 * balances), not instructions — the same discipline the store's own
 * bank reconciliation uses on this rail — and EIP-3009 nonce matching
 * is a Base facility that does not exist here, which is why the door
 * refuses a nonce beside a Solana signature instead of signing an
 * artifact that silently skipped a check.
 */
const SOLANA_SCOPE =
  "This observes public Solana chain state at the moment shown and nothing else, read from the transaction's settled USDC balance outcomes (pre/post token balances), not from its instructions. block_height and chain_head are slots. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND signature will never land — only that it had not at observed_at. EIP-3009 nonce matching is a Base facility and is not evaluated on Solana. It resolves no dispute and takes no custody. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.";

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

const SOLANA_READINGS: Record<SettlementStatus, string> = {
  SETTLED:
    "A matching USDC balance movement is on Solana, in a transaction that did not fail, at the slot depth shown.",
  NOT_FOUND:
    "Solana has no transaction for that signature at the moment observed. It may be unsent, dropped, or beyond the node's retention — this says nothing about later.",
  PENDING_FINALITY:
    "The transaction landed and matches, but sits fewer than the stated number of slots behind the head. Real, and not yet as deep as the rule asks.",
  INSUFFICIENT_MATCH:
    "The transaction exists and succeeded, but its USDC balance movements do not match what was asked about — wrong recipient, wrong amount, or no USDC movement at all. The gap is the finding.",
  REVERTED: "The transaction landed and failed. No tokens moved.",
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
  /**
   * THE RAIL DISPATCHES ON THE IDENTIFIER'S OWN SHAPE (2026-08-19,
   * the Solana directory's review): a base58 signature can never look
   * like a 0x-hex hash, so the caller never says which chain — the
   * identifier already did. The store has settled on both rails since
   * 08-04; the attestation finally observes both.
   */
  if (txHash && isSolanaSignature(txHash)) {
    return observeSolanaSettlement(env, query);
  }
  const [receipt, head] = await Promise.all([
    txHash ? getReceipt(env, txHash) : Promise.resolve(null),
    getBlockNumber(env),
  ]);
  return observeWithFacts(env, query, receipt, head);
}

/**
 * Sign one finished observation, both disciplines. Shared by the two
 * rails so the artifact shape cannot drift between them.
 */
async function signObservation(
  env: Env,
  observation: SettlementObservation,
): Promise<SignedAttestation> {
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
    // Same fields, sorted-key byte order, for JCS-conformant tooling.
    signature_jcs: await signJcs(
      observation as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    signature_jcs_covers: JCS_SIGNATURE_COVERS,
  };
}

/**
 * The Solana observation: one getTransaction read against the settled
 * balance outcomes, classified with the same statuses and the same
 * honesty rules as Base. block_height and chain_head carry SLOTS and
 * the scope says so. The nonce field never reaches here — the door
 * refuses a nonce beside a Solana signature, because signing an
 * artifact that silently skipped a requested check would be the
 * certificates defect in a new coat.
 */
export async function observeSolanaSettlement(
  env: Env,
  query: AttestationQuery,
): Promise<SignedAttestation> {
  const signature = query.txHash ?? "";
  const [facts, headSlot] = await Promise.all([
    solanaTransactionFacts(env, signature),
    getSlot(env),
  ]);

  let status: SettlementStatus;
  let recipient: string | null = null;
  let payer: string | null = null;
  let amountUsdc: number | null = null;
  let slot: number | null = null;
  let confirmations: number | null = null;

  if (!facts) {
    status = "NOT_FOUND";
  } else {
    slot = facts.slot;
    confirmations = Math.max(0, headSlot - facts.slot);
    if (facts.err) {
      status = "REVERTED";
    } else {
      const credits = facts.deltas.filter((d) => d.delta > 0n);
      const debits = facts.deltas.filter((d) => d.delta < 0n);
      // Narrow by whatever the caller gave, same law as Base: every
      // unstated field widens the match, and the echoed query is what
      // keeps the answer from being re-pointed later.
      const matches = credits.filter((credit) => {
        if (query.recipient && credit.owner !== query.recipient) return false;
        if (query.amountUsdc !== undefined) {
          const expected = BigInt(Math.round(query.amountUsdc * 1_000_000));
          if (credit.delta !== expected) return false;
        }
        return true;
      });
      const payerOk =
        !query.payer || debits.some((debit) => debit.owner === query.payer);
      const match = matches[0];
      if (!match || !payerOk) {
        status = "INSUFFICIENT_MATCH";
        recipient = credits[0]?.owner ?? null;
        payer = debits[0]?.owner ?? null;
        amountUsdc = credits[0] ? usdcFromUnits(credits[0].delta) : null;
      } else {
        status =
          confirmations < SOLANA_FINALITY_SLOTS ? "PENDING_FINALITY" : "SETTLED";
        recipient = match.owner;
        payer =
          (query.payer
            ? debits.find((debit) => debit.owner === query.payer)
            : debits[0]
          )?.owner ?? null;
        amountUsdc = usdcFromUnits(match.delta);
      }
    }
  }

  const core = {
    observed_at: new Date().toISOString(),
    chain: SOLANA_CHAIN,
    tx_hash: query.txHash ?? null,
    recipient,
    payer,
    amount_usdc: amountUsdc,
    status,
    block_height: slot,
    chain_head: headSlot,
    confirmations,
    query,
  };
  return signObservation(env, {
    ...core,
    evidence_hash: await evidenceHash(core),
    reading: SOLANA_READINGS[status],
    scope: SOLANA_SCOPE,
  });
}

/**
 * The observation with its chain facts already in hand — the seam the
 * sheaf reads through (2026-08-07, the red team's subrequest finding).
 * The sheaf fetches every receipt in ONE batched call and the chain
 * head ONCE, then attests each hash against that shared head. The
 * shared head is self-describing rather than hidden: every observation
 * in a sheaf carries the same chain_head value, which says plainly
 * that the sheaf was read against one moment — a more coherent claim
 * for a batch than twenty heads drifting across twenty sequential
 * reads, not a lesser one.
 */
export async function observeWithFacts(
  env: Env,
  query: AttestationQuery,
  receipt: Awaited<ReturnType<typeof getReceipt>>,
  head: number,
): Promise<SignedAttestation> {
  const verdict = classify(receipt, query, head);
  const core = {
    observed_at: new Date().toISOString(),
    chain: BASE_CHAIN,
    tx_hash: query.txHash ?? null,
    recipient: verdict.recipient,
    payer: verdict.payer,
    amount_usdc: verdict.amountUsdc,
    status: verdict.status,
    block_height: verdict.blockHeight,
    chain_head: head,
    confirmations: verdict.confirmations,
    query,
  };
  return signObservation(env, {
    ...core,
    evidence_hash: await evidenceHash(core),
    reading: READINGS[verdict.status],
    scope: SCOPE,
  });
}
