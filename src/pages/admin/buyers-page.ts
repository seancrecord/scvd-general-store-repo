import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { Buyer, BuyersReport, TurnedAway } from "@/services/buyers";

function short(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-4)}` : address;
}

function buyerRow(b: Buyer): string {
  const items = b.purchases.map((p) => `${escapeHtml(p.item)} <small>${escapeHtml(p.date.slice(0, 10))}</small>`).join(" → ");
  const row = b.payer_row_purchases === undefined
    ? ""
    : ` <strong title="the payer row disagrees with the certificates">row says ${b.payer_row_purchases}</strong>`;
  return `<tr>
    <td><code title="${escapeHtml(b.address)}">${escapeHtml(short(b.address))}</code></td>
    <td>${b.purchases.length}${row}</td>
    <td>$${b.paid_usdc.toFixed(3)}</td>
    <td>${b.followed_handoff ? "yes" : ""}</td>
    <td>${items}</td>
  </tr>`;
}

function turnedAwayRow(t: TurnedAway): string {
  const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ");
  return `<tr><td><code>${escapeHtml(t.user_agent)}</code></td><td>${t.declines}</td><td>${top(t.items)}</td><td>${top(t.reasons)}</td><td>${escapeHtml(t.last.slice(0, 16))}</td></tr>`;
}

export function renderBuyersPage(report: BuyersReport): string {
  const s = report.summary;
  const items = Object.entries(report.items_bought).sort((a, b) => b[1] - a[1]);
  const body = `<section>
    <h2>The buyers</h2>
    <p><small>Every certificate that carries a paying wallet, grouped by wallet, all-time and house excluded.
    The census reads eight hours; this reads the shelf. Read ${report.certificates_scanned} certificates${report.certificates_truncated ? " (scan hit its cap — older ones exist)" : ""},
    ${report.certificates_without_payer} from before payer recording, ${report.house_purchases_excluded} of the house's own.</small></p>
    <table border="1" cellpadding="4">
      <tr><td>distinct buyers</td><td>${s.distinct_buyers}</td></tr>
      <tr><td>…who bought more than once</td><td>${s.repeat_buyers}</td></tr>
      <tr><td>…who followed the handoff (bought, then attested that purchase)</td><td>${s.followed_handoff}</td></tr>
      <tr><td>purchases on certificates</td><td>${s.purchases}</td></tr>
      <tr><td>wallets whose payer row disagrees with their certificates</td><td>${s.rows_disagreeing}</td></tr>
    </table>
  </section>
  <section>
    <h2>What they bought</h2>
    <p>${items.length === 0 ? "Nothing yet." : items.map(([item, n]) => `${escapeHtml(item)} ×${n}`).join(" · ")}</p>
  </section>
  <section>
    <h2>Each wallet</h2>
    ${report.buyers.length === 0 ? "<p>No outside wallet holds a certificate yet.</p>" : `<table border="1" cellpadding="4">
      <tr><th>wallet</th><th>purchases</th><th>paid</th><th>handoff</th><th>in order</th></tr>
      ${report.buyers.map(buyerRow).join("")}
    </table>`}
    <p><small>"row says N" beside a count is the payer row on the counters disagreeing with the certificates on the shelf —
    the row-level detail the books check cannot give, by address. A row of 0 means the wallet has certificates and no row at all.</small></p>
  </section>
  <section>
    <h2>Presented, and turned away</h2>
    <p><small>From <a href="/admin/declines">the decline desk</a>: outside clients that opened a wallet and were refused.
    These rows carry a client string and no address, and age out at ninety days; ${report.declines_scanned} rows read${report.declines_capped ? ", scan capped" : ""}.</small></p>
    ${report.turned_away.length === 0 ? "<p>Nobody in the window.</p>" : `<table border="1" cellpadding="4">
      <tr><th>client</th><th>declines</th><th>at</th><th>reasons</th><th>last</th></tr>
      ${report.turned_away.map(turnedAwayRow).join("")}
    </table>`}
  </section>`;
  return renderAdminShell("buyers", body);
}
