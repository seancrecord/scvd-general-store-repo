import { checkProbeTarget, type ProbeTargetVerdict } from "@/lib/probe-target";
import { isValidHttpUrl } from "@/lib/sanitize";

/** Shared by purchase validation and delivery, including retained old orders.
 * This checks the URL, not its future DNS answer. Redirects are refused at
 * fetch so the purchased deliverable never follows a different destination.
 */
export function checkCompletionCallback(raw: unknown, ownHost: string): ProbeTargetVerdict {
  if (!isValidHttpUrl(raw)) return { ok: false, reason: "callback_url must be a usable public https URL, or omitted." };
  return checkProbeTarget(new URL(raw), ownHost);
}

export const COMPLETION_CALLBACK_POLICY = {
  automatic_retries: false,
  redirects: "not_followed",
} as const;

/** Both discovery doors publish the same shape as the order status. */
export const COMPLETION_CALLBACK_STATUS_SCHEMA = {
  type: "object",
  description: "Requested callback outcome, separate from completion of the goods.",
  properties: {
    requested: { type: "boolean", const: true },
    result: { type: ["string", "null"], description: "Recorded outcome; null until recorded." },
    automatic_retries: { type: "boolean", const: COMPLETION_CALLBACK_POLICY.automatic_retries },
    redirects: { type: "string", const: COMPLETION_CALLBACK_POLICY.redirects },
    retrieve: { type: "string", format: "uri", description: "Goods remain here." },
  },
  required: ["requested", "result", "automatic_retries", "redirects", "retrieve"],
} as const;
