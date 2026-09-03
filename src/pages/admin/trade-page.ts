import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { tradeStatement } from "@/services/trade-counter";

/**
 * THE STATEMENT DESK, AS A PAGE (2026-09-03, the Sunday grind reads
 * pages). /admin/trade.json carries the same rows for a script; this
 * is the keeper's view: every account's summary first, then the
 * rows both sides, newest first, and one form per live account to
 * record a payout by hand — the only write, and a person's.
 */
export type TradeStatementForPage = Awaited<ReturnType<typeof tradeStatement>>;

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function summaryHtml(statement: TradeStatementForPage): string {
  const s = statement.summary;
  return `<table>
    <tr><th>Mode</th><td>${escapeHtml(s.mode)}</td><th>Opened</th><td>${escapeHtml(s.opened)}</td></tr>
    <tr><th>Partner share</th><td>${s.partner_share_bps / 100}%</td><th>Daily cap</th><td>${s.daily_cap}</td></tr>
    <tr><th>Delivered, live</th><td>${s.delivered_live}</td><th>Delivered, test</th><td>${s.delivered_test}</td></tr>
    <tr><th>Billed</th><td>${usd(s.billed_usd)}</td><th>Net owed</th><td>${usd(s.net_usd)}</td></tr>
    <tr><th>Paid in</th><td>${usd(s.paid_usd)}</td><th><strong>Outstanding</strong></th><td><strong>${usd(s.outstanding_usd)}</strong> of a ${usd(s.credit_ceiling_usd)} ceiling</td></tr>
    <tr><th>Last delivery</th><td>${escapeHtml(s.last_delivery_at ?? "—")}</td><th>Oldest unpaid</th><td>${escapeHtml(s.oldest_unpaid_at ?? "—")}</td></tr>
  </table>
  ${s.truncated ? `<p><strong>Truncated read:</strong> every figure above is a floor, not a total (rule 52).</p>` : ""}`;
}

function deliveriesHtml(statement: TradeStatementForPage): string {
  if (statement.deliveries.length === 0) {
    return "<p>No deliveries on this account yet.</p>";
  }
  const rows = statement.deliveries
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.delivered_at)}</td>
      <td>${escapeHtml(row.mode)}</td>
      <td>${escapeHtml(row.item)}</td>
      <td><a href="/api/verify/${escapeHtml(row.cert_id)}">${escapeHtml(row.cert_id)}</a></td>
      <td>${usd(row.trade_price_usd)}</td>
      <td>${usd(row.net_usd)}</td>
      <td>${row.order_ref ? escapeHtml(row.order_ref) : "—"}</td>
      <td><code>${escapeHtml(row.instruction_digest.slice(0, 12))}…</code></td>
    </tr>`,
    )
    .join("");
  return `<table>
    <thead><tr><th>Delivered</th><th>Mode</th><th>Item</th><th>Certificate</th><th>Trade price</th><th>Net</th><th>order_ref</th><th>Instruction</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${statement.deliveries_truncated ? "<p><strong>Truncated:</strong> older rows not shown.</p>" : ""}`;
}

function payoutsHtml(statement: TradeStatementForPage): string {
  if (statement.payouts.length === 0) {
    return "<p>No payouts recorded.</p>";
  }
  const rows = statement.payouts
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.recorded_at)}</td>
      <td>${usd(row.amount_usd)}</td>
      <td>${escapeHtml(row.reference)}</td>
      <td><code>${escapeHtml(row.payout_id)}</code></td>
    </tr>`,
    )
    .join("");
  return `<table>
    <thead><tr><th>Recorded</th><th>Amount</th><th>Reference</th><th>Id</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${statement.payouts_truncated ? "<p><strong>Truncated:</strong> older rows not shown.</p>" : ""}`;
}

function payoutForm(account: string): string {
  return `<form method="post" action="/admin/trade/${escapeHtml(account)}/payout">
    <label>Amount (USD) <input name="amount_usd" type="number" step="0.01" min="0.01" required></label>
    <label>Reference (their statement id, a payment hash, a bank line) <input name="reference" type="text" maxlength="200" required></label>
    <button type="submit">Record payout</button>
  </form>`;
}

export function renderTradePage(statements: TradeStatementForPage[]): string {
  const sections = statements
    .map(
      (statement) => `<section>
    <h2>${escapeHtml(statement.summary.name)} <code>${escapeHtml(statement.summary.account)}</code></h2>
    ${summaryHtml(statement)}
    <h3>Deliveries</h3>
    ${deliveriesHtml(statement)}
    <h3>Payouts</h3>
    ${payoutsHtml(statement)}
    ${statement.summary.mode === "live" ? payoutForm(statement.summary.account) : "<p>A test account books nothing; there is nothing to pay.</p>"}
  </section>`,
    )
    .join("\n");
  const body = `
  <section>
    <h2>The trade counter, account by account</h2>
    <p>Every account's statement, both sides, newest first — the same
    rows <a href="/admin/trade.json">/admin/trade.json</a> serves a
    script and the public ledger sums at
    <a href="/api/trade/ledger">/api/trade/ledger</a>. Reconcile against
    the partner's own statement; record each payout here, by hand.
    Outstanding is net owed less payouts; the ceiling is the row's
    credit limit. The Sunday press pages you when a live account's
    oldest unpaid delivery stands past the statement window.</p>
  </section>
  ${sections}`;
  return renderAdminShell("trade", body);
}
