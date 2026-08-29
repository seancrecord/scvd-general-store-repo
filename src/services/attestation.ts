import {
  authorizationNonces,
  BASE_EVM,
  getBlockNumber,
  getReceipt,
  isSameAddress,
  POLYGON_EVM,
  usdcFromUnits,
  usdcTransfers,
} from "@/lib/base-rpc";
import type { EvmChain, RpcReceipt } from "@/lib/base-rpc";
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

/**
 * The EVM scope, one sentence-set per chain — the third-rail parity
 * ruling made the wording a parameter rather than a second constant
 * that could drift.
 */
function evmScope(chain: EvmChain): string {
  return `This observes public ${chain.label} chain state at the moment shown and nothing else. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND payment will never settle — only that it had not at observed_at. It resolves no dispute and takes no custody. Past stale_after, present this only as history: the observation stays true about its moment, but current-state claims should come from a fresh read, not from this document. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.`;
}

const SCOPE = evmScope(BASE_EVM);

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
  "This observes public Solana chain state at the moment shown and nothing else, read from the transaction's settled USDC balance outcomes (pre/post token balances), not from its instructions. block_height and chain_head are slots. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND signature will never land — only that it had not at observed_at. EIP-3009 nonce matching is a Base facility and is not evaluated on Solana. It resolves no dispute and takes no custody. Past stale_after, present this only as history: the observation stays true about its moment, but current-state claims should come from a fresh read, not from this document. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.";

function evmReadings(
  chain: EvmChain,
  checkedBothOnNotFound = false,
): Record<SettlementStatus, string> {
  return {
    SETTLED: `A matching USDC transfer is on ${chain.label}, in a mined transaction that did not revert, at the depth shown.`,
    NOT_FOUND: checkedBothOnNotFound
      ? "Neither Base nor Polygon has a receipt for that transaction hash at the moment observed — a 0x hash names an EVM transaction, not a chain, so both live EVM rails were read. It may be unbroadcast, dropped, or simply not yet mined — this says nothing about later."
      : `${chain.label} has no receipt for that transaction hash at the moment observed. It may be unbroadcast, dropped, or simply not yet mined — this says nothing about later.`,
    PENDING_FINALITY:
      "The transaction is mined and matches, but sits fewer than the stated number of blocks behind the head. Real, and not yet as deep as the rule asks.",
    INSUFFICIENT_MATCH:
      "The transaction exists and succeeded, but it does not match what was asked about — wrong recipient, wrong amount, no USDC movement at all, or (when a nonce was asked about) a nonce absent from the transaction's authorization events. The echoed query says which fields were asked; the gap is the finding.",
    REVERTED: `The transaction was mined and failed. No value moved.`,
  };
}

const READINGS: Record<SettlementStatus, string> = evmReadings(BASE_EVM);

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

/**
 * THE READER, HANDED TO THE WALK (roadmap 3.2, ledger C2/I4).
 *
 * The launch check settles real money at a stranger's door and gets a
 * transaction hash back in PAYMENT-RESPONSE. Until now that hash rode
 * into the signed observation as fact; this store never looked. The
 * attestation desk already knew how to look — receipt, transfer
 * match, finality — for anyone who PAID for an observation of our own
 * settlements. Same read, other direction: the walk narrows to the
 * transfer it just made (our field wallet, their declared payTo) and
 * asks the chain whether the seller's hash shows that money moving.
 *
 * Unsigned by design: the walk embeds this inside its OWN signed row,
 * and a signature within a signature would be decoration.
 */
/**
 * HOW LONG AN ATTESTATION MAY BE PRESENTED AS CURRENT (roadmap 3.3,
 * ledger D2). The observation never becomes false — it is a statement
 * about chain state at observed_at, and that moment does not move.
 * What ages is its use as evidence of NOW: a month-old SETTLED
 * verified forever and looked current, and a NOT_FOUND goes stale the
 * moment something could have settled behind it. stale_after is the
 * artifact saying, in its own signed bytes, when to stop treating it
 * as a statement about the present and re-read the chain instead.
 * Twenty-four hours: past one day, current-state claims should come
 * from the chain, not from us. RULED 2026-08-29 — put to the keeper
 * as an open dial with the trade named, he answered "24". Inherited
 * became chosen, which is the whole difference. ⚑ marks his call.
 */
