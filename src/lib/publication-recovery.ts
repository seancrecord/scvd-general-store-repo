import type { Context, MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";
import type { PurchaseIntent } from "@/services/purchase-intent";
import { encodeBase64Json } from "@/lib/base64-json";

export interface PublicationSnapshot {
  minimum_usdc: number;
  markdown: string;
  content_type: string;
}

/** Authenticate retained purchases before checking today's shelf. */
export function publicationAdmission(check: (c: Context<HonoEnv>) => Promise<Response | void>): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    c.set("publicationPurchase", true);
    if (c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT")) c.set("purchaseAdmission", () => check(c));
    else {
      const refusal = await check(c);
      if (refusal) return refusal;
    }
    await next();
  };
}

/** The retained page itself is the good; no current content read is needed. */
export function publicationDelivery(record: PurchaseIntent) {
  if (record.state !== "settled" || !record.payment || !record.publication) return undefined;
  return { publication_response: { ...record.publication, headers: record.payment.settleHeaders },
    transaction: record.payment.transaction, network: record.payment.network };
}

export function publicationResponse(page: Pick<PublicationSnapshot, "markdown" | "content_type">, headers: Record<string, string>, recovery?: Record<string, unknown>) {
  const response = new Response(page.markdown, { headers: { ...headers, "Content-Type": page.content_type, "Cache-Control": "no-store" } });
  if (recovery) response.headers.set("Purchase-Recovery", encodeBase64Json(recovery));
  return response;
}
