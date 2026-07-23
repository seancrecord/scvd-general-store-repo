import { Hono } from "hono";
import { getRefund } from "@/services/refunds";
import type { HonoEnv } from "@/types";

/**
 * GET /api/refund/:refund_id — the honest status of a refund on the
 * ledger. Pending until the keeper pays it by hand and records the
 * transaction hash; then paid, with the hash to prove it.
 */
export const refundRoutes = new Hono<HonoEnv>();

refundRoutes.get("/api/refund/:refund_id{refund_[a-z0-9]+}", async (c) => {
  const record = await getRefund(c.env, c.req.param("refund_id"));
  if (!record) {
    return c.text("No refund by that number on the ledger.", 404);
  }
  return c.json(
    {
      refund_id: record.refund_id,
      item: record.item,
      amount_usdc: record.amount_usdc,
      status: record.status,
      created_at: record.created_at,
      ...(record.tx_hash ? { tx_hash: record.tx_hash } : {}),
      ...(record.paid_at ? { paid_at: record.paid_at } : {}),
      note:
        record.status === "refund_paid"
          ? "Paid, by hand, with the hash to prove it."
          : "Pending. The keeper pays refunds by hand on Sundays; this page tells the truth either way.",
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
