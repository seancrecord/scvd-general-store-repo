import { Hono } from "hono";
import { getCertificate, getPatron } from "@/services/certificates";
import {
  renderAuditBadge,
  renderPatronBadge,
  renderVisitorSticker,
} from "@/services/badge-svg";
import { getServiceAudit } from "@/services/service-audit";
import type { HonoEnv } from "@/types";

/**
 * GET /badges/:patron_number.svg, the patron badge, vintage label style.
 * GET /badges/sticker.svg, the free visitor sticker.
 * GET /badges/audit/:audit_id.svg, the displayable half of a purchased
 * point-in-time audit — the verification marketplace's badge, under
 * the /criteria ruling (dated, criteria-cited, ages, never a score).
 */
export const badgeRoutes = new Hono<HonoEnv>();

const SVG_HEADERS = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=3600",
} as const;

badgeRoutes.get("/badges/sticker.svg", (c) => {
  return c.body(renderVisitorSticker(c.env.STORE_BASE_URL), 200, SVG_HEADERS);
});

badgeRoutes.get("/badges/audit/:badge{saudit_[a-z0-9]+\\.svg}", async (c) => {
  const auditId = c.req.param("badge").replace(/\.svg$/, "");
  const record = await getServiceAudit(c.env, auditId);
  if (!record) {
    return c.text(
      "No audit under that id. The badge is a rendering of a purchased report; the report URL is on the purchase response.",
      404,
    );
  }
  let host: string;
  try {
    host = new URL(record.audit.url).host;
  } catch {
    host = record.audit.url;
  }
  return c.body(
    renderAuditBadge({
      host,
      verdict: record.audit.verdict,
      observedAt: record.audit.observed_at,
      criteria: record.audit.criteria,
      reportUrl: `${c.env.STORE_BASE_URL}/api/service-audit/${record.audit.audit_id}`,
      signature: record.audit.signature,
    }),
    200,
    SVG_HEADERS,
  );
});

badgeRoutes.get("/badges/:badge{[0-9]+\\.svg}", async (c) => {
  const patronNumber = parseInt(c.req.param("badge"), 10);
  const patron = await getPatron(c.env, patronNumber);
  if (!patron) {
    return c.text("No badge by that number on the wall.", 404);
  }
  const badgeOptions: Parameters<typeof renderPatronBadge>[0] = {
    patronNumber: patron.patron_number,
    date: patron.date,
    verifyUrl: `${c.env.STORE_BASE_URL}/api/verify/${patron.cert_id}`,
  };
  if (patron.name) {
    badgeOptions.name = patron.name;
  }
  if (patron.patronage) {
    badgeOptions.patronage = true;
  }
  const certRecord = await getCertificate(c.env, patron.cert_id);
  if (certRecord) {
    badgeOptions.signature = certRecord.signature;
  }
  return c.body(renderPatronBadge(badgeOptions), 200, SVG_HEADERS);
});
