import {
  authorizationNonces,
  BASE_EVM,
  getBlockNumber,
  getReceipt,
  isSameAddress,
  POLYGON_EVM,
  WALKED_EVM_CHAINS,
  usdcFromUnits,
  usdcTransfers,
} from "@/lib/base-rpc";
import type { EvmChain, RpcReceipt } from "@/lib/base-rpc";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { signMessage } from "@/lib/signing";
import {
  RECEIVED_NOTE,
  claimReading,
  compareClaim,
  decodeSettlementResponseClaim,
  sha256Hex,
} from "@/services/attestation-claims";
import type {
  InputClaims,
  ObservedForClaims,
  ReceivedNotObserved,
} from "@/services/attestation-claims";
import { projectSettlementAttestation } from "@/services/attestation-projection";
import type { SettlementAttestationProjection } from "@/services/attestation-projection";
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

/**
 * THE DESK'S BATTERY (2026-09-11). Every observation now names the
 * revision of the desk that produced it, as the launch check has since
 * D6. The first revision never wrote one down, so its absence is how a
 * reader knows an artifact predates this line. That matters because v1
 * carried no `binding` field either, and "predates binding classes"
 * must never be read as "unbound": one is a date, the other is a
 * finding. Under this battery both fields are mandatory, and an
 * artifact citing it without them is defective, not merely old.
 * readBinding() applies that rule so no reader has to reconstruct it.
 */
export const SETTLEMENT_ATTESTATION_BATTERY = "settlement-attestation-v2";

/**
 * WHAT TIES THE OBSERVED TRANSACTION TO ONE PAYMENT (2026-09-11).
 *
 * A transaction-hash observation answers "did this settle" and, by
 * hash, "was this settled twice". It does not answer "is this the
 * settlement of THAT authorization" unless the chain's own record says
 * so. The desk has read EIP-3009 nonces out of AuthorizationUsed events
 * since it opened, but folded the answer into SETTLED versus
 * INSUFFICIENT_MATCH, so two SETTLED artifacts — one asked with a
 * nonce, one without — looked identical unless a reader dug through
 * the echoed query. The binding class states it outright.
 *
 *   none                — nothing on the artifact ties the transaction
 *                         to one authorization or request. The usual
 *                         value, and an honest one: it is what every
 *                         artifact before this battery meant.
 *   authorization_nonce — the nonce asked about appears in an
 *                         AuthorizationUsed event of this transaction,
 *                         read from the chain. The transfer is the
 *                         settlement of that one EIP-3009 authorization.
 *   input_commitment    — reserved. A commitment to the request itself,
 *                         carried in the settlement (masumi's
 *                         inputCommitment is the live example). No rail
 *                         this desk reads carries one; the class exists
 *                         so the vocabulary is declared before it is
 *                         needed rather than invented under pressure.
 *
 * THE SEAM, stated where it cannot be missed: authorization_nonce ties
 * the transaction to ONE AUTHORIZATION, not to one request. Whether the
 * door tied that nonce to a single 402 challenge is the door's work and
 * is not observed here. The default x402 scheme carries no server-side
 * nonce, so a payload signed against one challenge can be presented
 * against a fresh one with the same terms; dedupe by transaction
 * answers "settled twice", not "bound to this request". This field
 * types the gap. It does not close it, and says so.
 */
export type BindingClass = "none" | "authorization_nonce" | "input_commitment";

/**
 * Other people's words for the same classes, kept beside ours so the
 * mapping is a table rather than a private dialect. The x402 spec
 * thread had not settled its nouns when this shipped (its §5.3.5 text
 * was still on a branch; a separate issue titles the gap "request
 * commitment"). When the words land, the alias lands here and the
 * class name stays.
 */
export const BINDING_CLASS_ALIASES: Record<BindingClass, readonly string[]> = {
  none: [],
  authorization_nonce: ["EIP-3009 nonce", "AuthorizationUsed(authorizer, nonce)"],
  input_commitment: ["inputCommitment (masumi)", "request commitment (x402 thread)"],
};

