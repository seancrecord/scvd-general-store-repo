import {
  usdcAuthorizations,
  BASE_CHAIN,
  getBlockNumber,
  getReceipt,
  isSameAddress,
  usdcApprovals,
  usdcFromUnits,
  usdcTransfers,
} from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import { JCS_SIGNATURE_COVERS, signJcs } from "@/lib/jcs";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * SETTLEMENT RECONCILIATION — was the amount taken within the amount
 * authorized, and WAS THE CEILING SOMETHING WE COULD SEE?
 *
 * The existing settlement attestation answers "did this settle, and
 * does it match the amount asked about." That is one number. This
 * asks about the GAP between two: what a payer permitted and what a
 * seller actually took. The x402 schemes where those can differ —
 * `upto`, `deferred` — are the ones this store has never implemented,
 * which is exactly why observing them is worth anything.
 *
 * THE FLAW THIS SHIPS WITH THE FIX FOR, because the spec review found
 * it before a buyer did: the ceiling is USUALLY SUPPLIED BY THE PARTY
 * THE RECEIPT BENEFITS. Sign `within_cap: true` off a number the
 * caller handed us and we have signed the caller's arithmetic under
 * our key. That is the recorded referral-certificate defect, and the
 * same class as the `from` field on a decline, which this store
 * already refuses to trust for exactly this reason.
 *
 * So there are TWO VERDICTS AND NEVER ONE. `cap_observed` is a
 * separate field from the comparison, and every reading says which
 * kind it is:
 *
 *   OBSERVED — the ceiling is on Base. Either an Approval in the same
 *   receipt (the payer signed a ceiling, the spender took part of it,
 *   and both numbers are in the logs), or an EIP-3009 authorization,
 *   where the value is fixed inside the payer's signed digest and no
 *   discretion existed at all.
 *
 *   DECLARED — the caller told us. We do the arithmetic, we publish
 *   the result, and we say plainly that one of the two numbers came
 *   from the party asking. A reader who does not trust the caller
 *   gets no help from our signature on that half, and the artifact
 *   says so rather than letting the signature imply otherwise.
 *
 * WHY ANYONE PAYS FOR SUBTRACTION, which is the other thing the
 * review caught: they do not. `within_cap` is two numbers and a
 * comparison anyone can do. What is being bought is that A PARTY WITH
 * NO INTEREST IN THE ANSWER read both numbers off the chain at a
 * stated moment and signed them together. The subtraction is free.
 * The disinterested witness is the product, and the artifact says
 * that in those words so nobody works it out afterwards and feels
 * sold to.
 */

/** How the ceiling got here. Ordered strongest to weakest, deliberately. */
export type CapSource =
  /**
   * An Approval in the SAME receipt: the payer signed a ceiling and
   * the spender drew on it in one transaction. Both numbers observed.
   */
  | "chain_same_tx_approval"
  /**
   * EIP-3009. The value lives inside the payer's signed digest, so the
   * contract cannot move a different amount — the ceiling and the
   * amount are the same number by construction, and there was never
   * any discretion to exercise.
   */
  | "chain_eip3009_fixed_value"
  /** The caller's number. Not observed. Never treated as observed. */
  | "declared_by_caller"
  /** Nobody gave one and none was on the chain. */
  | "none";

export type ReconciliationVerdict =
  /** Nothing settled to compare against: not found, reverted, or no match. */
  | "no_settlement"
  /** EIP-3009: the amount was fixed when the payer signed. No gap possible. */
  | "no_discretion"
  /** A ceiling exists and the amount taken is at or under it. */
  | "within_cap"
  /** A ceiling exists and the amount taken is above it. */
  | "over_cap"
  /** It settled, and no ceiling was observable or declared. */
  | "cap_not_observable";

export interface ReconciliationQuery {
  txHash: string;
  /** Narrow the transfer, when a receipt carries several. */
  recipient?: string;
  payer?: string;
  /** The caller's ceiling. Recorded as DECLARED, never as observed. */
  declaredCapUsdc?: number;
}

export interface ReconciliationObservation {
  reconciliation_id: string;
  observed_at: string;
  chain: string;
  tx_hash: string;
  /** Echoed, so the answer cannot be re-pointed at a different question. */
  query: ReconciliationQuery;

