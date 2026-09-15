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
  const capSource = record.reconciliation.cap_source;
  return c.json({
    ...record,
    /*
     * READ THIS FIRST is not decoration. The verdict is the field a
     * skimmer takes away, and "within_cap" off a ceiling the buyer
     * supplied means something entirely different from "within_cap"
     * off a ceiling on Base. Putting the distinction below the verdict
     * would be technically honest and practically misleading.
     */
    read_this_first: capSource === "chain_same_tx_approval"
      ? "Historical Approval inference: cap_observed in this signed record does not establish that this transfer consumed that allowance. Approval co-occurrence was insufficient evidence. Read /corrections before relying on the ceiling; the original signed bytes are preserved."
      : capSource === "none"
      ? "No ceiling was established or declared. This record makes no claim about an authorization limit. Read verdict to determine whether any matching movement was observed."
      : observed
      ? "The selected transfer was paired with an EIP-3009 authorization whose value is fixed. This observation depends on the receipt evidence; it does not prove delivery or consensus. Read /corrections for limitations of older observations."
      : "cap_observed is FALSE. The CEILING was supplied by the commissioner. Our signature covers the fact that we were told that number — never that it is true. Read verdict to determine whether matching movement was observed.",
    how_to_verify: [
      "1. The signed object is reconciliation, not this outer response. Serialize its fields before signature in their served order without whitespace (JSON.stringify); exclude signature, public_key, signature_covers, signature_jcs and signature_jcs_covers. Check those UTF-8 bytes against reconciliation.signature and reconciliation.public_key, both hex encoded, using ed25519. Match the key to key_history.current or key_history.retired at /.well-known/scvd-signing-key. A valid signature authenticates bytes under that key; it does not prove the claim true.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this observation's evidence_hash, so the store's dated word says THIS observation is the one that purchase bought.`,
      "3. Independently establish the Base chain and requested transaction identity, then read its status and USDC logs. The amount comes from the selected Transfer. An observed fixed value requires its paired EIP-3009 AuthorizationUsed event; an Approval alone establishes no spending cap. Consult /corrections for older attribution and receipt-context defects. A receipt and head read do not establish consensus, finality or delivery.",
    ],
    what_this_is_not:
      "Not accounting, not a dispute resolution, not a delivery verification, and not a score on whoever sent or received the money. A dated observation about one transaction — rule of the house: we verify artifacts, we do not rate actors.",
  });
});
