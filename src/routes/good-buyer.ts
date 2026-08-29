import { Hono } from "hono";
import { getGoodBuyerReading } from "@/services/good-buyer";
import type { HonoEnv } from "@/types";

/**
 * GET /api/good-buyer/:reading_id — a purchased payment dry run,
 * served forever, free to read like every verify surface.
 *
 * WHO ACTUALLY READS THIS PAGE, and the artifact is shaped for them:
 * not the agent that bought it — that agent already had the answer,
 * for nothing, at the moment it needed it — but the HUMAN behind it,
 * later, asking why the money went where it went, or why it never
 * went at all. They were not there, the door's terms may have changed
 * since, and they have no reason to take the agent's word or ours.
 *
 * Which is why `accepts_as_served` is on the record verbatim. It is
 * the half a stranger can check without us: hand those accepts to any
 * copy of @x402/core and the selection re-derives itself. Everything
 * else in the reading is downstream of that, so publishing it is what
 * makes the rest falsifiable rather than trusted.
 */
export const goodBuyerRoutes = new Hono<HonoEnv>();

goodBuyerRoutes.get("/api/good-buyer/:reading_id", async (c) => {
  const record = await getGoodBuyerReading(c.env, c.req.param("reading_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No reading under that id. The id is on the purchase response and the certificate; the item is /api/buy/good_buyer, and the same reading unsigned is free at POST /api/before-you-pay/v1.",
      },
      404,
    );
  }
  return c.json({
    ...record,
    how_to_verify: [
      "1. Re-serialize every field of `reading` above `signature` as canonical JSON, in the order served, and check the ed25519 signature against the key here or at /.well-known/scvd-signing-key.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this reading's evidence_hash, signed by the store's key — the store's dated word that THIS reading is the one that purchase bought.`,
      "3. Re-derive the selection yourself, without us: `accepts_as_served` is printed verbatim, and @x402/core is public. Hand it those accepts with the declared configuration and see whether it picks what this record says it picks. A simulation you can reproduce is worth more than one you have to believe.",
      "4. GET the door yourself and compare. A difference is a difference in moments, which is exactly what a dated reading is honest about.",
    ],
    what_this_is_not:
      "A dated observation of what one door served at one moment, plus a replay of a named client library over it. Not a payment — nothing was signed and no wallet was touched. Not a promise the purchase would have succeeded. Not an uptime claim, and not a score on whoever runs the door: rule of the house, we verify artifacts and do not rate actors. And not a statement about the buyer's machine — `client_profile_as_declared` is the buyer's own claim about their own setup, recorded as theirs and never verified by this store, because we have no way to see it and will not sign as though we did.",
  });
});
