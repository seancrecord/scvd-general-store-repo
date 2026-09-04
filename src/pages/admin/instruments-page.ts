import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { InstrumentMonth, InstrumentUsage } from "@/services/instruments";

function surfaceRows(rows: { surface: string; organic: number; infrastructure: number; by_channel: Record<string, number> }[]): string {
  return rows.map((r) => `<tr><td><code>${escapeHtml(r.surface)}</code></td><td>${r.organic}</td><td>${r.infrastructure}</td><td><small>${Object.entries(r.by_channel).map(([k, v]) => `${escapeHtml(k)} ${v}`).join(", ")}</small></td></tr>`).join("");
}

function monthHtml(m: InstrumentMonth): string {
  return `<section>
    <h3>${escapeHtml(m.month)}${m.truncated ? " <small>(ledger scan capped — floors)</small>" : ""}</h3>
    <p><strong>Free instruments: ${m.free_total} organic uses</strong> · paid tool calls: ${m.paid_tool_calls}
    <small>(${Object.entries(m.free_by_channel).map(([k, v]) => `${escapeHtml(k)} ${v}`).join(", ") || "no channel split"})</small></p>
    <table border="1" cellpadding="4">
      <tr><th>instrument</th><th>organic</th><th>infra</th><th>by channel</th></tr>
      ${surfaceRows(m.free) || "<tr><td colspan=4>none used</td></tr>"}
    </table>
    ${m.paid_tools.length > 0 ? `<p><small>Paid tools the same month:</small></p><table border="1" cellpadding="4"><tr><th>tool</th><th>organic</th><th>infra</th><th>by channel</th></tr>${surfaceRows(m.paid_tools)}</table>` : ""}
  </section>`;
}

export function renderInstrumentsPage(usage: InstrumentUsage): string {
  const body = `<section>
    <h2>Free instruments</h2>
    <p><small>What agents use this store for without paying: the preflight, the look, the conformance desk, the verify
    endpoint, the corpus reads, and the free MCP tools — off <a href="/observatory">the observatory</a>'s own counts,
    sorted into free and paid so the ratio is a line. Counts are porch floors with the porch's caveats; tools called
    with arguments are the part of the traffic crawlers cannot fake. Computed ${escapeHtml(usage.computed_at)}.</small></p>
  </section>
  ${usage.months.map(monthHtml).join("")}
  <section><p><small>Roster, by prefix: ${usage.roster.map((r) => `<code>${escapeHtml(r)}</code>`).join(" ")}.</small></p></section>`;
  return renderAdminShell("instruments", body);
}
