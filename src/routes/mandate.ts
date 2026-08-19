import { Hono } from "hono";
import { getMandate } from "@/services/mandates";
import type { HonoEnv } from "@/types";

/**
 * GET /api/mandate/{mandate_id} — a purchased mandate record, served
 * free forever: the signed claimed-authorization, the certificate
 * that bound it, and how to verify both. The page a dispute reads.
 */
export const mandateRoutes = new Hono<HonoEnv>();

mandateRoutes.get("/api/mandate/:mandate_id", async (c) => {
  const record = await getMandate(c.env, c.req.param("mandate_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No mandate under that id. The id is on the purchase response and the certificate; the item is /api/buy/the_mandate.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      what_this_is:
        "A signed, dated record that the mandate text inside was submitted to this store as a claimed authorization, before any purchase that cites it. Chain-of-custody, not truth-of-intent: it proves the claim was made, by a party claiming the role stated — never that the human principal actually said it, and never that the declared cap or expiry were honored.",
      mandate: record.mandate,
      certificate: `${base}/api/verify/${record.cert_id}`,
      cited_by:
        "Any certificate carrying this mandate_id was minted AFTER this record existed — the buy door refuses citations it cannot resolve — and carries it signed. Verify any such certificate at /api/verify/{cert_id} and this link is part of what its signature covers.",
      how_to_verify: [
        "1. The record is signed on its own: re-serialize every field above `signature` (same order) and check the ed25519 signature against the key at /.well-known/scvd-signing-key.",
        "2. The record's evidence_hash is bound into the purchase certificate's attests field — the certificate URL above answers for it.",
        "3. recorded_at is this store's clock, vouched for by the signature; for a commitment no clock can rewrite, the store's artifacts anchor into Bitcoin via OpenTimestamps — see /api/buy/bitcoin_anchor for anchoring this record's evidence_hash yourself.",
      ],
      created_at: record.created_at,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});
