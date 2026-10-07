import { Hono } from "hono";
import { renderAdminShell } from "@/pages/admin/layout";
import { escapeHtml as h } from "@/lib/sanitize";
import { EVIDENCE_PILOT, PILOT_MONEY } from "@/store/evidence-pilot";
import { PilotInputError, startEvidencePilot } from "@/services/evidence-pilot";
import type { HonoEnv } from "@/types";

/** Mounted behind the existing keeper authentication. Requests never start watches. */
export const adminEvidencePilotRoutes = new Hono<HonoEnv>();
adminEvidencePilotRoutes.get("/", c => {
  c.header("Cache-Control", "no-store");
  const id = `cwatch_pilot_${crypto.randomUUID().replaceAll("-", "")}`;
  return c.html(renderAdminShell("tools", `<h1>Start an agreed evidence pilot</h1><p>${h(PILOT_MONEY)}</p><p>The buyer must have agreed the public endpoint, publication of observations, price and start date. This press starts the ${EVIDENCE_PILOT.duration_days}-day clock. It does not charge or send an invoice.</p><form method="post"><input type="hidden" name="pilot_id" value="${id}"><label>Public endpoint URL <input name="url" type="url" required maxlength="2048" placeholder="https://merchant.example/x402"></label><p>No query parameters, fragments, credentials or private endpoints.</p><label><input name="agreed" value="yes" type="checkbox" required> The buyer agreed the scope, price, start now and public observation.</label><p><button type="submit">Start this pilot</button></p></form><p>Keep the returned report link in the customer correspondence. Download and hand over the final report before invoicing. <a href="/evidence-pilot">Read the offer</a>.</p>`));
});
adminEvidencePilotRoutes.post("/", async c => {
  c.header("Cache-Control", "no-store");
  const origin = c.req.header("Origin"), site = c.req.header("Sec-Fetch-Site");
  if ((origin !== undefined && origin !== new URL(c.env.STORE_BASE_URL).origin) || (site !== undefined && site !== "same-origin" && site !== "none")) return c.json({ error: "cross_site_refused" }, 403);
  const body = await c.req.parseBody();
  if (body.agreed !== "yes" || typeof body.url !== "string" || body.url.length > 2048 || typeof body.pilot_id !== "string") return c.json({ error: "agreement_and_endpoint_required" }, 400);
  try {
    const record = await startEvidencePilot(c.env, body.pilot_id, body.url, Date.now());
    return c.redirect(`/api/evidence-pilot/${record.watch_id}`, 303);
  } catch (error) { return c.json({ error: "pilot_not_started", note: "Check the public URL and agreement. If storage was unavailable, retry the same form and pilot id; do not create a second pilot." }, error instanceof PilotInputError ? 400 : 503); }
});
