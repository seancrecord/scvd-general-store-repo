import { Hono } from "hono";
import { OASF_RECORD_PATH, oasfRecord } from "@/lib/oasf-record";
import type { HonoEnv } from "@/types";

/**
 * THE OASF RECORD, SERVED FROM THE NAME IT CLAIMS.
 *
 * AGNTCY's Directory addresses a record by its content (a CID) and,
 * once the record is signed by a key published in the claiming
 * domain's JWKS, by the URL-shaped name in the record itself. This
 * store's name is `https://scvd.store/agents/general-store`, so that
 * URL answers with the record — which Directory does not require and
 * a human reading the name will absolutely try.
 *
 * DERIVED AT REQUEST TIME, so it cannot go stale. The tool list comes
 * from the same catalogue /mcp answers tools/list from; a tool added
 * to the server appears here in the same deploy. registry/agntcy/
 * record.json is a CUT of this for pushing to a Directory node, and
 * test/oasf-record.spec.ts fails when the cut is behind.
 *
 * WHAT THIS IS NOT. It is not a signed artifact and does not pretend
 * to be one. Directory's provenance comes from signing the pushed
 * record, and this store's own evidence products are ed25519-signed
 * elsewhere. A record fetched from here is a claim by whoever controls
 * this hostname, which is exactly as much as an unsigned record ever
 * proves.
 */
export const oasfRoutes = new Hono<HonoEnv>();

export { OASF_RECORD_PATH };

for (const path of [OASF_RECORD_PATH, "/.well-known/oasf.json"] as const) {
  oasfRoutes.get(path, (c) =>
    c.json(oasfRecord(c.env.STORE_BASE_URL), 200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    }),
  );
}
