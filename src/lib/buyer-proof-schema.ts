/** These envelopes travel beside the purchase certificate, not in its signature. */
export const BUYER_PROOF_SCHEMA = {
  type: "object",
  description: "ed25519 proof: verify exact UTF-8 signed_payload, then its identities and hashes. RFC 8785 JSON.",
  properties: {
    signed_payload: { type: "string" }, signature: { type: "string" },
    public_key: { type: "string" }, signature_covers: { type: "string" },
  },
  required: ["signed_payload", "signature", "public_key", "signature_covers"],
};
export const HUMAN_PROOF_PROPERTIES = { commission: BUYER_PROOF_SCHEMA, completion_proof: BUYER_PROOF_SCHEMA };