export interface SettlementBinding {
  /** What this artifact establishes. */
  class: BindingClass;
  /** What the caller asked to have checked; "none" when nothing was. */
  asked: BindingClass;
  /** Plain words: what the class ties, and what it leaves untied. */
  reading: string;
}

const BINDING_SEAM =
  "This ties the transaction to one authorization, not to one request: whether the door tied that nonce to a single 402 challenge is the door's job and is not observed here.";

const UNASKED_BINDING: SettlementBinding = {
  class: "none",
  asked: "none",
  reading:
    "No authorization nonce was asked about, so nothing on this artifact ties the transaction to one payment authorization or request; it is identified by its hash and the stated transfer fields only. To bind, ask again with the nonce from the PAYMENT-SIGNATURE payload (or send payment_payload) and the desk reads it against the transaction's AuthorizationUsed events.",
};

const SOLANA_BINDING: SettlementBinding = {
  class: "none",
  asked: "none",
  reading:
    "Solana carries no EIP-3009 authorization nonce and this desk reads no request commitment on that rail, so nothing on this artifact ties the transaction to one payment authorization or request; it is identified by its signature and the stated balance movements only. The door refuses a nonce beside a Solana signature rather than sign an artifact that skipped the check.",
};

function evmBinding(
  query: AttestationQuery,
  receipt: RpcReceipt | null,
  status: SettlementStatus,
  nonces: string[],
): SettlementBinding {
  if (!query.nonce) return UNASKED_BINDING;
  if (!receipt) {
    return {
      class: "none",
      asked: "authorization_nonce",
      reading:
        "A nonce was asked about, but there was no transaction to read it against at the moment observed. No binding is established; this says nothing about later.",
    };
  }
  if (status === "REVERTED") {
    return {
      class: "none",
      asked: "authorization_nonce",
      reading:
        "A nonce was asked about, but the transaction reverted: no authorization was used and no value moved, so no binding is established.",
    };
  }
  if (nonces.includes(query.nonce.toLowerCase())) {
    return {
      class: "authorization_nonce",
      asked: "authorization_nonce",
      reading: `The nonce asked about appears in an AuthorizationUsed event of this transaction, read from the chain, so the observed transfer is the settlement of that one EIP-3009 authorization. ${BINDING_SEAM}`,
    };
  }
  return {
    class: "none",
    asked: "authorization_nonce",
    reading:
      "The nonce asked about does not appear in any AuthorizationUsed event of this transaction. No binding is established, and status reads INSUFFICIENT_MATCH for that reason.",
  };
}

/**
 * HOW A READER TAKES THE FIELD, including when it is not there. Three
 * answers, kept apart on purpose: an artifact from before the battery
 * is silent about binding (it never spoke; read its echoed query); an
 * artifact under the battery declares it; an artifact citing the
 * battery without it is defective. Absence means one thing per
 * version, never two.
 */
export type BindingRead =
  | { kind: "declared"; binding: SettlementBinding }
  | { kind: "predates"; note: string }
  | { kind: "defect"; note: string };

const BINDING_CLASSES: readonly BindingClass[] = ["none", "authorization_nonce", "input_commitment"];

function isSettlementBinding(value: unknown): value is SettlementBinding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    BINDING_CLASSES.includes(candidate.class as BindingClass) &&
    BINDING_CLASSES.includes(candidate.asked as BindingClass) &&
    typeof candidate.reading === "string"
  );
}

export function readBinding(artifact: object): BindingRead {
  // Any artifact-shaped object: a live SignedAttestation, a parsed
  // JSON body, or a partial. The reader looks at two fields only.
  const record = artifact as { battery?: unknown; binding?: unknown };
  if (record.battery === undefined) {
    return {
      kind: "predates",
      note: `This observation names no battery, so it predates ${SETTLEMENT_ATTESTATION_BATTERY} and binding classes (2026-09-11). It is silent about binding — not "unbound", not "unasked". Its echoed query says whether a nonce was asked, and its status already folded the answer in.`,
    };
  }
  if (isSettlementBinding(record.binding)) {
    return { kind: "declared", binding: record.binding };
  }
  return {
    kind: "defect",
    note: `This observation cites battery ${String(record.battery)} but carries no well-formed binding field, which that battery makes mandatory. Treat the artifact as defective, not as unbound.`,
  };
}

