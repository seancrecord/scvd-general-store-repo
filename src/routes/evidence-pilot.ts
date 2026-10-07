import { Hono } from "hono";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { escapeHtml as h } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { EVIDENCE_PILOT as pilot, PILOT_PROPOSITION, PILOT_MONEY, PILOT_FREE, PILOT_LIMITS, PILOT_REQUEST_URL } from "@/store/evidence-pilot";
import { readPilot, signedPilotReport, samplePilotReport } from "@/services/evidence-pilot";
import type { HonoEnv } from "@/types";

export const evidencePilotRoutes = new Hono<HonoEnv>();
const CSS = `
body.pilot {background:#101921;color:#ecf1f4}
.pilot .paper {max-width:1000px}
.pilot h1 {font-size:clamp(2.2rem,6vw,4.4rem);letter-spacing:-.045em;text-align:left}
.pilot h2 {text-align:left;line-height:1.25;color:#a9ded6;text-transform:none;letter-spacing:normal;font-size:1.5rem}
.pilot .room-directory {margin:1rem 0 2rem}
.pilot summary {cursor:pointer;color:#a9ded6}
.pilot .offer section {margin:0}
.pilot .offer h2 {margin-top:0}
.pilot a {color:#a9ded6}
.pilot .intro {font-size:1.25rem;max-width:44rem}
.pilot .offer {display:grid;grid-template-columns:1.8fr 1fr;gap:2.5rem;align-items:start;margin:2.5rem 0}
.pilot .price {font-size:2.7rem;line-height:1.1;margin:0}
.pilot .cta {display:inline-block;background:#a9ded6;color:#101921;padding:.85rem 1.1rem;text-decoration:none;border-radius:3px;font-weight:700;white-space:nowrap}
.pilot a:focus-visible {outline:3px solid #a9ded6;outline-offset:5px}
.pilot .sample {background:#182630;padding:1.5rem;border-radius:3px}
.pilot table {width:100%;border-collapse:collapse;font-size:.95rem}
.pilot td,.pilot th {padding:.8rem .5rem;text-align:left;vertical-align:top}
.pilot li,.pilot td {color:#ecf1f4}
.pilot th {color:#a9ded6}
.pilot .limits li {margin-bottom:.9rem}
.pilot .facts {display:flex;gap:2rem;flex-wrap:wrap;margin:1rem 0}
.pilot .facts strong {font-size:1.5rem;display:block}
.pilot .download {overflow-wrap:anywhere}
@media(max-width:640px){.pilot .offer{grid-template-columns:1fr;gap:1.5rem}.pilot .offer section[aria-label]{grid-row:1}.pilot .sample{padding:1rem}.pilot .cta{white-space:normal}.pilot td,.pilot th{padding:.6rem .25rem}}
`;
const sample = samplePilotReport();
const sampleRows = sample.report.days.map(day => `<tr><th scope="row">Day ${day.day}</th><td>${day.attempts}</td><td>${day.conformance_checks}</td><td>${day.gap ? "Coverage gap" : day.outcomes.map(o => h(o.verdict)).join(", ")}</td></tr>`).join("");

