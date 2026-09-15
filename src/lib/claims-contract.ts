/** A selector is a public receipt id, never a payment or wallet credential. */
export const CLAIM_CERT_ID = { type: "string", pattern: "^cert_[A-Za-z0-9_-]+$", maxLength: 128,
  description: "Optional. Recover this certificate's original good instead of listing purchases. Use a fresh wallet challenge; no payment, old payment header or idempotency key is needed." };

export const CLAIM_GOOD_INSTRUCTIONS = "To recover one original good, get a fresh challenge from /api/claims/challenge, sign it with the paying wallet, then POST /api/claims with { address, signature, cert_id } using a certificate id from this list. Read fulfillment when recovery_state is ready. An unavailable original stays an explicit gap; no replacement is minted and no payment is submitted. Keep the response private.";
