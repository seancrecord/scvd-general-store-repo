import { Hono } from "hono";
import { getLaunchCheck } from "@/services/launch-check";
import type { TxHashStatus } from "@/services/launch-check";
import type { HonoEnv } from "@/types";

// Exhaustive against the producing instrument; adding a status must also tell
// the recipient what it means. These explain the saved record, never rewrite it.
const TX_HASH_MEANINGS = {
  confirmed_on_chain: "a receipt shows a USDC transfer between the field wallet and the declared payTo on tx_verification.chain; read tx_verification.chain_status and tx_verification.confirmations for finality. This does not bind the transfer to this walk's exact authorization nonce and amount",
  claimed: "the seller named a hash, but this walk could not confirm the transfer; tx_verification says whether the read was unavailable, failed, or found no receipt yet",
  contradicted: "the transaction reverted or the receipt did not match the transfer fields the walk checked; inspect tx_verification for the observed parties and amount",
  unverifiable_shape: "the seller's identifier cannot name a transaction on the checked chain, so no chain read was attempted",
} satisfies Record<TxHashStatus, string>;

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
        `1. The signed object is check, not this outer response. Re-serialize its fields before signature in their served order, without whitespace (JSON.stringify); exclude signature, public_key and signature_covers. Verify the UTF-8 bytes against check.signature and check.public_key, both hex encoded, using ed25519. Match that key against key_history.current or key_history.retired at ${base}/.well-known/scvd-signing-key; the current key alone may differ after rotation. A valid signature authenticates those bytes under that key; it does not prove the claim true. The published key history supplies attribution to this store.`,
        "2. The record's evidence_hash is bound into the purchase certificate's attests field — the certificate URL above answers for it.",
        `3. Read tx_hash_status: ${Object.entries(TX_HASH_MEANINGS).map(([status, meaning]) => `"${status}" means ${meaning}`).join("; ")}. null means no transaction identifier was retained. It is not proof that no money moved. The field wallet is declared at ${base}/house-ledger.json.`,
        "4. paid_usd is the quoted amount when the paid request answered 2xx; it is not independent settlement evidence. Read payment_attempt.settlement separately: unknown remains unresolved even when tx_hash_status is confirmed_on_chain. authorization_outstanding_until bounds when the authorization can be used, not whether it was already used. Preserve the original authorization and purchase identifiers; an uncertain result is not a reason to sign a fresh payment. Older records may omit payment_attempt; omission establishes no settlement outcome.",
        `5. These instructions describe the evidence limits without changing the saved signed bytes. Dated corrections are at ${base}/corrections.`,
      ],
      created_at: record.created_at,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});
