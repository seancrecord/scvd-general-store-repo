import { commissionGuidance } from "@/lib/buyer-guidance";
import type { CommissionPurchase } from "@/services/commission-purchase";

/** Render retained goods with the purchased quote, without accepting new work. */
export function commissionPurchaseResponse(base: string, result: Record<string, unknown>, purchase: CommissionPurchase): Record<string, unknown> {
  return { ...result, commission_id: purchase.id, commission_status: "accepted",
    commission_terms: { description: purchase.description, quote_usdc: purchase.quote_usdc,
      window_hours: purchase.quote_window_hours, quoted_at: purchase.quoted_at,
      expires_at: purchase.quote_expires_at, ...(purchase.quote_note === undefined ? {} : { note: purchase.quote_note }) },
    commission_url: `${base}/api/commission/${purchase.id}`,
    buyer_guidance: { ...commissionGuidance(purchase.quote_usdc, base),
      production: { kind: "commissioned_human_work", sla_hours: purchase.quote_window_hours,
        terms_url: `${base}/api/commission/${purchase.id}` } },
  };
}
