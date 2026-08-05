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
  /** The settlement tx parsed from the detail, for the inline resolve. */
  tx?: string;
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
      const last = chain.solanaLastResult;
      // The WHY lives in the last-result record — showing it only on
      // success was exactly inverted (the keeper asked "why" and the
      // page was sitting on the answer).
      const why = last
        ? last.ran
          ? `The last attempt DID complete (${last.transfers_seen ?? 0} transfers seen, at ${escapeHtml(last.at)}) but no clean-pass stamp landed — that combination is a bug worth reporting.`
          : `Last attempt at ${escapeHtml(last.at)}: <strong>${escapeHtml(last.reason ?? "no reason recorded")}</strong>. A failed pass retries next hour and never advances the cursor; nothing is lost, but the cap stays on until one completes.`
        : `No attempt has recorded a result yet — if the hourly cron is running, the next result lands within the hour.`;
      return `<p>${ATTENTION} — no clean Solana pass recorded yet. Until one lands, the unreconciled cap stays conservative by design. ${why}</p>`;
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

function deliveriesHtml(
  audit: (DeliveryAudit & { house_payers?: Record<string, boolean> }) | null,
): string {
  if (!audit) return `<p>${ATTENTION} — the delivery audit didn't load. Reload to retry.</p>`;
  if (audit.undelivered.length === 0) {
    return `<p>${PASS} — every settle either delivered its goods or is in flight
      (${audit.in_flight} in flight, ${audit.checked} checked${audit.truncated ? "; scan capped, count is a floor" : ""}).</p>`;
  }
  const rows = audit.undelivered
    .map((sale) => {
      const house = sale.payer
        ? (audit.house_payers?.[sale.payer] ?? false)
        : false;
      return `<li>${escapeHtml(sale.path)} — $${sale.paid_usdc} settled ${escapeHtml(sale.settled_at)}${sale.transaction ? `, tx ${escapeHtml(sale.transaction)}` : ""}${
        house
          ? ` <strong>[HOUSE WALLET]</strong> — the store's own money bought this and the artifact never minted; nobody outside is owed anything. "House money, absorbed" closes it honestly.`
          : sale.payer
            ? ` — paid by ${escapeHtml(sale.payer)}, a real buyer: fulfill or refund, never absorb.`
            : ""
      }
      <form method="POST" action="/admin/delivery/resolve" style="margin:0.3em 0">
        <input type="hidden" name="transaction" value="${escapeHtml(sale.transaction ?? "")}">
        <select name="outcome" required>
          ${house ? `<option value="house_absorbed">house money, absorbed</option>` : ""}
          <option value="fulfilled_by_hand">fulfilled by hand</option>
          <option value="refunded">refunded</option>
          ${house ? "" : `<option value="house_absorbed">house money, absorbed</option>`}
        </select>
        <button type="submit">Resolve this one</button>
      </form></li>`;
    })
    .join("\n");
  return `<p>${ATTENTION} — ${audit.undelivered.length} settle${audit.undelivered.length === 1 ? "" : "s"} took money without recorded goods.
    <small>What this means mechanically: the settle succeeded and then the
    fulfillment step — the certificate, the recorded goods — never wrote,
    so the buyer paid and holds nothing. For an instant item that is a
    half-finished purchase, not a missing shipment. Resolve inline below;
    the record keeps the original intent inside it.</small></p>
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
        }<strong>${escapeHtml(alert.condition)}</strong> at ${escapeHtml(alert.at)}: ${escapeHtml(alert.detail)}${
          alert.now === "still open" && alert.tx
            ? `<form method="POST" action="/admin/delivery/resolve" style="margin:0.3em 0">
                <input type="hidden" name="transaction" value="${escapeHtml(alert.tx)}">
                <select name="outcome" required>
                  <option value="house_absorbed">house money, absorbed</option>
                  <option value="fulfilled_by_hand">fulfilled by hand</option>
                  <option value="refunded">refunded</option>
                </select>
                <button type="submit">Resolve this one</button>
              </form>`
            : ""
        }</li>`,
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