function payload(base: string) {
  return { what_this_is: PILOT_PROPOSITION, proposition: PILOT_PROPOSITION, price: PILOT_MONEY, free_first: PILOT_FREE,
    offer: pilot, request_url: PILOT_REQUEST_URL,
    how_to_call: { request: "Email the public endpoint URL, intended review, report recipient and deadline. Scope and start date are agreed before the keeper activates the watch. No payment is taken on this page.",
      sample: `${base}/api/evidence-pilot/sample`, report: `${base}/api/evidence-pilot/{watch_id}`, free_preflight: `${base}/try`,
      verification: "Download the JSON export and check its signed_payload and public key using the instructions in the export." },
    errors: { missing_report: "404: no pilot under that watch id.", report_unavailable: "503: the record or its signatures could not be verified; no replacement report is invented.", scope: "Private endpoints and sensitive decision records are outside this pilot." },
    security: { credentials: "No customer credentials, wallet secrets or private decision data are requested.", stores: "Public endpoint URL, agreed public observation terms, signed checks and reports. Email correspondence stays outside public reports.", visibility: "Public reports and watch history; public observation must be agreed before activation." },
    limitations: PILOT_LIMITS };
}
evidencePilotRoutes.get(pilot.path, c => {
  const base = c.env.STORE_BASE_URL;
  const data = payload(base);
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) return jsonDocumentMarkdownResponse({ base, path: pilot.path, title: pilot.name, description: PILOT_PROPOSITION, document: data });
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json(data);
  return c.html(renderSimplePage({ title: pilot.name, description: PILOT_PROPOSITION, path: pilot.path, markdownAlt: pilot.path,
    collapseNavigation: true, bodyClass: "pilot", extraCss: CSS, webmcp: false,
    bodyHtml: `<p class="intro">${h(PILOT_PROPOSITION)}</p>
    <div class="offer"><section><h2>A record you can hand to a reviewer.</h2><p>Agree the endpoint and the review you need to support. We observe its public payment interface each day and assemble the signed readings, changes and coverage gaps into one export.</p><p><a href="/try">Run a free preflight</a> · <a href="#sample">See a sample report</a></p><p>${h(PILOT_FREE)}</p></section>
    <section aria-label="Pilot price"><p class="price">$${pilot.price_usd} <small>USD</small></p><p>${pilot.duration_days} days · one public endpoint</p><p>${h(pilot.billing)}</p><a class="cta" href="${h(PILOT_REQUEST_URL)}">Request this pilot</a></section></div>
    <section><h2>What the engagement includes</h2><p>${h(PILOT_MONEY)}</p><ol><li>Agree a public x402 endpoint, the intended reviewer and a start date.</li><li>Daily scheduled checks against the published endpoint criteria. Each observation is signed individually.</li><li>A final signed JSON report, a readable report page and one handoff explaining what changed and what we could not observe.</li></ol><p>Requests open an email draft. We confirm scope and availability before starting; the invoice follows delivery of the final report.</p></section>
    <section class="sample" id="sample"><h2>The gaps travel with the findings.</h2><p>${h(sample.note)}</p><div class="facts"><span><strong>${sample.report.coverage.days_with_conformance_checks} / ${sample.report.coverage.elapsed_days}</strong>completed days with checks</span><span><strong>${sample.report.coverage.days_without_conformance_checks}</strong>day without a result</span></div>
    <table><caption>Illustrative first three days of a pilot</caption><thead><tr><th scope="col">Window</th><th scope="col">Attempts</th><th scope="col">Checks</th><th scope="col">Finding</th></tr></thead><tbody>${sampleRows}</tbody></table><p class="download"><a href="/api/evidence-pilot/sample">Download the unsigned sample JSON</a></p></section>
    <section><h2>What this evidence can establish</h2><p>What our instrument saw at a named endpoint and time, under named criteria. A reviewer can verify the exported signature and inspect the original readings.</p><ul class="limits">${PILOT_LIMITS.map(limit => `<li>${h(limit)}</li>`).join("")}</ul></section>
    <section><h2>Before you request a pilot</h2><p>This first offer is for operators of public x402 endpoints preparing a customer or internal review. Send the endpoint URL, the question the review must answer, who will read the report and the deadline. Leave out credentials, customer records and private decision data.</p><p>Methodology: <a href="/criteria">published criteria</a>. Existing observations: <a href="/corpus">the evidence corpus</a>. Vendor information: <a href="/trust">how SCVD operates</a>.</p></section>
    ${jsonLdScript({ "@context": "https://schema.org", "@type": "Service", name: pilot.name, description: PILOT_PROPOSITION, url: `${base}${pilot.path}`, provider: organizationRef(base), offers: { "@type": "Offer", price: pilot.price_usd, priceCurrency: pilot.currency, description: PILOT_MONEY, url: `${base}${pilot.path}` } })}`,
  }));
});
evidencePilotRoutes.get("/api/evidence-pilot/sample", c => c.json(sample));
evidencePilotRoutes.get("/api/evidence-pilot/:watch_id", async c => {
  c.header("Cache-Control", "no-store");
  try {
    const record = await readPilot(c.env, c.req.param("watch_id"));
    if (!record) return c.json({ error: "missing_report" }, 404);
    const data = await signedPilotReport(c.env, record, Date.now());
    if (c.req.query("download") !== "1" && wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
      const report = data.report;
      return c.html(renderSimplePage({ title: `${pilot.name}: ${report.window.complete ? "final report" : "interim report"}`, path: `/api/evidence-pilot/${record.watch_id}`,
        description: PILOT_PROPOSITION, webmcp: false, collapseNavigation: true, bodyClass: "pilot", extraCss: CSS,
        bodyHtml: `<p>${h(record.url)}</p><p>${h(record.started_at)} to ${h(record.ends_at)}</p><p><strong>${report.coverage.days_with_conformance_checks} / ${report.coverage.elapsed_days}</strong> completed days with conformance checks; <strong>${report.coverage.days_without_conformance_checks}</strong> without.</p><p>${h(report.coverage.denominator)}</p><p>${report.changes.length} changes between comparable readings or criteria revisions; inspect the export for their kinds.</p><table><caption>Completed observation windows</caption><thead><tr><th>Day</th><th>Attempts</th><th>Checks</th><th>Gap</th></tr></thead><tbody>${report.days.map(day => `<tr><th>${day.day}</th><td>${day.attempts}</td><td>${day.conformance_checks}</td><td>${h(day.gap ?? "none in this slot")}</td></tr>`).join("")}</tbody></table><p><a href="?download=1">Download signed JSON</a></p><p>${h(data.how_to_verify)}</p><ul>${PILOT_LIMITS.map(limit => `<li>${h(limit)}</li>`).join("")}</ul>`,
      }));
    }
    return c.json(data);
  } catch { return c.json({ error: "report_unavailable", note: "Could not verify and assemble this report. Retry later; no finding is inferred from this failure." }, 503); }
});
