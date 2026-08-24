import { jcsCanonicalize } from "@/lib/jcs";
import type {
  EvidenceEnvelope,
  EvidenceEnvelopePayload,
} from "@/evidence/types";

/**
 * CANONICAL FORM — RFC 8785 (JCS) over the payload, signature
 * excluded (a signature cannot cover itself). One canonicalizer in
 * the tree: this file consumes `lib/jcs.ts`, the same bytes the
 * dual-emit discipline pins against the RFC's own vectors. At
 * extraction into `@scvd/evidence`, jcs.ts moves INTO the package and
 * the store consumes the package back (spec §10's dogfood rule) —
 * what never happens is a second implementation.
 */

/** The exact bytes an envelope's signature covers. */
export function canonicalEvidenceBytes(
  payload: EvidenceEnvelopePayload,
): string {
  return jcsCanonicalize(stripSignature(payload));
}

/**
 * Belt over braces: callers hand us payloads, but a whole envelope
 * arriving here (the easy mistake — it is the payload plus one
 * field) must not produce bytes that include the signature. Dropping
 * it here means the mistake yields the RIGHT preimage instead of an
 * artifact that can never verify.
 */
function stripSignature(
  value: EvidenceEnvelopePayload,
): Record<string, unknown> {
  const { signature: _signature, ...payload } = value as EvidenceEnvelope;
  return payload;
}

/**
 * Round-trip guarantee (roadmap 1.1 acceptance): canonical bytes,
 * parsed and re-canonicalized, are byte-identical. True by RFC 8785
 * construction; exported so the suite asserts it against real
 * fixtures rather than trusting the construction.
 */
export function roundTrips(payload: EvidenceEnvelopePayload): boolean {
  const first = canonicalEvidenceBytes(payload);
  const reparsed = JSON.parse(first) as EvidenceEnvelopePayload;
  return canonicalEvidenceBytes(reparsed) === first;
}
