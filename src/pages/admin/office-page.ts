import type { MetricEvent, MonthLedger, PorchLedger } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { isRecord } from "@/types";
import type { BazaarLedgerEntry, GazetteIssue, PayerRecord } from "@/types";

/**
 * The desk: analytics front and center, because that's what the
 * keeper opens the office for. Month at a glance, the trend, sources
 * differentiated and interpreted, then the item ledger; diagnostics
 * fold away below. Work waiting shows as one strip up top with a
 * door to the counter.
 */

export interface OfficePageData {
  monthLedger: MonthLedger;
  porchLedger: PorchLedger;
  payers: PayerRecord[];
  recentChallenges: MetricEvent[];
  bazaarLedger: BazaarLedgerEntry[];
  gazetteIssues: GazetteIssue[];
  /** Pending work counts for the strip. */
  work: { orders: number; letters: number; reviews: number; alerts: number };
  loadNotes: string[];
}

/** Plain-English channel legend, for planning, not decoration. */
const CHANNEL_MEANING: Record<string, string> = {
  direct: "came straight to a URL, no referrer: bookminded agents, scripts, or anyone who already knew the address",
  skill: "arrived through the ClawHub skill (?src=clawhub-skill): the skill listing is working",
  mcp: "tool-calling agents through the /mcp door: definitive, not inferred",
  bazaar: "referred by the x402 Bazaar / x402scan catalog: discovery is working",
  unknown: "no user-agent and no referrer: bare fetches, hard to plan around",
  infrastructure: "known crawlers and scanners: the noise floor, never counted as customers",
};

