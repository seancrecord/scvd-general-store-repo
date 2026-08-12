import { Hono, type Context } from "hono";
import { ONPAGE_VERSION } from "@/services/onpage-checks";
import { onpageUrl } from "@/services/onpage";
import { getOnpageAudit } from "@/services/onpage-audit";
import type { HonoEnv } from "@/types";

/**
 * /api/onpage — the free on-page desk, plus the permanent report URL
 * for the paid audit. The preflight's two-door pattern: the GET is
 * the document (and the criteria page the paid audit names as its
 * contract), the POST is the probe.
 */
export const onpageRoutes = new Hono<HonoEnv>();

function doc(base: string) {
  return {
    title: "The on-page desk",
    version: ONPAGE_VERSION,
    summary:
      "Send a public page's URL; we GET it once and report what it serves a machine reader: title, meta description, canonical, robots directives, headings, JSON-LD structured data, link shape. Free, no account. The HTML is read AS SERVED — nothing here runs a script, and the report names that blind spot rather than papering over it. One probe, one moment; never a rank, a grade, or an uptime claim.",
    method: "POST",
    url: `${base}/api/onpage/${ONPAGE_VERSION}`,
    request: {
      url: "REQUIRED. The https URL of the page — a page a person or agent would read, not an API endpoint (those go to /api/preflight).",
    },
    rate_limit:
      "Two ceilings, both ours: a strict per-isolate bucket and a global best-effort cap of 60 probes/minute across all callers. Past either you get a 429 that says the budget is our cost bound, not a fact about your page. This endpoint makes one outbound GET per call to a host you chose; the cap is what keeps it a checker rather than a relay.",
    what_it_checks: [
      "The URL answers 200 with an HTML content type (a redirect is reported, not followed — plenty of machine readers refuse them too).",
      "Exactly one non-empty <title> — the first line every machine reader takes.",
      "Exactly one meta description with content — the summary machines quote instead of writing their own.",
      "rel=canonical, if present: at most one, and an absolute http(s) URL.",
      "JSON-LD structured data, if present: every block parses as JSON. Parsed, not validated against a vocabulary.",
    ],
    what_it_flags_without_failing: [
      "No canonical, no structured data, meta robots noindex, heading shape (zero or multiple h1), missing html lang, links with no destination, a body past the read ceiling, title or description lengths that get truncated where they are quoted.",
    ],
    what_it_cannot_check: [
      "Anything a script renders — the battery reads the HTML as served, so a client-side app can read as nearly empty here and rich in a browser. The report says this on itself.",
      "robots.txt — one request per call is the law, and the site-wide file would be a second one.",
      "Appearance, speed, or ranking anywhere. Nothing is rendered and nothing is predicted.",
    ],
    the_ladder: {
      this_desk: `${base}/api/onpage/${ONPAGE_VERSION} — free, unsigned, run it any day.`,
      this_moment_signed: `${base}/api/buy/onpage_audit — these exact checks, signed, bound into a certificate and served at a permanent report URL: for when you need to hand somebody the readout rather than run it yourself.`,
      payment_doors: `${base}/api/preflight/${ONPAGE_VERSION} — the sibling desk for x402 endpoints: it reads 402 challenges the way this one reads HTML.`,
    },
  };
}

onpageRoutes.get(`/api/onpage/${ONPAGE_VERSION}`, (c) =>
  c.json(doc(c.env.STORE_BASE_URL)),
);
onpageRoutes.get("/api/onpage", (c) => c.json(doc(c.env.STORE_BASE_URL)));

async function handle(c: Context<HonoEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: 'Body must be JSON: {"url": "https://your-site.example/page"}' },
      400,
    );
  }
  const url =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["url"]
      : undefined;
  const result = await onpageUrl(url, c.env);
  return c.json(result.body, result.status as 200, {
    "Cache-Control": "no-store",
  });
}

onpageRoutes.post(`/api/onpage/${ONPAGE_VERSION}`, handle);
onpageRoutes.post("/api/onpage", handle);

/**
 * GET /api/onpage-audit/:audit_id — a purchased on-page audit, served
 * forever. The report is the product; whoever the buyer shows it to
 * reads it here without asking the buyer OR the store to be honest —
 * the signature and the certificate's attests binding carry the
 * weight. Free to read, like every verify surface.
 */
onpageRoutes.get("/api/onpage-audit/:audit_id", async (c) => {
  const record = await getOnpageAudit(c.env, c.req.param("audit_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No audit under that id. The id is on the purchase response and the certificate; the item is /api/buy/onpage_audit.",
      },
      404,
    );
  }
  return c.json({
    ...record,
    how_to_verify: [
      "1. Re-serialize every field of `audit` above `signature` as canonical JSON, in the order served, and check the ed25519 signature against the key here or at /.well-known/scvd-signing-key.",
      `2. GET /api/verify/${record.cert_id}: the certificate's attests field carries this report's evidence_hash, signed by the store's key — the store's dated word that THIS report is the one that purchase bought.`,
      "3. The criteria are published, so the checks themselves take no trust: GET the page yourself and compare what you see against what this report says it served then. A difference is a difference in moments, which is exactly what a point-in-time audit is honest about.",
    ],
    what_this_is_not:
      "A dated observation of what one page served at one moment, against published criteria, with its blind spots printed on it. Not an endorsement, not a ranking claim, not an SEO grade, and not a score on whoever runs the site — rule of the house: we verify artifacts, we do not rate actors.",
  });
});
