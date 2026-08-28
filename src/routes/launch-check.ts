import { Hono } from "hono";
import { getLaunchCheck } from "@/services/launch-check";
import type { HonoEnv } from "@/types";

/**
 * GET /api/launch-check/{check_id} — a purchased Launch Check, served
 * free forever: the signed stage-by-stage record of one real purchase
 * attempt, the certificate that bound it, and how to verify both.
 */
export const launchCheckRoutes = new Hono<HonoEnv>();

launchCheckRoutes.get("/api/launch-check/:check_id", async (c) => {
  const record = await getLaunchCheck(c.env, c.req.param("check_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No launch check under that id. The id is on the purchase response and the certificate; the item is /api/buy/launch_check.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      what_this_is:
        "A signed record of one real purchase attempt this store made against the endpoint named inside, from its declared field wallet, at the moment stated. One transaction, one moment — never a badge, never a score, and an unpaid verdict is a statement about this store's own published rules.",
      check: record.check,
      certificate: `${base}/api/verify/${record.cert_id}`,
      how_to_verify: [
        "1. The record is signed on its own: re-serialize every field above `signature` (same order) and check the ed25519 signature against the key at /.well-known/scvd-signing-key.",
        "2. The record's evidence_hash is bound into the purchase certificate's attests field — the certificate URL above answers for it.",
        `3. If paid_usd is above zero, read tx_hash_status before pointing anyone at the chain: "confirmed" means our own read of Base verified the settlement from the field wallet named in the record (declared at ${base}/house-ledger.json) and the chain's copy is nobody's to edit; "claimed" means the seller's receipt named a hash we could not verify; null means no settlement receipt came back at all, and paid_usd rests on the till's 2xx, not on an observed transfer.`,
      ],
      created_at: record.created_at,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});
