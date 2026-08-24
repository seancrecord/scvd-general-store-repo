/**
 * `src/evidence/` — the evidence envelope module tree, future
 * `@scvd/evidence` (spec §10). Roadmap 1.1: schema + canonical form +
 * validators. Producers wire in at 1.2; nothing outside this tree
 * imports from anywhere but this index.
 */

export {
  KNOWN_CHAINS,
  PROTOCOL_FAMILIES,
  RAIL_ASSETS,
  SANDBOX_CHAIN,
  isKnownChain,
  isValidChain,
  isValidRail,
  protocolFamily,
  subjectDefects,
} from "@/evidence/subject";
export type { EvidenceSubject, ProtocolFamily } from "@/evidence/subject";
export {
  COVERAGE_DEPTHS,
  COVERAGE_REGISTRATIONS,
  coverageClassIds,
  coverageMatrix,
  envelopeCoverage,
  isCoverageDepth,
  publicCoverageDocument,
  registrationFor,
  rowFor,
} from "@/evidence/coverage";
export type {
  ClassCoverageRegistration,
  CoverageMatrixRow,
} from "@/evidence/coverage";
export {
  EVIDENCE_SCHEMA_V1,
  REFUSED_DERIVED_FIELDS,
} from "@/evidence/types";
export type {
  CheckState,
  CoverageDepth,
  EvidenceAuthorization,
  EvidenceCapture,
  EvidenceCoverage,
  EvidenceDerived,
  EvidenceEnvelope,
  EvidenceEnvelopePayload,
  EvidenceKeyWindow,
  EvidenceLimitations,
  EvidenceMethodology,
  EvidenceObserver,
} from "@/evidence/types";
export { canonicalEvidenceBytes, roundTrips } from "@/evidence/canonical";
export { validateEnvelopePayload } from "@/evidence/validate";
export type { EnvelopeValidation } from "@/evidence/validate";
