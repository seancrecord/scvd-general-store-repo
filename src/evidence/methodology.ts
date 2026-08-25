import { EVIDENCE_SCHEMA_V1, type EvidenceMethodology } from "@/evidence/types";
import type { ProtocolFamily } from "@/evidence/subject";

/**
 * D6 — schema id and battery version, derived from the family
 * registry, never typed beside it. Producers call this; they do
 * not hand-write `{ schema: "scvd-evidence/v1" }`.
 */
export function envelopeMethodology(
  family: ProtocolFamily,
): EvidenceMethodology {
  const battery_version = family.versions[0];
  if (!battery_version) {
    throw new Error(`${family.id} family has no version`);
  }
  return { schema: EVIDENCE_SCHEMA_V1, battery_version };
}
