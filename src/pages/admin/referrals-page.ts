import { escapeHtml } from "@/lib/sanitize";
import type { ReferralReport, ReferrerReport } from "@/lib/referrals";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * WORD OF MOUTH, measured.
 *
 * The first instrument the store has ever had for "did one agent send
 * another one here." It counts a marker carried in `?ref=` — arrivals
 * at a priced door, and the ones that went on to settle.
 *
 * IT COUNTS CLAIMS, NOT REFERRALS, and the page says so above the
 * table rather than in a footnote. The marker is typed by the arriving
 * client, so it is self-declared and unverifiable; nothing here is
 * signed and no certificate is minted from it. That was a deliberate
 * stop: the certificate CV proposed would have put the store's key on
 * a claim the buyer authored.
 *
 * A ZERO HERE IS A REAL ANSWER. It means agent-to-agent word of mouth
 * is not happening yet, which is worth knowing for free rather than
 * discovering after building an artifact around it.
 */
export function renderReferralsPage(
  report: ReferralReport,
  referrers: ReferrerReport,
): string {
  const rows = report.rows
    .map(
      (row) => `<tr>
      <td>#${row.marker}</td>
      <td>${row.arrived}</td>
      <td>${row.settled}</td>
    </tr>`,
    )
    .join("\n");

  const table =
    report.rows.length > 0
      ? `<table>
      <thead><tr><th>Marker claims patron</th><th>Arrived</th><th>Settled</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
      : `<p class="menu-desc"><strong>Nothing yet.</strong> No request has
      carried a referral marker this month. That is the honest state of
      agent-to-agent word of mouth here, and it cost nothing to learn.</p>`;

  return renderAdminShell(
    "referrals",
    `<section>
      <h2>Word of mouth — ${escapeHtml(report.month)}</h2>
      <p class="menu-desc">${escapeHtml(report.honest_limit)}</p>
      <p class="menu-meta">Arrived: ${report.total_arrived} · Settled: ${report.total_settled}</p>
      ${table}
    </section>
    <section>
      <p class="menu-meta">The gap between arrived and settled reads the
      same way the 402-to-settle gap does everywhere else: a marker that
      reached a price and stopped is a different fact from one that went
      through. Nothing on this page is published and nothing is signed.</p>
    </section>
    <section>
      <h2>Referrers by host — a DIFFERENT mechanism</h2>
      <p class="menu-desc">Everything above counts a marker somebody
      <strong>typed</strong>. Everything below counts the
      <code>Referer</code> header, which a browser sets
      <strong>by itself</strong>. Same instinct, nothing else in common —
      do not add these numbers together.</p>
      <p class="menu-desc">${escapeHtml(referrers.honest_limit)}</p>
      <p class="menu-meta">Rows scanned: ${referrers.rows_scanned} · carried a referrer: ${referrers.with_referrer}</p>
      ${
        referrers.hosts.length > 0
          ? `<table>
        <thead><tr><th>Host</th><th>Arrivals</th></tr></thead>
        <tbody>${referrers.hosts
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.host)}</td><td>${row.count}</td></tr>`,
          )
          .join("")}</tbody>
      </table>`
          : `<p class="menu-desc"><strong>Nothing yet, and that is the
      expected reading rather than a fault.</strong> Nobody has arrived
      here by clicking a link in a browser. The instrument is working; the
      clicks are not happening.</p>`
      }
    </section>`,
  );
}
