/**
 * THE PAYTO DIGEST — chain hygiene under the G2 ruling
 * (docs/G2_OPERATOR_LINKING_RULING_2026-08.md, keeper-ruled
 * 2026-08-27).
 *
 * New signed corpus rows carry this digest instead of the verbatim
 * payment address; verbatim lives only in the MUTABLE views. The
 * point is erasure: the chain cannot unsign, so the personal data
 * must never be IN what is signed — a digest proves address reuse
 * across doors without containing the address.
 *
 * THE SALT IS PUBLIC, DELIBERATELY. Transparency is the proof: anyone
 * holding an address can recompute the digest with their own tools
 * and verify "this row is about my wallet" — which is exactly the
 * property the standing-note lane and the objection lane stand on. A
 * public salt means someone who already knows a candidate address
 * can test it; it does not let anyone ENUMERATE the addresses out of
 * the chain. That is the standard pseudonymization trade and the
 * ruling makes it knowingly: the address itself is already public on
 * its own chain — what the digest withholds is the free join.
 *
 * Versioned in the salt string so a future change never silently
 * splits clusters: rows carrying v1 digests compare only against v1.
 */
// Keep the signed store rows and the offline reader on the same contract.
export { PAY_TO_DIGEST_SALT, normalizePayTo, payToDigest } from "../../verifier/payment-identity.js";
