import { Hono } from "hono";
import { getServiceAudit } from "@/services/service-audit";
import type { HonoEnv } from "@/types";

/**
 * GET /api/service-audit/:audit_id — a purchased point-in-time audit,
 * served forever. The report is the product; whoever the buyer shows
 * it to reads it here without asking the buyer OR the store to be
 * honest — the signature and the certificate's attests binding carry
 * the weight. Free to read, like every verify surface.
 */
export const serviceAuditRoutes = new Hono<HonoEnv>();

serviceAuditRoutes.get("/api/service-audit/:audit_id", async (c) => {
  const record = await getServiceAudit(c.env, c.req.param("audit_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No audit under that id. The id is on the purchase response and the certificate; the item is /api/buy/service_audit.",
      },
      404,
    );
  }
  return c.json({
    ...record,
    badge_url: `${c.env.STORE_BASE_URL}/badges/audit/${record.audit.audit_id}.svg`,
    how_to_verify: [
      "1. Re-serialize every field of `audit` above `signature` as canonical JSON, in the order served, and check the ed25519 signature against the key here or at /.well-known/scvd-signing-key.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this report's evidence_hash, signed by the store's key — the store's dated word that THIS report is the one that purchase bought.`,
      "3. The criteria are published, so the checks themselves take no trust: GET the endpoint yourself and compare what you see against what this report says it answered then. A difference is a difference in moments, which is exactly what a point-in-time audit is honest about.",
    ],
    what_this_is_not:
      "A dated observation of what one endpoint answered at one moment, against published criteria. Not an endorsement, not an uptime claim, and not a score on whoever runs the endpoint — rule of the house: we verify artifacts, we do not rate actors. The badge_url above renders this same dated observation as an embeddable label and nothing more; it ages, and it is never revoked (see /criteria).",
  });
});
