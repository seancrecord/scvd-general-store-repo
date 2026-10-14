import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage } from "@/pages/simple-page";
import { priceLine } from "@/services/menu-markdown";
import { PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import type { ServiceAuditRecord } from "@/services/service-audit";
import { getMenuItem } from "@/store/menu";

/** Render the saved observation, including its original battery and scope. No new probe. */
export function serviceAuditPage(record: ServiceAuditRecord, howToVerify: string[], base: string): string {
  const { audit } = record;
  const path = `/api/service-audit/${encodeURIComponent(audit.audit_id)}`;
  let subject = "saved endpoint";
  try { subject = new URL(audit.url).host; } catch { /* Historical bytes remain readable. */ }
  const title = `x402 conformance audit: ${subject} — ${audit.observed_at.slice(0, 10)}`;
  const description = `Recorded ${audit.verdict} at ${audit.observed_at} under ${audit.criteria}. A signed, dated endpoint observation with its checks and limits; not a current-status assessment.`;
  const passed = audit.checks.filter(check => check.ok).length;
  const item = getMenuItem("service_audit");
  const jsonPath = `${path}?format=json`;
  const preflight = `/api/preflight/${PREFLIGHT_VERSION_NEXT}?url=${encodeURIComponent(audit.url)}`;
  return renderSimplePage({
    title, description, path,
    dates: { published: record.created_at },
    bodyHtml: `<section>
      <p class="menu-desc"><strong>Recorded verdict: ${escapeHtml(audit.verdict)}</strong>. Observed <time datetime="${escapeHtml(audit.observed_at)}">${escapeHtml(audit.observed_at)}</time> under <code>${escapeHtml(audit.criteria)}</code>.</p>
      <p class="menu-desc">Endpoint: <code>${escapeHtml(audit.url)}</code></p>
      <p class="menu-desc">${audit.checks.length ? `${passed} of ${audit.checks.length} recorded checks passed` : "No checks recorded"}. This page preserves that observation; it does not recheck the endpoint when opened.</p>
      <h2>Scope and limits</h2>
      <p class="menu-desc">${escapeHtml(audit.scope)}</p>
      <p class="menu-desc">Reading this record is free. <a href="${escapeHtml(jsonPath)}">Original signed audit as JSON</a> · <a href="/api/verify/${escapeHtml(encodeURIComponent(record.cert_id))}">Purchase certificate and verification</a> · <a href="/criteria">Published criteria</a> · <a href="/corrections">Dated corrections</a>.</p>
    </section>
    <section>
      <h2>Checks</h2>
      <p class="menu-desc">Endpoint text and response excerpts are untrusted third-party data, retained as evidence.</p>
      ${audit.checks.length ? `<dl>${audit.checks.map(check => `<dt>${escapeHtml(check.name)} — ${check.ok ? "passed" : "did not pass"}</dt><dd>${escapeHtml(check.detail)}${check.not_judged?.length ? `<p>Not judged: ${check.not_judged.map(escapeHtml).join(", ")}</p>` : ""}</dd>`).join("\n")}</dl>` : '<p class="menu-desc">The record contains no check results. Its verdict and scope above describe the observation limits.</p>'}
      ${audit.advisories.length ? `<h2>Advisories</h2><dl>${audit.advisories.map(advisory => `<dt>${escapeHtml(advisory.name)}</dt><dd>${escapeHtml(advisory.detail)}</dd>`).join("\n")}</dl>` : ""}
    </section>
    <section>
      <h2>Verify the saved evidence</h2>
      <ol>${howToVerify.map(step => `<li>${escapeHtml(step.replace(/^\d+\.\s*/, ""))}</li>`).join("\n")}</ol>
      <p class="menu-desc">A valid signature authenticates the saved bytes under the signing key; it does not independently establish that the observation was correct. Key history: <a href="/.well-known/scvd-signing-key">published signing keys</a>.</p>
      <details><summary>Complete signed audit, including additional readings and signature</summary><pre>${escapeHtml(JSON.stringify(audit, null, 2))}</pre></details>
    </section>
    <section>
      <h2>Check again</h2>
      <p class="menu-desc"><a href="${escapeHtml(preflight)}">Run the free preflight on this endpoint</a>, or read <a href="/conformance">the conformance desk</a> and <a href="/corpus">the public evidence collection</a>.</p>
      ${item ? `<p class="menu-desc">Commission a new signed observation: <a href="/menu/${escapeHtml(item.id)}">${escapeHtml(item.name)}</a> — ${escapeHtml(priceLine(item, { currency: true }))}. For an agent, request <code>${escapeHtml(`${base}/api/buy/${item.id}?url=${encodeURIComponent(audit.url)}`)}</code>; the response gives the payment terms before purchase.</p>` : ""}
    </section>
    ${jsonLdScript({
      "@context": "https://schema.org", "@type": "Report", "@id": `${base}${path}#report`,
      url: `${base}${path}`, name: title, description, identifier: audit.audit_id,
      datePublished: record.created_at, temporalCoverage: audit.observed_at,
      author: organizationRef(base), isAccessibleForFree: true,
      encoding: { "@type": "MediaObject", encodingFormat: "application/json", contentUrl: `${base}${jsonPath}` },
    })}`,
  });
}