  settled_usdc: number | null;
  settled_from: string | null;
  settled_to: string | null;
  block_height: number | null;
  chain_head: number | null;
  confirmations: number | null;

  /**
   * How many USDC transfers in this receipt matched the question, and
   * whether naming one of them was therefore a CHOICE. Top-level and
   * machine-readable on purpose: a consumer that reads only `verdict`
   * and `settled_usdc` must still be able to see that the question was
   * loose enough to have more than one answer.
   */
  matched_transfers: number;
  match_ambiguous: boolean;

  cap_usdc: number | null;
  cap_source: CapSource;
  /** THE FIELD THE WHOLE ARTIFACT TURNS ON. False means: caller's number. */
  cap_observed: boolean;
  /** cap - settled, when both are known. The unused headroom. */
  discretion_usdc: number | null;

  verdict: ReconciliationVerdict;
  reading: string;
  evidence_hash: string;
  scope: string;
  what_this_cannot_see: string[];
  why_this_is_not_just_subtraction: string;
}

export interface SignedReconciliation extends ReconciliationObservation {
  /** RFC 8785 dual-emit over the same observation. See lib/jcs.ts. */
  signature_jcs: string;
  signature_jcs_covers: string;
  signature: string;
  public_key: string;
  signature_covers: string;
}

export interface ReconciliationRecord {
  reconciliation: SignedReconciliation;
  cert_id: string;
  stored_at: string;
}

const SCOPE =
  "This reads one Base transaction receipt at the moment shown and reports two numbers: what moved, and what ceiling was in force. It does not attest that goods or services were delivered, it resolves no dispute, it takes no custody, and it is not accounting. Produced automatically from one RPC read — no human looked, which is the point, because a party to a payment cannot produce a neutral observation of it.";

const NOT_SUBTRACTION =
  "Comparing two numbers is free and you do not need us for it. What this artifact is, is a party with no stake in the answer reading both numbers off the public chain at a stated moment and signing them together — and saying, in the same breath, which of the two it actually observed and which it was merely told. That last part is the whole difference between a receipt and evidence.";

const READINGS: Record<ReconciliationVerdict, string> = {
  no_settlement:
    "No USDC movement matching the question is in this receipt — it may be missing, reverted, or a different transfer than the one asked about. There is nothing to reconcile, which is not the same as something being wrong.",
  no_discretion:
    "This was an EIP-3009 authorization: the amount was fixed inside the payer's own signed digest, so the spender could not have taken a different figure. There was no ceiling to exceed because there was no discretion to exercise.",
  within_cap:
    "The amount taken is at or below the ceiling in force, and both numbers are named above with where each came from.",
  over_cap:
    "The amount taken is ABOVE the ceiling in force. Read cap_source before drawing a conclusion: an observed ceiling makes this a fact about the chain, and a declared one makes it a fact about what the caller told us.",
  cap_not_observable:
    "The payment settled and no ceiling was observable in this receipt, nor was one declared. We report what moved and decline to imply a limit we never saw.",
};

