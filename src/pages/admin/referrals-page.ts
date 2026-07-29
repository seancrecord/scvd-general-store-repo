import { escapeHtml } from "@/lib/sanitize";
import type { ReferralReport } from "@/lib/referrals";
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
export function renderReferralsPage(report: ReferralReport): string {
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
    </section>`,
  );
}
