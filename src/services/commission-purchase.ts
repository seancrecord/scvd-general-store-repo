import { commissionPurchaseResponse } from "@/lib/commission-purchase-response";
import { sanitizeText } from "@/lib/sanitize";
import { fulfillPurchase, type FulfillmentInput } from "@/services/fulfillment";
import { getOrder } from "@/services/orders";
import { acceptCommission } from "@/services/commission-desk";
import type { PendingPayment } from "@/lib/payments";
import type { CommissionRequest, Env, MenuItem } from "@/types";

/** Only purchased terms travel into recovery; the requester's contact does not. */
export interface CommissionPurchase {
  id: string;
  description: string;
  quote_usdc: number;
  quote_window_hours: number;
  quoted_at: string;
  quote_expires_at: string;
  quote_note?: string;
  input: FulfillmentInput;
}

export function captureCommissionPurchase(request: CommissionRequest, agentName?: string, userAgent?: string): CommissionPurchase {
  if (!request.quote_usdc || !request.quote_window_hours || !request.quoted_at || !request.quote_expires_at) {
    throw new Error("Commission terms incomplete");
  }
  return {
    id: request.id, description: request.description,
    quote_usdc: request.quote_usdc, quote_window_hours: request.quote_window_hours,
    quoted_at: request.quoted_at, quote_expires_at: request.quote_expires_at,
    ...(request.quote_note === undefined ? {} : { quote_note: request.quote_note }),
    input: { detail: `Commission ${request.id}: ${request.description}`, slaHours: request.quote_window_hours,
      ...(agentName ? { agentName: sanitizeText(agentName, 80) } : {}),
      ...(userAgent ? { userAgent: sanitizeText(userAgent, 200) } : {}) },
  };
}

export async function fulfillCommissionPurchase(env: Env, item: MenuItem, pending: PendingPayment,
  purchase: CommissionPurchase, recovery: NonNullable<Parameters<typeof fulfillPurchase>[4]>,
): Promise<Record<string, unknown>> {
  const result = await fulfillPurchase(env, item, pending, purchase.input, recovery);
  if (typeof result.order_id !== "string") throw new Error("Commission order unavailable");
  // A failed desk projection keeps the recovery alarm working. The original
  // order is checkpointed, so repairing this link cannot create another one.
  const order = await getOrder(env, result.order_id);
  if (!order) throw new Error("Commission order unavailable");
  await acceptCommission(env, purchase.id, result.order_id, new Date(order.created_at), purchase);
  return commissionPurchaseResponse(env.STORE_BASE_URL, result, purchase);
}
