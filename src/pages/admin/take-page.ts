import type { PaymentOperations } from "@/lib/payment-operations";
import { paymentRollupHtml } from "@/pages/payment-rollup";
import { formatUnits } from "viem";
import { escapeHtml } from "@/lib/sanitize";
import type { StoreStats } from "@/services/stats";
import { renderAdminShell } from "@/pages/admin/layout";
import { takeSectionHtml } from "@/pages/admin/office-page";
import type { TakeSummary } from "@/services/books-summary";
import type { TillItemCount } from "@/services/stats";

/**
 * THE MONEY PAGE. Every figure here used to render on the desk, and
 * the three walks behind them gated the desk's first paint —
 * computeStats over every month, takeSummary over every certificate.
 * Nothing about the numbers changed on the way over; the reader now
 * asks for them instead of paying for them en route to something else.
 */
export interface TakePageData {
  operations?: PaymentOperations | null;
  stats?: StoreStats | null;
  take: TakeSummary | null;
  allTime: { organic: number; house: number } | null;
  /** The till's per-item counters, for the no-certificate table. */
  till: Record<string, TillItemCount> | null;
  loadNotes: string[];
}

export function renderTakePage(data: TakePageData): string {
  const body = `
  <p><a href="/admin/purchases">Inspect a purchase by its purchase ID</a></p>
  ${data.stats?.payments ? paymentRollupHtml(data.stats.payments, data.stats.payment_sources) : ""}
  ${(data.stats?.payment_sources ?? []).filter(source => source.amounts).map(source => {
    const amounts = source.amounts!;
    return `<section><h2>${escapeHtml(source.protocol)} settlement amounts</h2><p>${escapeHtml(source.currency)} on ${escapeHtml(amounts.network)};
      asset ${escapeHtml(amounts.asset)}. Organic: ${formatUnits(BigInt(amounts.organic_atomic), amounts.decimals)}.
      House: ${formatUnits(BigInt(amounts.house_atomic), amounts.decimals)}.</p>
      ${source.house_correction ? `<p>House corrections included: ${source.house_correction.purchases} purchases, ${formatUnits(BigInt(source.house_correction.amount_atomic), amounts.decimals)} ${escapeHtml(source.currency)} moved from organic to house. Original sale records are preserved.</p>` : ""}
      <p>Confirmed settlements, before refunds. These amounts are separate from purchase counts.</p></section>`;
  }).join("")}
  <section><h2>HTTP payment request outcomes</h2>
    <p>Credential-bearing requests through the HTTP payment gate, including house traffic and retries. A 2xx response is not a new sale. Mixed means both protocols were declared. Free quotes, MCP and WebMCP tool calls are outside this instrument. These best-effort mirrored counters may lag or miss writes; they are not the accounting ledger.</p>
    ${data.operations ? `<p>Month ${escapeHtml(data.operations.month)}; read at ${escapeHtml(data.operations.read_at)}. Counts start when this instrument is deployed; no earlier history is inferred.</p>
    <table><thead><tr><th>Protocol</th><th>2xx</th><th>3xx</th><th>4xx</th><th>5xx</th><th>Threw</th></tr></thead><tbody>${data.operations.rows.map(row => `<tr><th>${escapeHtml(row.protocol)}</th>${row.observed ? [row.success, row.redirect, row.client_error, row.server_error, row.threw].map(n => `<td>${n}</td>`).join("") : '<td colspan="5">No observations recorded</td>'}</tr>`).join("")}</tbody></table>` : '<p>Operational counts unavailable.</p>'}
  </section>
  <section>
    <h2>The take — all-time</h2>
    <p><small>Real money off the certificates, split by shelf kind. This
    is the slow page on purpose: it walks every certificate and every
    month's counters, which is why <a href="/admin">the desk</a> no
    longer does it just to open.</small></p>
    ${takeSectionHtml(data.take, data.allTime, data.till)}
  </section>`;
  return renderAdminShell("take", body, data.loadNotes);
}
