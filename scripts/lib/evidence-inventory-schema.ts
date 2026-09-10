import { KV_KEYS } from "../../src/lib/kv-keys";
export { canonicalizeCertificate, canonicalizeCertificateLegacy } from "../../src/lib/signing";
export { canonicalizeCorpusSnapshot } from "../../src/services/corpus";
export const inventoryFamilies = [
  { name: "certificates", prefix: KV_KEYS.certPrefix, mode: "certificate" },
  { name: "service_audit", prefix: KV_KEYS.serviceAudit(""), mode: "core" },
  { name: "good_buyer", prefix: KV_KEYS.goodBuyerReading(""), mode: "core" },
  { name: "signature_agent_card", prefix: KV_KEYS.signatureAgentCard(""), mode: "core" },
  { name: "onpage_audit", prefix: KV_KEYS.onpageAudit(""), mode: "core" },
  { name: "launch_check", prefix: KV_KEYS.launchCheck(""), mode: "core" },
  { name: "provenance_check", prefix: KV_KEYS.provenanceCheck(""), mode: "payload" },
  { name: "wallet_statement", prefix: KV_KEYS.walletStatement(""), mode: "core" },
  { name: "mandate", prefix: KV_KEYS.mandate(""), mode: "core" },
  { name: "settlement_reconciliation", prefix: KV_KEYS.settlementReconciliation(""), mode: "reconciliation" },
  { name: "case_file", prefix: KV_KEYS.caseFile(""), mode: "core" },
] as const;
export const inventoryCounters = [KV_KEYS.patronNumber, KV_KEYS.certAnchorCursor, KV_KEYS.certAnchorSweep];

// These projections are separate from immutable reports in the original census.
export const retentionFamilies = [
  { name: "trust_profile", binding: "COUNTERS", prefix: KV_KEYS.trustProfile(""), mode: "payload" },
  { name: "passport_refresh", binding: "COUNTERS", prefix: KV_KEYS.passportRefresh(""), mode: "projection" },
  { name: "bitcoin_anchor", binding: "PATRONS", prefix: KV_KEYS.patronAnchorPrefix, mode: "opaque" },
] as const;
