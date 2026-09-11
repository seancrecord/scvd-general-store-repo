import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payment-networks";
import { SOLANA_CHAIN } from "@/lib/solana-rpc";
import type { SettlementStatus } from "@/services/attestation";
import { isRecord } from "@/types";

/**
 * RECEIVED, NOT OBSERVED (2026-09-11).
 *
 * A buyer who paid an x402 door holds the facilitator's settlement
 * response: the base64 JSON in the PAYMENT-RESPONSE header, naming a
 * transaction, a network, a payer and a success flag. Every field in
 * it is the facilitator's word. Copying those fields into a signed
 * artifact would launder a claim into an observation — exactly what
 * the desk's own scope forbids, because a party to a payment cannot
 * produce a neutral observation of it.
 *
 * So the response is accepted as INPUT and never as fact. The rule is
 * structural, not tonal: facilitator bytes never enter the signed
 * payload. What the signature covers is a digest of the exact bytes
 * received and, per field, whether the claim agrees with what the
 * chain showed. The bytes themselves are echoed OUTSIDE the signature
 * so a reader can check the digest and the table without taking our
 * word for either.
 *
 * The reason this exists is one specific trap the spec thread named
 * the day this shipped: on rails where the facilitator pays the fee,
 * a settlement response's `payer` can name the facilitator rather
 * than the buyer, and a well-formed attestation that copied the field
 * would name the wrong party. "The response said payer X; the chain
 * shows Y" is the whole product, and it is a finding about the
 * response, not a verdict on anyone.
 */

