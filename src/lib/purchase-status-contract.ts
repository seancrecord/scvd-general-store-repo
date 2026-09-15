/** Shared recovery instructions for buyers arriving through any published door. */
export const PURCHASE_RECOVERY_GUIDANCE = "Free, even after payment expiry: GET recovery.status_url with Authorization: Bearer <status_token>, or check_purchase(purchase_id,status_token). Keep token private. recovery_state=pending: poll after retry_after_seconds (not a delivery deadline). Use fulfillment when ready; orders still need completion. purchase_input_mismatch is not temporary (HTTP 409/MCP error): read status or retry original inputs with recovery.original_door and recovery.original_path. Do not pay again.";

// The tool catalogue has its own measured reader budget; keep its action complete.
export const PURCHASE_RECOVERY_TOOL_GUIDANCE = "Free, even after payment expiry; submits no payment. Pending: poll after retry_after_seconds (not a deadline). Ready: use fulfillment; orders need completion. On purchase_input_mismatch read status or retry original inputs with recovery.original_door and recovery.original_path. Keep status_token private; do not pay again.";

export const PURCHASE_STATUS_GUIDANCE_PROPERTIES = {
  recovery_state: { type: "string", enum: ["pending", "ready", "not_settled", "resolved"], description: "Recovery readiness, separate from payment and human-work completion." },
  next_action: { type: "string", enum: ["read_purchase_status", "use_fulfillment", "review_unsettled_purchase", "read_resolution"] },
  retry_after_seconds: { type: ["integer", "null"], minimum: 1, description: "Suggested delay before another free status read while recovery is pending; not a delivery deadline. Null when no recovery poll is advised." },
  settlement_attempted: { type: "boolean", const: false, description: "This status read never submits payment." },
} as const;
