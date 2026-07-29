import { Hono } from "hono";
import { signMessage } from "@/lib/signing";
import { computeStats } from "@/services/stats";
import { STORE_SERVICE_NAME } from "@/store";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { HonoEnv } from "@/types";

/**
 * GET /house-ledger.json — every wallet the store itself controls,
 * declared and signed, plus the house-against-organic split.
 *
 * WHY THIS EXISTS, and it came from outside, which is the only place
 * this kind of thing ever comes from. On 2026-07-29 CV paid a
 * competitor's risk-scoring product $0.002 to assess OUR OWN payTo
 * address. It came back `review`, 63/100, with two factors:
 *
 *   "address only 6d old"
 *   "only 2 real payers over 29 settlements —
 *    concentrated / possible self-wash"
 *
 * Both correct. That is their product working exactly as advertised,
 * and it is the sharpest mirror the store has been handed: WE FLAG
 * HOUSE TRAFFIC IN OUR OWN BOOKS AND THE CHAIN CARRIES NO SUCH FLAG.
 * From outside, our carefulness is invisible and our settlements look
 * like a store buying from itself — which, mechanically, most of them
 * are. Rule 13 governs what we count, not what a stranger can see.
 *
 * So: publish the wallets. A scorer that wants to subtract us can
 * subtract us, by address, without asking and without trusting a
 * sentence. The store's whole pitch is that its claims are checkable;
 * this is the claim that had no check on it.
 *
 * WHAT THIS IS NOT, said here rather than discovered later: it is a
 * DECLARATION, not a proof. Nothing stops a store from owning a wallet
 * it does not list. What makes it worth anything is that it is signed
 * and dated, so a wallet quietly added to the list later — or a
 * settlement from an address that was never on it — is visible to
 * anyone who kept a copy. It is a commitment that can be held against
 * us, which is the most any self-declaration can be.
 */
export const houseLedgerRoutes = new Hono<HonoEnv>();

export const HOUSE_LEDGER_PATH = "/house-ledger.json";
export const HOUSE_LEDGER_VERSION = 1;

houseLedgerRoutes.get(HOUSE_LEDGER_PATH, async (c) => {
  const base = c.env.STORE_BASE_URL;
  const stats = await computeStats(c.env);

  const body = {
    version: HOUSE_LEDGER_VERSION,
    issuer: STORE_SERVICE_NAME,
    issuer_origin: base,
    issued_at: new Date().toISOString(),

    declares:
      "Every wallet this store controls, so that settlements from them can be subtracted by anyone scoring this origin. We flag house traffic in our own books; the chain does not carry that flag, so we publish the addresses instead of asking to be believed.",

    why_published:
      "An outside risk-scoring service assessed this store's payment address and returned `review`, citing few distinct payers across many settlements — concentration indistinguishable from self-dealing. That reading was correct from where it stood. This document is the correction, in a form that does not require trusting us.",

    honest_limit:
      "A DECLARATION, NOT A PROOF. Nothing prevents a store from owning a wallet it does not list here. What this is worth is that it is signed and dated: a wallet added quietly later, or a settlement from an address that was never listed, is visible to anyone who kept an earlier copy. Treat it as a commitment that can be held against us, not as evidence of completeness.",

    house_wallets: HOUSE_WALLET_FILE.wallets.map((entry) => ({
      address: entry.address,
      who: entry.who,
      since: entry.since,
      why: entry.why,
    })),

    settlements: {
      total: stats.settled_purchases_total,
      house: stats.house_settlements,
      organic: stats.organic_settlements,
      // Settles from before the channel meter existed. Attributed to
      // nobody rather than quietly counted as organic, which would
      // flatter us in exactly the direction this document exists to
      // correct.
      unattributed_pre_meter: stats.pre_meter_settlements,
      operating_since: stats.operating_since,
      note: "House settlements are the store buying from itself: the keeper walking every shelf before a stranger can, and test purchases against our own till. They are real payments on Base and they are deliberately excluded from every organic count we publish.",
    },

    what_a_scorer_should_conclude:
      "That this origin is young and has not yet been paid by strangers. Both are true, neither is hidden, and no number here is improved by the publishing of it. If the organic count above is zero, that is the honest state of the business and not an omission.",

    verify: {
      signing_key_url: `${base}/.well-known/scvd-signing-key`,
      trust_list_url: `${base}/trust-list.json`,
    },
  };

  const canonical = JSON.stringify(body);
  const { signature, publicKey } = await signMessage(
    canonical,
    c.env.SIGNING_KEY,
  );
  return c.json(
    {
      ...body,
      signature,
      public_key: publicKey,
      signature_covers:
        "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