export interface SettlementResponseClaim {
  success?: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

const CLAIM_FIELDS = ["success", "transaction", "network", "payer"] as const;

/**
 * Read a settlement response as the buyer holds it: the header value
 * verbatim (base64 JSON) or its decoded JSON text. Returns null when
 * nothing readable names any of the four fields — the door refuses
 * that before money moves, because an agreement table over bytes we
 * could not read would be a table about nothing.
 */
export function decodeSettlementResponseClaim(
  raw: string,
): SettlementResponseClaim | null {
  const text = raw.trim();
  if (!text) return null;
  let parsed: unknown = null;
  for (const attempt of [text, base64Decode(text)]) {
    if (attempt === null) continue;
    try {
      parsed = JSON.parse(attempt);
    } catch {
      parsed = null;
    }
    // Only an object ends the search: a bare number that happens to
    // parse must not stop the base64 reading of the same bytes.
    if (isRecord(parsed)) break;
  }
  if (!isRecord(parsed)) return null;
  const claim: SettlementResponseClaim = {};
  if (typeof parsed.success === "boolean") claim.success = parsed.success;
  if (typeof parsed.transaction === "string" && parsed.transaction) {
    claim.transaction = parsed.transaction;
  }
  if (typeof parsed.network === "string" && parsed.network) {
    claim.network = parsed.network;
  }
  if (typeof parsed.payer === "string" && parsed.payer) claim.payer = parsed.payer;
  if (typeof parsed.errorReason === "string" && parsed.errorReason) {
    claim.errorReason = parsed.errorReason;
  }
  return CLAIM_FIELDS.some((field) => claim[field] !== undefined) ? claim : null;
}

function base64Decode(text: string): string | null {
  try {
    const padded =
      text.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (text.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

export type Agreement = "agrees" | "disagrees" | "not_claimed" | "not_observed";

export interface ClaimAgreement {
  transaction: Agreement;
  network: Agreement;
  payer: Agreement;
  success: Agreement;
}

/** The signed half: a digest of what was received and the table. */
export interface InputClaims {
  source: "PAYMENT-RESPONSE";
  standing: "received, not observed";
  /** sha256 of the exact string received, so the echo is checkable. */
  received_sha256: string;
  agreement: ClaimAgreement;
  reading: string;
}

/** The unsigned half: somebody else's bytes, echoed for the reader. */
export interface ReceivedNotObserved {
  standing: "received, not observed";
  /** Exactly as received; hash it and compare with input_claims.received_sha256. */
  payment_response: string;
  sha256: string;
  decoded: SettlementResponseClaim;
  note: string;
}

/**
 * v1 names beside v2 CAIP-2 ids. A response that says "base" is not
 * disagreeing with eip155:8453; a response that says "eip155:137"
 * beside a Base receipt is.
 */
const NETWORK_ALIASES: Record<string, string> = {
  base: BASE_NETWORK,
  "base-mainnet": BASE_NETWORK,
  polygon: POLYGON_NETWORK,
  "polygon-mainnet": POLYGON_NETWORK,
  solana: SOLANA_CHAIN,
  "solana-mainnet": SOLANA_CHAIN,
};

export function normalizeClaimedNetwork(network: string): string {
  const trimmed = network.trim();
  return NETWORK_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface ObservedForClaims {
  txHash: string | null;
  chain: string;
  payer: string | null;
  status: SettlementStatus;
}

function sameIdentifier(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  // 0x identifiers are case-insensitive hex; base58 is not.
  if (x.startsWith("0x") && y.startsWith("0x")) {
    return x.toLowerCase() === y.toLowerCase();
  }
  return x === y;
}

export function compareClaim(
  claim: SettlementResponseClaim,
  observed: ObservedForClaims,
): ClaimAgreement {
  const transaction: Agreement =
    claim.transaction === undefined
      ? "not_claimed"
      : observed.txHash === null
        ? "not_observed"
        : sameIdentifier(claim.transaction, observed.txHash)
          ? "agrees"
          : "disagrees";
  const network: Agreement =
    claim.network === undefined
      ? "not_claimed"
      : observed.status === "NOT_FOUND"
        ? "not_observed"
        : normalizeClaimedNetwork(claim.network) === observed.chain
          ? "agrees"
          : "disagrees";
  const payer: Agreement =
    claim.payer === undefined
      ? "not_claimed"
      : observed.payer === null
        ? "not_observed"
        : sameIdentifier(claim.payer, observed.payer)
          ? "agrees"
          : "disagrees";
  let success: Agreement;
  if (claim.success === undefined) {
    success = "not_claimed";
  } else if (
    observed.status === "SETTLED" ||
    observed.status === "PENDING_FINALITY"
  ) {
    success = claim.success ? "agrees" : "disagrees";
  } else if (observed.status === "NOT_FOUND" || observed.status === "REVERTED") {
    success = claim.success ? "disagrees" : "agrees";
  } else {
    // INSUFFICIENT_MATCH: the transaction succeeded but did not match
    // what was asked, so which transfer the response's success refers
    // to is not something this read can say.
    success = "not_observed";
  }
  return { transaction, network, payer, success };
}

export function claimReading(
  agreement: ClaimAgreement,
  claim: SettlementResponseClaim,
  observed: ObservedForClaims,
): string {
  const parts = [
    "The facilitator's settlement response was received, not observed: nothing in it is asserted here. Its exact bytes are committed by received_sha256 and echoed outside the signature under received_not_observed. Each agreement row sets one claimed field beside what the chain showed at observed_at; disagrees is a finding about the response, not a verdict on anyone.",
  ];
  /*
   * The claimed values are never quoted here: this reading rides the
   * signed payload, and a quoted claim would be a facilitator byte
   * inside the signature by the back door. The reader finds the
   * claimed value in received_not_observed.decoded, outside it.
   */
  if (agreement.payer === "disagrees") {
    parts.push(
      `The response's payer is not the payer the chain shows (${observed.payer}); the claimed value is in received_not_observed.decoded.payer. On rails where the facilitator pays the fee, a settlement response's payer can name the facilitator rather than the buyer; this desk reports the chain's word and does not resolve the difference.`,
    );
  }
  if (agreement.transaction === "disagrees") {
    parts.push(
      `The response's transaction is not the one this observation read (${observed.txHash}); the claimed value is in received_not_observed.decoded.transaction. This artifact is about the transaction it read.`,
    );
  }
  if (agreement.network === "disagrees") {
    parts.push(
      `The response's network is not the chain the receipt was found on (${observed.chain}); the claimed value is in received_not_observed.decoded.network. A network and a transaction travel together or not at all.`,
    );
  }
  if (agreement.success === "disagrees") {
    parts.push(
      claim.success
        ? `The response claimed success; the chain showed ${observed.status} at observed_at. A NOT_FOUND says nothing about later.`
        : `The response claimed failure; the chain showed ${observed.status} at observed_at.`,
    );
  }
  if (claim.errorReason) {
    parts.push(
      "The response carried an errorReason; it is echoed with the bytes and not evaluated.",
    );
  }
  return parts.join(" ");
}

export const RECEIVED_NOTE =
  "Somebody else's bytes, outside both signatures by design. Hash payment_response with sha256 and compare with input_claims.received_sha256 inside the signed fields; then read the agreement table against decoded.";
