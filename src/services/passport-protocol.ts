import { MPP_BATTERY, MPP_SPEC_DRAFT } from "@/lib/mpp-challenge";
import { MPP_CHECK_NAMES } from "@/services/mpp-battery";
import type { MppCensusReading } from "@/services/mpp-census";

export type PassportProtocol = "x402" | "mpp";
export interface ProtocolEvidence {
  verdict?: string | null;
  failed?: string[];
  battery?: string;
  protocols_spoken?: readonly string[];
  mpp?: MppCensusReading;
  mpp_read_error?: string;
}

export const PASSPORT_PROTOCOL_RULE = "A passport can rest on either x402 or MPP when that protocol's latest observed checks pass. If both pass, x402 remains the primary reading and MPP is shown separately. Every tier counts one named protocol's rounds; successes from different protocols are never added together. Missing readings are unmeasured. Other advertised protocols neither qualify nor disqualify a door. Credentials, challenge binding, delivery and receipts were not observed for MPP; this store's till does not speak MPP.";

/** Read saved evidence, never reinterpret historical challenge bytes. */
export function protocolVerdict(evidence: ProtocolEvidence | null | undefined, protocol: PassportProtocol): string | null {
  if (!evidence) return null;
  if (protocol === "x402") return evidence.verdict === "not_probed" ? null : evidence.verdict ?? null;
  if (evidence.verdict === "unreachable") return "unreachable";
  const mpp = evidence.mpp;
  if (!mpp || evidence.mpp_read_error || !evidence.protocols_spoken) return null;
  if (!mpp.spoken || !evidence.protocols_spoken.includes("mpp")) return "not_ready";
  // A partial list (including []) is not a passing battery. Unknown versions
  // need their own reviewed fold, not today's rules applied to yesterday's ink.
  if (mpp.battery !== MPP_BATTERY || mpp.spec !== MPP_SPEC_DRAFT ||
      !Array.isArray(mpp.checks) || mpp.checks.length !== MPP_CHECK_NAMES.length ||
      !MPP_CHECK_NAMES.every(name => mpp.checks.filter(check => check.name === name).length === 1)) return null;
  return mpp.checks.every(check => check.ok === true) ? "ready" : "not_ready";
}

export function passportProtocolOf(evidence: ProtocolEvidence | null | undefined): PassportProtocol {
  if (protocolVerdict(evidence, "x402") === "ready") return "x402";
  if (protocolVerdict(evidence, "mpp") === "ready") return "mpp";
  return evidence?.protocols_spoken?.includes("mpp") && !evidence.protocols_spoken.includes("x402") ? "mpp" : "x402";
}

export function protocolFailures(evidence: ProtocolEvidence | null | undefined, protocol: PassportProtocol): string[] {
  if (protocol === "x402") return evidence?.failed ?? [];
  const checks = evidence?.mpp?.checks;
  return Array.isArray(checks) ? checks.filter(check => !check.ok).map(check => check.name) : [];
}
