import { Hono } from "hono";
import { SPEC_SCHEMA_PATH } from "@/lib/listing-spec";
import {
  computeStats,
  HOUSE_FLAG_POLICY,
  trackRecordLine,
} from "@/services/stats";
import { IDENTITY_POLICY, SAMPLE_ARTIFACT_ID } from "@/store/spec";
import type { HonoEnv } from "@/types";

/**
 * GET /stats: the books, public, computed live. The claim and the
 * ledger agree because the claim is the ledger.
 */
export const statsRoutes = new Hono<HonoEnv>();

statsRoutes.get("/stats", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const stats = await computeStats(c.env);
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
            "organic_by_rail divides the organic figure by the chain the money arrived on, from three records covering disjoint sets of sales so that nothing is counted twice. (1) The TILL: the rail is written in the same call that produces the organic count, so every settle has one, including the penny pages that mint no certificate. (2) The CERTIFICATES, for sales settled before the till started recording rails; that walk stops at exactly the instant the till took over. (3) THE STORE'S OWN CONFIGURATION, for anything the first two missed that predates 2026-08-04 — the day the Solana rail was built. Before it this store could accept exactly one network, so a sale from those weeks did not probably settle on Base, it could not have settled anywhere else. base + solana + rail_not_recorded always equals organic_settlements. What is left in rail_not_recorded can only be a sale from between the second rail opening and the till learning to record rails, that also minted no certificate — a closed set that nothing can join, recoverable by hand from the public receiving wallets against its transaction hash.",
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
