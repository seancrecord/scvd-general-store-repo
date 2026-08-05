import type { SettleReconciliation } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { DeliveryAudit } from "@/services/delivery-audit";

/** Matches listAlerts' inline row shape. */
interface AlertLogEntry {
  condition: string;
  detail: string;
  at: string;
  /**
   * For undelivered_sale entries only: what the intent looks like
   * NOW. The keeper read three old alerts as three live problems —
   * the trail must say when history has since been handled.
   */
  now?: "still open" | "resolved by hand" | "closed (delivered)";
}

/**
 * THE BOOKS CHECK: every way the store audits its own money, on one
 * page, each one a verdict first and numbers second. The keeper
 * asked for exactly this — one place to look instead of a verdict
 * scattered across the desk, the recount, the ward, and a JSON
 * route. The rule of the page: green says PASS and why it can, red
 * says what to chase, and nothing renders a number without saying
 * what would be wrong if it were different.
 */

export interface ReconciliationPageData {
  settles: SettleReconciliation | null;
  chain: {
    baseCursor: string | null;
    solanaLastOk: string | null;
    solanaLastResult: {
      ran: boolean;
      reason?: string;
      transfers_seen?: number;
      at: string;
    } | null;
  };
  deliveries: DeliveryAudit | null;
  alerts: AlertLogEntry[];
  loadNotes: string[];
}

const PASS = `<strong style="color:#2f6b2f">PASS</strong>`;
const ATTENTION = `<strong style="color:#8c2f1b">ATTENTION</strong>`;

function settlesHtml(r: SettleReconciliation | null): string {
  if (!r) return `<p>${ATTENTION} — the recount didn't load. Reload to retry.</p>`;
  const verdict =
    r.unexplained === 0
      ? `<p>${PASS} — every settle the counters know is on a payer row, the founding settle, or a settle that arrived without a wallet address.</p>`
      : r.unexplained > 0
        ? `<p>${ATTENTION} — ${r.unexplained} settle${r.unexplained === 1 ? "" : "s"} moved a counter without writing a payer row. This is the one to chase.</p>`
        : `<p>${ATTENTION} — ${-r.unexplained} more purchase${r.unexplained === -1 ? "" : "s"} on the payer rows than the counters admit.</p>`;
  return `${verdict}
    <details><summary>The arithmetic</summary>
    <table border="1" cellpadding="4">
      <tr><td>settles on the counters</td><td>${r.counter_settles}</td></tr>
      <tr><td>purchases on the payer rows</td><td>${r.payer_purchases}</td></tr>
      <tr><td>the founding settle (predates the instrument)</td><td>${r.founding}</td></tr>
      <tr><td>settles with no payer address returned</td><td>${r.unattributed}</td></tr>
      <tr><td><strong>unexplained</strong></td><td><strong>${r.unexplained}</strong></td></tr>
    </table>
    <p><small>All-time on both sides: payer rows carry no month, so a
    month-window compare would manufacture a discrepancy every time the
    calendar turned. Row-level detail lives at <a href="/admin/recount">the recount</a>.</small></p>
    </details>`;
}

/** A pass is stale after this long: both rails audit hourly. */
const CHAIN_STALE_MS = 3 * 60 * 60 * 1000;

function chainHtml(chain: ReconciliationPageData["chain"], now: Date): string {
  const solana = (() => {
    if (!chain.solanaLastOk) {
      return `<p>${ATTENTION} — no clean Solana pass recorded yet. Until one lands, the unreconciled cap stays conservative by design.</p>`;
    }
    const age = now.getTime() - new Date(chain.solanaLastOk).getTime();
    const stale = !Number.isFinite(age) || age > CHAIN_STALE_MS;
    const last = chain.solanaLastResult;
    return `<p>${stale ? ATTENTION : PASS} — last clean Solana pass ${escapeHtml(chain.solanaLastOk)}${stale ? " (stale: the hourly audit has missed its window)" : ""}.
      ${last ? `Last run: ${last.ran ? `${last.transfers_seen ?? 0} transfer${(last.transfers_seen ?? 0) === 1 ? "" : "s"} seen` : `did not run (${escapeHtml(last.reason ?? "no reason recorded")})`} at ${escapeHtml(last.at)}.` : ""}</p>`;
  })();
  const base = chain.baseCursor
    ? `<p>${PASS} — Base cursor at block ${escapeHtml(chain.baseCursor)}; it only advances on a clean pass, so an advancing cursor IS the verdict. Anything found on-chain that the books can't explain pages the keeper instead of waiting here.</p>`
    : `<p>${ATTENTION} — no clean Base pass recorded yet.</p>`;
  return `${base}${solana}`;
}

