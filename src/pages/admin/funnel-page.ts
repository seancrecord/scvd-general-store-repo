import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { FunnelReport, ItemFunnel } from "@/services/funnel";

/**
 * THE FUNNEL PAGE — where the 703 went.
 *
 * One rule shapes everything here: the verdict is the row, the
 * numbers are the receipts. The keeper's question was never "how many
 * asks" — his ledger already says that — it is "which wall do I fix",
 * and the page answers that in words on every line, because a keeper
 * scanning at midnight fixes what the sentence tells him to fix and
 * not what a ratio implies.
 */

function reasonsHtml(reasons: Record<string, number>): string {
  const entries = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "";
  return `<details><summary>refusal reasons</summary><ul>${entries
    .map(
      ([reason, count]) =>
        `<li><code>${escapeHtml(reason)}</code> ×${count}</li>`,
    )
    .join("\n")}</ul></details>`;
}

function rowHtml(row: ItemFunnel): string {
  const tone = row.verdict.startsWith("REAL INTENT")
    ? "#8c2f1b"
    : row.verdict.startsWith("Converting")
      ? "#2f6b2f"
      : "#555";
  return `<tr>
    <td><strong>${escapeHtml(row.item)}</strong>${row.verification_tier ? " ⚑" : ""}</td>
    <td>${row.asks_organic}</td>
    <td>${row.wallets_opened}</td>
    <td>${row.settles_organic}</td>
    <td style="max-width:34em"><span style="color:${tone}">${escapeHtml(row.verdict)}</span>
    ${reasonsHtml(row.decline_reasons)}</td>
  </tr>`;
}

export function renderFunnelPage(
  report: FunnelReport,
  loadNotes: string[] = [],
): string {
  const tier = report.items.filter((row) => row.verification_tier);
  const rest = report.items.filter((row) => !row.verification_tier);
  const body = `
  <h1>The funnel — where the asks go</h1>
  <p>An <strong>ask</strong> is a 402 issued to organic traffic. A
  <strong>wallet opened</strong> is a signed payment actually presented —
  settled or refused, either way somebody tried. The gap between those
  two columns is the whole diagnosis: refused wallets mean the FLOW is
  the wall and the reasons name the brick; zero wallets against a pile
  of asks means nobody tried, and the wall is upstream — the pitch, the
  price framing, or a required input reading as work.</p>
  <p><small>${escapeHtml(report.window_note)}</small></p>

  <h2>⚑ The verification tier — the shelf the strategy rides on</h2>
  ${
    tier.length === 0
      ? "<p>No organic asks on the verification tier in the scanned window.</p>"
      : `<table border="1" cellpadding="4">
    <tr><th>item</th><th>asks</th><th>wallets opened</th><th>settles</th><th>the reading</th></tr>
    ${tier.map(rowHtml).join("\n")}
  </table>`
  }

  <h2>The rest of the shelf</h2>
  ${
    rest.length === 0
      ? "<p>Nothing else drew an organic ask in the window.</p>"
      : `<table border="1" cellpadding="4">
    <tr><th>item</th><th>asks</th><th>wallets opened</th><th>settles</th><th>the reading</th></tr>
    ${rest.map(rowHtml).join("\n")}
  </table>`
  }

  <h2>What this cannot see</h2>
  <ul>${report.what_this_cannot_see
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n")}</ul>`;
  return renderAdminShell("funnel", body, loadNotes);
}
