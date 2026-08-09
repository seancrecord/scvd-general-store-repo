import { Hono } from "hono";
import { getReconciliation } from "@/services/settlement-reconciliation";
import type { HonoEnv } from "@/types";

/**
 * GET /api/reconciliation/:reconciliation_id — a purchased settlement
 * reconciliation, served forever and free to read.
 *
 * Same shape as the service audit's door and for the same reason: the
 * artifact is bought so it can be shown to somebody else, and that
 * somebody must be able to read it without asking either the buyer or
 * this store to be honest. The signature and the certificate's
 * `attests` binding carry the weight.
 */
export const reconciliationRoutes = new Hono<HonoEnv>();

reconciliationRoutes.get("/api/reconciliation/:reconciliation_id", async (c) => {
  const record = await getReconciliation(
    c.env,
    c.req.param("reconciliation_id"),
  );
  if (!record) {
    return c.json(
      {
        error:
          "No reconciliation under that id. The id is on the purchase response and bound into the certificate; the item is /api/buy/settlement_reconciliation.",
      },
      404,
    );
  }
  const observed = record.reconciliation.cap_observed;
  return c.json({
    ...record,
    /*
     * READ THIS FIRST is not decoration. The verdict is the field a
     * skimmer takes away, and "within_cap" off a ceiling the buyer
     * supplied means something entirely different from "within_cap"
     * off a ceiling on Base. Putting the distinction below the verdict
     * would be technically honest and practically misleading.
     */
    read_this_first: observed
      ? "Both numbers on this receipt were read off Base by a party with no stake in the answer. cap_observed is true, which is the version of this artifact that carries weight with a stranger."
      : "cap_observed is FALSE. The amount was read off Base; the CEILING was supplied by whoever commissioned this. Our signature covers the fact that we were told that number — never that it is true. Anyone relying on this should treat the ceiling as the commissioner's claim and the amount as our observation.",
    how_to_verify: [
      "1. Re-serialize every field of `reconciliation` above `signature` as canonical JSON, in the order served, and check the ed25519 signature against the key at /.well-known/scvd-signing-key.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this observation's evidence_hash, so the store's dated word says THIS observation is the one that purchase bought.`,
      "3. Take the tx_hash to any Base explorer or your own node and read the receipt yourself. The amount is in the USDC Transfer log; an observed ceiling is in an Approval log in the same receipt, or is the EIP-3009 value fixed in the payer's signed digest. Nothing here needs our word — that is the point of naming where each number came from.",
    ],
    what_this_is_not:
      "Not accounting, not a dispute resolution, not a delivery verification, and not a score on whoever sent or received the money. A dated observation about one transaction — rule of the house: we verify artifacts, we do not rate actors.",
  });
});