function deliveriesHtml(audit: DeliveryAudit | null): string {
  if (!audit) return `<p>${ATTENTION} — the delivery audit didn't load. Reload to retry.</p>`;
  if (audit.undelivered.length === 0) {
    return `<p>${PASS} — every settle either delivered its goods or is in flight
      (${audit.in_flight} in flight, ${audit.checked} checked${audit.truncated ? "; scan capped, count is a floor" : ""}).</p>`;
  }
  const rows = audit.undelivered
    .map(
      (sale) =>
        `<li>${escapeHtml(sale.path)} — $${sale.paid_usdc} settled ${escapeHtml(sale.settled_at)}${sale.transaction ? `, tx ${escapeHtml(sale.transaction)}` : ""}</li>`,
    )
    .join("\n");
  return `<p>${ATTENTION} — ${audit.undelivered.length} settle${audit.undelivered.length === 1 ? "" : "s"} took money without recorded goods. Resolve each by hand: fulfill it, refund it, or absorb it — the resolve door is on <a href="/admin/tools">the back shelf</a>.</p>
    <ul>${rows}</ul>`;
}

function alertsHtml(alerts: AlertLogEntry[]): string {
  if (alerts.length === 0) {
    return `<p>${PASS} — the alarm log is quiet (30-day window).</p>`;
  }
  const rows = alerts
    .map(
      (alert) =>
        `<li>${
          alert.now
            ? alert.now === "still open"
              ? `<strong style="color:#8c2f1b">[STILL OPEN]</strong> `
              : `<strong style="color:#2f6b2f">[${escapeHtml(alert.now).toUpperCase()}]</strong> `
            : ""
        }<strong>${escapeHtml(alert.condition)}</strong> at ${escapeHtml(alert.at)}: ${escapeHtml(alert.detail)}</li>`,
    )
    .join("\n");
  return `<p>Recent alarms — each paged the keeper when it fired. This is the
    trail, not the pager: an entry marked resolved or delivered is HISTORY,
    already handled, kept so the record shows it happened. Only [STILL OPEN]
    needs a hand.</p><ul>${rows}</ul>`;
}

export function renderReconciliationPage(
  data: ReconciliationPageData,
  now: Date,
): string {
  const body = `
  <section>
    <p>Every way this store audits its own money, one page, verdicts
    first. A quiet page and a quiet phone mean the same thing here.</p>
  </section>

  <section>
    <h2>Settle counters vs payer rows</h2>
    ${settlesHtml(data.settles)}
  </section>

  <section>
    <h2>The chain vs the books</h2>
    <p><small>Both rails audited hourly against the receive wallets.
    Money on-chain the books can't explain — either direction — pages
    the keeper the hour it's found.</small></p>
    ${chainHtml(data.chain, now)}
  </section>

  <section>
    <h2>Money in vs goods out</h2>
    ${deliveriesHtml(data.deliveries)}
  </section>

  <section>
    <h2>The alarm trail</h2>
    ${alertsHtml(data.alerts)}
  </section>

  <section>
    <p><small>Deeper readings, kept off the main shelf: <a href="/admin/recount">the recount</a>
    (row-level settle audit) · <a href="/admin/census">the census</a> ·
    <a href="/admin/bell">the bell</a> · <a href="/admin/ward">the ward</a>
    (link health and outside witnesses).</small></p>
  </section>`;
  return renderAdminShell("reconciliation", body, data.loadNotes);
}
