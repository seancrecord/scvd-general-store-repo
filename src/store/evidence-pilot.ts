import { STORE_CONTACT_EMAIL } from "@/store/metadata";

export const EVIDENCE_PILOT = {
  name: "SCVD Attestation",
  path: "/evidence-pilot",
  duration_days: 30,
  price_usd: 300,
  currency: "USD",
  interval_hours: 24,
  terms_version: "scvd.endpoint-evidence-pilot.v1",
  billing: "Invoice after delivery of the final report. No automatic renewal.",
} as const;
export const PILOT_PROPOSITION = "Independent signed observations of one public x402 endpoint, assembled into a report for customer and internal reviews.";
export const PILOT_MONEY = `$${EVIDENCE_PILOT.price_usd} USD buys a ${EVIDENCE_PILOT.duration_days}-day pilot for one endpoint, daily checks and one final evidence report; invoiced after delivery, with no automatic renewal.`;
export const PILOT_FREE = "Read the illustrative report and run the free endpoint preflight before requesting a pilot.";
export const PILOT_LIMITS = [
  "The checks cover the public x402 payment interface. They do not inspect private agent decisions, model outputs, fairness or legal compliance.",
  "A daily sample cannot establish continuous behavior. Missed days, refusals, unreachable responses and unresolved methods remain visible.",
  "A signature protects the exported record from undetected editing. It does not establish completeness, correctness of customer claims or when an underlying AI decision occurred.",
  "This pilot does not include real-time alerts, Bitcoin timestamp proofs, private-data storage or a multi-year retention commitment. Download and retain your report.",
  "The endpoint URL and observations are public, including through the existing watch history. Only submit a public URL you are authorized to have observed and published.",
] as const;
export const PILOT_REQUEST_URL = `mailto:${STORE_CONTACT_EMAIL}?subject=${encodeURIComponent("SCVD Attestation pilot request")}&body=${encodeURIComponent(`Public endpoint URL (no credentials or sensitive query parameters):\n\nWhat review do you need evidence for?\n\nWho will use the report, and by when?\n\n${PILOT_MONEY}\nPlease confirm scope and a start date before starting. This email does not commission a watch or authorize a charge.`)}`;
