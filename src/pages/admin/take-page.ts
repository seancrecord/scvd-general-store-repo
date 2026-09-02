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
  take: TakeSummary | null;
  allTime: { organic: number; house: number } | null;
  /** The till's per-item counters, for the no-certificate table. */
  till: Record<string, TillItemCount> | null;
  loadNotes: string[];
}

export function renderTakePage(data: TakePageData): string {
  const body = `
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
