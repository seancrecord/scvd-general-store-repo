import { INSPECTION_VERSION } from "../../../x402-preflight/inspection.js";

/** The served guides explain the same observation contract as the tool. */
export const ENDPOINT_INSPECTION_GUIDANCE = `Read the returned \`inspection\` block (${INSPECTION_VERSION}) for reachability,
observed protocols, unverified advertised terms, structural findings and gaps.
Report \`inspection.observed_at\`; a missing observation time remains unknown.
The top-level \`verdict\` is x402-specific: an MPP-only door can be \`not_ready\`
there without being globally broken. Mixed doors retain both readings.
Read \`mpp\` and \`mpp_core\` under their own returned battery and source versions;
unmeasured checks and missing historical fields are not proof of absence.
Inspection signatures are \`not_checked\`; it does not authorize payment or
establish settlement or delivery. On older reports without \`inspection\`,
preserve the protocol fields actually present and name the missing coverage.`;
