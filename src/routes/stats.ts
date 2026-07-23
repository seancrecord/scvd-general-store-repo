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
  });
});