export interface AttestationQuery {
  txHash?: string;
  payer?: string;
  recipient?: string;
  nonce?: string;
  /** Expected amount in whole USDC. */
  amountUsdc?: number;
  /**
   * The facilitator's settlement response as the buyer holds it: the
   * PAYMENT-RESPONSE header verbatim, or its JSON. Received, not
   * observed — it never enters the signed payload; see
   * attestation-claims.ts. Stripped from the echoed query for the
   * same reason: its digest rides in input_claims instead.
   */
  paymentResponse?: string;
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
  stale_after: string;
  /** Which revision of the desk produced this. Absent before 2026-09-11. */
  battery: string;
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
  /** What, if anything, ties this transaction to one payment. */
  binding: SettlementBinding;
  /**
   * Present only when a settlement response was given: a digest of
   * its bytes and, per field, whether it agrees with the chain.
   */
  input_claims?: InputClaims;
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
  /**
   * Outside both signatures by design: somebody else's bytes, echoed
   * so the reader can check input_claims.received_sha256 and the table.
   */
  received_not_observed?: ReceivedNotObserved;
  /** Outside both signatures, signed on its own, pointing back here. */
  projection: SettlementAttestationProjection;
}

/**
 * The EVM scope, one sentence-set per chain — the third-rail parity
 * ruling made the wording a parameter rather than a second constant
 * that could drift.
 */