/** A short, stable digest over the observed facts. */
async function evidenceHash(
  core: Omit<
    ReconciliationObservation,
    | "evidence_hash"
    | "reading"
    | "scope"
    | "what_this_cannot_see"
    | "why_this_is_not_just_subtraction"
  >,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(core)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface Facts {
  settledUnits: bigint | null;
  from: string | null;
  to: string | null;
  capUnits: bigint | null;
  capSource: CapSource;
  blockHeight: number | null;
  confirmations: number | null;
  /** How many USDC transfers matched the question. */
  matched: number;
  /** True when more than one matched, so "the" transfer is a choice. */
  ambiguous: boolean;
}

/**
 * Everything derivable from one receipt. Pure, so the classification
 * can be tested against captured receipts without a network.
 */
export function reconcileFacts(
  receipt: RpcReceipt | null,
  query: ReconciliationQuery,
  head: number,
): Facts {
  const empty: Facts = {
    settledUnits: null,
    from: null,
    to: null,
    capUnits: null,
    capSource: "none",
    blockHeight: null,
    confirmations: null,
    matched: 0,
    ambiguous: false,
  };
  if (!receipt) return empty;

  const blockHeight = Number.parseInt(receipt.blockNumber, 16);
  const confirmations = Number.isFinite(blockHeight)
    ? Math.max(0, head - blockHeight)
    : null;
  if (receipt.status !== "0x1") {
    return { ...empty, blockHeight, confirmations };
  }

  const transfers = usdcTransfers(receipt).filter((transfer) => {
    if (query.recipient && !isSameAddress(transfer.to, query.recipient)) {
      return false;
    }
    if (query.payer && !isSameAddress(transfer.from, query.payer)) return false;
    return true;
  });
  /*
   * THE LARGEST MATCHING TRANSFER, not the sum. A receipt can carry a
   * fee split or a refund leg, and adding them together would invent
   * a payment nobody made. Naming one and saying which is honest;
   * synthesising a total is not. When the question is under-specified
   * the artifact echoes the query so a reader can see how loose it was.
   */
  const largest = transfers.reduce<(typeof transfers)[number] | null>(
    (best, transfer) =>
      best === null || transfer.amount > best.amount ? transfer : best,
    null,
  );
  if (!largest) return { ...empty, blockHeight, confirmations };
  /*
   * AMBIGUITY IS A TOP-LEVEL FACT, not a footnote. A red team found the
   * cost of burying it: a caller asks about their own 1 USDC leg, an
   * unrelated 9,999 leg shares the receipt, and the artifact reports
   * the stranger's payment — correct per the stated rule, and read by
   * a machine that only ever looks at `verdict` and `settled_usdc`.
   * The prose caveat was in `what_this_cannot_see`; nothing consuming
   * this JSON reads prose.
   */
  const matched = transfers.length;
  const ambiguous = matched > 1;

  /*
   * THE CEILING, strongest source first.
   *
   * An EIP-3009 authorization pins the value inside the payer's signed
   * digest, so the transfer amount IS the authorized amount and the
   * honest report is that no discretion existed — not that the cap
   * happened to be met exactly.
   */
  /*
   * THE AUTHORIZATION MUST BELONG TO THE PAYER WE ARE REPORTING ON.
   * This filter was missing while the approval filter below was
   * present — the same mistake, made once and caught once. Without
   * it, an authorization signed by anybody in the receipt was read as
   * evidence that THIS transfer's amount was fixed in THIS payer's
   * signed digest, which is a false statement under our own key.
   */
  const authorized = usdcAuthorizations(receipt).some((authorization) =>
    isSameAddress(authorization.authorizer, largest.from),
  );
  const approvals = usdcApprovals(receipt).filter(
    (approval) => isSameAddress(approval.owner, largest.from),
  );
  const approval = approvals.reduce<(typeof approvals)[number] | null>(
    (best, entry) => (best === null || entry.amount > best.amount ? entry : best),
    null,
  );

  if (approval) {
    return {
      settledUnits: largest.amount,
      from: largest.from,
      to: largest.to,
      capUnits: approval.amount,
      capSource: "chain_same_tx_approval",
      blockHeight,
      confirmations,
      matched,
      ambiguous,
    };
  }
  if (authorized) {
    return {
      settledUnits: largest.amount,
      from: largest.from,
      to: largest.to,
      capUnits: largest.amount,
      capSource: "chain_eip3009_fixed_value",
      blockHeight,
      confirmations,
      matched,
      ambiguous,
    };
  }
  return {
    settledUnits: largest.amount,
    from: largest.from,
    to: largest.to,
    capUnits: null,
    capSource: "none",
    blockHeight,
    confirmations,
    matched,
    ambiguous,
  };
}

/** One reconciliation: one receipt read, one head read, signed. */
export async function reconcileSettlement(
  env: Env,
  query: ReconciliationQuery,
  now: Date = new Date(),
): Promise<SignedReconciliation> {
  const [receipt, head] = await Promise.all([
    getReceipt(env, query.txHash),
    getBlockNumber(env),
  ]);
  const facts = reconcileFacts(receipt, query, head);

  /*
   * A DECLARED CEILING IS ONLY USED WHEN THE CHAIN GAVE US NOTHING,
   * and it never overrides an observed one. If the caller's number
   * disagrees with the chain's, the chain wins and the disagreement
   * is visible because the query is echoed on the artifact.
   */
  let capUnits = facts.capUnits;
  let capSource = facts.capSource;
  let capObserved = capSource.startsWith("chain_");
  if (capUnits === null && query.declaredCapUsdc !== undefined) {
    capUnits = BigInt(Math.round(query.declaredCapUsdc * 1_000_000));
    capSource = "declared_by_caller";
    capObserved = false;
  }

  let verdict: ReconciliationVerdict;
  if (facts.settledUnits === null) {
    verdict = "no_settlement";
  } else if (capSource === "chain_eip3009_fixed_value") {
    verdict = "no_discretion";
  } else if (capUnits === null) {
    verdict = "cap_not_observable";
  } else {
    verdict = facts.settledUnits <= capUnits ? "within_cap" : "over_cap";
  }

  const core = {
    reconciliation_id: `srec_${newEntryId()}`,
    observed_at: now.toISOString(),
    chain: BASE_CHAIN,
    tx_hash: query.txHash,
    query,
    settled_usdc:
      facts.settledUnits === null ? null : usdcFromUnits(facts.settledUnits),
    settled_from: facts.from,
    settled_to: facts.to,
    block_height: facts.blockHeight,
    chain_head: head,
    confirmations: facts.confirmations,
    matched_transfers: facts.matched,
    match_ambiguous: facts.ambiguous,
    cap_usdc: capUnits === null ? null : usdcFromUnits(capUnits),
    cap_source: capSource,
    cap_observed: capObserved,
    discretion_usdc:
      capUnits === null || facts.settledUnits === null
        ? null
        : usdcFromUnits(capUnits - facts.settledUnits),
    verdict,
  };

  /*
   * The ambiguity rides in FRONT of the reading, not after it. A
   * reader who stops at the first sentence should stop having already
   * been told the question had more than one answer.
   */
  const ambiguityNote = facts.ambiguous
    ? `${facts.matched} USDC transfers in this receipt matched the question, and the largest is the one reported. ${
        query.payer || query.recipient
          ? "Narrow further with both payer and recipient to remove the choice."
          : "The question named no payer and no recipient, so this may not be the transfer you meant — it may not even involve you."
      } `
    : "";

  const observation: ReconciliationObservation = {
    ...core,
    reading: `${ambiguityNote}${READINGS[verdict]}`,
    evidence_hash: await evidenceHash(core),
    scope: SCOPE,
    what_this_cannot_see: [
      "A ceiling granted in an EARLIER transaction. Only approvals inside this receipt are visible here, so 'no cap observed' means 'not in this receipt' and never 'no ceiling existed'.",
      capObserved
        ? "Whether the ceiling was reasonable. We observed that it was in force, not that it was fair."
        : "WHETHER THE DECLARED CEILING IS REAL. It came from whoever asked for this artifact, who is generally the party it benefits. Our signature covers the fact that we were told this number, never that it is true.",
      "Anything about delivery. Money moving is not goods arriving, and this reads only the money.",
      "Later. This is one receipt at one moment; a subsequent transaction could move more.",
      facts.ambiguous
        ? `WHETHER THIS IS THE TRANSFER YOU MEANT. ${facts.matched} matched, the largest was reported, and match_ambiguous is true for exactly this reason. A receipt can carry a fee split, a refund leg, or an entirely unrelated payment between other parties.`
        : "Whether the transfer named here is the RIGHT one, when the question did not narrow it. Here exactly one matched, so there was no choice to get wrong.",
    ],
    why_this_is_not_just_subtraction: NOT_SUBTRACTION,
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
      "The canonical JSON of every field above `signature`, in the order served.",
    // Same fields, sorted-key byte order, for JCS-conformant tooling.
    signature_jcs: await signJcs(
      observation as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    signature_jcs_covers: JCS_SIGNATURE_COVERS,
  };
}

/**
 * Filed after the mint, so the envelope carries the certificate id.
 * The binding runs one direction — through the certificate's
 * `attests` — exactly like the service audit's.
 */
export async function storeReconciliation(
  env: Env,
  reconciliation: SignedReconciliation,
  certId: string,
): Promise<void> {
  const record: ReconciliationRecord = {
    reconciliation,
    cert_id: certId,
    stored_at: new Date().toISOString(),
  };
  await env.PATRONS.put(
    KV_KEYS.settlementReconciliation(reconciliation.reconciliation_id),
    JSON.stringify(record),
  );
}

export async function getReconciliation(
  env: Env,
  reconciliationId: string,
): Promise<ReconciliationRecord | null> {
  return env.PATRONS.get<ReconciliationRecord>(
    KV_KEYS.settlementReconciliation(reconciliationId),
    "json",
  );
}
