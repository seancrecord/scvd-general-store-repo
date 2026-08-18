import { signMessage } from "@/lib/signing";

/**
 * RFC 8785 (JCS) CANONICALIZATION — the store's SECOND signature
 * discipline, adopted 2026-08-18 on the keeper's ruling, and additive
 * only.
 *
 * WHY A SECOND DISCIPLINE EXISTS AT ALL. The IETF drafts converging on
 * agent-payment receipts (draft-hopley-x402-canonicalisation-jcs-v1,
 * draft-vauban-x402-*) pin RFC 8785 — sorted keys — as the canonical
 * preimage. Our own discipline is declared-field-order, permanent for
 * everything already issued, because changing a preimage discipline
 * orphans every signature under it. The risk that decided this was
 * never "standardized out of the product"; it was quieter: conformant
 * tooling gets built around JCS receipts, somebody quotes one of our
 * settlement attestations inside it, and it does not parse — not
 * because our signature is wrong but because the byte order is not
 * what the tool expects. A compatibility gap that compounds.
 *
 * So every artifact minted from 2026-08-18 carries TWO signatures over
 * the SAME fields: the house signature (declared field order, primary,
 * the one our own verify path uses) and `signature_jcs` (this file's
 * bytes). Old artifacts simply lack the field, exactly the way
 * pre-2026-07-30 certificates lack the fields added since. Neither
 * signature covers the other; both cover the same subset.
 *
 * WHY THIS IS HAND-ROLLED RATHER THAN A DEPENDENCY. It is ~30 lines,
 * and it sits in the signing path — the one place a supply-chain
 * surprise costs the store its entire product. The same reasoning that
 * keeps the ed25519 library pinned keeps this in the tree where the
 * suite can pin its bytes against the RFC's own test vectors.
 *
 * WHAT RFC 8785 ACTUALLY REQUIRES, and where JavaScript gets it free:
 *   - Property names sorted by UTF-16 code units. That is EXACTLY the
 *     default Array.prototype.sort() comparator on strings — not
 *     locale sort, not code points. (The RFC's own worked example
 *     sorts "€" BEFORE surrogate-pair characters for this
 *     reason.)
 *   - Strings and numbers serialized as ECMAScript JSON.stringify
 *     serializes them (ES2015+ shortest round-trip numbers). We run on
 *     V8; JSON.stringify IS the reference serializer here.
 *   - No whitespace.
 *
 * WHAT IT REFUSES, loudly rather than creatively: undefined, functions
 * and symbols inside objects are DROPPED by JSON.stringify and dropped
 * here (same subset rule as the house discipline — absent fields are
 * omitted, never null). But a non-finite number (NaN, Infinity) throws
 * instead of becoming null: a signature over "null" where a number was
 * meant is a signature over a lie, and no artifact this store mints
 * should ever contain one.
 */

/** The day dual-emit began; artifacts minted earlier carry no JCS signature. */
export const JCS_DUAL_EMIT_DATED = "2026-08-18";

/** The marker every dual-emitted artifact carries beside signature_jcs. */
export const JCS_DISCIPLINE = "RFC8785" as const;

/** One sentence for artifacts to serve beside the JCS signature. */
export const JCS_SIGNATURE_COVERS =
  "The RFC 8785 (JCS) canonicalization of the same fields the primary signature covers — sorted keys, ECMAScript number and string serialization, no whitespace. Verify with any RFC 8785 implementation and the same ed25519 public key. Additive since 2026-08-18: artifacts minted earlier carry only the primary signature.";

export function jcsCanonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      // JSON.stringify would quietly write "null"; a canonicalizer in
      // a signing path must never improvise a different value.
      throw new Error("jcs: non-finite number cannot be canonicalized");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) =>
        // Inside arrays JSON puts null where stringify would; RFC 8785
        // inherits that (arrays keep their positions).
        entry === undefined || typeof entry === "function" || typeof entry === "symbol"
          ? "null"
          : jcsCanonicalize(entry),
      )
      .join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Default sort() compares UTF-16 code units — RFC 8785's exact rule.
    const keys = Object.keys(record).sort();
    const members: string[] = [];
    for (const key of keys) {
      const entry = record[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") {
        continue;
      }
      members.push(`${JSON.stringify(key)}:${jcsCanonicalize(entry)}`);
    }
    return `{${members.join(",")}}`;
  }
  throw new Error(`jcs: cannot canonicalize a ${typeof value}`);
}

/**
 * The dual-emit helper: ed25519 over the JCS bytes of the SAME subset
 * the primary signature covers. Callers pass the subset object, never
 * the whole served artifact — the served artifact includes the primary
 * signature itself, which no signature can cover.
 */
export async function signJcs(
  signedSubset: Record<string, unknown>,
  signingKeyHex: string,
): Promise<string> {
  const { signature } = await signMessage(
    jcsCanonicalize(signedSubset),
    signingKeyHex,
  );
  return signature;
}