function evmScope(chain: EvmChain): string {
  return `This observes public ${chain.label} chain state at the moment shown and nothing else. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND payment will never settle — only that it had not at observed_at. The binding field says what, if anything, ties this transaction to one payment authorization; read it before citing this artifact as proof of which payment settled, because a hash alone proves settlement, not correspondence. It resolves no dispute and takes no custody. Past stale_after, present this only as history: the observation stays true about its moment, but current-state claims should come from a fresh read, not from this document. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.`;
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
  "This observes public Solana chain state at the moment shown and nothing else, read from the transaction's settled USDC balance outcomes (pre/post token balances), not from its instructions. block_height and chain_head are slots. It does not attest that goods or services were delivered. It does not attest that a NOT_FOUND signature will never land — only that it had not at observed_at. EIP-3009 nonce matching is an EVM facility and is not evaluated on Solana; the binding field says so, and says that nothing on this artifact ties the transaction to one payment authorization. It resolves no dispute and takes no custody. Past stale_after, present this only as history: the observation stays true about its moment, but current-state claims should come from a fresh read, not from this document. Produced automatically from one RPC read: no human looked at this, and that is the point, because a party to a payment cannot produce a neutral observation of it.";

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
  /** Every EIP-3009 nonce the transaction burned; the binding reads these. */
  nonces: string[];
} {
  if (!receipt) {
    return {
      status: "NOT_FOUND",
      recipient: null,
      payer: null,
      amountUsdc: null,
      blockHeight: null,
      confirmations: null,
      nonces: [],
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
      nonces: [],
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
      nonces,
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
    nonces,
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
 * The echoed query, minus the facilitator's bytes. Everything else a
 * caller asked is theirs and is echoed verbatim; the settlement
 * response is somebody else's word and is committed by digest instead.
 */
function echoedQuery(query: AttestationQuery): AttestationQuery {
  const { paymentResponse: _dropped, ...rest } = query;
  return rest;
}

/**
 * Both halves of "received, not observed": the signed digest-and-table
 * and the unsigned echo. Nothing when no response was given.
 */
async function inputClaimsFor(
  query: AttestationQuery,
  observed: ObservedForClaims,
): Promise<{ claims?: InputClaims; received?: ReceivedNotObserved }> {
  if (!query.paymentResponse) return {};
  const decoded = decodeSettlementResponseClaim(query.paymentResponse);
  if (!decoded) return {};
  const digest = await sha256Hex(query.paymentResponse);
  const agreement = compareClaim(decoded, observed);
  return {
    claims: {
      source: "PAYMENT-RESPONSE",
      standing: "received, not observed",
      received_sha256: digest,
      agreement,
      reading: claimReading(agreement, decoded, observed),
    },
    received: {
      standing: "received, not observed",
      payment_response: query.paymentResponse,
      sha256: digest,
      decoded,
      note: RECEIVED_NOTE,
    },
  };
}

/**
 * Sign one finished observation, both disciplines. Shared by the two
 * rails so the artifact shape cannot drift between them. The two
 * trailing fields are appended AFTER signing on purpose: one is
 * somebody else's bytes, the other carries its own signature.
 */
async function signObservation(
  env: Env,
  observation: SettlementObservation,
  received?: ReceivedNotObserved,
): Promise<SignedAttestation> {
  const { signature, publicKey } = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  const signed = {
    ...observation,
    signature,
    public_key: publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key. Fields below signature_jcs_covers — received_not_observed and projection — sit outside both signatures by design: the first is somebody else's bytes, the second is signed on its own and points back here.",
    // Same fields, sorted-key byte order, for JCS-conformant tooling.
    signature_jcs: await signJcs(
      observation as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    signature_jcs_covers: JCS_SIGNATURE_COVERS,
    ...(received ? { received_not_observed: received } : {}),
  };
  return { ...signed, projection: await projectSettlementAttestation(env, signed) };
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
  const { claims, received } = await inputClaimsFor(query, {
    txHash: query.txHash ?? null,
    chain: SOLANA_CHAIN,
    payer,
    status,
  });
  const core = {
    observed_at: solanaObservedAt,
    stale_after: staleAfterFrom(solanaObservedAt),
    battery: SETTLEMENT_ATTESTATION_BATTERY,
    chain: SOLANA_CHAIN,
    tx_hash: query.txHash ?? null,
    recipient,
    payer,
    amount_usdc: amountUsdc,
    status,
    block_height: slot,
    chain_head: headSlot,
    confirmations,
    binding: SOLANA_BINDING,
    ...(claims ? { input_claims: claims } : {}),
    query: echoedQuery(query),
  };
  return signObservation(
    env,
    {
      ...core,
      evidence_hash: await evidenceHash(core),
      reading: SOLANA_READINGS[status],
      scope: SOLANA_SCOPE,
    },
    received,
  );
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
  const { claims, received } = await inputClaimsFor(query, {
    txHash: query.txHash ?? null,
    chain: chain.caip2,
    payer: verdict.payer,
    status: verdict.status,
  });
  const core = {
    observed_at: observedAt,
    stale_after: staleAfterFrom(observedAt),
    battery: SETTLEMENT_ATTESTATION_BATTERY,
    chain: chain.caip2,
    // Named only when more than one chain was actually read — the
    // NOT_FOUND that checked both EVM rails says so on the artifact.
    ...(options.checkedBothEvmChains
      ? { chains_checked: WALKED_EVM_CHAINS.map((chain) => chain.caip2) }
      : {}),
    tx_hash: query.txHash ?? null,
    recipient: verdict.recipient,
    payer: verdict.payer,
    amount_usdc: verdict.amountUsdc,
    status: verdict.status,
    block_height: verdict.blockHeight,
    chain_head: head,
    confirmations: verdict.confirmations,
    binding: evmBinding(query, receipt, verdict.status, verdict.nonces),
    ...(claims ? { input_claims: claims } : {}),
    query: echoedQuery(query),
  };
  return signObservation(
    env,
    {
      ...core,
      evidence_hash: await evidenceHash(core),
      reading: evmReadings(chain, options.checkedBothEvmChains === true)[
        verdict.status
      ],
      scope: evmScope(chain),
    },
    received,
  );
}
