import { Hono } from "hono";
import { A2A_AUTH_PATH, A2A_BATTERY, A2A_GAPS, A2A_READ_LIMIT, A2A_RECHECK_DAYS, A2A_SPEC, A2A_TIMEOUT_MS, A2A_WATCH_DAYS, A2A_FREE_REQUESTS_PER_MINUTE, boundedText, record, target, type A2AReading } from "@/lib/a2a-instrument";
import { freeA2ACheck } from "@/lib/a2a-admission";
import { A2A_FREE, A2A_MONEY, A2A_PRICE_USDC, A2A_PROPOSITION, A2A_REPAIR_RECIPES, repairRows } from "@/store/a2a-repair";
import { kitStore } from "@/services/a2a-kit";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { STORE_CONTACT_EMAIL } from "@/store/metadata";
import runner from "@/store/a2a-runner.md";
import type { HonoEnv } from "@/types";

const DESK_CSS = `.a2a-form{display:grid;gap:.75rem}.a2a-form input{box-sizing:border-box;width:100%;padding:.8rem;border:1px solid #786b80;border-radius:4px;background:#15121b;color:#f1e9df;font:inherit}.a2a-form button{justify-self:start;padding:.7rem 1rem;border:1px solid #d7b675;border-radius:4px;background:#d7b675;color:#17111d;font:inherit;cursor:pointer}.a2a-checks li{margin-bottom:1rem}.a2a-repair{padding:1rem 0;border-top:1px solid #403647}details{margin:1.5rem 0}summary{cursor:pointer;color:#e4c080}pre{overflow:auto;max-height:32rem}`;
function readingHtml(reading: A2AReading): string {
  const c = reading.counts;
  const labels = { pass: "Passed", fail: "Needs a fix", not_observed: "Not observed", not_applicable: "Not applicable" };
  const repairs = repairRows(reading);
  return `<p>${c.pass} passed · ${c.fail} need a fix · ${c.not_observed} not observed · ${c.not_applicable} not applicable.</p>
    <ul class="a2a-checks">${reading.checks.map(check => `<li><strong>${labels[check.state]} — ${escapeHtml(check.id)}</strong><br>${escapeHtml(check.detail)}</li>`).join("")}</ul>
    <h3>Your fix list</h3>${repairs.length ? repairs.map(repair => `<article class="a2a-repair"><h4>${escapeHtml(repair.check)}</h4><p><strong>Change:</strong> ${escapeHtml(repair.change)}</p><p><strong>Acceptance test:</strong> ${escapeHtml(repair.acceptance)}</p><p>${escapeHtml(repair.implementation)}</p><p><a href="${escapeHtml(repair.spec)}">Protocol reference</a>. Suggested; not applied.</p></article>`).join("") : "<p>No repair is suggested by the observed checks. Anything not observed remains unproven.</p>"}`;
}