export const ATTESTATION_STALE_AFTER_HOURS = 24;

export function staleAfterFrom(observedAt: string): string {
  return new Date(
    new Date(observedAt).getTime() + ATTESTATION_STALE_AFTER_HOURS * 3_600_000,
  ).toISOString();
}

export interface TransferClaimRead {
  status: SettlementStatus;
  recipient: string | null;
  payer: string | null;
  amountUsdc: number | null;
  blockHeight: number | null;
  confirmations: number | null;
}

export async function readTransferClaim(
  env: Env,
  txHash: string,
  query: AttestationQuery,
  chain: EvmChain = BASE_EVM,
): Promise<TransferClaimRead> {
  const [receipt, head] = await Promise.all([
    getReceipt(env, txHash, chain),
    getBlockNumber(env, chain),
  ]);
  return classify(receipt, query, head, chain);
}

function classify(
  receipt: RpcReceipt | null,
  query: AttestationQuery,
  head: number,
  chain: EvmChain = BASE_EVM,
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

  const transfers = usdcTransfers(receipt, chain);
  const nonces = authorizationNonces(receipt, chain);

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
    /*
     * Echo the transfer that MATCHED the stated fields when one did
     * (the nonce alone failed), the first transfer otherwise. The
     * old transfers[0] pick could show a right-recipient buyer some
     * other leg of the transaction and read as "the seller paid the
     * wrong party" when the only gap was the nonce.
     */
    const echoed = match ?? transfers[0];
    return {
      status: "INSUFFICIENT_MATCH",
      recipient: echoed?.to ?? null,
      payer: echoed?.from ?? null,
      amountUsdc: echoed ? usdcFromUnits(echoed.amount) : null,
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
  now: Date = new Date(),
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
    return observeSolanaSettlement(env, query, now);
  }
  const [receipt, head] = await Promise.all([
    txHash ? getReceipt(env, txHash) : Promise.resolve(null),
    getBlockNumber(env),
  ]);
  if (receipt || !txHash) {
    return observeWithFacts(env, query, receipt, head, BASE_EVM, {}, now);
  }
  /**
   * NOT ON BASE IS NOT NOT-FOUND ANY MORE (dark team follow-through,
   * 2026-08-21): since the third rail opened, a 0x hash names an EVM
   * transaction, not a chain — the same shape settles on Base and on
   * Polygon. Before signing NOT_FOUND, ask Polygon. Whichever chain
   * holds the receipt is the settlement's chain; a hash on neither is
   * NOT_FOUND with both reads named on the artifact.
   */
  const [polygonReceipt, polygonHead] = await Promise.all([
    getReceipt(env, txHash, POLYGON_EVM),
    getBlockNumber(env, POLYGON_EVM),
  ]);
  if (polygonReceipt) {
    return observeWithFacts(
      env,
      query,
      polygonReceipt,
      polygonHead,
      POLYGON_EVM,
      {},
      now,
    );
  }
  return observeWithFacts(
    env,
    query,
    null,
    head,
    BASE_EVM,
    { checkedBothEvmChains: true },
    now,
  );
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
  now: Date = new Date(),
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

  const solanaObservedAt = now.toISOString();
  const core = {
    observed_at: solanaObservedAt,
    stale_after: staleAfterFrom(solanaObservedAt),
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
  chain: EvmChain = BASE_EVM,
  options: { checkedBothEvmChains?: boolean } = {},
  now: Date = new Date(),
): Promise<SignedAttestation> {
  const verdict = classify(receipt, query, head, chain);
  const observedAt = now.toISOString();
  const core = {
    observed_at: observedAt,
    stale_after: staleAfterFrom(observedAt),
    chain: chain.caip2,
    // Named only when more than one chain was actually read — the
    // NOT_FOUND that checked both EVM rails says so on the artifact.
    ...(options.checkedBothEvmChains
      ? { chains_checked: [BASE_EVM.caip2, POLYGON_EVM.caip2] }
      : {}),
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
    reading: evmReadings(chain, options.checkedBothEvmChains === true)[
      verdict.status
    ],
    scope: evmScope(chain),
  });
}
