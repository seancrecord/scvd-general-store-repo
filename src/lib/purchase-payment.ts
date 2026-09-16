import type { PaymentRequirements } from "@x402/core/types";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";
import { isRecord } from "@/types";

export type PurchaseProtocol = "x402" | "mpp";

/** Verified settlement facts, not a credential and not a verifier. */
export interface PurchasePayment {
  version: 1;
  protocol: PurchaseProtocol;
  method: "exact" | "evm/charge";
  network: string;
  asset: string;
  amount_atomic: string;
  recipient: string;
  payer: string;
  /** The historical settlement identity: deliberately excludes protocol. */
  identity: string;
  proof_digest: string;
  authorization?: { nonce: string; valid_after: string; valid_before: string };
  solana?: { message_hash: string };
}

/** Keep the existing IDs byte-for-byte, including their base64/hex normalization. */
export async function settlementPurchaseIdentity(network: string, verifiedPayer: string, raw: string, kind: "authorization" | "transaction") {
  if (!raw || !verifiedPayer) throw new Error("Missing verified payment identity");
  const payer = network.startsWith("eip155:") ? verifiedPayer.toLowerCase() : verifiedPayer;
  const identity = kind === "authorization" ? raw.toLowerCase() : btoa(atob(raw));
  return { payer, id: await sha256Hex(jcsCanonicalize({ network, payer, identity })) };
}

function facts(protocol: PurchaseProtocol, terms: PaymentRequirements, payer: string, identity: string, proof: string): PurchasePayment {
  if (terms.scheme !== "exact" || !/^[0-9]+$/.test(terms.amount) || BigInt(terms.amount) <= 0n ||
    !terms.asset || !terms.payTo || !terms.network || !payer || !/^[0-9a-f]{64}$/.test(proof)) {
    throw new Error("Invalid verified purchase terms");
  }
  return { version: 1, protocol, method: protocol === "x402" ? "exact" : "evm/charge",
    network: terms.network, asset: terms.asset, amount_atomic: terms.amount,
    recipient: terms.payTo, payer, identity, proof_digest: proof };
}

/** Existing x402 gates call this only after authenticating the payment. */
export async function x402PurchasePayment(terms: PaymentRequirements, verifiedPayer: string, wire: unknown): Promise<PurchasePayment> {
  const payload = isRecord(wire) && isRecord(wire.payload) ? wire.payload : {};
  const nonce = extractPaymentNonce(wire);
  const raw = nonce ?? payload.transaction;
  if (typeof raw !== "string") throw new Error("Missing payment identity");
  const { payer, id } = await settlementPurchaseIdentity(terms.network, verifiedPayer, raw, nonce ? "authorization" : "transaction");
  const payment = facts("x402", terms, payer, id, await sha256Hex(jcsCanonicalize(wire)));
  const auth = isRecord(payload.authorization) ? payload.authorization : {};
  if (nonce) payment.authorization = { nonce: nonce.toLowerCase(), valid_after: String(auth.validAfter), valid_before: String(auth.validBefore) };
  if (terms.network.startsWith("solana:")) {
    const evidence = await solanaPaymentEvidence(String(payload.transaction));
    payment.solana = { message_hash: evidence.message_hash };
  }
  return payment;
}

/**
 * Adapter seam for a verified MPP EIP-3009 authorization. This does not parse
 * HTTP, verify signatures, bind an MPP challenge, or submit payment. The real
 * adapter must do those checks before using it; no checkout calls it yet.
 * Settlement terms use the existing exact-transfer projection so chain
 * reconciliation does not need an invented MPP receipt or another journal.
 */
export async function mppEvmPurchasePayment(terms: PaymentRequirements, verifiedPayer: string,
  authorization: { from: string; to: string; value: string; nonce: string; validAfter: string; validBefore: string },
  proofDigest: string,
): Promise<PurchasePayment> {
  if (!terms.network.startsWith("eip155:") || authorization.from.toLowerCase() !== verifiedPayer.toLowerCase() ||
    authorization.to.toLowerCase() !== terms.payTo.toLowerCase() || authorization.value !== terms.amount ||
    !/^0x[0-9a-f]{64}$/i.test(authorization.nonce) || !/^[0-9]+$/.test(authorization.validAfter) ||
    !/^[0-9]+$/.test(authorization.validBefore) || BigInt(authorization.validBefore) <= BigInt(authorization.validAfter)) {
    throw new Error("MPP authorization does not match verified settlement terms");
  }
  const { payer, id } = await settlementPurchaseIdentity(terms.network, verifiedPayer, authorization.nonce, "authorization");
  return { ...facts("mpp", terms, payer, id, proofDigest), authorization: {
    nonce: authorization.nonce.toLowerCase(), valid_after: authorization.validAfter, valid_before: authorization.validBefore,
  } };
}

/** Never infer another asset, network or protocol from a convenient label. */
export function assertPurchasePayment(payment: PurchasePayment, terms: PaymentRequirements, payer: string) {
  if (terms.scheme !== "exact" || !/^[0-9]+$/.test(terms.amount) || BigInt(terms.amount) <= 0n ||
    !terms.network || !terms.asset || !terms.payTo || !payer ||
    payment.version !== 1 || !["x402", "mpp"].includes(payment.protocol) ||
    payment.method !== (payment.protocol === "x402" ? "exact" : "evm/charge") ||
    payment.network !== terms.network || payment.asset !== terms.asset || payment.amount_atomic !== terms.amount ||
    payment.recipient !== terms.payTo || payment.payer !== payer || !/^[0-9a-f]{64}$/.test(payment.identity) ||
    !/^[0-9a-f]{64}$/.test(payment.proof_digest) || (payment.protocol === "mpp" && (!payment.authorization || !payment.network.startsWith("eip155:")))) {
    throw new Error("Purchase payment facts disagree with settlement terms");
  }
}