export function a2aDeskDocument(base: string) {
  return {
    what_this_is: A2A_PROPOSITION, proposition: A2A_PROPOSITION, for_money: A2A_MONEY, price: { description: A2A_MONEY, amount_usdc: A2A_PRICE_USDC, cadence: "one_off", free: A2A_FREE },
    battery: A2A_BATTERY, protocol_version: "0.3.0", specification: A2A_SPEC,
    how_to_call: {
      card_check: { method: "POST", url: `${base}/api/a2a/check`, body: { url: "https://your-agent.example/.well-known/agent-card.json" } },
      setup: `Publish the authorization JSON below at ${A2A_AUTH_PATH} on the card origin. Replace both URLs and the safe test message; choose an expiry in the next ${A2A_RECHECK_DAYS} days. Only public test data. The endpoint must be on that same origin. The fixture permits repeated execution, including malformed trailing parts that a broken agent might execute.`,
      authorization_example: { allow_scvd_audit: true, allow_negative_tests: true, safe_to_repeat: true, card_url: "https://your-agent.example/.well-known/agent-card.json", endpoint: "https://your-agent.example/a2a", expires_at: "REPLACE_WITH_FUTURE_ISO_TIMESTAMP", message: { kind: "message", role: "user", messageId: "replaced-on-each-run", parts: [{ kind: "text", text: "REPLACE_WITH_YOUR_SAFE_TEST_TASK" }] } },
      purchase: { url: `${base}/api/buy/a2a_repair_kit?url=https%3A%2F%2Fyour-agent.example%2F.well-known%2Fagent-card.json`, method: "GET", payment: "x402; the item page has the browser till", item_page: `${base}/menu/a2a_repair_kit` },
      recheck: "POST the private token from your purchase to its recheck URL within 30 days. The authorization file is read again. Repeated calls return the same recheck; the original report remains intact. An interrupted run is reported as a gap, without automatic replay.",
      regression: { download: `${base}/api/a2a/runner.mjs`, run: "node a2a-regression.mjs https://your-agent.example/.well-known/agent-card.json --runtime", exits: { 0: "All observed applicable checks passed; the stated untested capabilities remain outside scope", 1: "At least one check failed", 2: "Observation gaps, unsupported scope, refusal or instrument error" }, ci: "Save the downloaded runner in your repository, require Node 22 or later, and run the command as a required CI step. Omit --runtime for card-only checks." },
      implementation_quote: { contact: `mailto:${STORE_CONTACT_EMAIL}`, include: "Kit ID, public repository URL, Hono/Workers stack details, and requested repair scope. Implementation is separately quoted and is not included in the kit. Never send credentials or keys." },
    },
    errors: { target_refused: "Use a public HTTPS URL without query, fragment, credentials or private/internal addresses; our own host is refused", unsupported_version: "Only 0.3.0 is assessed; no automatic version conversion", unsupported_transport: "This pilot tests JSON-RPC only", endpoint_refused: "The card and endpoint must share an origin", authorization_required: "Publish or refresh the authorization fixture before purchase or recheck; nothing charged", invalid_fixture: "Use a valid new user Message with no existing taskId or contextId", budget_exhausted: "The shared free/admission budget is exhausted; retry after 60 seconds", body_limit: "Read exceeded the byte ceiling and is unobserved", missing: "Check the kit ID in the purchase response", unavailable: "An instrument or storage failure prevented completion; no pass is inferred", expired: "The included recheck period has ended" },
    security: { public_data_only: true, stored: "Bounded public card, authorization fixture, task requests and responses, signed reports and suggested fixes. The private recheck token is stored separately and never returned by report reads. Report IDs are unguessable links; anyone holding a link can read the report, so use only public test data.", authority: "The operator grants runtime permission using a fixed file on the same origin. No supplied credentials, callback registrations, redirects or existing tasks. Daily watch passes only read the card.", bounds: { response_bytes: A2A_READ_LIMIT, request_timeout_ms: A2A_TIMEOUT_MS, watch_days: A2A_WATCH_DAYS, recheck_days: A2A_RECHECK_DAYS, free_and_admission_requests_per_minute: A2A_FREE_REQUESTS_PER_MINUTE }, conflict: "The subject pays for the work, never the result. Suggested repairs are authored by this store and have not been applied or independently code-reviewed. Any separately commissioned implementation must disclose store authorship at recheck.", gaps: A2A_GAPS },
    repair_guidance: A2A_REPAIR_RECIPES,
  };
}
export const a2aDeskRoutes = new Hono<HonoEnv>();
a2aDeskRoutes.use("/api/a2a/kits/*", async (c, next) => { await next(); if (c.req.path.startsWith("/api/a2a/kits/")) { c.header("Cache-Control", "no-store"); c.header("Referrer-Policy", "no-referrer"); c.header("X-Robots-Tag", "noindex"); } });
a2aDeskRoutes.get("/api/a2a/check", c => c.json(a2aDeskDocument(c.env.STORE_BASE_URL)));
a2aDeskRoutes.get("/a2a-desk.json", c => c.json(a2aDeskDocument(c.env.STORE_BASE_URL)));
a2aDeskRoutes.get("/a2a-desk", async c => {
  const doc = a2aDeskDocument(c.env.STORE_BASE_URL);
  const requested = c.req.query("url");
  const checked = requested ? await freeA2ACheck(c.env, requested) : null;
  if (checked) c.header("Cache-Control", "no-store");
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json({ ...doc, ...(checked ? { card_check: checked.body } : {}) });
  const reading = checked?.status === 200 ? checked.body.reading as A2AReading : null;
  const refusal = checked && !reading ? doc.errors[String(checked.body.error) as keyof typeof doc.errors] ?? "The check could not run. See the full instructions for the next step." : "";
  const resultHtml = checked ? `<section><h2>Your card check</h2>${reading ? `<p>Runtime behavior has not been tested.</p>${readingHtml(reading)}` : `<p>${escapeHtml(refusal)}</p>`}<details><summary>Card-check evidence and gaps</summary><pre>${escapeHtml(JSON.stringify(checked.body, null, 2))}</pre></details>${reading?.protocol_version === "0.3.0" ? `<p><a href="/menu/a2a_repair_kit?url=${escapeHtml(encodeURIComponent(requested!))}">Continue to the repair kit for this card</a></p>` : ""}</section>` : "";
  return c.html(renderSimplePage({ title: "A2A checks and repair kits", description: "Test your A2A agent, get reproducible failures and repair guidance, then verify the repair with a dated signed report and a week of card checks.", path: "/a2a-desk", extraCss: DESK_CSS, bodyHtml: `
    <section><p>${escapeHtml(A2A_PROPOSITION)}</p><p>${escapeHtml(A2A_FREE)}</p><p>${escapeHtml(A2A_MONEY)}</p>
    <p><strong>Scope:</strong> public A2A 0.3.0 JSON-RPC. The watch reads the card daily; runtime tests run at purchase and your recheck.</p></section>
    <section><h2>Start with a free card check</h2><form class="a2a-form" action="/a2a-desk" method="get"><label for="a2a-card-url">Your public agent-card URL</label><input id="a2a-card-url" name="url" type="url" required maxlength="2048" value="${escapeHtml(requested ?? "")}" placeholder="https://your-agent.example/.well-known/agent-card.json"><button type="submit">Check card free</button></form><details><summary>Call from an agent or script</summary><p>Send <code>POST /api/a2a/check</code> with your full card URL:</p><pre>${escapeHtml(JSON.stringify(doc.how_to_call.card_check.body, null, 2))}</pre></details><p>The response names each check, its evidence and any observation gap. <a href="/a2a-desk.json">Full instructions and error meanings</a>.</p></section>
    ${resultHtml}
    <section><h2>Authorize the runtime test</h2><p>${escapeHtml(doc.how_to_call.setup)}</p><pre>${escapeHtml(JSON.stringify(doc.how_to_call.authorization_example, null, 2))}</pre><p>Malformed requests are part of the test. Choose a task that is safe even when a broken agent executes it more than once.</p></section>
    <section><h2>Get the repair kit</h2><p><a href="/samples/a2a-repair-kit.json">See an unsigned specimen</a> before buying.</p><p>Exact bounded requests and responses, suggested fixes, a regression runner, one recheck and seven days of signed card observations. A failed test stays a failed test in the report.</p><p><a href="/menu/a2a_repair_kit">Buy The A2A Repair Kit — $${A2A_PRICE_USDC} once</a>. The item page supports browser purchase and gives your agent the same terms.</p><p>To direct your agent: read <code>/a2a-desk.json</code>, check the public card, confirm the authorization fixture, then buy <code>a2a_repair_kit</code> with the card URL.</p></section>
    <section><h2>Apply, test and recheck</h2><p>Each failure carries a suggested change and an acceptance test. <a href="/api/a2a/runner.mjs">Download the test runner</a>, save it as <code>a2a-regression.mjs</code>, and run it with Node 22 or later. It executes only when you run it.</p><pre>${escapeHtml(doc.how_to_call.regression.run)}</pre><p>${escapeHtml(doc.how_to_call.recheck)}</p><p>For implementation help, <a href="mailto:${escapeHtml(STORE_CONTACT_EMAIL)}">request a separate code-repair quote</a> with the kit ID and public repository. Hono/Workers is the initial supported stack; the kit price includes no repository changes.</p></section>
    <section><h2>What remains untested</h2><ul>${A2A_GAPS.map(g => `<li>${escapeHtml(g)}</li>`).join("")}</ul><p>${escapeHtml(doc.security.stored)}</p><p>${escapeHtml(doc.security.conflict)}</p><p>Missed watch slots are counted against us. Read the signed report with an independently obtained <a href="/.well-known/scvd-signing-key">issuer key</a>; the purchase certificate binds its evidence hash.</p></section>
    ${jsonLdScript({ "@context": "https://schema.org", "@type": "Service", name: "A2A checks and repair kits", description: A2A_PROPOSITION, url: `${c.env.STORE_BASE_URL}/a2a-desk` })}` }));
});
a2aDeskRoutes.get("/api/a2a/runner.mjs", c => c.body(runner, 200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Disposition": 'attachment; filename="a2a-regression.mjs"' }));
a2aDeskRoutes.post("/api/a2a/check", async c => {
  let url: string;
  try { const body: unknown = JSON.parse(await boundedText(new Response(c.req.raw.body), 4096)); url = target(record(body) ? body.url : null, new URL(c.env.STORE_BASE_URL).host); } catch { return c.json({ error: "target_refused", documentation: "/a2a-desk.json" }, 400); }
  const result = await freeA2ACheck(c.env, url);
  return c.json(result.body, result.status, { "Cache-Control": "no-store", ...(result.status === 429 ? { "Retry-After": "60" } : {}) });
});
a2aDeskRoutes.get("/api/a2a/kits/:kit_id", async c => {
  const id = c.req.param("kit_id");
  if (!/^a2akit_[a-f0-9-]{36}$/.test(id)) return c.json({ error: "missing" }, 404);
  const kit = await kitStore(c.env, id).read();
  if (!kit) return c.json({ error: "missing" }, 404);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json(kit);
  return c.html(renderSimplePage({ title: "Your A2A repair report", description: "Dated A2A observations, suggested repairs, the recheck and the card watch, with untested behavior and missed observations stated.", path: `/api/a2a/kits/${id}`, extraCss: DESK_CSS, bodyHtml: `
    <section><h2>Original observation</h2><p>${escapeHtml(kit.report.observation.observed_at)}</p>${readingHtml(kit.report.observation)}</section>
    <section><h2>Your included recheck</h2><p>${kit.recheck ? escapeHtml(kit.recheck.status) : "Not used. Your purchase delivery contains the private token and recheck URL."}</p>${kit.recheck?.report ? readingHtml(kit.recheck.report.observation) : ""}<p><a href="/a2a-desk">Runner and recheck instructions</a>.</p></section>
    <section><h2>Seven-day card watch</h2><p>${kit.watch.slots_recorded} recorded slots out of ${kit.watch.slots_due} due. Missed slots: ${kit.watch.slots_missed.length}. Slots without an observation: ${kit.watch.slots_without_observation.length}.</p><p>The watch reads the card only. ${kit.watch.complete ? "The included watch has ended." : `Scheduled through ${escapeHtml(kit.ends_at)}.`}</p><ul>${kit.watch.passes.map(pass => `<li>${escapeHtml(pass.report.observation.observed_at)}: ${pass.report.observation.counts.fail} failed checks; ${pass.report.observation.counts.not_observed} not observed.</li>`).join("")}</ul></section>
    <section><h2>Evidence and limits</h2><ul>${kit.report.observation.gaps.map(gap => `<li>${escapeHtml(gap)}</li>`).join("")}</ul><p>Anyone with this link can read the report. Request this URL with Accept: application/json for the signed record. The signature covers observations, not the suggested repairs.</p><details><summary>Signed records, bounded exchanges and verification instructions</summary><pre>${escapeHtml(JSON.stringify(kit, null, 2))}</pre></details></section>` }));
});
a2aDeskRoutes.post("/api/a2a/kits/:kit_id/recheck", async c => {
  if (!/^a2akit_[a-f0-9-]{36}$/.test(c.req.param("kit_id"))) return c.json({ error: "missing" }, 404);
  let token: string;
  try { const body: unknown = JSON.parse(await boundedText(new Response(c.req.raw.body), 2048)); if (!record(body) || typeof body.token !== "string" || body.token.length > 100) throw new Error(); token = body.token; } catch { return c.json({ error: "bad_request" }, 400); }
  const result = await kitStore(c.env, c.req.param("kit_id")).recheck(token);
  const status = result.status === "complete" ? 200 : result.status === "running" ? 202 : result.status === "unauthorized" ? 403 : result.status === "expired" ? 410 : result.status === "authorization_required" ? 400 : 503;
  return status >= 400
    ? c.json({ error: `A2A recheck ${result.status}. See /a2a-desk.json for the next step.`, recheck: result }, status)
    : c.json(result, status);
});
