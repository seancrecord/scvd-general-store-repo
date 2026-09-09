import { BASE_NETWORK } from "@/lib/payment-networks";
/** Share of each organic settle banked as credit. ⚑ keeper dial. */
export const CREDIT_RATE = 0.05;
/** Balance ceiling per wallet, atomic units ($25) — bounds the
 * liability any one wallet can hold. ⚑ keeper dial. */
export const CREDIT_CAP_ATOMIC = 25_000_000n;
/** Cash-out floor, atomic units ($1): below it, keep shopping. */
export const CREDIT_FLOOR_ATOMIC = 1_000_000n;
/** Idle this long, a balance expires back to the store. ⚑ dial. */
export const CREDIT_IDLE_EXPIRY_DAYS = 90;
/** Redemption authorizations expire like the bounty board's. */
export const CREDIT_AUTH_VALID_SECONDS = 7 * 24 * 3600;

/** Pure terms: discovery must never import the cash-out signer. */
export function creditTerms(base: string) {
  return {
    rate: CREDIT_RATE,
    cash_out_floor_atomic: String(CREDIT_FLOOR_ATOMIC),
    balance_cap_atomic: String(CREDIT_CAP_ATOMIC),
    idle_expiry_days: CREDIT_IDLE_EXPIRY_DAYS,
    currency: "USDC",
    changes_checkout_price: false,
    proof_of_accrual: "store_credit in the successful fulfillment response",
    eligibility: "Organic certificate purchases; house wallets excluded. Accrual can be unavailable or capped. Publication-only payments do not accrue.",
    cash_out_wallet_kind: "EVM EOA",
    cash_out_network: BASE_NETWORK,
    balance_url_template: `${base}/api/credit/{evm_wallet}`,
    terms_url: `${base}/credit`,
    redemption: { challenge_url: `${base}/api/credit/challenge`, redeem_url: `${base}/api/credit/redeem`, method: "POST", requires_wallet_signature: true, automatic: false },
    rail_limit: "The current balance and cash-out API accepts EVM addresses only; do not infer Solana cash-out support.",
  };
}

export function creditPickup(base: string, payer: string | undefined) {
  return payer && /^0x[0-9a-fA-F]{40}$/.test(payer)
    ? { balance_url:`${base}/api/credit/${payer.toLowerCase()}`, balance_read_payment_required:false, redemption_terms_url:`${base}/credit` }
    : { cash_out_available:false, rail_limit:"The current cash-out API supports EVM EOAs only.", redemption_terms_url:`${base}/credit` };
}
