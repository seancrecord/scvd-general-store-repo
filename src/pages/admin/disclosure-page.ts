import { escapeHtml } from "@/lib/sanitize";
import { DISCLOSURE_FIELDS } from "@/lib/disclosure";
import { renderAdminShell } from "@/pages/admin/layout";
import type { DisclosureCensus } from "@/services/disclosure-census";

/**
 * WHAT THEY TOLD US, and who told us nothing.
 *
 * One month, two doors, never blended: the paid door counts settled
 * purchases, the free door counts calls on the three instruments a
 * buyer runs before paying. Every rate here is printed as the
 * fraction it came from, because "40% disclose" off five calls and
 * off five hundred are different facts wearing the same number.
 *
 * The values are capped maps with an "other" bucket (the MCP client
 * census's shape), and operator and prior_cert_id are never listed
 * as values at all — one is a stranger's identity, the other joins to
 * a wallet. The counter page shows both, per order, where an order
 * already exists.
 */

export interface DisclosurePageData {
  month: string;
  paid: DisclosureCensus;
  free: DisclosureCensus;
}

function fraction(n: number, of: number): string {
  if (of === 0) return `${n} of 0`;
  return `${n} of ${of} (${Math.round((n / of) * 100)}%)`;
}

function valueList(map: Record<string, number> | undefined): string {
  if (!map || Object.keys(map).length === 0) return "<small>none kept</small>";
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${escapeHtml(k)} ×${n}`)
    .join(" · ");
}

function doorSection(title: string, census: DisclosureCensus, note: string): string {
  const fieldRows = DISCLOSURE_FIELDS.map(
    (field) => `<tr>
      <td><code>${field}</code></td>
      <td>${fraction(census.supplied[field], census.offered)}</td>
      <td>${field === "operator" || field === "prior_cert_id" ? "<small>counted, never listed</small>" : valueList(census.values[field])}</td>
    </tr>`,
  ).join("");
  const returning = Object.entries(census.returning);
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <p><small>${escapeHtml(note)}</small></p>
    <table border="1" cellpadding="4">
      <tr><td>offered the block</td><td>${census.offered}</td></tr>
      <tr><td>…who filled at least one field</td><td>${fraction(census.disclosed, census.offered)}</td></tr>
      <tr><td>…who filled nothing (the ignores)</td><td>${fraction(census.ignored, census.offered)}</td></tr>
    </table>
    <table border="1" cellpadding="4">
      <tr><th>field</th><th>supplied</th><th>values kept (capped, "other" past the cap)</th></tr>
      ${fieldRows}
    </table>
    ${returning.length > 0
      ? `<p><em>prior_cert_id claims:</em> ${returning.map(([verdict, n]) => `${escapeHtml(verdict)} ×${n}`).join(" · ")}. Only <code>verified</code> means the same wallet paid both times.</p>`
      : ""}
  </section>`;
}

export function renderDisclosurePage(data: DisclosurePageData): string {
  const body = `<section>
    <h2>What they told us, ${escapeHtml(data.month)}</h2>
    <p><small>The optional block on every paid door and on preflight_endpoint, look_at_door and check_before_you_pay. Nothing here is verified,
    nothing here changes a price, and none of it reaches a certificate. Counts are floors: one key per door per month, read-modify-write,
    written beside the answer and never in front of it. Another month: <code>?month=YYYY-MM</code>.</small></p>
  </section>
  ${doorSection("The paid door", data.paid, "One row per settled purchase, house wallets skipped at settle, the same rule as the buyers page.")}
  ${doorSection("The free door", data.free, "One row per call on the three pre-payment instruments, any door. A scanner calling preflight a hundred times is a hundred rows that filled nothing.")}
  <section>
    <p><small>If the ignores stay near the whole after a month, the ask is wrong, not the buyers, and rule 56 wants that said on /corrections rather than read as "agents don't disclose".</small></p>
  </section>`;
  return renderAdminShell("disclosure", body);
}