/** The funnel: porch visits -> 402s -> settles, per channel, organic only. */
function sourcesHtml(ledger: MonthLedger, porch: PorchLedger): string {
  const porchByChannel: Record<string, number> = {};
  for (const buckets of Object.values(porch.surfaces)) {
    for (const [key, count] of Object.entries(buckets)) {
      if (key.startsWith("organic:")) {
        const channel = key.slice(8);
        porchByChannel[channel] = (porchByChannel[channel] ?? 0) + count;
      }
    }
  }
  const channels = [
    ...new Set([
      ...Object.keys(porchByChannel),
      ...Object.keys(ledger.channels402),
      ...Object.keys(ledger.channels),
    ]),
  ].filter((channel) => channel !== "infrastructure");
  const rows =
    channels.length === 0
      ? '<tr><td colspan="5">No organic traffic on the books yet this month.</td></tr>'
      : channels
          .map((channel) => {
            const visits = porchByChannel[channel] ?? 0;
            const challenges = ledger.channels402[channel] ?? 0;
            const settles = ledger.channels[channel] ?? 0;
            const conversion =
              challenges > 0
                ? `${Math.round((settles / challenges) * 100)}%`
                : "n/a";
            return `<tr><td><strong>${escapeHtml(channel)}</strong></td>
              <td>${visits}</td><td>${challenges}</td><td>${settles}</td><td>${conversion}</td></tr>`;
          })
          .join("\n");
  const venueLines = Object.entries(ledger.venues)
    .map(([venue, count]) => `${escapeHtml(venue)}: ${count}`)
    .join(" \u00B7 ");
  const legend = channels
    .concat(["infrastructure"])
    .filter((channel) => CHANNEL_MEANING[channel])
    .map(
      (channel) =>
        `<li><strong>${escapeHtml(channel)}</strong>: ${escapeHtml(CHANNEL_MEANING[channel] ?? "")}</li>`,
    )
    .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>source</th><th>porch visits</th><th>402s</th><th>settles</th><th>conversion</th></tr>
      ${rows}
    </table>
    <p>Organic only; infrastructure and house are kept out of every column. Read it left to right: who shows up, who reaches a shelf, who pays.</p>
    <p><small>Off the books but on file: house settles ${Object.entries(ledger.channelsHouse).map(([channel, count]) => `${escapeHtml(channel)}: ${count}`).join(" \u00B7 ") || "none"} \u00B7 infrastructure 402s ${Object.entries(ledger.channels402Infra).map(([channel, count]) => `${escapeHtml(channel)}: ${count}`).join(" \u00B7 ") || "none"}</small></p>
    <p><strong>Venue markers (?src=)</strong>: ${venueLines || "none yet; they appear when papers get handed out with per-venue markers"}</p>
    <details><summary>What each source means</summary><ul>${legend}</ul></details>`;
}

/** Last 14 days with any traffic: 402s vs settles, organic. */
function trendHtml(ledger: MonthLedger): string {
  const days = Object.entries(ledger.days).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  if (days.length === 0) {
    return "<p>No day-level rows yet; the trend starts counting from this deploy.</p>";
  }
  const rows = days
    .slice(0, 14)
    .map(
      ([day, counts]) =>
        `<tr><td>${escapeHtml(ledger.month)}-${escapeHtml(day)}</td><td>${counts.challenges}</td><td>${counts.settles}</td><td>${"\u25A0".repeat(Math.min(counts.settles, 40)) || ""}</td></tr>`,
    )
    .join("\n");
  return `
    <table border="1" cellpadding="4">
      <tr><th>day</th><th>organic 402s</th><th>organic settles</th><th></th></tr>
      ${rows}
    </table>`;
}

function glanceHtml(data: OfficePageData): string {
  const ledger = data.monthLedger;
  const organicSettles = Object.values(ledger.items).reduce(
    (sum, row) => sum + row.settled,
    0,
  );
  const organic402s = Object.values(ledger.items).reduce(
    (sum, row) => sum + row.challenges,
    0,
  );
  return `
    <p style="font-size:1.15em">
      <strong>$${ledger.revenueUsdc.toFixed(2)}</strong> organic revenue
      <small>(+$${ledger.revenueHouseUsdc.toFixed(2)} house)</small> \u00B7
      <strong>${organicSettles}</strong> organic settle${organicSettles === 1 ? "" : "s"} \u00B7
      <strong>${organic402s}</strong> organic 402s \u00B7
      <strong>${data.payers.length}</strong> paying wallet${data.payers.length === 1 ? "" : "s"} \u00B7
      <strong>${data.porchLedger.organicVisits}</strong> organic porch visits
      ${data.porchLedger.porchToPurchase !== null ? `\u00B7 porch-to-purchase <strong>${data.porchLedger.porchToPurchase}</strong>` : ""}
    </p>
    <p><small>Revenue counts from this deploy forward (the founding fifty cents predates the meter). House money is real money; it just doesn't count as proof.</small></p>`;
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
    <p>Organic numbers only in the main columns; house counts ride alongside as (+Nh), stored, never mixed. Conversion is organic-only. Channel-level funnel lives in Sources above.</p>
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

export function renderOfficePage(data: OfficePageData): string {
  const work = data.work;
  const workTotal = work.orders + work.letters + work.reviews;
  const workStrip =
    workTotal + work.alerts === 0
      ? `<p>Nothing waiting at <a href="/admin/counter">the counter</a>. The alarms are quiet.</p>`
      : `<p><strong>Waiting at <a href="/admin/counter">the counter</a>:</strong>
         ${work.orders} open order${work.orders === 1 ? "" : "s"} \u00B7
         ${work.letters} letter${work.letters === 1 ? "" : "s"} \u00B7
         ${work.reviews} review${work.reviews === 1 ? "" : "s"} (tips/confessions/refunds)
         ${work.alerts > 0 ? `\u00B7 <strong style="color:#8c2f1b">${work.alerts} alarm${work.alerts === 1 ? "" : "s"}</strong>` : ""}</p>`;
  const body = `
  <section>
    <h2>The month so far, ${escapeHtml(data.monthLedger.month)}</h2>
    ${glanceHtml(data)}
    ${workStrip}
  </section>

  <section>
    <h2>Sources, differentiated</h2>
    ${sourcesHtml(data.monthLedger, data.porchLedger)}
  </section>

  <section>
    <h2>The trend</h2>
    ${trendHtml(data.monthLedger)}
  </section>

  <section>
    <h2>The ledger's answers, per item</h2>
    <p>402s issued vs settled per item, tier picks, wallets. The ledger outranks research.</p>
    ${ledgerAnswersHtml(data.monthLedger, data.payers)}
  </section>

  <section>
    <details>
      <summary>The front porch, by surface</summary>
      <p>Free-tier visits by surface. Infrastructure is the noise floor made visible, never organic, never house.
      This table counts from its own deploy; <a href="/admin/bell">the bell, ring by ring</a> reads the raw rows and remembers further back.</p>
      ${porchHtml(data.porchLedger)}
    </details>
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
  return renderAdminShell("office", body, data.loadNotes);
}
