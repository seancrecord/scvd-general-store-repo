import type { MetricEvent, MonthLedger, PorchLedger } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { isRecord } from "@/types";
import type { BazaarLedgerEntry, GazetteIssue, PayerRecord } from "@/types";

/**
 * The books: ledgers and diagnostics, read-only. Nothing on this page
 * changes anything; it's where the monthly review happens.
 */

export interface BooksPageData {
  monthLedger: MonthLedger;
  porchLedger: PorchLedger;
  payers: PayerRecord[];
  recentChallenges: MetricEvent[];
  bazaarLedger: BazaarLedgerEntry[];
  gazetteIssues: GazetteIssue[];
  loadNotes: string[];
}

function ledgerAnswersHtml(ledger: MonthLedger, payers: PayerRecord[]): string {
  const items = Object.entries(ledger.items);
  const rows =
    items.length === 0
      ? '<tr><td colspan="6">No 402s issued this month yet.</td></tr>'
      : items
          .map(([item, row]) => {
            const conversion =
              row.challenges > 0
                ? `${Math.round((row.settled / row.challenges) * 100)}%`
                : ", ";
            const tiers = Object.entries(row.tiers)
              .map(([tier, count]) => `${tier}:${count}`)
              .join(" ");
            return `<tr><td>${escapeHtml(item)}</td>
              <td>${row.challenges}${row.challengesHouse ? ` <small>(+${row.challengesHouse}h)</small>` : ""}${row.challengesInfra ? ` <small>(+${row.challengesInfra}i)</small>` : ""}</td>
              <td>${row.settled}${row.settledHouse ? ` <small>(+${row.settledHouse}h)</small>` : ""}</td>
              <td>${conversion}</td>
              <td>${row.verifies}${row.verifiesHouse ? ` <small>(+${row.verifiesHouse}h)</small>` : ""}${row.verifiesInfra ? ` <small>(+${row.verifiesInfra}i)</small>` : ""}</td>
              <td>${escapeHtml(tiers || ", ")}</td></tr>`;
          })
          .join("\n");
  const channelLine = (record: Record<string, number>): string =>
    Object.entries(record)
      .map(([channel, count]) => `${escapeHtml(channel)}: ${count}`)
      .join(" \u00B7 ") || "none yet";
  const payerLines =
    payers.length === 0
      ? "<li>No paying wallets on the books yet.</li>"
      : payers
          .slice(0, 15)
          .map(
            (payer) =>
              `<li>${escapeHtml(payer.address)}, first seen ${escapeHtml(payer.first_seen.slice(0, 10))}, ${payer.purchases} purchase${payer.purchases === 1 ? "" : "s"}</li>`,
          )
          .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>item</th><th>402s organic</th><th>settled organic</th><th>conversion</th><th>verifies</th><th>tiers</th></tr>
      ${rows}
    </table>
    <p>Organic numbers only in the main columns; house counts ride alongside as (+Nh), stored, never mixed. Conversion is organic-only.</p>
    <p>Channels, organic 402s issued: ${channelLine(ledger.channels402)} <small>(who's window-shopping)</small></p>
    <p>Channels, infrastructure 402s: ${channelLine(ledger.channels402Infra)}</p>
    <p>Channels, organic settles: ${channelLine(ledger.channels)}</p>
    <p>Channels, house settles: ${channelLine(ledger.channelsHouse)}</p>
    <p>Paying wallets (${payers.length} on file, newest first):</p>
    <ul>${payerLines}</ul>`;
}

function porchHtml(porch: PorchLedger): string {
  const surfaces = Object.entries(porch.surfaces);
  const rows =
    surfaces.length === 0
      ? '<tr><td colspan="4">Nobody on the porch yet this month.</td></tr>'
      : surfaces
          .sort((a, b) => (b[1]["organic"] ?? 0) - (a[1]["organic"] ?? 0))
          .map(([surface, buckets]) => {
            const channels = Object.entries(buckets)
              .filter(([key]) => key.startsWith("organic:"))
              .map(([key, count]) => `${escapeHtml(key.slice(8))}: ${count}`)
              .join(" \u00B7 ");
            return `<tr><td>${escapeHtml(surface)}</td>
              <td>${buckets["organic"] ?? 0}${channels ? ` <small>(${channels})</small>` : ""}</td>
              <td>${buckets["house"] ?? 0}</td>
              <td>${buckets["infrastructure"] ?? 0}</td></tr>`;
          })
          .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>surface</th><th>organic (by channel)</th><th>house</th><th>infrastructure</th></tr>
      ${rows}
    </table>
    <p><strong>Porch-to-purchase: ${porch.porchToPurchase === null ? ", " : porch.porchToPurchase}</strong>, organic 402s per organic porch visit. No cookies and no IP retention means no unique heads; this is the honest rate.</p>`;
}

function windowShoppersHtml(events: MetricEvent[]): string {
  if (events.length === 0) {
    return "<p>No 402s in the recent event rows.</p>";
  }
  const rows = events
    .map((event) => {
      const bucket = event.house
        ? "house"
        : event.channel === "infrastructure"
          ? "infra"
          : "organic";
      return `<tr><td>${escapeHtml(event.at.slice(5, 16))}</td>
        <td>${escapeHtml(event.item)}</td>
        <td>${escapeHtml(event.channel)} <small>(${bucket})</small></td>
        <td><small>${escapeHtml((event.user_agent ?? "(no user-agent)").slice(0, 60))}</small></td>
        <td><small>${escapeHtml((event.referrer ?? "none").slice(0, 40))}</small></td></tr>`;
    })
    .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>when (UTC)</th><th>item</th><th>channel</th><th>user-agent</th><th>referrer</th></tr>
      ${rows}
    </table>
    <p>Many items touched once with a generic UA = a scanner walking the catalog. One item hammered by the same UA with no settle = a budget-cap signal worth acting on.</p>`;
}

function extensionStatus(payload: unknown): string {
  if (!isRecord(payload)) {
    return JSON.stringify(payload);
  }
  const status = typeof payload["status"] === "string" ? payload["status"] : "";
  const reason =
    typeof payload["rejectedReason"] === "string"
      ? payload["rejectedReason"]
      : typeof payload["reason"] === "string"
        ? payload["reason"]
        : "";
  if (status && reason) {
    return `${status} (${reason})`;
  }
  return status || reason || JSON.stringify(payload);
}

function bazaarHtml(entries: BazaarLedgerEntry[]): string {
  if (entries.length === 0) {
    return "<p>No EXTENSION-RESPONSES headers seen from the facilitator yet.</p>";
  }
  return entries
    .map((entry) => {
      const statuses = Object.entries(entry.extensions)
        .map(
          ([key, payload]) =>
            `${escapeHtml(key)}: ${escapeHtml(extensionStatus(payload))}`,
        )
        .join("; ");
      return `<li><strong>${escapeHtml(entry.path)}</strong> [${escapeHtml(entry.operation)}], ${statuses}, ${escapeHtml(entry.observed_at)}</li>`;
    })
    .join("\n");
}

function rackHtml(issues: GazetteIssue[]): string {
  if (issues.length === 0) {
    return "<p>No issues off the press yet.</p>";
  }
  return issues
    .map(
      (issue) =>
        `<li>Issue no. ${issue.issue_number}, ${escapeHtml(issue.title)}, ${escapeHtml(issue.date)}, contributors: ${issue.contributors.length > 0 ? issue.contributors.map((contributor) => escapeHtml(contributor.name)).join(", ") : "none named"}</li>`,
    )
    .join("\n");
}

export function renderBooksPage(data: BooksPageData): string {
  const body = `
  <section>
    <h2>The ledger's answers, ${escapeHtml(data.monthLedger.month)}</h2>
    <p>402s issued vs settled per item, tier picks, channels, wallets. The ledger outranks research.</p>
    ${ledgerAnswersHtml(data.monthLedger, data.payers)}
  </section>

  <section>
    <h2>The front porch, ${escapeHtml(data.monthLedger.month)}</h2>
    <p>Free-tier visits by surface. Infrastructure is the noise floor made visible, never organic, never house.</p>
    ${porchHtml(data.porchLedger)}
  </section>

  <section>
    <details>
      <summary>Window-shoppers, up close (last ${data.recentChallenges.length} 402s)</summary>
      ${windowShoppersHtml(data.recentChallenges)}
    </details>
  </section>

  <section>
    <details>
      <summary>Bazaar ledger (extension responses) and the Gazette rack (${data.gazetteIssues.length})</summary>
      <ul>${bazaarHtml(data.bazaarLedger)}</ul>
      <ul>${rackHtml(data.gazetteIssues)}</ul>
    </details>
  </section>`;
  return renderAdminShell("books", body, data.loadNotes);
}
