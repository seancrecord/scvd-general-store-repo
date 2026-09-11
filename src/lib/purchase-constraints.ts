import { decodeBase58 } from "@/lib/base58";
import { isSolanaSignature } from "@/lib/solana-rpc";
import { nonceFromPaymentPayload } from "@/services/attestation";
import { decodeSettlementResponseClaim } from "@/services/attestation-claims";
import type { PurchaseArgs } from "@/lib/purchase-args";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_NONCE = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
export interface ConstraintRefusal { field: string; reason: string }

/** Omitted constraints widen a query. Invalid supplied constraints cannot
 * silently widen it too, nor can parseFloat turn a prefix into a paid claim. */
export function checkOptionalObservationConstraints(itemId: string, args: PurchaseArgs): ConstraintRefusal | undefined {
  const present = (field: string) => args.has?.(field) ?? args.get(field) !== undefined;
  const numeric = (field: string, minimum: number, allowZero = false): ConstraintRefusal | undefined => {
    if (!present(field)) return;
    const raw = args.get(field), value = Number(raw);
    if (raw === undefined || !DECIMAL.test(raw) || !Number.isFinite(value) || (allowZero ? value < minimum : value <= minimum)) {
      return { field, reason: `${field} must be a complete finite ${allowZero ? "nonnegative" : "positive"} decimal number, or omitted.` };
    }
  };
  if (["settlement_attestation", "settlement_reconciliation", "the_case_file"].includes(itemId)) {
    const solana = isSolanaSignature(args.get("tx_hash") ?? "");
    for (const field of ["payer", "recipient"]) if (present(field)) {
      const value = args.get(field)?.trim();
      const valid = value !== undefined && (solana
        ? value.length >= 32 && value.length <= 44 && decodeBase58(value)?.length === 32
        : EVM_ADDRESS.test(value));
      if (!valid) return { field, reason: `${field} must be a ${solana ? "Solana public key" : "0x EVM address"} for the transaction being observed, or omitted.` };
    }
    const amount = itemId === "settlement_attestation" ? "amount_usdc" : itemId === "settlement_reconciliation" ? "declared_cap_usdc" : "expected_amount_usdc";
    const badNumber = numeric(amount, 0);
    if (badNumber) return badNumber;
    if (itemId === "settlement_attestation") {
      if (present("nonce") && (solana || !EVM_NONCE.test(args.get("nonce")?.trim() ?? ""))) {
        return { field: "nonce", reason: "nonce must be an EVM bytes32 authorization nonce beside an EVM transaction, or omitted." };
      }
      if (present("payment_payload")) {
        const nonce = nonceFromPaymentPayload(args.get("payment_payload") ?? "");
        if (solana || nonce === null || !EVM_NONCE.test(nonce)) return { field: "payment_payload", reason: "payment_payload must be readable base64 JSON containing an EVM bytes32 authorization nonce beside an EVM transaction, or omitted." };
        if (present("nonce") && nonce.toLowerCase() !== args.get("nonce")?.trim().toLowerCase()) return { field: "payment_payload", reason: "The payload nonce disagrees with the explicit nonce. Supply one consistent constraint." };
      }
      if (present("payment_response") && !decodeSettlementResponseClaim(args.get("payment_response") ?? "")) {
        return { field: "payment_response", reason: "payment_response must be the PAYMENT-RESPONSE header verbatim (base64 JSON) or its decoded JSON, naming at least one of transaction, network, payer or success, or omitted." };
      }
    }
  }
  if (itemId === "good_buyer") {
    const badNumber = numeric("max_usd", 0, true);
    if (badNumber) return badNumber;
    if (present("no_spend_controls") && !["true", "false"].includes(args.get("no_spend_controls") ?? "")) {
      return { field: "no_spend_controls", reason: 'no_spend_controls must be "true" or "false", or omitted.' };
    }
  }
}
