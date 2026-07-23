import { escapeHtml } from "@/lib/sanitize";
import type { MetricEvent } from "@/lib/metrics";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * The bell, ring by ring: every logged bell event from the raw
 * 90-day rows, newest first. Provenance only, no identities: channel,
 * bucket, declared source, UA, referrer. Its own page so the deep
 * row scan never weighs down the desk.
 */

export interface BellPageData {
  rings: MetricEvent[];
}

function bucket(event: MetricEvent): string {
  if (event.house) {
    return "house";
  }
  if (event.channel === "infrastructure") {
    return "infrastructure";
  }
  return "organic";
}

function ringsHtml(rings: MetricEvent[]): string {
  if (rings.length === 0) {
    return "<p>No logged rings yet. The counter predates the porch log; rings before it left no row.</p>";
  }
  const rows = rings
    .map(
      (event) => `<tr>
      <td>${escapeHtml(event.at)}</td>
      <td>${escapeHtml(bucket(event))}</td>
      <td>${escapeHtml(event.channel)}</td>
      <td>${event.declared_source ? escapeHtml(event.declared_source) : "\u2014"}</td>
      <td>${event.user_agent ? escapeHtml(event.user_agent) : "\u2014"}</td>
      <td>${event.referrer ? escapeHtml(event.referrer) : "\u2014"}</td>
    </tr>`,
    )
    .join("\n");
  return `<table>
    <tr><th>when</th><th>bucket</th><th>channel</th><th>declared source</th><th>user agent</th><th>referrer</th></tr>
    ${rows}
  </table>`;
}

export function renderBellPage(data: BellPageData): string {
  const body = `
  <section>
    <h2>The bell, ring by ring</h2>
    <p>From the raw 90-day event rows, newest first. The all-time counter
    on the storefront predates this log; early rings left no row. A
    declared source of clawhub-skill means the ring came off the skill's
    own bell line. MCP rings book here too (channel: mcp), as of the
    fix that made that door audible.</p>
    ${ringsHtml(data.rings)}
  </section>`;
  return renderAdminShell("office", body);
}
