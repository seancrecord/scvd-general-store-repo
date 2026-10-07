import { Hono } from "hono";
import { settlementNetworkLabels } from "@/lib/payment-networks";
import { SPEC_SCHEMA_PATH } from "@/lib/listing-spec";
import {
  computeStatsDiagnosed,
  HOUSE_FLAG_POLICY,
  trackRecordLine,
} from "@/services/stats";
import { IDENTITY_POLICY, SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { publishedCountsBlock } from "@/store/published-counts";
import type { HonoEnv } from "@/types";

/**
 * GET /stats: the books, public, computed live. The claim and the
 * ledger agree because the claim is the ledger.
 */
export const statsRoutes = new Hono<HonoEnv>();

statsRoutes.get("/stats", async (c) => {
  const base = c.env.STORE_BASE_URL;
  // The books with the per-item till beside them (ruling R3, 2026-09-21).
  const books = await computeStatsDiagnosed(c.env);
  const stats = books.stats;
  /**
   * The net-by-chain statement rides the same response rather than a
   * new room: an agent doing diligence is already reading this JSON,
   * and "our books, checked against the chain" belongs on the page
   * whose honest limit has always been "our books, not the chain".
   * Absent on failure rather than a page error — the stats above are
   * older machinery and should not die of the newer instrument.
   */
  const { computeNetStatement } = await import("@/services/net-statement");
  const netByChain = await computeNetStatement(c.env).catch(() => null);
  return c.json({
    ...stats,
    // Rule 43 for the numbers: every count above, with what it is out of (store/published-counts.ts).
    published_counts: publishedCountsBlock("/stats"),
    /**
     * THE TILL, BY ITEM, PUBLIC (ruling R3, 2026-09-21). The same
     * counters the organic figure is summed from, left un-summed, so
     * the next catalogue cut is a derivation anyone can check rather
     * than a keeper's ruling. RAW, and said so: the reclassification
     * ledger moves family settles from organic to house in the totals
     * only and does not know which item they were on, so these rows
     * do not follow it; a shelf item by its id, a penny page by its
     * path with slashes turned to colons. Native MPP joins separately
     * with per-item corrections; the response note names that difference.
     */
    till_by_item: books.till_by_item,
    till_by_item_note:
      "Settles per item, all time, with x402 and native MPP combined. Legacy x402 rows are raw: later wallet-level house corrections affect totals but cannot be assigned to items. The native MPP rows include their per-item house corrections. Founding purchases without an item counter are absent; these rows need not sum to the corrected headline total. Never a ranking.",
    track_record: trackRecordLine(stats, base),
    house_flag_policy: HOUSE_FLAG_POLICY,
    identity_policy: IDENTITY_POLICY,
    verify_url: `${base}/api/verify/{id}`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
    sample_artifact_id: SAMPLE_ARTIFACT_ID,
    listing_spec_schema: `${base}${SPEC_SCHEMA_PATH}`,
    note: "Computed from the same counters the keeper reads. No hand edits; the line rewrites itself as the ledger grows.",
    /**
     * WHERE THE RAIL SPLIT COMES FROM, said here rather than left for
     * somebody to infer, because it is the ONE figure on this page
     * whose substrate is not the settle counters. Only present when
     * there is a split to explain.
     */
    ...(stats.organic_by_rail
      ? {
          rail_split_method:
            `The x402 split combines the till's network counters, certificate-era records before that meter, and documented single-network history and hand placements. Corrected native MPP sales add to Base from their own settlement ledger. ${settlementNetworkLabels().map(row => row.key).join(" + ")} + rail_not_recorded equals organic_settlements when the split is available. rail_not_recorded means the network was not established; it does not establish the sale's age. A contradictory legacy split remains withheld even when native MPP has a valid network reading.`,
        }
      : {}),
    /**
     * THE SECOND FIGURE WHOSE SUBSTRATE IS NOT THE SETTLE COUNTERS,
     * and named for the same reason the rail split is: a reader adding
     * these numbers up should never have to guess which ledger a line
     * came off. Present only when the count could be taken — a null
     * buyer count publishes no method, because there was no method.
     */
    ...(stats.distinct_organic_buyers !== null
      ? {
          patrons_method:
            "distinct_organic_buyers counts payer rows, not sales: one key per wallet that has ever settled here, written at the till, with the house wallets struck out. It is a FLOOR in three directions and none of them inflate it — a settle whose wallet never came back with the money writes no row (those are counted by item, so the gap is a number rather than a mystery), the founding settles that predate the channel meter have no row either, and one buyer paying from a second wallet reads here as a second patron. It is published beside artifacts_issued deliberately: sales, artifacts and patrons are three different quantities, and this store spent its opening weeks showing one of them under another's name.",
        }
      : {}),
    /**
     * AT_SCALE rule 5b. Every number above comes from counters this
     * store writes, which makes them our BOOKS and not the chain. The
     * failure they cannot see is the one that matters: a payment that
     * settled on Base and never bumped a counter is not a discrepancy
     * here, it is an absence, and these figures would read clean.
     *
     * The check exists — an hourly walk compares USDC transfers to our
     * pay-to address against the settlement_tx on every certificate —
     * so the honest move is to NAME it and hand over the address,
     * rather than let "computed live, no hand edits" stand in for
     * independence it does not provide. Computed live says nobody
     * typed it. It does not say anybody outside agreed with it.
     */
    what_these_numbers_are:
      "OUR BOOKS, NOT THE CHAIN. Every figure here is computed from counters this store writes, so a settlement that landed on Base and never bumped one would not appear as a discrepancy — it would not appear at all, and this page would look clean while a payment went unrecorded. 'Computed live, no hand edits' means nobody typed these numbers; it does not mean anybody outside checked them.",
    ...(netByChain ? { net_by_chain: netByChain } : {}),
    how_to_check_it_without_us:
      "An hourly walk compares USDC transfers to our pay-to address against the settlement_tx recorded on every certificate, and a mismatch raises an alert that a person writes up at /corrections. You do not have to take our word for that walk: the pay-to address is public in the 402 terms and at /.well-known/x402.json, every certificate carries its own settlement_tx, and Base is readable by anyone. Walk it yourself and tell us if the two disagree — the mailbox at /api/letter is free.",
  });
});
