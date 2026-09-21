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
    /*
     * FIELDS, NOT PROSE (2026-09-21). This answered with a plain-text
     * sentence — no code, no charged flag, nothing to branch on —
     * which is the same defect the 404 and 405 envelopes carried, on
     * the one endpoint the documented refund procedure in agents.md
     * tells an agent to POLL. A caller that mistyped a refund id, or
     * polled one before the keeper opened it, got a paragraph.
     *
     * `charged: false` is about THIS request, as it is everywhere
     * else: reading a refund's status never moves money in either
     * direction. Whether the original purchase was charged is what
     * /api/verify/{cert_id} answers, and the recovery link says so.
     */
    return c.json(
      {
        error: "No refund by that number on the ledger.",
        code: "not_found",
        charged: false,
        retry_same_request: false,
        next_step: {
          method: "GET",
          url: `${c.env.STORE_BASE_URL}/api/verify/{cert_id}`,
          payment_required: false,
        },
        note: "A refund id is issued by the keeper when one is opened, in reply to a letter. If you have a purchase and no refund id, ask at POST /api/letter; if you are checking whether a purchase was charged at all, verify the certificate — that read is free and permanent.",
        letter_url: `${c.env.STORE_BASE_URL}/api/letter`,
      },
      404,
      { "Cache-Control": "no-store" },
    );
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
