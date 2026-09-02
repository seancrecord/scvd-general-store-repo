import { Hono } from "hono";
import { NO_VERDICT, getCaseFile } from "@/services/case-file";
import type { HonoEnv } from "@/types";

/**
 * GET /case/{case_id} — a purchased case file, served forever and free
 * to read. Same door shape as the reconciliation and the mandate, for
 * the same reason: the artifact is bought so it can be handed to the
 * other side, and the other side must be able to read it without
 * asking either the buyer or this store to be honest. The signature
 * and the certificate's `attests` binding carry the weight.
 */
export const caseFileRoutes = new Hono<HonoEnv>();

caseFileRoutes.get("/case/:case_id", async (c) => {
  const record = await getCaseFile(c.env, c.req.param("case_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No case file under that id. The id is on the purchase response and bound into the certificate; the item is /api/buy/the_case_file.",
      },
      404,
    );
  }
  return c.json({
    ...record,
    read_this_first:
      "Read `case.gaps` before any section: the parts this store could not observe are the file's most important fact, and a section marked absent is absent with its reason, never inferred. Then read `case.declared`: everything there is the buyer's own word, stored verbatim and never checked. Only then read the observed sections.",
    no_verdict: NO_VERDICT,
    how_to_verify: [
      "1. Re-serialize every field of `case` above `signature` as JSON in the order served and check the ed25519 signature against the key at /.well-known/scvd-signing-key; or canonicalize per RFC 8785 and check signature_jcs with the same key.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this file's evidence_hash, so the store's dated word says THIS assembly is the one that purchase bought.`,
      "3. Each observed section is the shelf's own artifact and verifies on its own: the settlement attestation and the reconciliation each carry their own signature; the mandate record is served at /api/mandate/{mandate_id}; the door's rounds each name the signed corpus entry they came from.",
    ],
    what_this_is_not:
      "Not a dispute resolution, not a court, not an escrow, and not a verdict on either party. One assembly at one moment of what this store observed and did not observe about one purchase, for the person who has to decide.",
  });
});
